import { describe, it, expect } from 'vitest';
import { replay, type ReplayOrder } from '../src/replay.js';
const order = (id: number, side: number, tick: number, lots: bigint, extra: Partial<ReplayOrder> = {}): ReplayOrder => ({ id: String(id), side, tick, lots, blockNumber: 1n, txIndex: id, logIndex: id, ...extra });
describe('continuous price/time replay', () => {
  it('trades at the resting price and keeps both participants and actor totals', () => {
    const r = replay([order(0, 1, 80, 5n, {actor:'mo'}), order(1, 0, 120, 3n, {actor:'pete'})]);
    expect(r.matchedLots).toBe(3n);
    expect(r.orders.map(o => o.averagePrice)).toEqual(Array(2).fill({ numerator: 2_700_000n, denominator: 3n }));
    expect(r.actors.pete.filledLots).toBe(3n); expect(r.actors.mo.priceLots).toBe(2_700_000n);
  });
  it('sweeps best levels first, then earlier arrivals at the same price', () => {
    const r = replay([order(0,1,100,4n),order(1,1,80,2n),order(2,1,80,2n),order(3,0,120,5n)]);
    expect(r.orders.map(o => o.filledLots)).toEqual([1n,2n,2n,5n]);
    expect(r.orders[3]!.averagePrice).toEqual({numerator:4_600_000n,denominator:5n});
  });
  it('rests partial remainders and matches incoming sells at the best bid', () => {
    const r=replay([order(0,0,120,2n),order(1,0,140,3n),order(2,1,100,4n),order(3,1,110,3n)]);
    expect(r.orders.map(o=>o.filledLots)).toEqual([2n,3n,4n,1n]); expect(r.matchedLots).toBe(5n);
    expect(r.orders[2]!.priceLots).toBe(4_700_000n);
  });
  it('sorts block/transaction/log independently, keeps exact large integers and does not mutate', () => {
    const q=2n**60n, input=[order(0,0,100,q,{blockNumber:2n}),order(1,1,80,q,{blockNumber:1n})];
    expect(replay(input).orders[1]!.priceLots).toBe(q*900_000n); expect(input[0]!.side).toBe(0);
  });
  it('excludes cancelled orders and returns null for unfilled averages', () => {
    const r=replay([order(0,1,80,10n,{cancelled:true}),order(1,0,120,10n)]);
    expect(r.matchedLots).toBe(0n); expect(r.orders[1]!.averagePrice).toBeNull();
  });
  it('rejects ambiguous arrival, duplicate ids and invalid quantities', () => {
    expect(()=>replay([order(1,0,80,0n)])).toThrow();
    expect(()=>replay([order(1,0,80,1n),order(1,1,80,1n)])).toThrow();
    expect(()=>replay([order(1,0,80,1n),order(2,1,80,1n,{txIndex:1,logIndex:1})])).toThrow();
  });
  it('conserves lots and notional in 1,000 seeded random books', () => {
    let seed=42; const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
    for(let run=0;run<1000;run++) {
      const input=Array.from({length:1+rand()%60},(_,i)=>order(i,rand()%2,rand()%256,BigInt(1+rand()%10000)));
      const r=replay(input); const sum=(side:number,key:'filledLots'|'priceLots')=>r.orders.reduce((s,f,i)=>s+(input[i]!.side===side?f[key]:0n),0n);
      expect(sum(0,'filledLots')).toBe(r.matchedLots);expect(sum(1,'filledLots')).toBe(r.matchedLots);expect(sum(0,'priceLots')).toBe(sum(1,'priceLots'));
      for(const side of [0,1]) expect(r.matchedLots<=input.filter(o=>o.side===side).reduce((s,o)=>s+o.lots,0n)).toBe(true);
      for(const [i,f] of r.orders.entries()) {
        expect(f.filledLots<=input[i]!.lots).toBe(true);
        if(f.filledLots) expect(input[i]!.side===0?f.priceLots<=f.filledLots*BigInt(500000+input[i]!.tick*5000):f.priceLots>=f.filledLots*BigInt(500000+input[i]!.tick*5000)).toBe(true);
      }
    }
  });
});
