export const CANDLE_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;

export type CandleInterval = (typeof CANDLE_INTERVALS)[number];

export const DEFAULT_CANDLE_INTERVAL: CandleInterval = "1h";

export function parseCandleInterval(value: string | string[] | undefined): CandleInterval {
  return typeof value === "string" && (CANDLE_INTERVALS as readonly string[]).includes(value)
    ? (value as CandleInterval)
    : DEFAULT_CANDLE_INTERVAL;
}
