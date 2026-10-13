import { describe, expect, it } from 'vitest';
import { createTestIndexer, type TestIndexerProcessConfig } from 'envio';
import { batchKey, orderKey, traderKey } from '../src/ids';

type Mock = NonNullable<NonNullable<TestIndexerProcessConfig['chains'][10143]>['simulate']>[number];
const market = '0x1111111111111111111111111111111111111111';
const pete = '0x2222222222222222222222222222222222222222';
const mo = '0x3333333333333333333333333333333333333333';
const asha = '0x4444444444444444444444444444444444444444';
const hash = `0x${'ab'.repeat(32)}`;
const place = (id: number, trader: string, side: bigint, tick: bigint, lots: bigint, relayed = false, priority = 1n, txIndex = id): Mock => ({
  contract: 'BatchAuction', event: 'OrderPlaced', srcAddress: market,
  params: { orderId: BigInt(id), trader: trader as `0x${string}`, batchId: 1n, side, tick, lots, relayed },
  block: { number: 100, timestamp: 1000, baseFeePerGas: 100n },
  transaction: { hash, transactionIndex: txIndex, effectiveGasPrice: 100n + priority, maxPriorityFeePerGas: 1000n }, logIndex: id,
});
const clear = (params = {}): Mock => ({ contract: 'BatchAuction', event: 'BatchCleared', srcAddress: market,
  block: { number: 101, timestamp: 1001, baseFeePerGas: 100n }, transaction: { hash },
  params: { batchId: 1n, clearTick: 100n, price: 1_000_000n, volumeLots: 9n, buyCutoff: 100n, sellCutoff: 100n, rB: 4n, mB: 4n, rS: 9n, mS: 9n, orderCount: 12n, clearGas: 123456n, ...params },
});
const process = (indexer: ReturnType<typeof createTestIndexer>, simulate: Mock[]) => indexer.process({ chains: { 10143: { startBlock: Math.min(...simulate.map(e => e.block!.number!)), endBlock: Math.max(...simulate.map(e => e.block!.number!)), simulate } } });

