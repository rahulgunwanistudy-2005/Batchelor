/** Integration evidence on an ephemeral loopback MonadTen chain, never a live deployment. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, decodeEventLog, encodeDeployData, http, getContractAddress, parseGwei, toHex } from 'viem';
import type { Abi, Address, Hex } from 'viem';
import type { DemoFill } from '../services/bots/src/rehearsal.ts';
import { mnemonicToAccount } from 'viem/accounts';
import { monadTestnet } from 'viem/chains';
import { batchAuctionAbi, faucetAbi } from '../packages/core/src/abi.ts';
import { transactionGas } from '../packages/core/src/gas.ts';
import bench from '../packages/core/src/bench.json' with { type: 'json' };
const root = fileURLToPath(new URL('../', import.meta.url));
const rpc = process.env.LOCAL_MONAD_RPC ?? 'http://127.0.0.1:18545';
if (!['127.0.0.1', 'localhost'].includes(new URL(rpc).hostname)) throw new Error('Local integration refuses external RPCs.');
const accounts = Array.from({ length: 8 }, (_, accountIndex) => mnemonicToAccount('test test test test test test test test test test test junk', { addressIndex: accountIndex }));
const client = createPublicClient({ chain: monadTestnet, transport: http(rpc) });
if (await client.getChainId() !== 10143) throw new Error('Local chain ID must be 10143.');
const wallet = createWalletClient({ account: accounts[0]!, chain: monadTestnet, transport: http(rpc) });
// Anvil does not enforce the live chain's minimum base fee; initialize this fixture explicitly.
const resetFee = await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'anvil_setNextBlockBaseFeePerGas', params: [toHex(parseGwei('100'))] }) });
if ((await resetFee.json() as { error?: unknown }).error) throw new Error('Cannot initialize local fee fixture.');
const nonce = await client.getTransactionCount({ address: wallet.account.address, blockTag: 'pending' });
const predicted = [0,1,2,3].map((i) => getContractAddress({ from: wallet.account.address, nonce: BigInt(nonce+i) }));
const contracts: Address[] = [];
const argumentsByName = [ ['Rose','ROSE',18,predicted[3]], ['Demo USD','dUSD',6,predicted[3]],
  [predicted[0],predicted[1],500_000n,5_000n,10n**15n,1,100], [predicted[0],predicted[1],predicted[2]] ];
for (const [i,name] of ['DemoToken','DemoToken','BatchAuction','Faucet'].entries()) {
  const artifact = JSON.parse(await readFile(`${root}contracts/out/${name}.sol/${name}.json`, 'utf8')) as { abi: Abi; bytecode: { object: Hex } };
  const tooling = ['tooling:deployBase','tooling:deployQuote','tooling:deployMarket','tooling:deployFaucet'][i]! as keyof typeof bench.toolingGas;
  const gas = BigInt(bench.toolingGas[tooling]);
  const hash = await wallet.sendTransaction({ data: encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode.object, args: argumentsByName[i]! }), gas, gasPrice: await client.getGasPrice() });
  const receipt = await client.waitForTransactionReceipt({ hash, pollingInterval: 100 });
  if (receipt.status !== 'success' || !receipt.contractAddress || receipt.contractAddress.toLowerCase() !== predicted[i]!.toLowerCase()) throw new Error('Local deployment mismatch.');
  contracts.push(receipt.contractAddress);
}
const market = contracts[2]!, faucet = contracts[3]!;
for (const account of accounts.slice(1)) {
  const hash = await wallet.writeContract({ address: faucet, abi: faucetAbi, functionName: 'drip', args: [account.address], gas: transactionGas('drip'), gasPrice: await client.getGasPrice() });
  if ((await client.waitForTransactionReceipt({ hash, pollingInterval: 100 })).status !== 'success') throw new Error('Local drip failed.');
}
const chainModule = await import(new URL('../services/bots/dist/chain.js', import.meta.url).href) as typeof import('../services/bots/src/chain.ts');
const runtimeModule = await import(new URL('../services/bots/dist/runtime.js', import.meta.url).href) as typeof import('../services/bots/src/runtime.ts');
const token = 'local-integration-only-control-token';
const source: NodeJS.ProcessEnv = { CHAIN: 'testnet', RPC_HTTP: rpc, RPC_WS: rpc.replace('http:','ws:'),
  MARKET_ADDRESS: market, FAUCET_ADDRESS: faucet, BOTS_TOKEN: token, START_BLOCK: '0', PETE_BURST_BLOCKS: '10', MO_AWAKE_SECONDS: '90' };
if(process.env.LOCAL_MONAD_WS) {
  const proxy=new URL(process.env.LOCAL_MONAD_WS);
  if(!['localhost','127.0.0.1'].includes(proxy.hostname)||proxy.protocol!=='ws:')throw new Error('Websocket fixture must be loopback.');
  source.RPC_WS=proxy.href;
}
chainModule.keyNames.forEach((name, i) => { source[name] = toHex(accounts[i+1]!.getHdKey().privateKey!); });
const env = chainModule.readEnv(source);
const runtime = await runtimeModule.startRuntime(env);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let ashaHash: Hex | undefined;
try {
  const deadline = Date.now() + 10_000;
  while (runtime.state.lastHead === null && Date.now() < deadline) await wait(100);
  const response = await runtime.app.request('/unleash', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  if (response.status !== 200) throw new Error('Local unleash failed.');
  const burst = await response.json() as { startBlock: string };
  while ((runtime.state.lastHead ?? 0n) < BigInt(burst.startBlock) + 2n) await wait(20);
  // Pete's four sends begin on this head; delay Asha within the one-second test window.
  await wait(150);
  const asha = createWalletClient({ account: accounts[7]!, chain: monadTestnet, transport: http(rpc) });
  const block = await client.getBlock();
  ashaHash = await asha.writeContract({ address: market, abi: batchAuctionAbi, functionName: 'place', args: [0, 120, 5n], gas: transactionGas('place'),
    ...chainModule.feeCaps(block.baseFeePerGas!, parseGwei('1')) });
  const receipt = await client.waitForTransactionReceipt({ hash: ashaHash, pollingInterval: 100 });
  if (receipt.status !== 'success') throw new Error('Local Asha order reverted.');
  const event = receipt.logs.flatMap((l) => { try { return [decodeEventLog({ abi: batchAuctionAbi, eventName: 'OrderPlaced', data:l.data, topics:l.topics })]; } catch { return []; } })[0]!;
  await wait(2500);
  const result = await client.readContract({ address: market, abi: batchAuctionAbi, functionName: 'result', args: [event.args.batchId] });
  const peers = await client.getContractEvents({ address: market, abi: batchAuctionAbi, eventName:'OrderPlaced', args:{ batchId:event.args.batchId }, fromBlock:receipt.blockNumber,toBlock:receipt.blockNumber,strict:true });
  const peteAddresses = accounts.slice(3,7).map((a)=>a.address.toLowerCase());
  const peteLogs = peers.filter((l)=>peteAddresses.includes(l.args.trader.toLowerCase()));
  if (!peteLogs.length || !peteLogs.some((l)=>l.transactionIndex < receipt.transactionIndex) || result.volumeLots === 0n) throw new Error('Local inclusion/fill proof failed.');
  const inclusionBlock = await client.getBlock({ blockNumber: receipt.blockNumber });
  const price = await client.readContract({ address: market, abi: batchAuctionAbi, functionName: 'price', args: [result.clearTick] });
  const claimed = await client.getContractEvents({ address: market, abi: batchAuctionAbi, eventName: 'Claimed',
    fromBlock: result.clearedAt, toBlock: await client.getBlockNumber(), strict: true });
  const inspect = async (orderId: bigint, hash: Hex): Promise<DemoFill> => {
    const r = await client.getTransactionReceipt({ hash });
    const preview = await client.readContract({ address: market, abi: batchAuctionAbi, functionName: 'previewFill', args: [orderId] });
    const settled = claimed.find((l) => l.args.orderId === orderId)?.args;
    return { orderId: orderId.toString(), batchId: event.args.batchId.toString(), hash, txIndex: r.transactionIndex,
      block: r.blockNumber.toString(), baseFee: inclusionBlock.baseFeePerGas!, priorityFee: r.effectiveGasPrice - inclusionBlock.baseFeePerGas!,
      baseDelta: settled ? settled.baseOut - settled.baseIn : preview[0], quoteDelta: settled ? settled.quoteOut - settled.quoteIn : preview[1], price };
  };
  const demoModule = await import(new URL('../services/bots/dist/rehearsal.js', import.meta.url).href) as typeof import('../services/bots/src/rehearsal.ts');
  const demo = demoModule.verifyDemo(await inspect(event.args.orderId, ashaHash),
    await Promise.all(peteLogs.map((l) => inspect(l.args.orderId, l.transactionHash))), 10n);
  let recovery: { httpCatchUp: boolean; socketResubscribed: boolean; restartAttempts: number } | undefined;
  if(process.env.S8_SOCKET_RECOVERY==='1') {
    if(!process.env.LOCAL_MONAD_WS)throw new Error('Recovery requires the local socket proxy.');
    const before=runtime.state.lastHead!,droppedAt=Date.now();
    const control=new URL('/drop',process.env.LOCAL_MONAD_WS.replace('ws:','http:'));
    if(!(await fetch(control,{method:'POST'})).ok)throw new Error('Socket outage injection failed.');
    await wait(7500);
    const httpCatchUp=runtime.state.lastHead!>before&&runtime.state.httpFallbackHeads>0;
    await wait(10500);
    const socketResubscribed=runtime.state.lastSocketHeadAt>droppedAt+6000&&Date.now()-runtime.state.lastSocketHeadAt<4000;
    recovery={httpCatchUp,socketResubscribed,restartAttempts:runtime.state.socketRestarts};
    if(!httpCatchUp||!socketResubscribed||recovery.restartAttempts<2)throw new Error('Socket watchdog recovery failed.');
  }
  const duration = Number(process.env.LOCAL_SOAK_SECONDS ?? '300');
  if (!Number.isInteger(duration) || duration < 10 || duration > 300) throw new Error('Local soak seconds must be 10..300.');
  const until = Date.now() + duration*1000; const samples: unknown[] = [];
  while (Date.now() < until) {
    await runtime.app.request('/wake',{method:'POST',headers:{Authorization:`Bearer ${token}`}});
    const health = await runtime.app.request('/health'); samples.push(await health.json());
    await wait(5000);
  }
  const finalResponse = await runtime.app.request('/health'); const final = await finalResponse.json();
  const healthy = recovery ? runtime.state.lastHead!==null&&Date.now()-runtime.state.lastHeadAt<4000&&finalResponse.status===503 : finalResponse.status===200;
  const passed = healthy && runtime.state.maxClearLag <= 2n && runtime.state.oldestClaimBatchAge <= 10n && runtime.state.reverts === 0;
  await mkdir(`${root}contracts/bench/out/s4`, {recursive:true});
  await writeFile(process.env.LOCAL_EVIDENCE_OUTPUT ?? `${root}contracts/bench/out/s4/local-bots.json`,JSON.stringify({environment:'local MonadTen Anvil, simulated MON only',passed,durationSeconds:duration,chainId:10143,
    asha:{hash:ashaHash, batch:event.args.batchId.toString(),txIndex:receipt.transactionIndex},pete:peteLogs.map((l)=>({hash:l.transactionHash,txIndex:l.transactionIndex})),
    market, faucet, demo, recovery, clearTick:result.clearTick,volumeLots:result.volumeLots.toString(),final,samples},(_,v:unknown)=>typeof v==='bigint'?v.toString():v,2)+'\n');
  if (!passed) throw new Error('Local soak gate failed.');
  console.log(JSON.stringify({event:'local_integration_passed',durationSeconds:duration,ashaHash,batch:event.args.batchId.toString()}));
} finally { await runtime.stop(); }
