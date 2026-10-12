import type { MarketDataResult, MarketSummary, OrderBookSnapshot } from "@/types/market";

/**
 * Frontend contract for market data.
 * Replace this adapter with the agreed API/indexer/contract-backed implementation.
 * Do not put fixture data or inferred prices in this production-facing boundary.
 */
export interface MarketDataAdapter {
  getMarketSummary(marketId: string): Promise<MarketDataResult<MarketSummary>>;
  getOrderBook(marketId: string): Promise<MarketDataResult<OrderBookSnapshot>>;
}

export const marketDataAdapter: MarketDataAdapter = {
  async getMarketSummary() {
    return {
      status: "unavailable",
      data: null,
      message: "Market data is not connected yet. Backend integration is pending.",
    };
  },
  async getOrderBook() {
    return {
      status: "unavailable",
      data: null,
      message: "Order-book data is not connected yet.",
    };
  },
};
