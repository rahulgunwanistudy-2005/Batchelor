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
import { BASE_SCALE, LOT, N_TICKS, tickToPrice } from './format.js';

/**
 * Off-chain mirror of the batch uncrossing and settlement rules (CLAUDE.md
 * §6.4-6.6). Pure integer arithmetic: the same inputs must give the same
 * outputs as the contract, so nothing here may use floating point.
 */
export type Side = 'buy' | 'sell';

export interface BookOrder {
  side: Side;
  tick: number;
  lots: bigint;
}

export interface Ladder {
  /** Lots bid at each tick, index = tick. */
  bids: bigint[];
  /** Lots offered at each tick, index = tick. */
  asks: bigint[];
}

export interface Uncrossing {
  clearTick: number;
  volumeLots: bigint;
  /** Lowest tick at which buys still fill; buys above it fill fully. */
  buyCutoff: number;
  /** Highest tick at which sells still fill; sells below it fill fully. */
  sellCutoff: number;
  /** Buys at `buyCutoff` fill `rB` of every `mB` lots. */
  rB: bigint;
  mB: bigint;
  /** Sells at `sellCutoff` fill `rS` of every `mS` lots. */
  rS: bigint;
  mS: bigint;
}

export interface Settlement {
  /** QUOTE for a buy, BASE for a sell. */
  escrow: bigint;
  baseReceived: bigint;
  baseDelivered: bigint;
  quotePaid: bigint;
  quoteReceived: bigint;
  /** Returned escrow, in the escrowed token. */
  refund: bigint;
}

function assertTick(tick: number, nTicks: number): void {
  if (!Number.isInteger(tick) || tick < 0 || tick >= nTicks) throw new RangeError(`Tick must be an integer from 0 to ${nTicks - 1}.`);
}

function mulDivDown(a: bigint, b: bigint, denominator: bigint): bigint {
  return (a * b) / denominator;
}

function mulDivUp(a: bigint, b: bigint, denominator: bigint): bigint {
  const product = a * b;
  return product / denominator + (product % denominator === 0n ? 0n : 1n);
}

/** Sums orders into per-tick totals. Order of the input never matters. */
export function aggregate(orders: readonly BookOrder[], nTicks: number = N_TICKS): Ladder {
  const bids = new Array<bigint>(nTicks).fill(0n);
  const asks = new Array<bigint>(nTicks).fill(0n);
  for (const order of orders) {
    assertTick(order.tick, nTicks);
    if (order.lots <= 0n) throw new RangeError('Order lots must be positive.');
    const side = order.side === 'buy' ? bids : asks;
    side[order.tick] = (side[order.tick] ?? 0n) + order.lots;
  }
  return { bids, asks };
}

/**
 * Finds the single clearing tick for a sealed batch: maximum executable
 * volume, then smallest surplus, then market pressure, then the tick
 * closest to `refTick` (lower tick on an exact tie). Returns null when
 * nothing can trade.
 */
