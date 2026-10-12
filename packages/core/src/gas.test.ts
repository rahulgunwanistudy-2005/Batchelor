import { describe, expect, it } from 'vitest';
import bench from './bench.json';
import { gasLimits, transactionGas } from './gas.js';

describe('measured transaction budgets', () => {
  it('uses every measured maximum with exactly the 7.5% buffer rounded to 1000', () => {
    for (const [name, row] of Object.entries(bench.entrypoints)) {
      expect(gasLimits[name as keyof typeof gasLimits]).toBe(Math.ceil(row.measuredWorst * 1.075 / 1000) * 1000);
      expect(row.limit).toBeGreaterThan(row.measuredWorst);
    }
  });
  it('reserves a self-clear even when the open batch is currently empty', () => {
    expect(transactionGas('place')).toBe(BigInt(gasLimits.placeSelfClear));
    expect(transactionGas('placeFor')).toBe(BigInt(gasLimits.placeForSelfClear));
    expect(transactionGas('placeMany', 6)).toBe(BigInt(gasLimits.placeManySelfClear));
    expect(transactionGas('cancelFor')).toBe(BigInt(gasLimits.cancel));
  });
  it('enforces the measured array sizes', () => {
    expect(transactionGas('claim', 1)).toBe(BigInt(gasLimits.claim1));
    expect(transactionGas('claim', 2)).toBe(BigInt(gasLimits.claim50));
    expect(() => transactionGas('claim', 51)).toThrow();
    expect(() => transactionGas('placeMany', 7)).toThrow();
    expect(() => transactionGas('claim', 0)).toThrow();
    expect(() => transactionGas('claim', 1.5)).toThrow();
  });
});
