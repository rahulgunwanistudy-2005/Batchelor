import type { SettlementResult } from './settle.js';
export interface AuctionResult extends SettlementResult { clearTick: number }
const MAX = (1n << 64n) - 1n;
/** Exact linear port of Uncross.sol. Arrays include the whole supplied tick range. */
export function uncross(bids: readonly bigint[], asks: readonly bigint[], lo = 0, refTick = 100): AuctionResult {
  if (!Number.isInteger(lo) || lo < 0 || !bids.length || bids.length !== asks.length || lo + bids.length > 256 || !Number.isInteger(refTick) || refTick < 0 || refTick > 255) throw new Error('Bad range');
  if ([...bids, ...asks].some(v => v < 0n || v > MAX)) throw new Error('Invalid lots');
  const result: AuctionResult = { clearTick: 0, buyCutoff: 0, sellCutoff: 0, volumeLots: 0n, rB: 0n, mB: 0n, rS: 0n, mS: 0n };
  const demand = Array<bigint>(bids.length + 1).fill(0n);
  for (let j = bids.length - 1; j >= 0; j--) demand[j] = demand[j + 1]! + bids[j]!;
  let supply = 0n, best = -1n, abs = 0n;
  let candidates: { tick: number; surplus: bigint }[] = [];
  for (let j = 0; j < bids.length; j++) {
    supply += asks[j]!;
    const d = demand[j]!, volume = d < supply ? d : supply, surplus = d - supply, a = surplus < 0n ? -surplus : surplus;
    if (volume > best || (volume === best && a < abs)) { best = volume; abs = a; candidates = []; }
    if (volume === best && a === abs) candidates.push({ tick: lo + j, surplus });
  }
  if (best === 0n) return result;
  if (best > MAX) throw new Error('Overflow');
  let tick = candidates[0]!.tick;
  if (candidates.every(c => c.surplus > 0n)) tick = candidates.at(-1)!.tick;
  else if (!candidates.every(c => c.surplus < 0n)) for (const c of candidates) if (Math.abs(c.tick - refTick) < Math.abs(tick - refTick)) tick = c.tick;
  result.clearTick = tick; result.volumeLots = best;
  for (let j = bids.length - 1; j >= 0; j--) if (demand[j]! >= best) {
    result.buyCutoff = lo + j; result.rB = best - demand[j + 1]!; result.mB = bids[j]!; break;
  }
  supply = 0n;
  for (let j = 0; j < asks.length; j++) {
    if (supply + asks[j]! >= best) { result.sellCutoff = lo + j; result.rS = best - supply; result.mS = asks[j]!; break; }
    supply += asks[j]!;
  }
  return result;
}
