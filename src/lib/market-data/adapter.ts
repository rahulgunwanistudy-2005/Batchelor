
import type {
  BatchResult,
  Candle,
  MarketDataResult,
  MarketSummary,
  OrderBookSnapshot,
} from "@/types/market";
import { createPublicClient, http } from "viem";
import { networkConfig } from "@/lib/network/status";
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
};

/**
 * Contract reads stay off unless explicitly enabled AND a chain, RPC and
 * market address are all configured. The on-chain adapter has not been
 * run against a real deployment; see onchain.ts before enabling it.
 */
function selectAdapter(): MarketDataAdapter {
  const { expectedChainId, rpcUrl, marketAddress } = networkConfig;
  if (
    process.env.NEXT_PUBLIC_CONTRACT_READS !== "enabled" ||
    expectedChainId === null ||
    rpcUrl === null ||
    marketAddress === null
  ) {
    return unavailableAdapter;
  }

  return createOnchainAdapter({
    reader: createPublicClient({ transport: http(rpcUrl, { timeout: 8_000, retryCount: 0 }) }),
    address: marketAddress,
    expectedChainId,
  });
}

export const marketDataAdapter: MarketDataAdapter = selectAdapter();
