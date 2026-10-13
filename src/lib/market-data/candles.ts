import type { Candle } from "@/types/market";

export interface ChartCandle {
  /** Unix timestamp in seconds, as the chart library expects. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Null when the source volume is unusable; the price bar is still drawn. */
  volume: number | null;
}

/**
 * Turns adapter candles into chart-ready bars: drops any candle with a
 * non-finite, non-positive or internally inconsistent price, sorts by
 * time, and keeps the first bar for each timestamp. Never invents a bar.
 */
export function normalizeCandles(candles: readonly Candle[]): ChartCandle[] {
  const valid = candles
    .filter((candle) => {
      const open = Number(candle.open);
      const high = Number(candle.high);
      const low = Number(candle.low);
      const close = Number(candle.close);

      return (
        Number.isFinite(candle.time) &&
        candle.time > 0 &&
        [open, high, low, close].every((value) => Number.isFinite(value) && value > 0) &&
        high >= Math.max(open, close, low) &&
        low <= Math.min(open, close, high)
      );
    })
    .map((candle) => {
      const volume = Number(candle.volume);

      return {
        time: Math.floor(candle.time / 1000),
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close),
        volume: candle.volume.trim() !== "" && Number.isFinite(volume) && volume >= 0 ? volume : null,
      };
    })
    .sort((a, b) => a.time - b.time);

  // Lightweight Charts requires unique, ascending timestamps.
  return valid.filter((candle, index, array) => index === 0 || candle.time !== array[index - 1].time);
}
