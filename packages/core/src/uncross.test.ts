import { describe, expect, it } from 'vitest';
import { BASE_SCALE, LOT, tickToPrice } from './format.js';
import { aggregate, indicative, settle, uncross, type BookOrder, type Side, type Uncrossing } from './uncross.js';

const buy = (tick: number, lots: bigint): BookOrder => ({ side: 'buy', tick, lots });
const sell = (tick: number, lots: bigint): BookOrder => ({ side: 'sell', tick, lots });

/** Deterministic PRNG so every fuzz failure is reproducible from its seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBook(random: () => number): BookOrder[] {
  const count = 1 + Math.floor(random() * 24);
  const centre = 20 + Math.floor(random() * 216);
  const spread = 1 + Math.floor(random() * 12);
  return Array.from({ length: count }, () => {
    const side: Side = random() < 0.5 ? 'buy' : 'sell';
    const tick = Math.min(255, Math.max(0, centre + Math.floor((random() - 0.5) * 2 * spread)));
    // Mix tiny and huge sizes so pro-rata rounding is exercised.
    const lots = random() < 0.2 ? BigInt(1 + Math.floor(random() * 3)) : BigInt(1 + Math.floor(random() * 1_000_000));
    return { side, tick, lots };
  });
}

/**
 * Naive reference: recomputes demand and supply from the raw order list at
 * every tick and applies the four rules literally, with no running state.
 */
function referenceClear(orders: readonly BookOrder[], refTick: number): { clearTick: number; volumeLots: bigint } | null {
  const buys = orders.filter((o) => o.side === 'buy');
  const sells = orders.filter((o) => o.side === 'sell');
  if (buys.length === 0 || sells.length === 0) return null;
  const lo = Math.min(...sells.map((o) => o.tick));
  const hi = Math.max(...buys.map((o) => o.tick));
  if (lo > hi) return null;

  const rows: { tick: number; vol: bigint; sur: bigint }[] = [];
  for (let tick = lo; tick <= hi; tick++) {
    const demand = buys.filter((o) => o.tick >= tick).reduce((sum, o) => sum + o.lots, 0n);
    const supply = sells.filter((o) => o.tick <= tick).reduce((sum, o) => sum + o.lots, 0n);
    rows.push({ tick, vol: demand < supply ? demand : supply, sur: demand - supply });
  }
  const abs = (x: bigint): bigint => (x < 0n ? -x : x);
  const maxVol = rows.reduce((max, row) => (row.vol > max ? row.vol : max), 0n);
  if (maxVol === 0n) return null;
  let candidates = rows.filter((row) => row.vol === maxVol);
  const minSur = candidates.reduce((min, row) => (abs(row.sur) < min ? abs(row.sur) : min), abs(candidates[0]!.sur));
  candidates = candidates.filter((row) => abs(row.sur) === minSur);

  let chosen: number;
  if (candidates.every((row) => row.sur > 0n)) chosen = Math.max(...candidates.map((row) => row.tick));
  else if (candidates.every((row) => row.sur < 0n)) chosen = Math.min(...candidates.map((row) => row.tick));
  else {
    const distance = Math.min(...candidates.map((row) => Math.abs(row.tick - refTick)));
    chosen = Math.min(...candidates.filter((row) => Math.abs(row.tick - refTick) === distance).map((row) => row.tick));
  }
  return { clearTick: chosen, volumeLots: maxVol };
}

describe('uncross: no trade', () => {
  it('returns null for empty, one-sided and uncrossed books', () => {
    expect(indicative([], 100)).toBeNull();
    expect(indicative([buy(120, 5n)], 100)).toBeNull();
    expect(indicative([sell(120, 5n)], 100)).toBeNull();
    expect(indicative([buy(99, 5n), sell(100, 5n)], 100)).toBeNull();
  });
  it('rejects malformed input', () => {
    expect(() => aggregate([buy(256, 1n)])).toThrow(RangeError);
    expect(() => aggregate([buy(1.5, 1n)])).toThrow(RangeError);
    expect(() => aggregate([sell(10, 0n)])).toThrow(RangeError);
    expect(() => uncross(aggregate([buy(10, 1n), sell(10, 1n)]), 256)).toThrow(RangeError);
    expect(() => uncross({ bids: [1n], asks: [1n, 1n] }, 0)).toThrow(RangeError);
  });
});

