import { describe, expect, it, vi } from 'vitest';
import { createIndexerClient } from './graphql';
const market = '0x1111111111111111111111111111111111111111';
const trader = '0x2222222222222222222222222222222222222222';
const id = `10143:${market}:batch:1`;
const batch = { id, chainId: 10143, batchId: '1', market, startBlock: '100', clearedBlock: '101', clearTxHash: `0x${'ab'.repeat(32)}`, clearTick: 100, price: '1000000', volumeLots: '1', buyCutoff: 100, sellCutoff: 100, rB: '1', mB: '1', rS: '1', mS: '1', orderCount: 1, placedCount: 1, relayedCount: 1, clearGas: '123456', baseFeePerGas: '100000000000', clearedAtTimestamp: '1001', maxPriorityFeePerGas: '1', medianPriorityFeePerGas: '1' };
const order = { id: `${id}:order:0`, chainId: 10143, orderId: '0', market, batch_id: id, trader_id: `10143:${market}:trader:${trader}`, side: 0, tick: 100, lots: '1', relayed: true, blockNumber: '100', txIndex: 0, logIndex: 0, txHash: `0x${'ab'.repeat(32)}`, effectiveGasPrice: '100000000001', maxPriorityFeePerGas: '1', baseFeePerGas: '100000000000', priorityFeePerGas: '1', cancelled: false, claimed: false, claimTxHash: null, baseIn: '0', baseOut: '1000000000000000', quoteIn: '1000', quoteOut: '0', filledLots: '1', trader: { address: trader }, batch: { batchId: '1', clearedBlock: '101' } };
const response = (data: unknown) => new Response(JSON.stringify({ data }));
function fixture(...results: unknown[]) {
  const fetcher = vi.fn<typeof fetch>();
  results.forEach(data => fetcher.mockResolvedValueOnce(response(data)));
  return { fetcher, client: createIndexerClient({ endpoint: 'https://example.com/graphql', chainId: 10143, market, fetch: fetcher }) };
}
describe('indexed read model', () => {
  it('keeps quantities exact and scopes batch requests', async () => {
    const { client, fetcher } = fixture({ Batch: [batch] }, { Order: [{ ...order, lots: '18446744073709551615' }] });
    const receipt = await client.batch('1');
    expect(receipt?.orders[0]?.lots).toBe(18446744073709551615n);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).variables).toEqual({ chain: 10143, market, id: '1' });
  });
  it('fetches all receipt pages instead of silently truncating at 1000', async () => {
    const { client, fetcher } = fixture({ Batch: [{ ...batch, placedCount: 1001, orderCount: 1001 }] }, { Order: Array.from({ length: 1000 }, (_, i) => ({ ...order, id: `${id}:${i}`, orderId: String(i), logIndex: i })) }, { Order: [{ ...order, id: `${id}:1000`, orderId: '1000', logIndex: 1000 }] });
    expect((await client.batch(1n))?.orders).toHaveLength(1001);
    expect(JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body)).variables.offset).toBe(1000);
  });
  it('distinguishes missing batches and partial synchronization', async () => {
    expect(await fixture({ Batch: [] }).client.batch(1n)).toBeNull();
    await expect(fixture({ Batch: [batch] }, { Order: [] }).client.batch(1n)).rejects.toThrow('still syncing');
  });
  it('rejects wrong fees, malformed data, GraphQL errors and transport failures', async () => {
    await expect(fixture({ Batch: [batch] }, { Order: [{ ...order, priorityFeePerGas: '2' }] }).client.batch(1n)).rejects.toThrow('incomplete data');
    await expect(fixture({ Batch: [{ ...batch, volumeLots: 9007199254740992 }] }).client.batch(1n)).rejects.toThrow('incomplete data');
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ errors: [{ message: 'internal details' }] })));
    const client = createIndexerClient({ endpoint: 'https://example.com', chainId: 10143, market, fetch: fetcher });
    await expect(client.recentBatches()).rejects.toThrow('could not return');
    fetcher.mockRejectedValueOnce(new Error('network'));
    await expect(client.recentBatches()).rejects.toThrow('unavailable');
  });
  it('computes statistics on the requested sample and handles no data', async () => {
    const rows = [100n, 200n, 400n, 300n].map((gas, i) => ({ ...batch, batchId: String(i + 1), clearGas: gas.toString() }));
    expect(await fixture({ Batch: rows }).client.batchStats(4)).toEqual({ count: 4, gasSampleCount: 4, p95ClearGas: 400n, medianClearGas: 250n, volumeLots: 4n });
    expect(await fixture({ Batch: [] }).client.batchStats()).toEqual({ count: 0, gasSampleCount: 0, p95ClearGas: null, medianClearGas: null, volumeLots: 0n });
  });

  it('does not render partial clearing evidence as a complete receipt', async () => {
    await expect(fixture({ Batch: [{...batch, price: null}] }, { Order: [order] }).client.batch(1n)).rejects.toThrow('still syncing');
    await expect(fixture({ Batch: [{...batch, orderCount: 2}] }, { Order: [order] }).client.batch(1n)).rejects.toThrow('still syncing');
  });
  it('keeps missing gas observations out of the percentile sample', async () => {
    const stats=await fixture({Batch:[batch,{...batch,batchId:'2',clearGas:null}]}).client.batchStats();
    expect(stats.count).toBe(2);expect(stats.gasSampleCount).toBe(1);expect(stats.p95ClearGas).toBe(123456n);
  });
  it('normalizes traders and validates bounds before sending', async () => {
    const { client, fetcher } = fixture({ Order: [order] });
    await client.ordersByTrader(trader.toUpperCase().replace('0X','0x'));
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).variables.trader).toBe(order.trader_id);
    await expect(client.recentBatches(501)).rejects.toThrow();
    await expect(client.ordersByTrader('bad')).rejects.toThrow();
    await expect(client.batch('0')).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
