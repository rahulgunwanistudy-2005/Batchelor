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
  await keeper.scan(10n); const send = vi.fn().mockResolvedValue(hash);
  await keeper.onHead(101n, send); keeper.receipt(hash, false); await keeper.onHead(101n, send);
  expect(send).toHaveBeenCalledTimes(2);
});