describe('real HyperIndex handler pipeline', () => {
  it('indexes Pete ×5, Mo ×6 and Asha ×1 with pre-claim fills and final claims', async () => {
    const indexer = createTestIndexer();
    const events: Mock[] = [];
    for (let i = 0; i < 5; i++) events.push(place(i, pete, 0n, 200n, 1n, false, 1000n));
    for (let i = 5; i < 8; i++) events.push(place(i, mo, 0n, 100n, 1n, false, 1n, 5));
    for (let i = 8; i < 11; i++) events.push(place(i, mo, 1n, 100n, 3n, false, 1n, 5));
    events.push(place(11, asha, 0n, 100n, 1n, true, 0n));
    await process(indexer, [...events, clear()]);
    const batch = await indexer.Batch.getOrThrow(batchKey(10143, market, 1n));
    expect(await indexer.SyncState.getOrThrow('10143')).toMatchObject({ processedBlock: 101n });
    expect(batch).toMatchObject({ startBlock: 100n, clearedBlock: 101n, clearTick: 100, price: 1_000_000n, volumeLots: 9n, orderCount: 12, placedCount: 12, relayedCount: 1, clearGas: 123456n, maxPriorityFeePerGas: 1000n, medianPriorityFeePerGas: 1n });
    for (let i = 0; i < 12; i++) {
      const order = await indexer.Order.getOrThrow(orderKey(10143, market, BigInt(i)));
      expect(order).toMatchObject({ claimed: false, cancelled: false, txHash: hash, txIndex: i >= 5 && i <= 10 ? 5 : i, logIndex: i, effectiveGasPrice: i < 5 ? 1100n : i === 11 ? 100n : 101n, priorityFeePerGas: i < 5 ? 1000n : i === 11 ? 0n : 1n });
      expect([order.baseIn, order.baseOut, order.quoteIn, order.quoteOut]).toEqual(i >= 8 && i <= 10 ? [3n * 10n ** 15n, 0n, 0n, 3000n] : [0n, 10n ** 15n, 1000n, 0n]);
    }
    expect(await indexer.Trader.getOrThrow(traderKey(10143, market, mo))).toMatchObject({ orderCount: 6, volumeLots: 12n });
    await process(indexer, [{ contract: 'BatchAuction', event: 'Claimed', srcAddress: market, block: { number: 102 }, params: { orderId: 11n, owner: asha, baseIn: 0n, baseOut: 10n ** 15n, quoteIn: 1000n, quoteOut: 0n } }]);
    expect(await indexer.Order.getOrThrow(orderKey(10143, market, 11n))).toMatchObject({ claimed: true, baseOut: 10n ** 15n });
  });
  it('excludes cancelled liquidity, retains its fees and represents a no-trade batch', async () => {
    const indexer = createTestIndexer();
    await process(indexer, [place(0, asha, 0n, 100n, 1n, true), { contract: 'BatchAuction', event: 'OrderCancelled', srcAddress: market, block: { number: 100 }, params: { orderId: 0n } }, clear({ volumeLots: 0n, orderCount: 0n, rB: 0n, mB: 0n, rS: 0n, mS: 0n })]);
    expect(await indexer.Order.getOrThrow(orderKey(10143, market, 0n))).toMatchObject({ cancelled: true, claimed: true, baseOut: 0n, quoteIn: 0n });
    expect(await indexer.Batch.getOrThrow(batchKey(10143, market, 1n))).toMatchObject({ orderCount: 0, placedCount: 1, medianPriorityFeePerGas: 1n });
  });
  it('settles fractional cutoffs with independent quote rounding', async () => {
    const indexer = createTestIndexer();
    await process(indexer, [place(0, pete, 0n, 100n, 2n), place(1, asha, 0n, 100n, 1n, true), place(2, mo, 1n, 100n, 1n), clear({ volumeLots: 1n, rB: 1n, mB: 3n, rS: 1n, mS: 1n, orderCount: 3n })]);
    expect(await indexer.Order.getOrThrow(orderKey(10143, market, 0n))).toMatchObject({ baseOut: 666666666666666n, quoteIn: 667n });
    expect(await indexer.Order.getOrThrow(orderKey(10143, market, 1n))).toMatchObject({ baseOut: 333333333333333n, quoteIn: 334n });
  });
  it('keeps identical order and batch numbers separate across markets', async () => {
    const indexer = createTestIndexer();
    const other = '0x5555555555555555555555555555555555555555';
    await process(indexer, [place(0, asha, 0n, 100n, 1n), { ...place(0, pete, 1n, 100n, 2n), srcAddress: other, logIndex: 1 }]);
    expect((await indexer.Order.getAll()).length).toBe(2);
    expect(await indexer.Batch.getOrThrow(batchKey(10143, market, 1n))).toMatchObject({ orderCount: 1 });
    expect(await indexer.Batch.getOrThrow(batchKey(10143, other, 1n))).toMatchObject({ orderCount: 1 });
  });
  it('rejects impossible paid fees rather than recording a fabricated zero', async () => {
    const indexer = createTestIndexer();
    await expect(process(indexer, [place(0, asha, 0n, 100n, 1n, false, -1n)])).rejects.toThrow();
  });
  it('rejects final claims that disagree with the predicted fill', async () => {
    const indexer = createTestIndexer();
    await process(indexer, [place(0, asha, 0n, 100n, 1n), place(1, mo, 1n, 100n, 1n), clear({ volumeLots: 1n, rB: 1n, mB: 1n, rS: 1n, mS: 1n, orderCount: 2n })]);
    await expect(process(indexer, [{ contract: 'BatchAuction', event: 'Claimed', srcAddress: market, block: { number: 102 }, params: { orderId: 0n, owner: asha, baseIn: 0n, baseOut: 0n, quoteIn: 1000n, quoteOut: 0n } }])).rejects.toThrow();
  });

  it('accumulates fractional trader volume before converting to whole lots', async () => {
    const indexer = createTestIndexer();
    await process(indexer, [place(0, asha, 0n, 100n, 1n), place(1, asha, 0n, 100n, 2n), place(2, mo, 1n, 100n, 2n), clear({ volumeLots: 2n, rB: 2n, mB: 3n, rS: 2n, mS: 2n, orderCount: 3n })]);
    expect(await indexer.Trader.getOrThrow(traderKey(10143, market, asha))).toMatchObject({ volumeBase: 1999999999999999n, volumeLots: 1n });
  });

});
