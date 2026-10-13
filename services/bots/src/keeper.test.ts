import { expect, it, vi } from 'vitest';
import { Keeper } from './keeper.js';
import type { ChainClients, OrderCall } from './chain.js';
import { BotState } from './state.js';
const market = '0x0000000000000000000000000000000000000001';
const hash = '0x1234';
function setup(logs: unknown[] = []) {
  const readContract = vi.fn().mockImplementation(async ({ functionName }: { functionName: string }) => {
    if (functionName === 'openBatch') return { hasOpen: true, startBlock: 100n };
    if (functionName === 'BATCH_BLOCKS') return 1;
    return [market, 0, 106, false, 5n, 1n, 5000n];
  });
  const events = vi.fn().mockImplementation(async ({ fromBlock }: { fromBlock: bigint }) => fromBlock === 0n ? logs : []);
  const state = new BotState(); const keeper = new Keeper({ publicClient: { readContract, getContractEvents: events } } as unknown as ChainClients, market, 0n, state);
  return { keeper, readContract, events, state };
}
it('waits one block after seal, then cranks once while the clear is pending', async () => {
  const { keeper } = setup(); const send = vi.fn().mockResolvedValue(hash);
  await keeper.onHead(101n, send); expect(send).not.toHaveBeenCalled();
  await keeper.onHead(102n, send); await keeper.onHead(103n, send);
  expect(send).toHaveBeenCalledOnce(); expect(send).toHaveBeenCalledWith({ action: 'clear' });
});
it('recovers orders from earlier windows, claims in chunks of 50, and drops cancelled/claimed orders', async () => {
  const logs: unknown[] = Array.from({ length: 62 }, (_, i) => ({ eventName: 'OrderPlaced', args: { batchId: 1n, orderId: BigInt(i) } }));
  logs.push({ eventName: 'OrderCancelled', args: { orderId: 0n } }, { eventName: 'BatchCleared', args: { batchId: 1n }, blockNumber: 150n }, { eventName: 'Claimed', args: { orderId: 1n } });
  const { keeper, events, state } = setup(logs);
  await keeper.scan(251n); expect(events).toHaveBeenCalledTimes(3); expect(state.claimsPending).toBe(60);
  const send = vi.fn().mockImplementation(async (call: OrderCall) => call.action === 'clear' ? '0x01' : hash);
  await keeper.onHead(102n, send);
  const claim = send.mock.calls.find(([c]) => c.action === 'claim')![0]; expect(claim.ids).toHaveLength(50);
  expect(claim.ids).not.toContain(0n); expect(claim.ids).not.toContain(1n);
  keeper.receipt(hash, true); send.mockClear(); await keeper.onHead(103n, send);
  expect(send.mock.calls.find(([c]) => c.action === 'claim')![0].ids).toHaveLength(10);
});
it('does not advance the chain cursor after an RPC failure', async () => {
  const { keeper, events } = setup(); events.mockRejectedValueOnce(new Error('offline'));
  await expect(keeper.scan(10n)).rejects.toThrow(); expect(keeper.nextScanBlock).toBe(0n);
  await keeper.scan(10n); expect(keeper.nextScanBlock).toBe(11n);
});
it('failed claim receipts leave orders available for retry', async () => {
  const { keeper } = setup([{ eventName: 'OrderPlaced', args: { batchId: 1n, orderId: 1n } }, { eventName: 'BatchCleared', args: { batchId: 1n } }]);
  await keeper.scan(101n); const send = vi.fn().mockResolvedValue(hash);
  await keeper.onHead(101n, send); keeper.receipt(hash, false); await keeper.onHead(101n, send);
  expect(send).toHaveBeenCalledTimes(2);
});

