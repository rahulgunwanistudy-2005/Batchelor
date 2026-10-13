import { expect, it } from 'vitest';
import { parseGwei } from 'viem';
import { transactionGas } from '../packages/core/src/gas.ts';
import { demoBudget } from './demo-budget.ts';
it('funds three complete four-key bursts and ten minutes of six-order quotes', () => {
  const base = parseGwei('100'), result = demoBudget(base);
  expect(result.petePerKeyMax).toBe(3n * 20n * transactionGas('place') * 12n * base);
  expect(result.peteTotalMax).toBe(4n * result.petePerKeyMax);
  expect(result.moQuotes).toBe(2000n);
  expect(result.moMax).toBe(2000n * transactionGas('placeMany', 6) * parseGwei('201'));
  expect(demoBudget(2n * base).peteTotalMax).toBe(2n * result.peteTotalMax);
});
it('rejects impossible or unbounded budget inputs', () => {
  expect(() => demoBudget(-1n)).toThrow();
  expect(() => demoBudget(1n, 101n)).toThrow();
  expect(() => demoBudget(1n, 10n, 0n)).toThrow();
});
