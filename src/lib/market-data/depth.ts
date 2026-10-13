import type { BookLevel } from "@/types/market";
import { addDecimals, formatDecimal, parseDecimal, type Decimal } from "./decimal";

export interface DepthLevel extends BookLevel {
  /** Cumulative quantity from the best price to this level; null if any quantity so far is not a valid decimal. */
  total: string | null;
  /** Cumulative quantity as a share (0..1) of `maxTotal`, for depth bars only. */
  depth: number;
}

/**
 * Exact running totals over decimal-string quantities. `levels` must be
 * ordered best price first.
 */
export function cumulativeTotals(levels: BookLevel[]): { total: string | null; value: number }[] {
  let sum: Decimal = { units: BigInt(0), scale: 0 };
  let valid = true;

  return levels.map((level) => {
    const parsed = valid ? parseDecimal(level.quantity) : null;
    if (!parsed) {
      valid = false;
      return { total: null, value: 0 };
    }

    sum = addDecimals(sum, parsed);
    const total = formatDecimal(sum);
    return { total, value: Number(total) };
  });
}

export function withDepth(bids: BookLevel[], asks: BookLevel[]): { bids: DepthLevel[]; asks: DepthLevel[] } {
  const bidTotals = cumulativeTotals(bids);
  const askTotals = cumulativeTotals(asks);
  const maxTotal = Math.max(0, ...bidTotals.map((t) => t.value), ...askTotals.map((t) => t.value));

  const merge = (levels: BookLevel[], totals: { total: string | null; value: number }[]): DepthLevel[] =>
    levels.map((level, index) => ({
      ...level,
      total: totals[index].total,
      depth: maxTotal > 0 ? totals[index].value / maxTotal : 0,
    }));

  return { bids: merge(bids, bidTotals), asks: merge(asks, askTotals) };
}
