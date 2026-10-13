
import type {
  BatchResult,
  Candle,
  MarketDataResult,
  MarketSummary,
  OrderBookSnapshot,
} from "@/types/market";
import { createPublicClient } from "viem";
import { networkConfig, rpcTransport } from "@/lib/network/status";
import { createOnchainAdapter } from "./onchain";

export interface MarketDataAdapter {
  getMarketSummary(
    marketId: string
  ): Promise<MarketDataResult<MarketSummary>>;

  getOrderBook(
    marketId: string
  ): Promise<MarketDataResult<OrderBookSnapshot>>;

  getCandles(
    marketId: string,
    interval: string
  ): Promise<MarketDataResult<Candle[]>>;

  getBatchResult(
    marketId: string,
    batchId: string
  ): Promise<MarketDataResult<BatchResult>>;

  /** Most recent cleared batches, newest first. */
  getRecentBatches(
    marketId: string,
    limit: number
  ): Promise<MarketDataResult<BatchResult[]>>;
}

function unavailable<T>(
  message: string
): MarketDataResult<T> {
  return {
    status: "unavailable",
    data: null,
    message,
  };
}

/**
 * Adapter used until a verified market-data source is configured.
 * It deliberately does not generate mock data.
 */
const unavailableAdapter: MarketDataAdapter = {
  async getMarketSummary(marketId) {
    if (!marketId.trim()) {
      return {
        status: "error",
        data: null,
        message: "A market ID is required.",
      };
    }

    return unavailable<MarketSummary>(
      "Market summary feed is not connected."
    );
  },

  async getOrderBook(marketId) {
    if (!marketId.trim()) {
      return {
        status: "error",
        data: null,
        message: "A market ID is required.",
      };
    }

    return unavailable<OrderBookSnapshot>(
      "Order book feed is not connected."
    );
  },

  async getCandles(marketId, interval) {
    if (!marketId.trim()) {
      return {
        status: "error",
        data: null,
        message: "A market ID is required.",
      };
    }

    if (!interval.trim()) {
      return {
        status: "error",
        data: null,
        message: "A candle interval is required.",
      };
    }

    return unavailable<Candle[]>(
      "Historical auction-clearing data is not connected."
    );
  },

  async getBatchResult(marketId, batchId) {
    if (!marketId.trim()) {
      return {
        status: "error",
        data: null,
        message: "A market ID is required.",
      };
    }

    if (!/^[1-9]\d*$/.test(batchId)) {
      return {
        status: "error",
        data: null,
        message: "A batch ID must be a positive whole number.",
      };
    }

    return unavailable<BatchResult>(
      "Batch results are not connected."
    );
  },

  async getRecentBatches() {
    return unavailable<BatchResult[]>(
      "Batch history is not connected."
    );
  },
};

/** True when a chain, RPC and market address are all configured. */
export const contractReadsConfigured =
  networkConfig.expectedChainId !== null && networkConfig.rpcUrl !== null && networkConfig.marketAddress !== null;

/**
 * Reads come from the auction contract once a chain, RPC and market
 * address are configured. No address is ever defaulted, so without one
 * every result stays "unavailable".
 */
function selectAdapter(): MarketDataAdapter {
  const { expectedChainId, rpcUrl, marketAddress } = networkConfig;
  if (expectedChainId === null || rpcUrl === null || marketAddress === null) {
    return unavailableAdapter;
  }

  return createOnchainAdapter({
    // Batched JSON-RPC and a few retries keep one page render within public RPC rate limits.
    reader: createPublicClient({ transport: rpcTransport({ timeout: 10_000, retryCount: 3, retryDelay: 250, batch: { wait: 10 } }) }),
    address: marketAddress,
    expectedChainId,
  });
}

export const marketDataAdapter: MarketDataAdapter = selectAdapter();
