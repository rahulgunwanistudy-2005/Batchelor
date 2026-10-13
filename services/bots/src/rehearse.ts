import { writeFile } from 'node:fs/promises';
import { batchAuctionAbi, faucetAbi } from '@batchelor/core/abi';
import { transactionGas } from '@batchelor/core/gas';
import { resolveRpcUrl } from '@batchelor/core/rpc';
import { createWalletClient, decodeEventLog, encodeFunctionData, http, parseGwei } from 'viem';
import type { Address, Hex, TransactionReceipt } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createChainClients, feeCaps, readEnv } from './chain.js';
import { NonceManager } from './nonce.js';
import { verifyDemo } from './rehearsal.js';
import type { DemoFill } from './rehearsal.js';

async function main() {
  const env = readEnv();
  if (env.CHAIN !== 'testnet') throw new Error('Rehearsal sends are testnet only. Mainnet requires an approved separate run.');
  if (!env.MARKET_ADDRESS || !env.FAUCET_ADDRESS || !env.BOTS_TOKEN || (!env.RPC_WS && !env.DWELLIR_API_KEY)) throw new Error('Missing rehearsal configuration.');
  const key = process.env.ASHA_PK;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('Configure a funded throwaway ASHA_PK.');
  const clients = createChainClients(env); const client = clients.publicClient;
  if (await client.getChainId() !== 10143) throw new Error('Wrong chain.');
  const account = privateKeyToAccount(key as Hex);
  if ([...clients.wallets.values()].some((w) => w.account.address === account.address)) throw new Error('Asha must have a separate key.');
  const wallet = createWalletClient({ account, chain: clients.chain, transport: http(resolveRpcUrl(env.CHAIN, 'http', env.RPC_HTTP, env.DWELLIR_API_KEY)) });
  const nonce = new NonceManager(client, account.address);
  const market = env.MARKET_ADDRESS as Address, faucet = env.FAUCET_ADDRESS as Address;
  const send = async (action: 'drip' | 'place', tick = 106): Promise<TransactionReceipt> => {
    const block = await client.getBlock(); if (block.baseFeePerGas === null) throw new Error('Missing base fee.');
    const gas = transactionGas(action); const fees = feeCaps(block.baseFeePerGas, parseGwei('1'));
    if (await client.getBalance({ address: account.address }) < gas * fees.maxFeePerGas) throw new Error('Fund the throwaway Asha key first.');
    const data = action === 'drip' ? encodeFunctionData({ abi: faucetAbi, functionName: 'drip', args: [account.address] })
      : encodeFunctionData({ abi: batchAuctionAbi, functionName: 'place', args: [0, tick, 5n] });
    const hash = await nonce.submit((n) => wallet.signTransaction({ to: action === 'drip' ? faucet : market, data, gas, ...fees, nonce: n, value: 0n }),
      (serializedTransaction) => client.sendRawTransaction({ serializedTransaction }));
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== 'success') throw new Error('Rehearsal transaction reverted.');
    return receipt;
  };
  const balances = await client.readContract({ address: market, abi: batchAuctionAbi, functionName: 'balances', args: [account.address] });
  if (balances[1] === 0n) await send('drip');
  const url = new URL(process.env.BOTS_URL ?? 'http://127.0.0.1:3001');
  const headers = { Authorization: `Bearer ${env.BOTS_TOKEN}` };
  const healthResponse = await fetch(new URL('/health', url), { signal: AbortSignal.timeout(10_000) });
  const health = await healthResponse.json() as { chainId: number; burstBlocks: number };
  if (!healthResponse.ok || health.chainId !== 10143 || health.burstBlocks !== 10) throw new Error('Run healthy testnet bots with PETE_BURST_BLOCKS=10.');
  const response = await fetch(new URL('/unleash', url), { method: 'POST', headers, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error('Unleash rejected.');
  const burst = await response.json() as { startBlock: string };
  const offset = BigInt(1 + Math.floor(Math.random() * 6));
  const target = BigInt(burst.startBlock) + offset;
  const receipt = await new Promise<TransactionReceipt>((resolve, reject) => {
    let sent = false;
    const timer = setTimeout(() => { unwatch(); reject(new Error('No usable head arrived during the burst.')); }, 30_000);
    const unwatch = clients.headClient!.watchBlocks({ onBlock: (block) => {
      if (sent || block.number === null || block.number < target) return;
      sent = true; clearTimeout(timer); unwatch();
      // Derive the current limit from the maker's indicative centre, via current ref tick + generous range.
      void client.readContract({ address: market, abi: batchAuctionAbi, functionName: 'refTick' })
        .then((ref) => send('place', Math.min(255, ref + 12))).then(resolve, reject);
    }, onError: () => { clearTimeout(timer); unwatch(); reject(new Error('Head subscription failed.')); } });
  });
  const placed = receipt.logs.filter((l) => l.address.toLowerCase() === market.toLowerCase()).flatMap((l) => {
    try { const e = decodeEventLog({ abi: batchAuctionAbi, eventName: 'OrderPlaced', data: l.data, topics: l.topics }); return [e.args]; }
    catch { return []; }
  }).find((o) => o.trader.toLowerCase() === account.address.toLowerCase());
  if (!placed) throw new Error('Asha OrderPlaced missing.');
  let result = await client.readContract({ address: market, abi: batchAuctionAbi, functionName: 'result', args: [placed.batchId] });
  const deadline = Date.now() + 30_000;
  while (result.clearedAt === 0n && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300));
    result = await client.readContract({ address: market, abi: batchAuctionAbi, functionName: 'result', args: [placed.batchId] });
  }
  if (result.clearedAt === 0n) throw new Error('Batch did not clear.');
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (block.baseFeePerGas === null) throw new Error('Inclusion block missing base fee.');
  const price = await client.readContract({ address: market, abi: batchAuctionAbi, functionName: 'price', args: [result.clearTick] });
  const logs = await client.getContractEvents({ address: market, abi: batchAuctionAbi, eventName: 'OrderPlaced', args: { batchId: placed.batchId },
    fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber, strict: true });
  // Keeper may already have claimed. Claimed events preserve the original entitlement;
  // previewFill deliberately returns zero for terminal orders, so report both honestly.
  const inspect = async (orderId: bigint, hash: Hex): Promise<DemoFill> => {
    const r = await client.getTransactionReceipt({ hash });
    const preview = await client.readContract({ address: market, abi: batchAuctionAbi, functionName: 'previewFill', args: [orderId] });
    let [baseDelta, quoteDelta] = preview;
    if (baseDelta === 0n) {
      const claimed = await client.getContractEvents({ address: market, abi: batchAuctionAbi, eventName: 'Claimed', args: { orderId },
        fromBlock: result.clearedAt, toBlock: result.clearedAt + 99n < await client.getBlockNumber() ? result.clearedAt + 99n : await client.getBlockNumber(), strict: true });
      const c = claimed[0]?.args;
      if (c) { baseDelta = BigInt(c.baseOut) - BigInt(c.baseIn); quoteDelta = BigInt(c.quoteOut) - BigInt(c.quoteIn); }
    }
    console.log(JSON.stringify({ event: 'previewFill', orderId: orderId.toString(), preview: preview.map(String) }));
    return { orderId: orderId.toString(), batchId: placed.batchId.toString(), hash, txIndex: r.transactionIndex,
      block: r.blockNumber.toString(), baseFee: block.baseFeePerGas!, priorityFee: r.effectiveGasPrice - block.baseFeePerGas!, baseDelta, quoteDelta, price };
  };
  const peteAddresses = [...clients.wallets].filter(([k]) => k.startsWith('PETE')).map(([, w]) => w.account.address.toLowerCase());
  const peers = await Promise.all(logs.filter((l) => peteAddresses.includes(l.args.trader.toLowerCase())).map((l) => inspect(l.args.orderId, l.transactionHash)));
  const evidence = verifyDemo(await inspect(placed.orderId, receipt.transactionHash), peers, BigInt(env.PETE_PRIORITY_MULT));
  const output = JSON.stringify({ chainId: 10143, ...evidence }, (_, v: unknown) => typeof v === 'bigint' ? v.toString() : v, 2);
  console.log(output);
  await writeFile(process.env.REHEARSAL_OUTPUT ?? 'rehearsal-testnet.json', output + '\n');
  (await clients.headClient!.transport.getRpcClient()).close();
}
void main().catch(() => { console.error('Rehearsal failed. Check configuration, funding, same-block inclusion and priority fees. No passing evidence saved.'); process.exit(1); });