function batchLogs(batch: bigint, count: number, block: bigint, first = 0n) {
  return [
    ...Array.from({ length: count }, (_, i) => ({ eventName: 'OrderPlaced', args: { batchId: batch, orderId: first + BigInt(i) }, blockNumber: block })),
    { eventName: 'BatchCleared', args: { batchId: batch }, blockNumber: block }
  ];
}
it('accumulates active six-order quotes and sends one measured-size claim at 50 orders', async () => {
  const { keeper, events, readContract, state } = setup();
  readContract.mockResolvedValue({ hasOpen: false, startBlock: 0n });
  const send = vi.fn().mockResolvedValue(hash);
  for (let batch = 1n; batch <= 9n; batch++) {
    events.mockResolvedValueOnce(batchLogs(batch, 6, batch, (batch - 1n) * 6n));
    await keeper.scan(batch); await keeper.onHead(batch, send, true);
    if (batch < 9n) expect(send).not.toHaveBeenCalled();
  }
  expect(send).toHaveBeenCalledOnce(); expect(send.mock.calls[0]![0].ids).toHaveLength(50);
  // Do not queue another claim behind a pending nonce even when the maker sleeps.
  await keeper.onHead(9n, send, false); expect(send).toHaveBeenCalledOnce();
  keeper.receipt(hash, true); expect(state.claimsPending).toBe(4);
  await keeper.onHead(9n, send, false);
  expect(send.mock.calls[1]![0].ids).toEqual([50n, 51n, 52n, 53n]);
});
it('dispatches a partial claim by nine cleared batches of age while trading remains active', async () => {
  const { keeper, events, readContract } = setup(batchLogs(1n, 1, 1n));
  readContract.mockResolvedValue({ hasOpen: false, startBlock: 0n });
  const send = vi.fn().mockResolvedValue(hash);
  await keeper.scan(1n); await keeper.onHead(1n, send, true);
  events.mockResolvedValueOnce([{ eventName: 'OrderPlaced', args: { batchId: 11n, orderId: 99n }, blockNumber: 9n },
    { eventName: 'BatchCleared', args: { batchId: 9n }, blockNumber: 9n }]);
  await keeper.scan(9n); await keeper.onHead(9n, send, true); expect(send).not.toHaveBeenCalled();
  events.mockResolvedValueOnce([{ eventName: 'BatchCleared', args: { batchId: 10n }, blockNumber: 10n }]);
  await keeper.scan(10n); await keeper.onHead(10n, send, true);
  expect(send).toHaveBeenCalledWith({ action: 'claim', ids: [0n] });
});
it('flushes partial claims after two idle confirmed heads even if the maker remains awake', async () => {
  const { keeper, readContract } = setup(batchLogs(1n, 6, 10n));
  readContract.mockResolvedValue({ hasOpen: false, startBlock: 0n });
  const send = vi.fn().mockResolvedValue(hash);
  await keeper.scan(10n); await keeper.onHead(10n, send, true); expect(send).not.toHaveBeenCalled();
  await keeper.scan(11n); await keeper.onHead(11n, send, true); expect(send).not.toHaveBeenCalled();
  await keeper.scan(12n); await keeper.onHead(12n, send, true); expect(send).toHaveBeenCalledOnce();
});
it('retries failed partial claims without resurrecting orders cancelled during submission', async () => {
  const { keeper, events, readContract, state } = setup(batchLogs(1n, 6, 10n));
  readContract.mockResolvedValue({ hasOpen: false, startBlock: 0n });
  const send = vi.fn().mockResolvedValue(hash);
  await keeper.scan(10n); await keeper.onHead(10n, send, false);
  events.mockResolvedValueOnce([{ eventName: 'OrderCancelled', args: { orderId: 0n }, blockNumber: 11n }]);
  await keeper.scan(11n); keeper.receipt(hash, false);
  await keeper.onHead(11n, send, true);
  expect(send.mock.calls[1]![0].ids).toEqual([1n, 2n, 3n, 4n, 5n]);
  keeper.receipt(hash, true); expect(state.claimsPending).toBe(0);
});
it('does not claim from incomplete event replay even when fifty orders are queued', async () => {
  const { keeper } = setup(batchLogs(1n, 50, 1n));
  await keeper.scan(1n); const send = vi.fn().mockResolvedValue(hash);
  await keeper.onHead(2n, send, false); expect(send).not.toHaveBeenCalled();
  await keeper.scan(2n); await keeper.onHead(2n, send, false); expect(send).toHaveBeenCalledOnce();
});

it('finishes bounded catch-up before claiming orders with terminal events in later windows', async () => {
  const { keeper, events, readContract, state } = setup();
  readContract.mockResolvedValue({ hasOpen: false, startBlock: 0n });
  events.mockImplementation(async ({ fromBlock }: { fromBlock: bigint }) => {
    if (fromBlock === 0n) return batchLogs(1n, 50, 1n);
    if (fromBlock === 500n) return [{ eventName: 'Claimed', args: { orderId: 0n }, blockNumber: 550n }];
    return [];
  });
  const send = vi.fn().mockResolvedValue(hash);
  await keeper.scan(600n); expect(keeper.nextScanBlock).toBe(500n);
  await keeper.onHead(600n, send, false); expect(send).not.toHaveBeenCalled();
  await keeper.scan(600n); await keeper.onHead(600n, send, false);
  expect(send.mock.calls[0]![0].ids).toHaveLength(49);
  expect(send.mock.calls[0]![0].ids).not.toContain(0n);
  keeper.receipt(hash, true); expect(state.claimsPending).toBe(0);
});

it('keeps one claim in flight and exposes age growth when receipts are delayed', async () => {
  const { keeper, events, readContract, state } = setup(batchLogs(1n, 1, 1n));
  readContract.mockResolvedValue({ hasOpen: false, startBlock: 0n });
  const send = vi.fn().mockResolvedValue(hash);
  await keeper.scan(1n); await keeper.onHead(1n, send, false);
  events.mockResolvedValueOnce([{ eventName: 'BatchCleared', args: { batchId: 20n }, blockNumber: 20n }]);
  await keeper.scan(20n); await keeper.onHead(20n, send, false);
  expect(send).toHaveBeenCalledOnce(); expect(state.oldestClaimBatchAge).toBe(19n);
  keeper.receipt(hash, true); expect(state.oldestClaimBatchAge).toBe(0n);
});

it('keeps claims within ten cleared batches over sustained quoting with next-head receipts', async () => {
  const { keeper, events, readContract, state } = setup();
  readContract.mockResolvedValue({ hasOpen: false, startBlock: 0n });
  const send = vi.fn().mockResolvedValue(hash);
  for (let batch = 1n; batch <= 100n; batch++) {
    keeper.receipt(hash, true);
    events.mockResolvedValueOnce(batchLogs(batch, 6, batch, (batch - 1n) * 6n));
    await keeper.scan(batch); await keeper.onHead(batch, send, true);
    expect(state.oldestClaimBatchAge).toBeLessThanOrEqual(10n);
  }
  keeper.receipt(hash, true); await keeper.onHead(100n, send, false); keeper.receipt(hash, true);
  expect(state.claimsPending).toBe(0);
  expect(send).toHaveBeenCalledTimes(12); // 600 orders, each transaction reuses the measured 50-order limit.
  expect(send.mock.calls.flatMap(([call]) => call.ids)).toHaveLength(600);
});