describe('uncross: hand-checked rules', () => {
  it('trades at the shared tick when bid and ask meet exactly', () => {
    expect(indicative([buy(100, 7n), sell(100, 7n)], 0)).toEqual({ clearTick: 100, volumeLots: 7n, buyCutoff: 100, sellCutoff: 100, rB: 7n, mB: 7n, rS: 7n, mS: 7n });
  });
  it('uses the reference tick when volume and surplus tie across a range', () => {
    const book = [buy(120, 10n), sell(100, 10n)];
    expect(indicative(book, 110)?.clearTick).toBe(110);
    expect(indicative(book, 30)?.clearTick).toBe(100);
    expect(indicative(book, 200)?.clearTick).toBe(120);
  });
  it('picks the highest candidate under buy pressure and rations buyers', () => {
    expect(indicative([buy(120, 20n), sell(100, 10n)], 100)).toEqual({ clearTick: 120, volumeLots: 10n, buyCutoff: 120, sellCutoff: 100, rB: 10n, mB: 20n, rS: 10n, mS: 10n });
  });
  it('picks the lowest candidate under sell pressure and rations sellers', () => {
    expect(indicative([buy(120, 10n), sell(100, 20n)], 120)).toEqual({ clearTick: 100, volumeLots: 10n, buyCutoff: 120, sellCutoff: 100, rB: 10n, mB: 10n, rS: 10n, mS: 20n });
  });
  it('maximises volume before anything else', () => {
    // Only ticks 104-105 match all 10 lots on both sides.
    const result = indicative([buy(110, 5n), buy(105, 5n), sell(100, 5n), sell(104, 5n)], 200);
    expect(result?.volumeLots).toBe(10n);
    expect(result?.clearTick).toBe(105);
    expect(result?.buyCutoff).toBe(105);
    expect(result?.sellCutoff).toBe(104);
  });
  it('prefers the smaller surplus among equal volumes', () => {
    // Ticks 100-104 balance exactly; 105-110 carry 5 lots of unsold supply.
    expect(indicative([buy(110, 10n), sell(100, 10n), sell(105, 5n)], 200)?.clearTick).toBe(104);
  });
  it('fills price-priority tiers fully and rations only the cutoff tick', () => {
    const result = indicative([buy(130, 4n), buy(120, 6n), buy(110, 9n), sell(100, 12n)], 100);
    expect(result).toEqual({ clearTick: 110, volumeLots: 12n, buyCutoff: 110, sellCutoff: 100, rB: 2n, mB: 9n, rS: 12n, mS: 12n });
  });
});

describe('settle: rounding and refunds', () => {
  it('settles a fully filled pair at the clearing price, not the limit', () => {
    const result = indicative([buy(120, 10n), sell(100, 10n)], 110)!;
    const price = tickToPrice(110);
    const bought = settle(buy(120, 10n), result);
    expect(bought.baseReceived).toBe(10n * LOT);
    expect(bought.quotePaid).toBe((10n * LOT * price) / BASE_SCALE);
    expect(bought.refund).toBe(bought.escrow - bought.quotePaid);
    expect(bought.escrow).toBe((10n * LOT * tickToPrice(120)) / BASE_SCALE);
    const sold = settle(sell(100, 10n), result);
    expect(sold.baseDelivered).toBe(10n * LOT);
    expect(sold.quoteReceived).toBe(bought.quotePaid);
    expect(sold.refund).toBe(0n);
  });
  it('refunds the whole escrow when nothing trades or the order misses', () => {
    const missed = settle(buy(90, 3n), indicative([buy(120, 5n), sell(100, 5n)], 100));
    expect(missed.baseReceived).toBe(0n);
    expect(missed.quotePaid).toBe(0n);
    expect(missed.refund).toBe(missed.escrow);
    const idle = settle(sell(140, 3n), null);
    expect(idle.baseDelivered).toBe(0n);
    expect(idle.refund).toBe(3n * LOT);
  });
  it('rounds pro-rata fills in the contract\'s favour', () => {
    // 1 lot shared between three 1-lot buyers: each gets a third, rounded down.
    const orders = [buy(110, 1n), buy(110, 1n), buy(110, 1n), sell(100, 1n)];
    const result = indicative(orders, 100)!;
    expect([result.rB, result.mB]).toEqual([1n, 3n]);
    const fill = settle(orders[0]!, result);
    expect(fill.baseReceived).toBe(LOT / 3n);
    expect(fill.quotePaid * 3n * BASE_SCALE >= LOT * tickToPrice(result.clearTick)).toBe(true);
  });
});

