import type { Address, Hex } from 'viem';

export type UncertainSubmission = { hash: Hex; senderNonce: number };
type ConfirmationClient = {
  getTransactionReceipt(args: { hash: Hex }): Promise<{ transactionHash: Hex }>;
  getTransactionCount(args: { address: Address; blockTag: 'latest' }): Promise<number>;
};

/** A missing receipt alone never releases the original signed transaction.
 * A confirmed nonce advancement proves a competing transaction consumed it.
 * Transport failures keep backpressure; provider details must not enter logs. */
export async function submissionResolved(client: ConfirmationClient, sender: Address, submission: UncertainSubmission): Promise<boolean> {
  try {
    const receipt = await client.getTransactionReceipt({ hash: submission.hash });
    return receipt.transactionHash.toLowerCase() === submission.hash.toLowerCase();
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'TransactionReceiptNotFoundError') return false;
  }
  try {
    const latestNonce = await client.getTransactionCount({ address: sender, blockTag: 'latest' });
    return latestNonce > submission.senderNonce;
  } catch { return false; }
}
