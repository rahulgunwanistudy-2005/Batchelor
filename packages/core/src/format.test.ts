import { describe, expect, it } from 'vitest';
import { baseToLots, formatDusd, formatRose, formatUnits, lotsToBase, priceToTick, tickToPrice } from './format.js';

describe('market units', () => {
  it('round-trips every tick exactly', () => {
    for (let tick = 0; tick < 256; tick++) expect(priceToTick(tickToPrice(tick))).toBe(tick);
  });
  it('rejects out-of-range and off-grid prices', () => {
    for (const tick of [-1, 256, 0.5, NaN]) expect(() => tickToPrice(tick)).toThrow(RangeError);
    for (const price of [499_999n, 500_001n, 1_780_000n]) expect(() => priceToTick(price)).toThrow(RangeError);
  });
  it('keeps large quantities exact and rejects partial lots', () => {
    const lots = (1n << 64n) - 1n;
    expect(baseToLots(lotsToBase(lots))).toBe(lots);
    expect(() => baseToLots(1n)).toThrow(RangeError);
    expect(() => lotsToBase(-1n)).toThrow(RangeError);
  });
  it('formats smallest units, negatives, zero and values above number precision', () => {
    expect(formatDusd(1n)).toBe('0.000001 dUSD');
    expect(formatDusd(0n)).toBe('0.000000 dUSD');
    expect(formatRose(lotsToBase(1n))).toBe('0.001000000000000000 ROSE');
    expect(formatUnits(-1n, 6)).toBe('-0.000001');
    expect(formatDusd(9_007_199_254_740_993n)).toBe('9007199254.740993 dUSD');
  });
});
