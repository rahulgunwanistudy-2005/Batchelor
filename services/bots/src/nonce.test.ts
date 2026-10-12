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
