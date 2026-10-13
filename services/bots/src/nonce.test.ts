import { describe, expect, it, vi } from 'vitest';
import { NonceManager } from './nonce.js';

const address = '0x0000000000000000000000000000000000000001';

describe('nonce reservations', () => {
  it('serializes concurrent requests with one pending read', async () => {
    const read = vi.fn().mockResolvedValue(7);
    const manager = new NonceManager({ getTransactionCount: read }, address);
    expect(await Promise.all([manager.reserve(), manager.reserve(), manager.reserve()])).toEqual([7, 8, 9]);
    expect(read).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledWith({ address, blockTag: 'pending' });
  });
  it('stops on uncertain sends and resumes only after pending catches up', async () => {
    const read = vi.fn().mockResolvedValueOnce(7).mockResolvedValueOnce(7).mockResolvedValueOnce(10);
    const manager = new NonceManager({ getTransactionCount: read }, address);
    expect(await manager.reserve()).toBe(7);
    await expect(manager.reconcile()).rejects.toThrow('Resolve the original transaction');
    await expect(manager.reserve()).rejects.toThrow('Reconcile');
    expect(await manager.reconcile()).toBe(10);
    expect(await manager.reserve()).toBe(10);
  });
  it('can retry a failed initial RPC without corrupting the queue', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(3);
    const manager = new NonceManager({ getTransactionCount: read }, address);
    await expect(manager.reserve()).rejects.toThrow('offline');
    expect(await manager.reserve()).toBe(3);
  });
});

it('serializes actual signing and broadcast, increments only after accepted sends', async () => {
  const read = vi.fn().mockResolvedValue(7);
  const manager = new NonceManager({ getTransactionCount: read }, address);
  const signed: number[] = [];
  const sign = async (nonce: number) => { signed.push(nonce); return `0x${nonce.toString(16).padStart(2, '0')}` as const; };
  const send = vi.fn().mockImplementation(async (raw) => raw);
  await Promise.all([manager.submit(sign, send), manager.submit(sign, send), manager.submit(sign, send)]);
  expect(signed).toEqual([7, 8, 9]);
});
it('reconciles a definite nonce-high error before the next accepted send', async () => {
  const read = vi.fn().mockResolvedValueOnce(7).mockResolvedValueOnce(7).mockResolvedValueOnce(3);
  const manager = new NonceManager({ getTransactionCount: read }, address);
  await manager.reserve(); // Simulate stale cached nonce 8.
  const sign = vi.fn().mockResolvedValue('0x01');
  const send = vi.fn().mockRejectedValueOnce(new Error('nonce too high')).mockResolvedValue('0xab');
  expect(await manager.submit(sign, send)).toBe('0xab');
  expect(sign.mock.calls.map((c) => c[0])).toEqual([8, 7]);
});
it('retains ambiguous bytes, recovers those first, and never labels them as a new intent', async () => {
  const manager = new NonceManager({ getTransactionCount: vi.fn().mockResolvedValue(5) }, address);
  const sign = vi.fn().mockResolvedValueOnce('0x01').mockResolvedValueOnce('0x02');
  const send = vi.fn().mockRejectedValueOnce(new Error('connection lost with secret RPC URL')).mockResolvedValue('0xab');
  await expect(manager.submit(sign, send)).rejects.toThrow('Send uncertain');
  await expect(manager.submit(sign, send)).rejects.toThrow('Previous send recovered');
  expect(sign).toHaveBeenCalledOnce();
  expect(send.mock.calls.map((c) => c[0])).toEqual(['0x01', '0x01']);
  await manager.submit(sign, send);
  expect(sign.mock.calls.map((c) => c[0])).toEqual([5, 6]);
});
it('reconciles a nonce-low rejection from another consumed transaction', async () => {
  const read = vi.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(6);
  const manager = new NonceManager({ getTransactionCount: read }, address);
  const sign = vi.fn().mockResolvedValue('0x01');
  const send = vi.fn().mockRejectedValueOnce(new Error('nonce too low')).mockResolvedValue('0xaa');
  expect(await manager.submit(sign, send)).toBe('0xaa');
  expect(sign.mock.calls.map((c) => c[0])).toEqual([5, 6]);
});
it('does not consume a nonce when local signing fails', async () => {
  const manager = new NonceManager({ getTransactionCount: vi.fn().mockResolvedValue(5) }, address);
  const sign = vi.fn().mockRejectedValueOnce(new Error('sign failed')).mockResolvedValue('0x01');
  const send = vi.fn().mockResolvedValue('0xaa');
  await expect(manager.submit(sign, send)).rejects.toThrow('sign failed');
  await manager.submit(sign, send);
  expect(sign.mock.calls.map((c) => c[0])).toEqual([5, 5]);
});
