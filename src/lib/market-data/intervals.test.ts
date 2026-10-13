import { describe, expect, it } from "vitest";
import { CANDLE_INTERVALS, DEFAULT_CANDLE_INTERVAL, parseCandleInterval } from "./intervals";

describe("parseCandleInterval", () => {
  it("accepts every listed interval", () => {
    for (const interval of CANDLE_INTERVALS) expect(parseCandleInterval(interval)).toBe(interval);
  });
  it("falls back to the default for anything else", () => {
    for (const value of [undefined, "", "2h", "1H", "bogus", ["1m", "5m"]]) {
      expect(parseCandleInterval(value)).toBe(DEFAULT_CANDLE_INTERVAL);
    }
  });
});
