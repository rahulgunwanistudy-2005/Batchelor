import { describe, expect, it } from "vitest";
import { cumulativeTotals, withDepth } from "./depth";

const level = (price: string, quantity: string) => ({ price, quantity });

describe("cumulativeTotals", () => {
  it("accumulates exactly from the best price outward", () => {
    expect(cumulativeTotals([level("1.00", "0.1"), level("0.99", "0.2"), level("0.98", "0.25")]).map((t) => t.total)).toEqual(["0.1", "0.3", "0.55"]);
  });
  it("stops reporting totals after the first invalid quantity", () => {
    expect(cumulativeTotals([level("1", "2"), level("2", "bad"), level("3", "1")]).map((t) => t.total)).toEqual(["2", null, null]);
  });
  it("returns nothing for an empty side", () => {
    expect(cumulativeTotals([])).toEqual([]);
  });
});

describe("withDepth", () => {
  it("scales both sides against the single largest cumulative total", () => {
    const { bids, asks } = withDepth([level("1.00", "1"), level("0.99", "1")], [level("1.01", "4")]);
    expect(bids.map((b) => b.depth)).toEqual([0.25, 0.5]);
    expect(asks.map((a) => a.depth)).toEqual([1]);
    expect(asks[0].total).toBe("4");
  });
  it("gives zero depth, not NaN, for empty or invalid books", () => {
    expect(withDepth([], [])).toEqual({ bids: [], asks: [] });
    expect(withDepth([level("1", "x")], []).bids[0]).toEqual({ price: "1", quantity: "x", total: null, depth: 0 });
  });
});
