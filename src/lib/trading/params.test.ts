import { describe, expect, it } from "vitest";
import { escrowFor, parseTokenAmount, priceToTick, quantityToLots, tickPrice, type MarketParams } from "./params";

// The demo market from the project spec: 0.50 dUSD at tick 0, 0.005 per tick, 0.001 ROSE lots.
const params: MarketParams = {
  base: "0x00000000000000000000000000000000000000b1",
  quote: "0x00000000000000000000000000000000000000c1",
  baseSymbol: "ROSE",
  quoteSymbol: "dUSD",
  baseDecimals: 18,
  quoteDecimals: 6,
  nTicks: 256,
  minPrice: BigInt(500_000),
  tickSize: BigInt(5_000),
  lot: BigInt(10) ** BigInt(15),
};

describe("priceToTick", () => {
  it("maps grid prices to ticks exactly", () => {
    expect(priceToTick(params, "0.5")).toEqual({ ok: true, value: 0 });
    expect(priceToTick(params, "1.035")).toEqual({ ok: true, value: 107 });
    expect(priceToTick(params, "1.775")).toEqual({ ok: true, value: 255 });
    for (let tick = 0; tick < 256; tick++) {
      const price = (Number(tickPrice(params, tick)) / 1e6).toFixed(6);
      expect(priceToTick(params, price)).toEqual({ ok: true, value: tick });
    }
  });
  it("rejects off-grid, out-of-range and malformed prices instead of rounding", () => {
    expect(priceToTick(params, "1.0351")).toMatchObject({ ok: false, reason: expect.stringContaining("1.035 dUSD or 1.04 dUSD") });
    for (const price of ["0.495", "1.78", "0", "", "abc", "-1", "1e3", "1.0000001"]) {
      expect(priceToTick(params, price).ok).toBe(false);
    }
  });
});

describe("quantityToLots", () => {
  it("accepts whole lots only", () => {
    expect(quantityToLots(params, "0.001")).toEqual({ ok: true, value: BigInt(1) });
    expect(quantityToLots(params, "2.5")).toEqual({ ok: true, value: BigInt(2500) });
    for (const quantity of ["0", "0.0005", "1.0001", "", "x", "-2"]) expect(quantityToLots(params, quantity).ok).toBe(false);
  });
  it("rejects quantities beyond the contract's uint64 lot count", () => {
    expect(quantityToLots(params, "18446744073709551.615")).toEqual({ ok: true, value: (BigInt(1) << BigInt(64)) - BigInt(1) });
    expect(quantityToLots(params, "18446744073709551.616").ok).toBe(false);
  });
});

describe("escrowFor", () => {
  it("locks base for a sell and rounded-up quote for a buy, as the contract does", () => {
    expect(escrowFor(params, "sell", 107, BigInt(2500))).toBe(BigInt(25) * BigInt(10) ** BigInt(17));
    // 2.5 ROSE at 1.035 dUSD = 2.5875 dUSD exactly.
    expect(escrowFor(params, "buy", 107, BigInt(2500))).toBe(BigInt(2_587_500));
    // 0.001 ROSE at 1.035 dUSD = 0.001035 dUSD = 1035 units.
    expect(escrowFor(params, "buy", 107, BigInt(1))).toBe(BigInt(1035));
  });
  it("rounds a fractional quote unit up, never down", () => {
    const odd: MarketParams = { ...params, lot: BigInt(1), minPrice: BigInt(500_001), tickSize: BigInt(1) };
    // 1 base unit at 0.500001 quote per whole token is far below one quote unit, so it rounds up to 1.
    expect(escrowFor(odd, "buy", 0, BigInt(1))).toBe(BigInt(1));
  });
});

describe("parseTokenAmount", () => {
  it("rejects zero, malformed and over-precise amounts", () => {
    expect(parseTokenAmount("1.5", 6)).toBe(BigInt(1_500_000));
    for (const value of ["0", "", "abc", "1.0000001", "-1"]) expect(parseTokenAmount(value, 6)).toBeNull();
  });
});
