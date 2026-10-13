import { describe, expect, it } from 'vitest';
import vectors from '../test/vectors.json';
import { uncross } from './uncross.js';
describe('Solidity uncross parity', () => {
  for (const v of vectors.vectors) it(`Foundry book ${v.seed}`, () => {
    const bids = Array<bigint>(256).fill(0n), asks = [...bids];
    for (const o of v.orders) (o.side === 0 ? bids : asks)[o.tick]! += BigInt(o.lots);
    expect(Object.fromEntries(Object.entries(uncross(bids, asks, 0, v.refTick)).map(([k,x]) => [k, typeof x === 'bigint' ? x.toString() : x]))).toEqual(v.result);
  });
  it('rejects unbounded ranges and quantities', () => {
    expect(() => uncross([], [])).toThrow();
    expect(() => uncross([1n], [-1n])).toThrow();
    expect(() => uncross([1n], [1n], 256)).toThrow();
  });
});
