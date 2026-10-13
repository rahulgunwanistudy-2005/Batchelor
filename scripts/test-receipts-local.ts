/** Real local-chain inclusion → actual Envio handlers → server-rendered S7 receipts. */
import {spawn} from 'node:child_process';
import {createServer as createNetServer} from 'node:net';
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createPublicClient,createWalletClient,encodeDeployData,getContractAddress,http,decodeEventLog,type Abi,type Hex} from 'viem';
import {mnemonicToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {batchAuctionAbi,faucetAbi} from '../packages/core/src/abi.ts';
import {transactionGas} from '../packages/core/src/gas.ts';
import {replay} from '../packages/core/src/replay.ts';
import {createIndexerClient} from '../apps/web/src/lib/api/graphql.ts';
import bench from '../packages/core/src/bench.json' with {type:'json'};
const root=fileURLToPath(new URL('../',import.meta.url));
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function freePort():Promise<number>{return new Promise((resolve,reject)=>{const s=createNetServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const a=s.address();if(!a||typeof a==='string')return reject(new Error('No local port'));s.close(e=>e?reject(e):resolve(a.port));});});}
const [rpcPort,webPort,graphPort]=await Promise.all([freePort(),freePort(),freePort()]);
const rpc=`http://127.0.0.1:${rpcPort}`,origin=`http://localhost:${webPort}`,endpoint=`http://127.0.0.1:${graphPort}`;
const logs:string[]=[];
const localAnvil=existsSync(`${root}.tools/foundry/bin/anvil`)?`${root}.tools/foundry/bin/anvil`:'anvil';
const chain=spawn(localAnvil,['--chain-id','10143','--network','monad','--hardfork','MonadTen','--port',String(rpcPort),'--number',String(monadTestnet.contracts.multicall3.blockCreated),'--silent'],{stdio:['ignore','pipe','pipe']});
chain.stderr.on('data',d=>logs.push(String(d)));
let server:ReturnType<typeof spawn>|undefined,graph:ReturnType<typeof createServer>|undefined;
async function rpcCall(method:string,params:unknown[]=[]){const response=await fetch(rpc,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});const body=await response.json() as {error?:unknown;result:unknown};if(body.error)throw new Error(JSON.stringify(body.error));return body.result;}
const json=(data:unknown)=>JSON.stringify(data,(_,v)=>typeof v==='bigint'?v.toString():v,2);
async function runIndexer(){
 const pnpm=process.env.S7_PNPM_CLI;
 const child=pnpm?spawn(process.execPath,[pnpm,'--filter','@batchelor/indexer','test','test/s7-receipts.test.ts'],{cwd:root,env:{...process.env,S7_RECEIPT_INPUT:`${root}.tools/s7-events.json`,S7_RECEIPT_OUTPUT:`${root}.tools/s7-indexed.json`},stdio:['ignore','pipe','pipe']}):spawn('pnpm',['--filter','@batchelor/indexer','test','test/s7-receipts.test.ts'],{cwd:root,env:{...process.env,S7_RECEIPT_INPUT:`${root}.tools/s7-events.json`,S7_RECEIPT_OUTPUT:`${root}.tools/s7-indexed.json`},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>logs.push(String(d)));child.stderr.on('data',d=>logs.push(String(d)));
 await new Promise<void>((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Envio handler/preview gate failed')));});
}
try{
 let ready=false;for(let i=0;i<60;i++){if(chain.exitCode!==null)throw new Error('Anvil exited');try{await rpcCall('eth_chainId');ready=true;break;}catch{}await delay(100);}if(!ready)throw new Error('Anvil readiness failed');
 const accounts=Array.from({length:7},(_,addressIndex)=>mnemonicToAccount('test test test test test test test test test test test junk',{addressIndex}));
 const deployer=accounts[0]!,asha=accounts[1]!,mo=accounts[2]!,pete=accounts.slice(3);
 const client=createPublicClient({chain:monadTestnet,transport:http(rpc),pollingInterval:50}),wallet=createWalletClient({chain:monadTestnet,account:deployer,transport:http(rpc)});
 const n=await client.getTransactionCount({address:deployer.address}),predicted=[0,1,2,3].map(i=>getContractAddress({from:deployer.address,nonce:BigInt(n+i)}));
 const constructorArgs=[['Rose','ROSE',18,predicted[3]],['Demo USD','dUSD',6,predicted[3]],[predicted[0],predicted[1],500000n,5000n,10n**15n,1,100],[predicted[0],predicted[1],predicted[2]]];
 for(const [i,name] of ['DemoToken','DemoToken','BatchAuction','Faucet'].entries()){
  const a=JSON.parse(await readFile(`${root}contracts/out/${name}.sol/${name}.json`,'utf8')) as {abi:Abi;bytecode:{object:Hex}};
  const op=['tooling:deployBase','tooling:deployQuote','tooling:deployMarket','tooling:deployFaucet'][i]! as keyof typeof bench.toolingGas;
  const hash=await wallet.sendTransaction({data:encodeDeployData({abi:a.abi,bytecode:a.bytecode.object,args:constructorArgs[i]!}),gas:BigInt(bench.toolingGas[op])});if((await client.waitForTransactionReceipt({hash})).status!=='success')throw new Error('Deployment failed');
 }
 const market=predicted[2]!,faucet=predicted[3]!;
 for(const actor of [asha,mo,...pete]){const hash=await wallet.writeContract({address:faucet,abi:faucetAbi,functionName:'drip',args:[actor.address],gas:transactionGas('drip')});if((await client.waitForTransactionReceipt({hash})).status!=='success')throw new Error('Drip failed');}
 const events:unknown[]=[],previews:{id:bigint;batchId:bigint;values:readonly bigint[]}[]=[];
 const record=async(hash:Hex)=>{
  const receipt=await client.getTransactionReceipt({hash});if(receipt.status!=='success')throw new Error('Transaction reverted');
  const block=await client.getBlock({blockNumber:receipt.blockNumber}),tx=await client.getTransaction({hash});
  for(const log of receipt.logs.filter(l=>l.address.toLowerCase()===market.toLowerCase())){
   const decoded=decodeEventLog({abi:batchAuctionAbi,data:log.data,topics:log.topics});
   if(decoded.eventName!=='OrderPlaced'&&decoded.eventName!=='BatchCleared')continue;
   const params=Object.fromEntries(Object.entries(decoded.args).map(([k,v])=>[k,typeof v==='number'?BigInt(v):v]));
   events.push({contract:'BatchAuction',event:decoded.eventName,srcAddress:market,params,logIndex:log.logIndex,block:{number:Number(block.number),timestamp:Number(block.timestamp),baseFeePerGas:block.baseFeePerGas},transaction:{hash,transactionIndex:receipt.transactionIndex,effectiveGasPrice:receipt.effectiveGasPrice,maxPriorityFeePerGas:tx.maxPriorityFeePerGas}});
   if(decoded.eventName==='OrderPlaced')previews.push({id:decoded.args.orderId,batchId:decoded.args.batchId,values:[]});
  }
 };
 for(let sample=0;sample<3;sample++){
  await rpcCall('evm_setAutomine',[false]);await rpcCall('anvil_setNextBlockBaseFeePerGas',['0x174876e800']);
  const hashes:Hex[]=[];
  for(const [i,actor] of [...pete,asha,mo].entries()){
   const w=createWalletClient({chain:monadTestnet,account:actor,transport:http(rpc)}),priority=i<4?1_000_000_000_000n:i===4?2_000_000_000n:1_000_000_000n;
   hashes.push(await w.writeContract({address:market,abi:batchAuctionAbi,functionName:'place',args:[i===5?1:0,(i<4?140:i===4?120:80)+sample, i===5?30n:5n],gas:transactionGas('place'),maxPriorityFeePerGas:priority,maxFeePerGas:priority+200_000_000_000n}));
  }
  await rpcCall('evm_mine');for(const hash of hashes)await record(hash);
  await rpcCall('evm_setAutomine',[true]);
  const clear=await wallet.writeContract({address:market,abi:batchAuctionAbi,functionName:'clear',gas:transactionGas('clear')});await client.waitForTransactionReceipt({hash:clear});await record(clear);
  for(const preview of previews.filter(p=>p.values.length===0))preview.values=await client.readContract({address:market,abi:batchAuctionAbi,functionName:'previewFill',args:[preview.id]});
 }
 await writeFile(`${root}.tools/s7-events.json`,JSON.stringify({events,previews},(_,v)=>typeof v==='bigint'?{$bigint:v.toString()}:v));
 await runIndexer();
 const indexed=JSON.parse(await readFile(`${root}.tools/s7-indexed.json`,'utf8')) as Record<string,unknown>[];
 graph=createServer((req,res)=>{let body='';req.on('data',d=>body+=String(d));req.on('end',()=>{try{const {query,variables}=JSON.parse(body) as {query:string;variables:{id:string;batch:string;limit:number;offset:number}};const batch=indexed.find(b=>b.batchId===variables.id);let data:unknown;if(query.includes('query BatchReceipt'))data={Batch:batch?[batch]:[]};else if(query.includes('query BatchOrders'))data={Order:(indexed.find(b=>b.id===variables.batch)?.orders as unknown[]??[]).slice(variables.offset,variables.offset+1000)};else if(query.includes('query RecentBatches'))data={Batch:[...indexed].reverse().slice(0,variables.limit)};else throw new Error('Unexpected fixture query');res.writeHead(200,{'Content-Type':'application/json'});res.end(json({data}));}catch{res.writeHead(400);res.end('{}');}});});
 await new Promise<void>((resolve,reject)=>{graph!.once('error',reject);graph!.listen(graphPort,'127.0.0.1',resolve);});
 const indexer=createIndexerClient({endpoint,chainId:10143,market});const receipts=[];
 for(const id of ['1','2','3']){
  const receipt=await indexer.batch(id);if(!receipt)throw new Error('Missing indexed receipt');
  const sim=replay(receipt.orders.map(o=>({...o,actor:pete.some(p=>p.address.toLowerCase()===o.trader.address)?'pete':o.trader.address===mo.address.toLowerCase()?'mo':'everyone'})));
  const person=receipt.orders.find(o=>o.trader.address===asha.address.toLowerCase())!,bots=receipt.orders.filter(o=>pete.some(p=>p.address.toLowerCase()===o.trader.address));
  if(bots.some(o=>o.txIndex>=person.txIndex||o.priorityFeePerGas<10n*o.baseFeePerGas)||person.baseOut===0n)throw new Error('Rehearsal inclusion gate failed');
  if(bots.some(o=>o.quoteIn*10n**18n!==o.baseOut*receipt.price!)||person.quoteIn*10n**18n!==person.baseOut*receipt.price!)throw new Error('Uniform price gate failed');
  const continuous=sim.actors.pete.priceLots/sim.actors.pete.filledLots;if(continuous===receipt.price)throw new Error('Pete replay difference is zero');
  receipts.push({batchId:receipt.batchId,price:receipt.price,peteContinuousPrice:continuous,peteDifference:continuous-receipt.price!,ashaContinuousPrice:sim.actors.everyone.priceLots/sim.actors.everyone.filledLots,clearGas:receipt.clearGas,peteTxIndices:bots.map(o=>o.txIndex),ashaTxIndex:person.txIndex,previewComparisons:receipt.orders.length});
 }
 server=spawn(process.execPath,[`${root}apps/web/node_modules/vite/bin/vite.js`,'dev','--host','127.0.0.1','--port',String(webPort),'--strictPort'],{cwd:`${root}apps/web`,env:{...process.env,PUBLIC_CHAIN:'testnet',PUBLIC_MARKET_ADDRESS:market.toLowerCase(),PUBLIC_ENVIO_GRAPHQL_URL:endpoint,PUBLIC_RPC_HTTP:rpc,PUBLIC_RPC_WS:rpc.replace('http:','ws:'),PUBLIC_PETE_ADDRESSES:pete.map(p=>p.address).join(','),PUBLIC_MO_ADDRESS:mo.address,PUBLIC_RP_ID:'localhost',BOTS_URL:''},stdio:['ignore','pipe','pipe']});
 server.stdout?.on('data',d=>logs.push(String(d)));server.stderr?.on('data',d=>logs.push(String(d)));
 ready=false;for(let i=0;i<100;i++){if(server.exitCode!==null)throw new Error('Web server exited');try{if((await fetch(origin)).ok){ready=true;break;}}catch{}await delay(200);}if(!ready)throw new Error('Web readiness failed');
 const html=await (await fetch(`${origin}/b/1?trader=${asha.address}`,{headers:{'User-Agent':'facebookexternalhit/1.1'}})).text();
 for(const required of ['6 orders, one price: 0.9000 dUSD','Pete (bot)','Mo (market maker bot)','og:image','10×','0.300000 dUSD','0.200000 dUSD'])if(!html.includes(required))throw new Error(`Missing server-rendered receipt: ${required}`);
 const image=await fetch(`${origin}/b/1/og.png`);if(image.headers.get('content-type')!=='image/png')throw new Error('Missing OG PNG');const png=Buffer.from(await image.arrayBuffer());if(png.readUInt32BE(16)!==1200||png.readUInt32BE(20)!==630)throw new Error('OG dimensions');
 await mkdir(`${root}docs/verification`,{recursive:true});await writeFile(`${root}docs/screens/s7-receipt-og.png`,png);
 const proof=await (await fetch(`${origin}/proof`)).text();for(const required of ['p95','150,000,000','Eight correctness gates','Solvency','256'])if(!proof.includes(required))throw new Error(`Proof missing ${required}`);
 await writeFile(`${root}docs/verification/s7-local.json`,json({environment:'Ephemeral local MonadTen Anvil; real local transactions replayed through actual Envio handlers; loopback GraphQL fixture, not hosted Envio',passed:true,chainId:10143,market,asha:asha.address,pete:pete.map(p=>p.address),receipts,previewComparisons:previews.length,serverRendered:true,og:{contentType:'image/png',width:1200,height:630},stats:await indexer.batchStats()})+'\n');
 console.log('S7: 3 batches, 18 contract/indexer previews, Pete/Asha uniform prices, nonzero replay and SSR/PNG checks passed.');
 const hold=Number(process.env.LOCAL_WEB_HOLD_SECONDS??0);if(!Number.isInteger(hold)||hold<0||hold>300)throw new Error('Local hold must be 0..300 seconds');
 if(hold||process.env.PLAYWRIGHT_MODULE)await writeFile(`${root}.tools/s7-browser.json`,json({origin,asha:asha.address}));
 if(process.env.PLAYWRIGHT_MODULE){
  const audit=spawn(process.execPath,[`${root}scripts/capture-receipts.mjs`],{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});
  audit.stdout.on('data',d=>console.log(String(d).trim()));audit.stderr.on('data',d=>logs.push(String(d)));
  await new Promise<void>((resolve,reject)=>{audit.once('error',reject);audit.once('exit',code=>code===0?resolve():reject(new Error('Browser visual/accessibility gate failed')));});
 }else if(hold){console.log(`Local receipt browser fixture: ${origin}`);await delay(hold*1000);}
}catch(error){console.error(logs.slice(-12).join('\n'));throw error;}finally{server?.kill('SIGTERM');chain.kill('SIGTERM');graph?.closeAllConnections();graph?.close();}
