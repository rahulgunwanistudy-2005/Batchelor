/** Exact integer port of contracts/src/lib/Settle.sol. Quote rounds once, independently of base. */
export interface SettlementOrder { side: number; tick: number; lots: bigint; escrow: bigint }
export interface SettlementResult { buyCutoff: number; sellCutoff: number; volumeLots: bigint; rB: bigint; mB: bigint; rS: bigint; mS: bigint }
export interface Fill { baseIn: bigint; baseOut: bigint; quoteIn: bigint; quoteOut: bigint; refund: bigint }
export const DEMO_LOT = 10n ** 15n;
export const DEMO_MIN_PRICE = 500_000n;
export const DEMO_TICK_SIZE = 5_000n;
export function ceilDiv(n: bigint, d: bigint): bigint {
  if (n < 0n || d <= 0n) throw new Error('Invalid unsigned division');
  return (n + d - 1n) / d;
}
export function escrowFor(side: number, lots: bigint, price: bigint, lot: bigint): bigint {
  if (side !== 0 && side !== 1) throw new Error('Invalid side');
  return side === 0 ? ceilDiv(lots * lot * price, 10n ** 18n) : lots * lot;
}
export function fill(o: SettlementOrder, result: SettlementResult, price: bigint, lot: bigint): Fill {
  if ((o.side !== 0 && o.side !== 1) || o.lots < 0n || o.escrow < 0n || price <= 0n || lot <= 0n) throw new Error('Invalid settlement');
  let r = 0n;
  let m = 1n;
  if (result.volumeLots > 0n) {
    if (o.side === 0) {
      if (o.tick > result.buyCutoff) r = 1n;
      else if (o.tick === result.buyCutoff) { r = result.rB; m = result.mB; }
    } else {
      if (o.tick < result.sellCutoff) r = 1n;
      else if (o.tick === result.sellCutoff) { r = result.rS; m = result.mS; }
    }
  }
  if (r === 0n) return { baseIn: 0n, baseOut: 0n, quoteIn: 0n, quoteOut: 0n, refund: o.escrow };
  if (r < 0n || m <= 0n || r > m) throw new Error('Invalid cutoff fraction');
  const b = o.lots * lot;
  if (o.side === 0) {
    const quoteIn = ceilDiv(b * r * price, m * 10n ** 18n);
    if (quoteIn > o.escrow) throw new Error('Settlement exceeds escrow');
    return { baseIn: 0n, baseOut: b * r / m, quoteIn, quoteOut: 0n, refund: o.escrow - quoteIn };
  }
  const baseIn = ceilDiv(b * r, m);
  return { baseIn, baseOut: 0n, quoteIn: 0n, quoteOut: b * r * price / (m * 10n ** 18n), refund: b - baseIn };
}
export function median(values: readonly bigint[]): bigint | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2n;
}
