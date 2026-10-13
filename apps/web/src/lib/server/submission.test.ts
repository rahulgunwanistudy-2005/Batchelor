import { expect, it, vi } from 'vitest';
import { submissionResolved } from './submission';

const sender = `0x${'11'.repeat(20)}` as const;
const submission = { hash: `0x${'ab'.repeat(32)}` as const, senderNonce: 7 };
function missingReceipt() { return Object.assign(new Error('not found'), { name: 'TransactionReceiptNotFoundError' }); }
function client() {
  return {
    getTransactionReceipt: vi.fn().mockRejectedValue(missingReceipt()),
    getTransactionCount: vi.fn().mockResolvedValue(7)
  };
}

it.each(['success', 'reverted'])('releases the uncertainty after a matching %s receipt consumes the nonce', async status => {
  const rpc = client(); rpc.getTransactionReceipt.mockResolvedValue({ transactionHash: submission.hash, status });
  expect(await submissionResolved(rpc, sender, submission)).toBe(true);
  expect(rpc.getTransactionCount).not.toHaveBeenCalled();
});
it('releases a never-mined hash only when the confirmed nonce proves a replacement consumed it', async () => {
  const rpc = client(); rpc.getTransactionCount.mockResolvedValue(8);
  expect(await submissionResolved(rpc, sender, submission)).toBe(true);
  expect(rpc.getTransactionReceipt).toHaveBeenCalledWith({ hash: submission.hash });
  expect(rpc.getTransactionCount).toHaveBeenCalledWith({ address: sender, blockTag: 'latest' });
});
it.each([6, 7])('retains the signed transaction when its nonce is still usable (latest %s)', async nonce => {
  const rpc = client(); rpc.getTransactionCount.mockResolvedValue(nonce);
  expect(await submissionResolved(rpc, sender, submission)).toBe(false);
});
it('fails closed on receipt transport errors rather than confusing them with a missing transaction', async () => {
  const rpc = client(); rpc.getTransactionReceipt.mockRejectedValue(new Error('private endpoint unavailable'));
  rpc.getTransactionCount.mockResolvedValue(8);
  expect(await submissionResolved(rpc, sender, submission)).toBe(false);
  expect(rpc.getTransactionCount).not.toHaveBeenCalled();
});
it('fails closed if the confirmed nonce cannot be read', async () => {
  const rpc = client(); rpc.getTransactionCount.mockRejectedValue(new Error('private endpoint unavailable'));
  expect(await submissionResolved(rpc, sender, submission)).toBe(false);
});
it('rejects a receipt that does not match the retained signed hash', async () => {
  const rpc = client(); rpc.getTransactionReceipt.mockResolvedValue({ transactionHash: `0x${'cd'.repeat(32)}` });
  expect(await submissionResolved(rpc, sender, submission)).toBe(false);
  expect(rpc.getTransactionCount).not.toHaveBeenCalled();
});
