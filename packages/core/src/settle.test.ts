import { describe, expect, it } from 'vitest';
import vectors from '../test/vectors.json';
import { escrowFor, fill, median } from './settle.js';

describe('Solidity settlement parity', () => {
  for (const vector of vectors.vectors) it(`Foundry book ${vector.seed}`, () => {
    const result = { ...vector.result, volumeLots: BigInt(vector.result.volumeLots), rB: BigInt(vector.result.rB), mB: BigInt(vector.result.mB), rS: BigInt(vector.result.rS), mS: BigInt(vector.result.mS) };
    const lot = BigInt(vectors.parameters.lot);
    vector.orders.forEach((order, i) => {
      const price = BigInt(vectors.parameters.minPrice) + BigInt(order.tick) * BigInt(vectors.parameters.tickSize);
      const actual = fill({ ...order, lots: BigInt(order.lots), escrow: escrowFor(order.side, BigInt(order.lots), price, lot) }, result, BigInt(vectors.parameters.minPrice) + BigInt(result.clearTick) * BigInt(vectors.parameters.tickSize), lot);
      expect(Object.fromEntries(Object.entries(actual).map(([k,v]) => [k,v.toString()]))).toEqual(vector.fills[i]);
    });
  });
  it('rounds the exact quote fraction only once', () => {
    expect(fill({ side: 0, tick: 100, lots: 1n, escrow: 10n }, { volumeLots: 1n, buyCutoff: 100, sellCutoff: 100, rB: 1n, mB: 3n, rS: 1n, mS: 1n }, 10n ** 18n, 2n)).toEqual({ baseIn: 0n, baseOut: 0n, quoteIn: 1n, quoteOut: 0n, refund: 9n });
  });
  it('computes integer medians without mutating inputs', () => {
    const values = [9n, 1n, 5n, 3n];
    expect(median(values)).toBe(4n);
    expect(values).toEqual([9n, 1n, 5n, 3n]);
    expect(median([])).toBeNull();
  });
});
