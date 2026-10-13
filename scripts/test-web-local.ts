/** Exercise the real Svelte endpoints on an ephemeral loopback MonadTen chain. */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, encodeDeployData, getContractAddress, http, decodeEventLog, type Abi, type Hex } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { monadTestnet } from 'viem/chains';
import { batchAuctionAbi } from '../packages/core/src/abi.ts';
import { transactionGas } from '../packages/core/src/gas.ts';
import { uncross } from '../packages/core/src/uncross.ts';
import { buildIntent, intentData, intentJSON } from '../packages/core/src/intents.ts';
import bench from '../packages/core/src/bench.json' with {type:'json'};
async function freePort():Promise<number> {
  return new Promise((resolve,reject)=>{
    const probe=createServer(); probe.once('error',reject);
    probe.listen(0,'127.0.0.1',()=>{const address=probe.address();if(!address||typeof address==='string'){probe.close();reject(new Error('No local port.'));return;}probe.close(error=>error?reject(error):resolve(address.port));});
  });
}
const [rpcPort,webPort]=await Promise.all([freePort(),freePort()]);
const root=fileURLToPath(new URL('../',import.meta.url)),rpc=`http://127.0.0.1:${rpcPort}`,origin=`http://localhost:${webPort}`;
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const logs:string[]=[];
const anvil=existsSync(`${root}.tools/foundry/bin/anvil`)?`${root}.tools/foundry/bin/anvil`:'anvil';
const chain=spawn(anvil,['--chain-id','10143','--network','monad','--hardfork','MonadTen','--port',String(rpcPort),'--number',String(monadTestnet.contracts.multicall3.blockCreated),'--silent'],{cwd:root,stdio:['ignore','pipe','pipe']});
chain.stderr.on('data',d=>logs.push(String(d)));
let server:ReturnType<typeof spawn>|undefined;
async function rpcCall(method:string,params:unknown[]=[]) {const r=await fetch(rpc,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});const json=await r.json() as {error?:unknown;result?:unknown};if(json.error)throw new Error(JSON.stringify(json.error));return json.result;}
async function api(path:string,body:unknown,expected=200) {const r=await fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});const data=await r.json() as {hash:Hex;error?:{code:string;message:string}};if(r.status!==expected)throw new Error(`${path}: ${r.status} ${JSON.stringify(data)}`);return data;}
try {
  let ready=false;for(let i=0;i<60;i++){if(chain.exitCode!==null)throw new Error('Local Anvil exited before readiness.');try{await rpcCall('eth_chainId');ready=true;break;}catch{await delay(100);}}if(!ready)throw new Error('Local Anvil did not start.');
  const accounts=[0,1,2].map(addressIndex=>mnemonicToAccount('test test test test test test test test test test test junk',{addressIndex}));
  const deployer=accounts[0]!,person=accounts[1]!,mo=accounts[2]!;
  const client=createPublicClient({chain:monadTestnet,transport:http(rpc),pollingInterval:100}),wallet=createWalletClient({chain:monadTestnet,account:deployer,transport:http(rpc)});
  const n=await client.getTransactionCount({address:deployer.address}),predicted=[0,1,2,3].map(i=>getContractAddress({from:deployer.address,nonce:BigInt(n+i)}));
  const args=[['Rose','ROSE',18,predicted[3]],['Demo USD','dUSD',6,predicted[3]],[predicted[0],predicted[1],500_000n,5000n,10n**15n,1,100],[predicted[0],predicted[1],predicted[2]]];
  for(const [i,name] of ['DemoToken','DemoToken','BatchAuction','Faucet'].entries()){
    const a=JSON.parse(await readFile(`${root}contracts/out/${name}.sol/${name}.json`,'utf8')) as {abi:Abi;bytecode:{object:Hex}};
    const op=['tooling:deployBase','tooling:deployQuote','tooling:deployMarket','tooling:deployFaucet'][i]! as keyof typeof bench.toolingGas;
    const hash=await wallet.sendTransaction({data:encodeDeployData({abi:a.abi,bytecode:a.bytecode.object,args:args[i]!}),gas:BigInt(bench.toolingGas[op])});
    if((await client.waitForTransactionReceipt({hash})).status!=='success')throw new Error('Local deployment failed.');
  }
  const market=predicted[2]!,faucet=predicted[3]!;
  const multicall=JSON.parse(await readFile(`${root}contracts/out/LocalMulticall.sol/LocalMulticall.json`,'utf8')) as {deployedBytecode:{object:Hex}};
  await rpcCall('anvil_setCode',[monadTestnet.contracts.multicall3.address,multicall.deployedBytecode.object]);
  server=spawn(process.execPath,[`${root}apps/web/node_modules/vite/bin/vite.js`,'dev','--host','127.0.0.1','--port',String(webPort),'--strictPort'],{cwd:`${root}apps/web`,env:{...process.env,CHAIN:'testnet',PUBLIC_CHAIN:'testnet',RPC_HTTP:rpc,PUBLIC_RPC_HTTP:rpc,PUBLIC_RPC_WS:rpc.replace('http:','ws:'),MARKET_ADDRESS:market.toLowerCase(),PUBLIC_MARKET_ADDRESS:market.toLowerCase(),FAUCET_ADDRESS:faucet.toLowerCase(),PUBLIC_RP_ID:'localhost',RELAYER_PK:`0x${Buffer.from(deployer.getHdKey().privateKey!).toString('hex')}`,BOTS_URL:'',PUBLIC_ENVIO_GRAPHQL_URL:''},stdio:['ignore','pipe','pipe']});
  server.stdout?.on('data',d=>logs.push(String(d)));server.stderr?.on('data',d=>logs.push(String(d)));
  ready=false;for(let i=0;i<100;i++){if(server.exitCode!==null)throw new Error('Local web server exited before readiness.');try{if((await fetch(origin)).ok){ready=true;break;}}catch{}await delay(200);}if(!ready)throw new Error('Web server did not start.');
  for(const account of [person,mo]) {const result=await api('/api/drip',{trader:account.address});if((await client.waitForTransactionReceipt({hash:result.hash})).status!=='success')throw new Error('Drip failed.');}
  const [base,quote]=await client.readContract({address:market,abi:batchAuctionAbi,functionName:'balances',args:[person.address]});if(base!==100n*10n**18n||quote!==100n*10n**6n)throw new Error('Incorrect drip balances.');
  const expired=buildIntent({trader:person.address,action:0,side:0,tick:120,lots:1000n,orderId:0n,nonce:0n,deadline:1n});
  const expiredResponse=await api('/api/relay',{intent:intentJSON(expired),sig:await person.signTypedData(intentData(10143,market,expired))},400);if(expiredResponse.error?.code!=='EXPIRED')throw new Error('Expiry guard failed.');
  const wrong=buildIntent({trader:person.address,action:0,side:0,tick:120,lots:1000n,orderId:0n,nonce:0n});
  const bad=await api('/api/relay',{intent:intentJSON(wrong),sig:await mo.signTypedData(intentData(10143,market,wrong))},400);if(bad.error?.code!=='BAD_SIGNATURE')throw new Error('Signature guard failed.');
  const samples:unknown[]=[];
  const mm=createWalletClient({chain:monadTestnet,account:mo,transport:http(rpc)});
  for(let j=-1;j<20;j++) {
    await rpcCall('evm_setAutomine',[false]);
    const tick=100+Math.max(0,j);
    const mmHash=await mm.writeContract({address:market,abi:batchAuctionAbi,functionName:'placeMany',args:[[0,1],[tick+5,tick-5],[1000n,1000n]],gas:transactionGas('placeMany')});
    let wire: Awaited<ReturnType<typeof signedWire>>|undefined, personHash:Hex|undefined;
    if(j===-1) {wire=await signedWire();personHash=(await api('/api/relay',wire)).hash;}
    await rpcCall('evm_mine');
    const placement=await client.getTransactionReceipt({hash:personHash??mmHash});if(placement.status!=='success')throw new Error('Order reverted.');
    const events=placement.logs.flatMap(l=>{try{const e=decodeEventLog({abi:batchAuctionAbi,data:l.data,topics:l.topics});return e.eventName==='OrderPlaced'?[e.args]:[];}catch{return [];}});
    const placed=events[0]!;
    const [meta,[bids,asks],ref]=await client.multicall({blockNumber:placement.blockNumber,allowFailure:false,contracts:[
      {address:market,abi:batchAuctionAbi,functionName:'openBatch'},
      {address:market,abi:batchAuctionAbi,functionName:'ladder',args:[0,255]},
      {address:market,abi:batchAuctionAbi,functionName:'refTick'}
    ]});
    if(meta.id!==placed.batchId)throw new Error('Incoherent snapshot.');
    const indicative=uncross(bids,asks,0,ref);
    await rpcCall('evm_setAutomine',[true]);
    const clearHash=await wallet.writeContract({address:market,abi:batchAuctionAbi,functionName:'clear',gas:transactionGas('clear')});await client.waitForTransactionReceipt({hash:clearHash});
    const result=await client.readContract({address:market,abi:batchAuctionAbi,functionName:'result',args:[placed.batchId]});
    if(indicative.clearTick!==result.clearTick||indicative.volumeLots!==result.volumeLots)throw new Error('Live indicative price mismatch.');
    if(personHash && wire) {
      const fill=await client.readContract({address:market,abi:batchAuctionAbi,functionName:'previewFill',args:[placed.orderId]});if(fill[0]<=0n||fill[1]>=0n)throw new Error('Person order did not fill.');
      const replay=await api('/api/relay',wire,400);if(replay.error?.code!=='BAD_NONCE')throw new Error('Replay guard failed.');
    } else samples.push({batchId:placed.batchId,clearTick:result.clearTick,indicativeTick:indicative.clearTick,volumeLots:result.volumeLots,mmHash});
    const ids=personHash?[placed.orderId-2n,placed.orderId-1n,placed.orderId]:events.map(e=>e.orderId);
    const claim=await wallet.writeContract({address:market,abi:batchAuctionAbi,functionName:'claim',args:[ids],gas:transactionGas('claim',ids.length)});await client.waitForTransactionReceipt({hash:claim});
  }
  async function signedWire() {const i=buildIntent({trader:person.address,action:0,side:0,tick:105,lots:100n,orderId:0n,nonce:0n});return {intent:intentJSON(i),sig:await person.signTypedData(intentData(10143,market,i))};}
  await mkdir(`${root}docs/verification`,{recursive:true});
  await writeFile(`${root}docs/verification/s6-local.json`,JSON.stringify({environment:'Ephemeral local MonadTen Anvil; simulated MON, no live deployment',passed:true,chainId:10143,market,faucet,guards:['bad signature','expired deadline','replayed nonce'],consecutivePriceMatches:samples.length,samples},(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
  const hold=Number(process.env.LOCAL_WEB_HOLD_SECONDS??0);
  if(!Number.isInteger(hold)||hold<0||hold>300)throw new Error('Local fixture lifetime must be 0..300 seconds.');
  if(hold) { const fixture = await mm.writeContract({address:market,abi:batchAuctionAbi,functionName:'placeMany',args:[[0,1],[130,90],[1000n,1000n]],gas:transactionGas('placeMany')}); await client.waitForTransactionReceipt({hash:fixture}); console.log(`Local browser fixture at ${origin}`); await delay(hold*1000); }
  console.log('Real web endpoints: drip, signed fills, signature/expiry/replay guards and 20 consecutive price comparisons passed.');
} catch(e){console.error(logs.slice(-10).join('\n'));throw e;}
finally{server?.kill('SIGTERM');chain.kill('SIGTERM');}
