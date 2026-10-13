import { mkdir, writeFile } from 'node:fs/promises';
import { pacedHttp } from '../src/rpc';
/** Optional read-only replay of S3's published testnet receipts, not a hosted sync test. */
import { expect, it } from 'vitest';
import { createTestIndexer, type TestIndexerProcessConfig } from 'envio';
import { createPublicClient, decodeEventLog } from 'viem';
import { batchAuctionAbi } from '@batchelor/core/abi';
import evidence from '../../contracts/bench/out/clear-live-testnet.json';
import { batchKey, orderKey } from '../src/ids';
import { DEMO_LOT, DEMO_MIN_PRICE, DEMO_TICK_SIZE, escrowFor, fill } from '@batchelor/core/settle';
type Mock = NonNullable<NonNullable<TestIndexerProcessConfig['chains'][10143]>['simulate']>[number];
it.skipIf(!process.env.INDEXER_LIVE_PARITY)('replays actual S3 testnet receipts and compares all 256 fills to previewFill', { timeout: 120000 }, async () => {
  const client = createPublicClient({ transport: pacedHttp('https://testnet-rpc.monad.xyz') });
  expect(await client.getChainId()).toBe(10143);
  const market = evidence.addresses.market as `0x${string}`;
  const events: Mock[] = [];
  for (const action of ['seed128', 'selfClear']) {
    const tx = evidence.transactions.find(t => t.action === action)!;
    const receipt = await client.getTransactionReceipt({ hash: tx.hash as `0x${string}` });
    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    for (const log of receipt.logs.filter(l => l.address.toLowerCase() === market.toLowerCase())) {
      const decoded = decodeEventLog({ abi: batchAuctionAbi, data: log.data, topics: log.topics });
      if (decoded.eventName !== 'OrderPlaced' && decoded.eventName !== 'BatchCleared') continue;
      const common = { contract: 'BatchAuction' as const, srcAddress: market, logIndex: log.logIndex, block: { number: Number(block.number), timestamp: Number(block.timestamp), baseFeePerGas: block.baseFeePerGas! }, transaction: { hash: receipt.transactionHash, transactionIndex: receipt.transactionIndex, effectiveGasPrice: receipt.effectiveGasPrice } };
      if (decoded.eventName === 'OrderPlaced') events.push({ ...common, event: 'OrderPlaced', params: { ...decoded.args, side: BigInt(decoded.args.side), tick: BigInt(decoded.args.tick) } });
      else events.push({ ...common, transaction: { hash: receipt.transactionHash }, event: 'BatchCleared', params: { ...decoded.args, clearTick: BigInt(decoded.args.clearTick), buyCutoff: BigInt(decoded.args.buyCutoff), sellCutoff: BigInt(decoded.args.sellCutoff), orderCount: BigInt(decoded.args.orderCount), clearGas: BigInt(decoded.args.clearGas) } });
    }
  }
  const indexer = createTestIndexer();
  await indexer.process({ chains: { 10143: { startBlock: Math.min(...events.map(e => e.block!.number!)), endBlock: Math.max(...events.map(e => e.block!.number!)), simulate: events } } });
  const batch = await indexer.Batch.getOrThrow(batchKey(10143, market, 1n));
  expect(batch.orderCount).toBe(256);
  expect(batch.clearGas).toBe(213565n);
  let comparisons = 0;
  // The paced transport applies the provider's request budget to every call.
  for (let offset = 0; offset < 256; offset += 8) {
    await Promise.all(Array.from({ length: 8 }, async (_, i) => {
      const order = await indexer.Order.getOrThrow(orderKey(10143, market, BigInt(offset + i)));
      const preview = await client.readContract({ address: market, abi: batchAuctionAbi, functionName: 'previewFill', args: [order.orderId], blockNumber: batch.clearedBlock! });
      const exact = fill({ ...order, escrow: escrowFor(order.side, order.lots, DEMO_MIN_PRICE + BigInt(order.tick) * DEMO_TICK_SIZE, DEMO_LOT) }, { ...batch, buyCutoff: batch.buyCutoff!, sellCutoff: batch.sellCutoff! }, batch.price!, DEMO_LOT);
      expect(preview).toEqual([order.baseOut - order.baseIn, order.quoteOut - order.quoteIn, exact.refund]);
      comparisons++;
    }));
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  expect(comparisons).toBe(256);
  const report = { source: 'real-testnet-receipts-replayed-in-memory', hosted: false, chainId: 10143, market, batchId: '1', fillsCompared: comparisons, clearGas: batch.clearGas!.toString(), placementHash: evidence.transactions.find(t => t.action === 'seed128')!.hash, clearHash: evidence.transactions.find(t => t.action === 'selfClear')!.hash, previewBlock: batch.clearedBlock!.toString(), batch, sampleOrders: await Promise.all([0n, 127n, 255n].map(id => indexer.Order.getOrThrow(orderKey(10143, market, id)))) };
  const folder = new URL('../evidence/', import.meta.url);
  await mkdir(folder, { recursive: true });
  await writeFile(new URL('testnet-replay.json', folder), JSON.stringify(report, (_, value: unknown) => typeof value === 'bigint' ? value.toString() : value === undefined ? null : value, 2) + '\n');
  console.log(JSON.stringify({ source: report.source, fillsCompared: comparisons, clearGas: report.clearGas }));
});
