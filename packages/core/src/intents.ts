import type { Address } from 'viem';
export interface Intent { trader: Address; action: number; side: number; tick: number; lots: bigint; orderId: bigint; nonce: bigint; deadline: bigint }
export const intentTypes = { Intent: [
  { name: 'trader', type: 'address' }, { name: 'action', type: 'uint8' }, { name: 'side', type: 'uint8' },
  { name: 'tick', type: 'uint16' }, { name: 'lots', type: 'uint64' }, { name: 'orderId', type: 'uint256' },
  { name: 'nonce', type: 'uint64' }, { name: 'deadline', type: 'uint64' }
] } as const;
export function intentData(chainId: number, market: Address, message: Intent) {
  return { domain: { name: 'Batchelor', version: '1', chainId, verifyingContract: market }, types: intentTypes, primaryType: 'Intent' as const, message };
}
export function buildIntent(input: Omit<Intent, 'deadline'> & { deadline?: bigint }, now = Math.floor(Date.now() / 1000)): Intent {
  return { ...input, deadline: input.deadline ?? BigInt(now + 60) };
}
export function intentJSON(intent: Intent) { return Object.fromEntries(Object.entries(intent).map(([k,v]) => [k, typeof v === 'bigint' ? v.toString() : v])); }