describe('fuzz: reference model and invariants', () => {
  const RUNS = 3000;

  it('matches the naive reference on random books', () => {
    const random = mulberry32(0xba7c4);
    for (let run = 0; run < RUNS; run++) {
      const orders = randomBook(random);
      const refTick = Math.floor(random() * 256);
      const actual = indicative(orders, refTick);
      const expected = referenceClear(orders, refTick);
      expect(actual === null ? null : { clearTick: actual.clearTick, volumeLots: actual.volumeLots }).toEqual(expected);
    }
  });

  it('holds the cutoff, limit, conservation and refund invariants', () => {
    const random = mulberry32(0x5eed);
    let traded = 0;
    for (let run = 0; run < RUNS; run++) {
      const orders = randomBook(random);
      const result = indicative(orders, Math.floor(random() * 256));
      const fills = orders.map((order) => settle(order, result));

      if (!result) {
        orders.forEach((_, i) => expect(fills[i]!.refund).toBe(fills[i]!.escrow));
        continue;
      }
      traded++;
      const price = tickToPrice(result.clearTick);
      expect(result.buyCutoff >= result.clearTick && result.clearTick >= result.sellCutoff).toBe(true);
      // At most one side is rationed.
      expect(result.rB === result.mB || result.rS === result.mS).toBe(true);
      expect(result.rB > 0n && result.rB <= result.mB && result.rS > 0n && result.rS <= result.mS).toBe(true);

      let baseReceived = 0n;
      let baseDelivered = 0n;
      let quotePaid = 0n;
      let quoteReceived = 0n;
      orders.forEach((order, i) => {
        const fill = fills[i]!;
        baseReceived += fill.baseReceived;
        baseDelivered += fill.baseDelivered;
        quotePaid += fill.quotePaid;
        quoteReceived += fill.quoteReceived;
        expect(fill.refund >= 0n).toBe(true);
        // Limit respected: a filled buy never clears above its limit, a filled sell never below.
        if (fill.baseReceived > 0n) expect(order.tick >= result.clearTick).toBe(true);
        if (fill.baseDelivered > 0n) expect(order.tick <= result.clearTick).toBe(true);
        // Uniform price: what a buyer pays for the base received never exceeds its limit price.
        if (order.side === 'buy') expect(fill.quotePaid <= fill.escrow).toBe(true);
        if (order.side === 'sell' && fill.baseDelivered === 0n) expect(fill.refund).toBe(fill.escrow);
        if (order.side === 'buy' && fill.baseReceived === 0n && fill.quotePaid === 0n) expect(fill.refund).toBe(fill.escrow);
      });

      const volumeBase = result.volumeLots * LOT;
      const count = BigInt(orders.length);
      expect(baseReceived <= volumeBase && volumeBase <= baseDelivered).toBe(true);
      expect(quotePaid * BASE_SCALE >= volumeBase * price && volumeBase * price >= quoteReceived * BASE_SCALE).toBe(true);
      expect(baseDelivered - baseReceived <= count).toBe(true);
      expect(quotePaid - quoteReceived <= count).toBe(true);
    }
    // Guard against a generator that never produces a crossing book.
    expect(traded > RUNS / 4).toBe(true);
  });

  it('is unchanged by the order in which a batch arrives', () => {
    const random = mulberry32(0x0b1d);
    const key = (order: BookOrder): string => `${order.side}:${order.tick}:${order.lots}`;
    for (let run = 0; run < RUNS; run++) {
      const orders = randomBook(random);
      const refTick = Math.floor(random() * 256);
      const shuffled = [...orders];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
      }
      const original: Uncrossing | null = indicative(orders, refTick);
      const permuted = indicative(shuffled, refTick);
      expect(permuted).toEqual(original);
      const fillsByOrder = new Map(orders.map((order) => [key(order), settle(order, original)]));
      for (const order of shuffled) expect(settle(order, permuted)).toEqual(fillsByOrder.get(key(order)));
    }
  });
});
