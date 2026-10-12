import { pacedHttp } from './rpc.ts';
/** Read-only live acceptance audit. No transaction sends and no eth_getLogs. */
import { writeFile } from 'node:fs/promises';
import { createPublicClient, decodeEventLog, isAddress } from 'viem';
import { batchAuctionAbi } from '@batchelor/core/abi';
import { DEMO_LOT, DEMO_MIN_PRICE, DEMO_TICK_SIZE, escrowFor, fill } from '@batchelor/core/settle';
import { createIndexerClient } from '../../apps/web/src/lib/api/graphql.ts';
const endpoint = process.env.ENVIO_GRAPHQL_URL;
const market = process.env.MARKET_ADDRESS;
const rpc = process.env.RPC_HTTP;
const chainId = process.env.CHAIN === 'mainnet' ? 143 : process.env.CHAIN === 'testnet' ? 10143 : null;
const ids = (process.env.VERIFY_BATCH_IDS ?? '').split(',').filter(Boolean);
if (!endpoint || !market || !isAddress(market) || !rpc || !chainId || new Set(ids).size < 3) throw new Error('Set CHAIN, RPC_HTTP, MARKET_ADDRESS, ENVIO_GRAPHQL_URL and three distinct VERIFY_BATCH_IDS');
const client = createPublicClient({ transport: pacedHttp(rpc) });
if (await client.getChainId() !== chainId) throw new Error('RPC chain mismatch');
const indexer = createIndexerClient({ endpoint, market, chainId });
const receipts = [];
let previewComparisons = 0;
let finalClaimComparisons = 0;
const distinctTransactions = new Set<string>();
for (const id of ids) {
  const batch = await indexer.batch(id);
  if (!batch || batch.clearedBlock === null || batch.price === null || batch.buyCutoff === null || batch.sellCutoff === null) throw new Error(`Batch ${id} is not fully indexed`);
  const result = await client.readContract({ address: market, abi: batchAuctionAbi, functionName: 'result', args: [batch.batchId] });
  for (const key of ['clearTick','buyCutoff','sellCutoff','volumeLots','rB','mB','rS','mS','clearGas'] as const) {
    if (BigInt(result[key]) !== BigInt(batch[key]!)) throw new Error(`Batch ${id} differs on ${key}`);
  }
  for (const order of batch.orders) {
    const receipt = await client.getTransactionReceipt({ hash: order.txHash as `0x${string}` });
    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    if (receipt.transactionIndex !== order.txIndex || receipt.blockNumber !== order.blockNumber || block.baseFeePerGas === null || receipt.effectiveGasPrice !== order.effectiveGasPrice || receipt.effectiveGasPrice - block.baseFeePerGas !== order.priorityFeePerGas) throw new Error(`Order ${order.orderId} gas metadata differs`);
    const log = receipt.logs.find(log => log.logIndex === order.logIndex && log.address.toLowerCase() === market.toLowerCase());
    if (!log) throw new Error('Placement log missing');
    const placed = decodeEventLog({ abi: batchAuctionAbi, data: log.data, topics: log.topics, eventName: 'OrderPlaced' });
    if (placed.args.orderId !== order.orderId || placed.args.batchId !== batch.batchId || placed.args.trader.toLowerCase() !== order.trader.address.toLowerCase() || placed.args.side !== order.side || placed.args.tick !== order.tick || placed.args.lots !== order.lots || placed.args.relayed !== order.relayed) throw new Error('Placement data differs');
    distinctTransactions.add(order.txHash);
    if (order.cancelled) continue;
    const exact = fill({ ...order, escrow: escrowFor(order.side, order.lots, DEMO_MIN_PRICE + BigInt(order.tick) * DEMO_TICK_SIZE, DEMO_LOT) }, { ...batch, buyCutoff: batch.buyCutoff, sellCutoff: batch.sellCutoff }, batch.price, DEMO_LOT);
    for (const key of ['baseIn','baseOut','quoteIn','quoteOut'] as const) if (order[key] !== exact[key]) throw new Error('Shared settlement differs');
    const historical = await client.readContract({ address: market, abi: batchAuctionAbi, functionName: 'orders', args: [order.orderId], blockNumber: batch.clearedBlock });
    if (!historical[3]) {
      const preview = await client.readContract({ address: market, abi: batchAuctionAbi, functionName: 'previewFill', args: [order.orderId], blockNumber: batch.clearedBlock });
      if (preview[0] !== order.baseOut - order.baseIn || preview[1] !== order.quoteOut - order.quoteIn || preview[2] !== exact.refund) throw new Error('Contract preview differs');
      previewComparisons++;
    } else {
      // A claim in the clearing transaction makes even a historical preview zero.
      if (!order.claimTxHash) throw new Error('Claim has not synced yet; retry');
      const claimReceipt = await client.getTransactionReceipt({ hash: order.claimTxHash as `0x${string}` });
      const claim = claimReceipt.logs.filter(log => log.address.toLowerCase() === market.toLowerCase()).flatMap(log => {
        try { const decoded = decodeEventLog({ abi: batchAuctionAbi, data: log.data, topics: log.topics, eventName: 'Claimed' }); return decoded.args.orderId === order.orderId ? [decoded.args] : []; } catch { return []; }
      })[0];
      if (!claim || claim.owner.toLowerCase() !== order.trader.address.toLowerCase()) throw new Error('Claim missing');
      for (const key of ['baseIn','baseOut','quoteIn','quoteOut'] as const) if (claim[key] !== order[key]) throw new Error('Final claim differs');
      finalClaimComparisons++;
    }
  }
  receipts.push(batch);
}
if (distinctTransactions.size < 3) throw new Error('Need at least three distinct placement transactions');
const lagSamples = [];
for (let sample = 0; sample < 20; sample++) {
  const started = Date.now();
  const [head, state] = await Promise.all([client.getBlock(), indexer.syncState()]);
  if (!state || state.chainId !== chainId) throw new Error('Sync progress unavailable');
  const indexed = await client.getBlock({ blockNumber: state.processedBlock });
  const secondsUpperBound = Math.max(0, Number(head.timestamp - indexed.timestamp)) + (Date.now() - started) / 1000 + 1;
  lagSamples.push({ head: head.number, processed: state.processedBlock, secondsUpperBound });
  await new Promise(resolve => setTimeout(resolve, 1000));
}
const maxLagSeconds = Math.max(...lagSamples.map(s => s.secondsUpperBound));
const report = { source: 'live-read-only', chainId, market, endpoint, sampledAt: new Date().toISOString(), batches: receipts, placementTransactions: distinctTransactions.size, previewComparisons, finalClaimComparisons, allOrdersPreviewed: finalClaimComparisons === 0, lagSamples, maxLagSeconds, lagPassed: maxLagSeconds < 5 };
await writeFile(new URL('../rehearsal.json', import.meta.url), JSON.stringify(report, (_, value: unknown) => typeof value === 'bigint' ? value.toString() : value, 2) + '\n');
console.log(JSON.stringify({ chainId, batches: ids, previewComparisons, finalClaimComparisons, maxLagSeconds, lagPassed: report.lagPassed }));
if (!report.lagPassed) throw new Error('Indexer lag exceeded five seconds');
