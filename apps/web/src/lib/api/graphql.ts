import { z } from 'zod';
import { median } from '@batchelor/core/settle';
const uint = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)]).transform(BigInt);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const count = z.number().int().nonnegative();
export const orderSchema = z.object({
  id: z.string(), chainId: count, orderId: uint, market: address, batch_id: z.string(), trader_id: z.string(),
  side: z.union([z.literal(0), z.literal(1)]), tick: count.max(255), lots: uint,
  relayed: z.boolean(), blockNumber: uint, txIndex: count, logIndex: count, txHash: hash,
  effectiveGasPrice: uint, maxPriorityFeePerGas: uint.nullable(), baseFeePerGas: uint, priorityFeePerGas: uint,
  cancelled: z.boolean(), claimed: z.boolean(), claimTxHash: hash.nullable(), baseIn: uint, baseOut: uint, quoteIn: uint, quoteOut: uint, filledLots: uint,
  trader: z.object({ address }), batch: z.object({ batchId: uint, clearedBlock: uint.nullable() }),
}).superRefine((o, ctx) => {
  if (o.effectiveGasPrice < o.baseFeePerGas || o.priorityFeePerGas !== o.effectiveGasPrice - o.baseFeePerGas) ctx.addIssue({ code: 'custom', message: 'Invalid paid priority fee' });
});
export const batchSchema = z.object({
  id: z.string(), chainId: count, batchId: uint, market: address, startBlock: uint, clearedBlock: uint.nullable(),
  clearTxHash: hash.nullable(), clearTick: count.max(255).nullable(), price: uint.nullable(), volumeLots: uint,
  buyCutoff: count.max(255).nullable(), sellCutoff: count.max(255).nullable(), rB: uint, mB: uint, rS: uint, mS: uint,
  orderCount: count, placedCount: count, relayedCount: count, clearGas: uint.nullable(), baseFeePerGas: uint.nullable(),
  clearedAtTimestamp: uint.nullable(), maxPriorityFeePerGas: uint, medianPriorityFeePerGas: uint,
});
export type IndexedOrder = z.infer<typeof orderSchema>;
export type IndexedBatch = z.infer<typeof batchSchema>;
export interface BatchReceipt extends IndexedBatch { orders: IndexedOrder[] }
const batchFields = 'id chainId batchId market startBlock clearedBlock clearTxHash clearTick price volumeLots buyCutoff sellCutoff rB mB rS mS orderCount placedCount relayedCount clearGas baseFeePerGas clearedAtTimestamp maxPriorityFeePerGas medianPriorityFeePerGas';
const orderFields = 'id chainId orderId market batch_id trader_id side tick lots relayed blockNumber txIndex logIndex txHash effectiveGasPrice maxPriorityFeePerGas baseFeePerGas priorityFeePerGas cancelled claimed claimTxHash baseIn baseOut quoteIn quoteOut filledLots trader { address } batch { batchId clearedBlock }';
export class IndexerError extends Error {}
export interface IndexerConfig { endpoint: string; chainId: 143 | 10143; market: string; fetch?: typeof fetch }
export function createIndexerClient(config: IndexerConfig) {
  const url = new URL(config.endpoint);
  if (!['https:', 'http:'].includes(url.protocol)) throw new IndexerError('Invalid indexer endpoint');
  const market = address.parse(config.market).toLowerCase();
  const requestFetch = config.fetch ?? globalThis.fetch;
  const scope = { chain: config.chainId, market };
  async function query<T>(document: string, variables: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    let response: Response;
    try { response = await requestFetch(url.href, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: document, variables }), signal: AbortSignal.timeout(10_000) }); }
    catch { throw new IndexerError('Indexed data is unavailable. Try again shortly.'); }
    if (!response.ok) throw new IndexerError('Indexed data is unavailable. Try again shortly.');
    const parsed = z.object({ data: z.unknown().optional(), errors: z.array(z.object({ message: z.string() })).optional() }).safeParse(await response.json().catch(() => null));
    if (!parsed.success || parsed.data.errors?.length || !parsed.data.data) throw new IndexerError('The indexer could not return this data. Try again shortly.');
    const data = schema.safeParse(parsed.data.data);
    if (!data.success) throw new IndexerError('The indexer returned incomplete data. Try again shortly.');
    return data.data;
  }
  const limitValue = (value: number, max = 500) => z.number().int().min(1).max(max).parse(value);
  async function batch(id: string | bigint): Promise<BatchReceipt | null> {
    const batchId = z.string().regex(/^[1-9]\d*$/).parse(String(id));
    const data = await query(`query BatchReceipt($chain: Int!, $market: String!, $id: numeric!) { Batch(where: {chainId: {_eq: $chain}, market: {_eq: $market}, batchId: {_eq: $id}}, limit: 1) { ${batchFields} } }`, { ...scope, id: batchId }, z.object({ Batch: z.array(batchSchema) }));
    const batch = data.Batch[0];
    if (!batch) return null;
    if (batch.chainId !== config.chainId || batch.market.toLowerCase() !== market || batch.batchId !== BigInt(batchId)) throw new IndexerError('The indexer returned a different market or batch.');
    const orders: IndexedOrder[] = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await query(`query BatchOrders($batch: String!, $offset: Int!) { Order(where: {batch_id: {_eq: $batch}}, order_by: [{blockNumber: asc}, {txIndex: asc}, {logIndex: asc}], limit: 1000, offset: $offset) { ${orderFields} } }`, { batch: batch.id, offset }, z.object({ Order: z.array(orderSchema) }));
      orders.push(...page.Order);
      if (page.Order.length < 1000) break;
    }
    if (orders.length !== batch.placedCount || new Set(orders.map(o => o.id)).size !== orders.length || orders.some(o => o.chainId !== config.chainId || o.market.toLowerCase() !== market || o.batch_id !== batch.id)) throw new IndexerError('This batch is still syncing. Try again shortly.');
    if (orders.filter(o => !o.cancelled).length !== batch.orderCount || (batch.clearedBlock !== null && [batch.clearTxHash, batch.clearTick, batch.price, batch.buyCutoff, batch.sellCutoff, batch.clearGas, batch.clearedAtTimestamp].some(value => value === null))) throw new IndexerError('This batch is still syncing. Try again shortly.');
    return { ...batch, orders };
  }
  async function recentBatches(limit = 60): Promise<IndexedBatch[]> {
    const data = await query(`query RecentBatches($chain: Int!, $market: String!, $limit: Int!) { Batch(where: {chainId: {_eq: $chain}, market: {_eq: $market}, clearedBlock: {_is_null: false}}, order_by: {batchId: desc}, limit: $limit) { ${batchFields} } }`, { ...scope, limit: limitValue(limit) }, z.object({ Batch: z.array(batchSchema) }));
    if (data.Batch.some(b => b.chainId !== config.chainId || b.market.toLowerCase() !== market)) throw new IndexerError('The indexer returned a different market.');
    return data.Batch;
  }
  async function ordersByTrader(trader: string, limit = 100, offset = 0): Promise<IndexedOrder[]> {
    const traderId = `${config.chainId}:${market}:trader:${address.parse(trader).toLowerCase()}`;
    const data = await query(`query TraderOrders($trader: String!, $limit: Int!, $offset: Int!) { Order(where: {trader_id: {_eq: $trader}}, order_by: {orderId: desc}, limit: $limit, offset: $offset) { ${orderFields} } }`, { trader: traderId, limit: limitValue(limit), offset: count.parse(offset) }, z.object({ Order: z.array(orderSchema) }));
    if (data.Order.some(o => o.trader_id !== traderId || o.chainId !== config.chainId || o.market.toLowerCase() !== market)) throw new IndexerError('The indexer returned a different trader or market.');
    return data.Order;
  }
  async function batchStats(lastN = 500) {
    const batches = await recentBatches(limitValue(lastN));
    const gases = batches.flatMap(b => b.clearGas === null ? [] : [b.clearGas]).sort((a,b) => a < b ? -1 : a > b ? 1 : 0);
    return { count: batches.length, gasSampleCount: gases.length, p95ClearGas: gases.length ? gases[Math.ceil(gases.length * 0.95) - 1]! : null, medianClearGas: median(batches.flatMap(b => b.clearGas === null ? [] : [b.clearGas])), volumeLots: batches.reduce((sum, b) => sum + b.volumeLots, 0n) };
  }
  async function syncState() {
    const data = await query('query Sync($id: String!) { SyncState_by_pk(id: $id) { chainId processedBlock } }', { id: String(config.chainId) }, z.object({ SyncState_by_pk: z.object({ chainId: count, processedBlock: uint }).nullable() }));
    return data.SyncState_by_pk;
  }
  return { batch, recentBatches, ordersByTrader, batchStats, syncState };
}
