import { expect, it } from 'vitest';
import { parseGwei } from 'viem';
import { transactionGas } from '../packages/core/src/gas.ts';
import { keeperBudget, demoBudget } from './demo-budget.ts';
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

it('includes conservative keeper claim and clear caps in the recording and total budgets', () => {
  const base = parseGwei('100'), result = demoBudget(base);
  expect(result.keeperOrders).toBe(12240n);
  expect(result.keeperClaimFullTransactionsMax).toBe(244n);
  expect(result.keeperClaimPartialTransactionsMax).toBe(232n);
  expect(result.keeperClaimTransactionsMax).toBe(476n);
  expect(result.keeperClearTransactionsMax).toBe(2063n);
  expect(result.keeperClaimMax).toBe(476n * transactionGas('claim', 50) * parseGwei('201'));
  expect(result.keeperClearMax).toBe(2063n * transactionGas('clear') * parseGwei('201'));
  expect(result.keeperMax).toBe(result.keeperClaimMax + result.keeperClearMax);
  expect(result.totalBotMax).toBe(result.peteTotalMax + result.moMax + result.keeperMax);
});
it('reserves an age/idle tail even when fewer than fifty orders are generated', () => {
  const result = keeperBudget(parseGwei('100'), 1n);
  expect(result.keeperClaimTransactionsMax).toBe(2n);
  expect(result.keeperClearTransactionsMax).toBe(2n);
  expect(keeperBudget(1n, 0n).keeperMax).toBe(0n);
});
it('reduces five-minute keeper claim reservations without inventing lower gas limits', () => {
  const base = parseGwei('100'), result = keeperBudget(base, 1000n);
  expect(result.keeperClaimTransactionsMax).toBe(233n);
  expect(result.keeperClaimMax).toBeLessThan(1000n * transactionGas('claim', 50) * parseGwei('201'));
  expect(() => keeperBudget(base, -1n)).toThrow();
  expect(() => keeperBudget(base, 1n, 0n, 0n)).toThrow();
});

it('plans one controlled burst independently from the longer default campaign', () => {
  const base = parseGwei('100');
  const single = demoBudget(base, 10n, 20n, { bursts: 1n, awakeSeconds: 120n });
  const original = demoBudget(base);
  expect(single.minimumAwakeSeconds).toBe(96n);
  expect(single.awakeSessions).toBe(1n);
  expect(single.moQuotes).toBe(400n);
  expect(single.peteTotalMax * 3n).toBe(original.peteTotalMax);
  expect(single.moMax * 5n).toBe(original.moMax);
  expect(single.totalBotMax).toBeLessThan(original.totalBotMax);
});

it('rounds quote heads up and independently covers separately timed wake sessions', () => {
  const rounded = demoBudget(1n, 1n, 1n, { bursts: 1n, awakeSeconds: 2n, moWakeSeconds: 1n, blockIntervalMs: 700n });
  expect(rounded.moQuotes).toBe(3n);
  const sessions = demoBudget(1n, 1n, 1n, {
    bursts: 1n, awakeSeconds: 4n, awakeSessions: 3n, moWakeSeconds: 1n, blockIntervalMs: 700n
  });
  expect(sessions.minimumMoQuotes).toBe(7n);
  expect(sessions.moQuotes).toBe(7n); // Aggregate-duration rounding alone would reserve only six quotes.
});

it('rejects timing that omits the wake tail or exceeds bounded campaign settings', () => {
  expect(() => demoBudget(1n, 10n, 20n, { bursts: 1n, awakeSeconds: 90n })).toThrow('at least 96 seconds');
  for (const options of [
    { bursts: 0n }, { bursts: 11n }, { awakeSeconds: 0n }, { awakeSeconds: 3601n },
    { blockIntervalMs: 99n }, { blockIntervalMs: 10001n }, { awakeSessions: 0n }, { awakeSessions: 101n },
    { moWakeSeconds: 0n }, { moWakeSeconds: 601n }
  ]) expect(() => demoBudget(1n, 10n, 20n, options)).toThrow();
  expect(() => demoBudget(1n, 10n, 20n, { bursts: 1n, awakeSeconds: 120n, moWakeSeconds: 600n })).toThrow('at least 606 seconds');
});
