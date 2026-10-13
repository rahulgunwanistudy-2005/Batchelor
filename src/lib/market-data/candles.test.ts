import { describe, expect, it } from "vitest";
import type { Candle } from "@/types/market";
import { normalizeCandles } from "./candles";

const candle = (overrides: Partial<Candle> = {}): Candle => ({
  time: 1_760_000_000_000,
  open: "1.00",
  high: "1.10",
  low: "0.95",
  close: "1.05",
  volume: "12.5",
  ...overrides,
});

describe("normalizeCandles", () => {
  it("converts milliseconds to seconds and strings to numbers", () => {
    expect(normalizeCandles([candle()])).toEqual([{ time: 1_760_000_000, open: 1, high: 1.1, low: 0.95, close: 1.05, volume: 12.5 }]);
  });
  it("drops candles with unusable or inconsistent prices", () => {
    const bad = [
      candle({ open: "abc" }),
      candle({ close: "" }),
      candle({ low: "0" }),
      candle({ high: "-1" }),
      candle({ high: "1.01" }), // below the close
      candle({ low: "1.02" }), // above the open
      candle({ time: 0 }),
      candle({ time: Number.NaN }),
      candle({ open: "Infinity" }),
    ];
    expect(normalizeCandles(bad)).toEqual([]);
  });
  it("keeps the price bar but no volume when volume is unusable", () => {
    for (const volume of ["", " ", "-3", "n/a"]) expect(normalizeCandles([candle({ volume })])[0].volume).toBeNull();
    expect(normalizeCandles([candle({ volume: "0" })])[0].volume).toBe(0);
  });
  it("sorts ascending and keeps one bar per timestamp", () => {
    const result = normalizeCandles([
      candle({ time: 3_000_000, close: "1.03" }),
      candle({ time: 1_000_000, close: "1.01" }),
      candle({ time: 3_000_400, close: "1.04" }), // same second as the first
      candle({ time: 2_000_000, close: "1.02" }),
    ]);
    expect(result.map((c) => c.time)).toEqual([1000, 2000, 3000]);
    expect(result[2].close).toBe(1.03);
  });
  it("returns an empty list for no input", () => {
    expect(normalizeCandles([])).toEqual([]);
  });
});
