import { z } from 'zod';
import { getAddress, isAddress, recoverTypedDataAddress, type Address, type Hex } from 'viem';
import { intentData, transactionGas, type Intent } from '@batchelor/core';
export class ApiError extends Error { constructor(public code: string, message: string, public status = 400) { super(message); } }
const address = z.string().refine(isAddress).transform(v => getAddress(v));
const uint = (bits: number) => z.string().regex(/^(0|[1-9]\d*)$/).max(78).transform(BigInt).refine(v => v < 1n << BigInt(bits));
export const relaySchema = z.object({ intent: z.object({ trader: address, action: z.union([z.literal(0), z.literal(1)]), side: z.union([z.literal(0), z.literal(1)]), tick: z.number().int().min(0).max(255), lots: uint(64), orderId: uint(256), nonce: uint(64), deadline: uint(64) }).strict(), sig: z.string().regex(/^0x[0-9a-fA-F]{130}$/) }).strict();
export const dripSchema = z.object({ trader: address }).strict();
export const wakeSchema = z.object({ action: z.enum(['wake', 'unleash']) }).strict();
/** Bounded, expiring per-instance quotas. Hosted multi-instance quotas are best effort. */
export class RateLimiter {
  private entries = new Map<string, { start: number; count: number }>();
  constructor(private now = Date.now) {}
  take(key: string, limit: number, windowMs = 60_000) {
    const now = this.now();
    for (const [k,v] of this.entries) if (now - v.start >= windowMs) this.entries.delete(k);
    let entry = this.entries.get(key);
    if (!entry) {
      if (this.entries.size >= 10_000) throw new ApiError('BUSY', 'Service is busy. Try again shortly.', 429);
      entry = { start: now, count: 0 }; this.entries.set(key, entry);
    }
    if (entry.count >= limit) throw new ApiError('RATE_LIMITED', 'Too many requests. Try again in a minute.', 429);
    entry.count++;
  }
}
export interface RelayDependencies {
  chainId: number; market: Address; now(): number;
  nonce(trader: Address): Promise<bigint>;
  send(action: 'placeFor' | 'cancelFor' | 'drip', args: readonly unknown[], gas: bigint): Promise<Hex>;
  wake(): Promise<unknown>;
}
export async function relay(body: unknown, deps: RelayDependencies): Promise<{ hash: Hex }> {
  const parsed = relaySchema.safeParse(body);
  if (!parsed.success) throw new ApiError('INVALID_BODY', 'Check the order details and try again.');
  const { intent, sig } = parsed.data;
  if (intent.deadline < BigInt(deps.now())) throw new ApiError('EXPIRED', 'This order signature expired. Sign the order again.');
  if (intent.deadline > BigInt(deps.now() + 60)) throw new ApiError('BAD_DEADLINE', 'Order signatures must expire within 60 seconds.');
  if (intent.action === 0 && (intent.lots === 0n || intent.orderId !== 0n)) throw new ApiError('INVALID_ORDER', 'Enter an amount of at least 0.001 ROSE.');
  let signer: Address;
  try { signer = await recoverTypedDataAddress({ ...intentData(deps.chainId, deps.market, intent as Intent), signature: sig as Hex }); }
  catch { throw new ApiError('BAD_SIGNATURE', 'The signature could not be verified. Sign the order again.'); }
  if (signer.toLowerCase() !== intent.trader.toLowerCase()) throw new ApiError('BAD_SIGNATURE', 'The signature does not match your account. Sign again.');
  if (await deps.nonce(intent.trader) !== intent.nonce) throw new ApiError('BAD_NONCE', 'This signature has already been used or your account changed. Sign again.');
  const action = intent.action === 0 ? 'placeFor' : 'cancelFor';
  if (action === 'placeFor') void deps.wake().catch(() => undefined);
  return { hash: await deps.send(action, [intent, sig], transactionGas(action)) };
}