export function uncross(ladder: Ladder, refTick: number): Uncrossing | null {
  const { bids, asks } = ladder;
  const nTicks = bids.length;
  if (asks.length !== nTicks) throw new RangeError('Bid and ask ladders must be the same length.');
  if (nTicks === 0) return null;
  assertTick(refTick, nTicks);

  const bid = (i: number): bigint => bids[i] ?? 0n;
  const ask = (i: number): bigint => asks[i] ?? 0n;
  for (let i = 0; i < nTicks; i++) {
    if (bid(i) < 0n || ask(i) < 0n) throw new RangeError('Ladder quantities cannot be negative.');
  }

  let lo = 0;
  while (lo < nTicks && ask(lo) === 0n) lo++;
  let hi = nTicks - 1;
  while (hi >= 0 && bid(hi) === 0n) hi--;
  // Either side empty, or the best ask is above the best bid.
  if (lo >= nTicks || hi < 0 || lo > hi) return null;

  // demand[i - lo] = lots bid at tick i or higher.
  const demand = new Array<bigint>(hi - lo + 1).fill(0n);
  let running = 0n;
  for (let i = hi; i >= lo; i--) {
    running += bid(i);
    demand[i - lo] = running;
  }

  let bestVol = 0n;
  let bestAbsSur = 0n;
  let lowCand = lo;
  let highCand = lo;
  let anyPos = false;
  let anyNeg = false;
  let anyZero = false;
  let closestToRef = lo;

  let supply = 0n;
  for (let i = lo; i <= hi; i++) {
    supply += ask(i);
    const d = demand[i - lo] ?? 0n;
    const vol = d < supply ? d : supply;
    const sur = d - supply;
    const absSur = sur < 0n ? -sur : sur;

    const better = vol > bestVol || (vol === bestVol && absSur < bestAbsSur);
    if (better || i === lo) {
      bestVol = vol;
      bestAbsSur = absSur;
      lowCand = i;
      highCand = i;
      anyPos = sur > 0n;
      anyNeg = sur < 0n;
      anyZero = sur === 0n;
      closestToRef = i;
    } else if (vol === bestVol && absSur === bestAbsSur) {
      highCand = i;
      anyPos ||= sur > 0n;
      anyNeg ||= sur < 0n;
      anyZero ||= sur === 0n;
      // Strict comparison on an ascending pass keeps the lower tick on a tie.
      if (Math.abs(i - refTick) < Math.abs(closestToRef - refTick)) closestToRef = i;
    }
  }

  if (bestVol === 0n) return null;

  let clearTick = closestToRef;
  if (anyPos && !anyNeg && !anyZero) clearTick = highCand;
  else if (anyNeg && !anyPos && !anyZero) clearTick = lowCand;

  // Price priority: buys fill from the highest tick down, sells from the lowest up.
  let buyCutoff = hi;
  let cumulative = 0n;
  for (let i = hi; i >= 0; i--) {
    cumulative += bid(i);
    if (cumulative >= bestVol) {
      buyCutoff = i;
      break;
    }
  }
  const mB = bid(buyCutoff);
  const rB = bestVol - (cumulative - mB);

  let sellCutoff = lo;
  cumulative = 0n;
  for (let i = lo; i < nTicks; i++) {
    cumulative += ask(i);
    if (cumulative >= bestVol) {
      sellCutoff = i;
      break;
    }
  }
  const mS = ask(sellCutoff);
  const rS = bestVol - (cumulative - mS);

  return { clearTick, volumeLots: bestVol, buyCutoff, sellCutoff, rB, mB, rS, mS };
}

/** Fraction `r / m` of an order that fills: 1/1 in full, 0/1 not at all. */
export function fillRatio(order: BookOrder, result: Uncrossing | null): { r: bigint; m: bigint } {
  if (!result) return { r: 0n, m: 1n };
  if (order.side === 'buy') {
    if (order.tick > result.buyCutoff) return { r: 1n, m: 1n };
    return order.tick === result.buyCutoff ? { r: result.rB, m: result.mB } : { r: 0n, m: 1n };
  }
  if (order.tick < result.sellCutoff) return { r: 1n, m: 1n };
  return order.tick === result.sellCutoff ? { r: result.rS, m: result.mS } : { r: 0n, m: 1n };
}

/**
 * Settles one order of a batch at the uniform clearing price. Rounding
 * always favours the contract: buyers' base rounds down and their payment
 * up; sellers' delivery rounds up and their proceeds down.
 */
export function settle(order: BookOrder, result: Uncrossing | null): Settlement {
  if (order.lots <= 0n) throw new RangeError('Order lots must be positive.');
  const base = order.lots * LOT;
  const { r, m } = fillRatio(order, result);
  const clearPrice = result ? tickToPrice(result.clearTick) : 0n;

  if (order.side === 'buy') {
    const escrow = mulDivUp(base, tickToPrice(order.tick), BASE_SCALE);
    const quotePaid = mulDivUp(base * r, clearPrice, m * BASE_SCALE);
    return { escrow, baseReceived: mulDivDown(base, r, m), baseDelivered: 0n, quotePaid, quoteReceived: 0n, refund: escrow - quotePaid };
  }

  const baseDelivered = mulDivUp(base, r, m);
  const quoteReceived = mulDivDown(base * r, clearPrice, m * BASE_SCALE);
  return { escrow: base, baseReceived: 0n, baseDelivered, quotePaid: 0n, quoteReceived, refund: base - baseDelivered };
}

/** Indicative result for a set of open orders, as if the batch sealed now. */
export function indicative(orders: readonly BookOrder[], refTick: number): Uncrossing | null {
  return uncross(aggregate(orders), refTick);
}
