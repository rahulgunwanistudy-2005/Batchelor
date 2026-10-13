import { describe, expect, it } from "vitest";
import { addDecimals, formatDecimal, multiplyDecimals, parseDecimal, trimDecimal } from "./decimal";

const d = (value: string) => {
  const parsed = parseDecimal(value);
  if (!parsed) throw new Error(`not a decimal: ${value}`);
  return parsed;
};

describe("parseDecimal", () => {
  it("accepts plain non-negative decimals and keeps their scale", () => {
    expect(parseDecimal("12.340")).toEqual({ units: BigInt(12340), scale: 3 });
    expect(parseDecimal(" 7 ")).toEqual({ units: BigInt(7), scale: 0 });
    expect(parseDecimal("0.000001")).toEqual({ units: BigInt(1), scale: 6 });
  });
  it("rejects anything that is not a plain decimal", () => {
    for (const value of ["", " ", "-1", "+1", "1e3", ".5", "5.", "1,000", "abc", "1.2.3", "0x10", "NaN", "Infinity"]) {
      expect(parseDecimal(value)).toBeNull();
    }
  });
});

describe("decimal arithmetic", () => {
  it("adds across different scales without float error", () => {
    expect(formatDecimal(addDecimals(d("0.1"), d("0.2")))).toBe("0.3");
    expect(formatDecimal(addDecimals(d("1"), d("0.005")))).toBe("1.005");
  });
  it("multiplies exactly beyond double precision", () => {
    expect(formatDecimal(trimDecimal(multiplyDecimals(d("0.1"), d("0.2"))))).toBe("0.02");
    expect(formatDecimal(trimDecimal(multiplyDecimals(d("1.035"), d("2.5"))))).toBe("2.5875");
    expect(formatDecimal(trimDecimal(multiplyDecimals(d("123456789.123456789"), d("1000000.000001"))))).toBe("123456789123580.245789123456789");
  });
  it("trims only trailing fractional zeros", () => {
    expect(formatDecimal(trimDecimal(d("1.500")))).toBe("1.5");
    expect(formatDecimal(trimDecimal(d("200.00")))).toBe("200");
    expect(formatDecimal(trimDecimal(d("0.0")))).toBe("0");
    expect(formatDecimal(d("0.050"))).toBe("0.050");
  });
});
