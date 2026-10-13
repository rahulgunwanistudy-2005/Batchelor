import { describe, expect, it } from 'vitest';
import { readEnv } from './chain.js';
import { Mo } from './mo.js';
import { Pete } from './pete.js';
import { logRanges } from './keeper.js';
import { verifyDemo } from './rehearsal.js';
import type { DemoFill } from './rehearsal.js';

describe('Mo and Pete', () => {
  it('quotes deterministically, sleeps on expiry, bounds tick walk and provides burst headroom', () => {
    let now = 0; const env = readEnv({ MO_AWAKE_SECONDS: '1' });
    const a = new Mo(env, () => now), b = new Mo(env, () => now);
    expect(a.quote(1n, false)).toBeNull(); a.wake(); b.wake();
    for (let head = 1n; head <= 500n; head++) {
      const quote = a.quote(head, true); expect(quote).toEqual(b.quote(head, true));
      expect(a.mid).toBeGreaterThanOrEqual(60); expect(a.mid).toBeLessThanOrEqual(200);
      if (quote?.action !== 'placeMany') throw new Error('Missing quote.');
      expect(quote.ticks).toEqual([-1,-2,-3,1,2,3].map((d) => a.mid + d));
      expect(quote.lots.every((q) => q >= 5n && q <= 20n)).toBe(true);
      expect(quote.lots.slice(3).reduce((s, q) => s + q, 0n)).toBeGreaterThan(40n);
      expect(a.quote(head, true)).toBeNull();
    }
    now = 1000; expect(a.quote(501n, false)).toBeNull();
  });
  it('sends four keys once per head for exactly the burst window, caps daily and resets on UTC date', () => {
    let now = Date.UTC(2026, 9, 13); const env = readEnv({ PETE_BURST_BLOCKS: '3', PETE_DAILY_CAP: '1' });
    const mo = new Mo(env, () => now); const pete = new Pete(env, mo, () => now);
    expect(pete.unleash(10n)).toEqual({ startBlock: '11', remainingToday: 0 });
    expect(pete.orders(10n)).toEqual([]);
    for (let h = 11n; h <= 13n; h++) {
      const orders = pete.orders(h); expect(orders).toHaveLength(4);
      expect(new Set(orders.map((o) => o.name)).size).toBe(4);
      expect(orders[0]!.call).toEqual({ action: 'place', side: 0, tick: mo.mid + 6, lots: 5n });
      expect(pete.orders(h)).toEqual([]);
    }
    expect(pete.orders(14n)).toEqual([]); expect(() => pete.unleash(14n)).toThrow('cap');
    now += 86_400_000; expect(pete.remainingToday).toBe(1); expect(pete.unleash(15n).remainingToday).toBe(0);
  });
});
it('RPC scan windows never exceed 100 blocks, including catch-up over long outages', () => {
  expect(logRanges(1n, 251n)).toEqual([{ fromBlock: 1n, toBlock: 100n }, { fromBlock: 101n, toBlock: 200n }, { fromBlock: 201n, toBlock: 251n }]);
  expect(logRanges(3n, 2n)).toEqual([]);
});
const fill: DemoFill = { orderId: '1', batchId: '3', hash: '0xaa', txIndex: 2, block: '100', baseFee: 100n, priorityFee: 1n, baseDelta: 5n * 10n ** 15n, quoteDelta: -5000n, price: 1_000_000n };
it('rehearsal requires later same-block inclusion, real fills, identical settlement and actual priority multiple', () => {
  const pete = { ...fill, orderId: '2', txIndex: 1, priorityFee: 1000n };
  expect(verifyDemo(fill, [pete], 10n).passed).toBe(true);
  expect(() => verifyDemo(fill, [{ ...pete, batchId: '4' }], 10n)).toThrow('same batch');
  expect(() => verifyDemo(fill, [{ ...pete, txIndex: 3 }], 10n)).toThrow('transaction order');
  expect(() => verifyDemo(fill, [{ ...pete, priorityFee: 999n }], 10n)).toThrow('priority');
  expect(() => verifyDemo(fill, [{ ...pete, baseDelta: 0n }], 10n)).toThrow('fill');
  expect(() => verifyDemo(fill, [{ ...pete, price: 2n }], 10n)).toThrow('prices differ');
});
