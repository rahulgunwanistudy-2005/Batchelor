import type { Address } from 'viem';
import { getContractAddress, isAddress } from 'viem';
export interface DeploymentRecord { market: Address; faucet: Address; base: Address; quote: Address; startBlock: string; hashes: string[] }
interface Broadcast {
  transactions: { hash: string; contractName: string; contractAddress: string; transactionType: string;
    transaction: { from: Address; nonce: string; chainId?: string }; arguments: string[] }[];
  receipts: { transactionHash: string; status: string; blockNumber: string; contractAddress: string }[];
}
/** Only mined successful CREATEs from the specific Deploy script are publishable. */
export function deploymentFromBroadcast(input: unknown, chainId: number): DeploymentRecord {
  const data = input as Broadcast;
  if (!Array.isArray(data?.transactions) || !Array.isArray(data.receipts) || data.transactions.length !== 4) throw new Error('Expected four deployment transactions.');
  const names = ['DemoToken', 'DemoToken', 'BatchAuction', 'Faucet'];
  const fields = ['base', 'quote', 'market', 'faucet'] as const;
  const addresses: Partial<DeploymentRecord> = {};
  let start = 0n;
  const first = data.transactions[0]!;
  for (const [i, tx] of data.transactions.entries()) {
    if (tx.contractName !== names[i] || tx.transactionType !== 'CREATE' || !isAddress(tx.contractAddress) || /^0x0{40}$/i.test(tx.contractAddress)) throw new Error('Invalid deployment CREATE.');
    if (tx.transaction.chainId !== undefined && BigInt(tx.transaction.chainId) !== BigInt(chainId)) throw new Error('Broadcast chain mismatch.');
    if (tx.transaction.from.toLowerCase() !== first.transaction.from.toLowerCase() || BigInt(tx.transaction.nonce) !== BigInt(first.transaction.nonce) + BigInt(i)) throw new Error('Deployment CREATEs must be consecutive.');
    const expected = getContractAddress({ from: tx.transaction.from, nonce: BigInt(tx.transaction.nonce) });
    if (expected.toLowerCase() !== tx.contractAddress.toLowerCase()) throw new Error('CREATE address mismatch.');
    const receipt = data.receipts.find((r) => r.transactionHash.toLowerCase() === tx.hash.toLowerCase());
    if (!receipt || BigInt(receipt.status) !== 1n || receipt.contractAddress?.toLowerCase() !== tx.contractAddress.toLowerCase()) throw new Error('Deployment receipt missing, failed or mismatched.');
    addresses[fields[i]!] = tx.contractAddress as Address;
    // Index from the auction's creation, not the later faucet confirmation.
    // configure.ts verifies code was absent in the immediately preceding block.
    if (i === 2) start = BigInt(receipt.blockNumber);
  }
  const [base, quote, market, faucet] = data.transactions;
  if (base!.arguments[3]?.toLowerCase() !== faucet!.contractAddress.toLowerCase() || quote!.arguments[3]?.toLowerCase() !== faucet!.contractAddress.toLowerCase()
    || market!.arguments[0]?.toLowerCase() !== base!.contractAddress.toLowerCase() || market!.arguments[1]?.toLowerCase() !== quote!.contractAddress.toLowerCase()
    || faucet!.arguments.map((a) => a.toLowerCase()).join(',') !== [base!, quote!, market!].map((t) => t.contractAddress.toLowerCase()).join(',')) throw new Error('Token, market or faucet constructor mismatch.');
  if (base!.arguments[0] !== 'Rose' || base!.arguments[1] !== 'ROSE' || quote!.arguments[0] !== 'Demo USD' || quote!.arguments[1] !== 'dUSD' || base!.arguments[2] !== '18' || quote!.arguments[2] !== '6' || market!.arguments.slice(2).map((v) => BigInt(v).toString()).join(',') !== '500000,5000,1000000000000000,1,100') throw new Error('Demo parameters mismatch.');
  return { ...addresses, startBlock: start.toString(), hashes: data.transactions.map((t) => t.hash) } as DeploymentRecord;
}

export function sanitizedBroadcast(input: unknown, chainId: number) {
  deploymentFromBroadcast(input, chainId);
  const data = input as Broadcast;
  return {
    transactions: data.transactions.map((tx) => ({ hash: tx.hash, contractName: tx.contractName,
      contractAddress: tx.contractAddress, transactionType: tx.transactionType, arguments: tx.arguments,
      transaction: { from: tx.transaction.from, nonce: tx.transaction.nonce, chainId: String(chainId) } })),
    receipts: data.receipts.map((r) => ({ transactionHash: r.transactionHash, status: r.status,
      blockNumber: r.blockNumber, contractAddress: r.contractAddress }))
  };
}
