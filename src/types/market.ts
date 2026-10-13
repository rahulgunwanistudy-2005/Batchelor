
export type DataStatus =
  | "live"
  | "loading"
  | "unavailable"
  | "error";

export interface MarketSummary {
  marketId: string;
  baseAsset: string;
  quoteAsset: string;
  lastClearingPrice: string | null;
  change24hPercent: string | null;
  currentBatchId: string | null;
  lastClearingTimestamp: number | null;
}

export interface BookLevel {
  /** Decimal strings avoid precision loss for token amounts. */
  price: string;
  quantity: string;
}

export interface OrderBookSnapshot {
  marketId: string;
  batchId: string | null;
  bids: BookLevel[];
  asks: BookLevel[];
  timestamp: number;
  /**
   * Where the open batch would clear if it sealed now, from the same
   * uncrossing rules the contract applies. Null when the book does not cross.
   */
  indicative: { price: string; volume: string } | null;
}

export interface Candle {
  /** Unix timestamp in milliseconds. */
  time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export interface BatchResult {
  marketId: string;
  batchId: string;
  /** Decimal strings, as elsewhere; null when the source omits a field. */
  clearingPrice: string | null;
  volume: string | null;
  orderCount: number | null;
  clearGas: string | null;
  blockNumber: string | null;
  /** Unix timestamp in milliseconds. */
  clearedAtTimestamp: number | null;
}

export interface MarketDataResult<T> {
  status: DataStatus;
  data: T | null;
  message?: string;
}
