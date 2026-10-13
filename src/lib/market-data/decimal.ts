/** Exact arithmetic on non-negative decimal strings, so token amounts never pass through floats. */
export interface Decimal {
  units: bigint;
  scale: number;
}

const DECIMAL = /^\d+(\.\d+)?$/;

export function parseDecimal(value: string): Decimal | null {
  const trimmed = value.trim();
  if (!DECIMAL.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  return { units: BigInt(whole + fraction), scale: fraction.length };
}

export function formatDecimal({ units, scale }: Decimal): string {
  if (scale === 0) return units.toString();
  const digits = units.toString().padStart(scale + 1, "0");
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

export function addDecimals(a: Decimal, b: Decimal): Decimal {
  const scale = Math.max(a.scale, b.scale);
  const rescale = (d: Decimal) => d.units * BigInt(10) ** BigInt(scale - d.scale);
  return { units: rescale(a) + rescale(b), scale };
}

export function multiplyDecimals(a: Decimal, b: Decimal): Decimal {
  return { units: a.units * b.units, scale: a.scale + b.scale };
}

/** Drops trailing fractional zeros: 1.500 -> 1.5, 2.00 -> 2. */
export function trimDecimal({ units, scale }: Decimal): Decimal {
  const ten = BigInt(10);
  while (scale > 0 && units % ten === BigInt(0)) {
    units /= ten;
    scale -= 1;
  }
  return { units, scale };
}
