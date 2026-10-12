export type DataStatus = "live" | "loading" | "unavailable" | "error";

export interface MarketSummary {
  marketId: string;
  baseSymbol: string;
  quoteSymbol: string;
  lastClearingPrice: string | null;
  priceChange24h: string | null;
  batchId: string | null;
  batchStatus: "open" | "clearing" | "settled" | "unknown";
  updatedAt: string | null;
}

export interface BookLevel {
  price: string;
  quantity: string;
}

export interface OrderBookSnapshot {
  bids: BookLevel[];
  asks: BookLevel[];
  updatedAt: string;
}

export interface MarketDataResult<T> {
  status: DataStatus;
  data: T | null;
  message?: string;
}
