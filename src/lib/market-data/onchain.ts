import { erc20Abi, formatUnits, type Address, type PublicClient } from "viem";
import { batchAuctionAbi } from "../../../packages/core/src/abi";
import type {
  BatchResult,
  BookLevel,
  MarketDataResult,
  MarketSummary,
  OrderBookSnapshot,
} from "@/types/market";
import type { MarketDataAdapter } from "./adapter";

/**
 * Market data read straight from a deployed BatchAuction contract.
 *
 * UNPROVEN AGAINST A REAL DEPLOYMENT. The contract's view functions still
 * revert, so this has only run against a fake reader in unit tests. Two
 * things are assumed from the interface and must be confirmed before this
 * is switched on:
 *   1. `ladder(from, to)` is inclusive of `to` and returns one entry per tick.
 *   2. `result(id).clearedAt == 0` means the batch has not been cleared.
 */
export type ContractReader = Pick<PublicClient, "readContract" | "getChainId">;

export interface OnchainConfig {
  reader: ContractReader;
  address: Address;
  expectedChainId: number;
}

interface MarketParams {
  baseSymbol: string;
  quoteSymbol: string;
  baseDecimals: number;
  quoteDecimals: number;
  nTicks: number;
  minPrice: bigint;
  tickSize: bigint;
  lot: bigint;
}

function failure<T>(message: string): MarketDataResult<T> {
  return { status: "error", data: null, message };
}

export function createOnchainAdapter({ reader, address, expectedChainId }: OnchainConfig): MarketDataAdapter {
  const auction = { address, abi: batchAuctionAbi } as const;
  let params: Promise<MarketParams> | null = null;

  // Immutable per deployment, so read once and reuse; a failed read is retried.
  function loadParams(): Promise<MarketParams> {
    params ??= (async () => {
      const chainId = await reader.getChainId();
      if (chainId !== expectedChainId) throw new Error(`RPC is on chain ${chainId}, expected ${expectedChainId}.`);

      const [base, quote, nTicks, minPrice, tickSize, lot] = await Promise.all([
        reader.readContract({ ...auction, functionName: "BASE" }),
        reader.readContract({ ...auction, functionName: "QUOTE" }),
        reader.readContract({ ...auction, functionName: "N_TICKS" }),
        reader.readContract({ ...auction, functionName: "MIN_PRICE" }),
        reader.readContract({ ...auction, functionName: "TICK_SIZE" }),
        reader.readContract({ ...auction, functionName: "LOT" }),
      ]);
      const [baseSymbol, baseDecimals, quoteSymbol, quoteDecimals] = await Promise.all([
        reader.readContract({ address: base, abi: erc20Abi, functionName: "symbol" }),
        reader.readContract({ address: base, abi: erc20Abi, functionName: "decimals" }),
        reader.readContract({ address: quote, abi: erc20Abi, functionName: "symbol" }),
        reader.readContract({ address: quote, abi: erc20Abi, functionName: "decimals" }),
      ]);

      return { baseSymbol, quoteSymbol, baseDecimals, quoteDecimals, nTicks, minPrice, tickSize, lot };
    })().catch((error: unknown) => {
      params = null;
      throw error;
    });
    return params;
  }

  const tickPrice = (p: MarketParams, tick: number): string =>
    formatUnits(p.minPrice + BigInt(tick) * p.tickSize, p.quoteDecimals);
  const lotsToBase = (p: MarketParams, lots: bigint): string => formatUnits(lots * p.lot, p.baseDecimals);

  async function guarded<T>(read: () => Promise<MarketDataResult<T>>): Promise<MarketDataResult<T>> {
    try {
      return await read();
    } catch {
      // Covers RPC failures and contract reverts alike; neither yields data.
      return failure<T>("The auction contract could not be read.");
    }
  }

  return {
    getMarketSummary(marketId) {
      return guarded<MarketSummary>(async () => {
        const p = await loadParams();
        const open = await reader.readContract({ ...auction, functionName: "openBatch" });

        // The interface exposes no "latest cleared batch" view, so the last
        // price is only known when the batch before the open one has cleared.
        let lastClearingPrice: string | null = null;
        if (open.hasOpen && open.id > BigInt(1)) {
          const previous = await reader.readContract({ ...auction, functionName: "result", args: [open.id - BigInt(1)] });
          if (previous.clearedAt > BigInt(0) && previous.volumeLots > BigInt(0)) {
            lastClearingPrice = tickPrice(p, previous.clearTick);
          }
        }

        return {
          status: "live",
          data: {
            marketId,
            baseAsset: p.baseSymbol,
            quoteAsset: p.quoteSymbol,
            lastClearingPrice,
            change24hPercent: null,
            currentBatchId: open.hasOpen ? open.id.toString() : null,
            lastClearingTimestamp: null,
          },
        };
      });
    },

    getOrderBook(marketId) {
      return guarded<OrderBookSnapshot>(async () => {
        const p = await loadParams();
        const open = await reader.readContract({ ...auction, functionName: "openBatch" });
        const snapshot = (bids: BookLevel[], asks: BookLevel[]): MarketDataResult<OrderBookSnapshot> => ({
          status: "live",
          data: { marketId, batchId: open.hasOpen ? open.id.toString() : null, bids, asks, timestamp: Date.now() },
        });
        if (!open.hasOpen) return snapshot([], []);

        const [bidLots, askLots] = await reader.readContract({ ...auction, functionName: "ladder", args: [0, p.nTicks - 1] });
        if (bidLots.length !== p.nTicks || askLots.length !== p.nTicks) {
          return failure<OrderBookSnapshot>("The contract returned a ladder of unexpected length.");
        }

        const levels = (lots: readonly bigint[]): BookLevel[] =>
          lots.flatMap((quantity, tick) =>
            quantity > BigInt(0) ? [{ price: tickPrice(p, tick), quantity: lotsToBase(p, quantity) }] : [],
          );
        // Best price first on both sides: highest bid, lowest ask.
        return snapshot(levels(bidLots).reverse(), levels(askLots));
      });
    },

    async getCandles() {
      return {
        status: "unavailable",
        data: null,
        message: "Price history needs an indexer; it cannot be read from the contract.",
      };
    },

    getBatchResult(marketId, batchId) {
      if (!/^[1-9]\d{0,18}$/.test(batchId)) {
        return Promise.resolve(failure<BatchResult>("A batch ID must be a positive whole number."));
      }

      return guarded<BatchResult>(async () => {
        const p = await loadParams();
        const result = await reader.readContract({ ...auction, functionName: "result", args: [BigInt(batchId)] });
        if (result.clearedAt === BigInt(0)) {
          return { status: "unavailable", data: null, message: "This batch has not been cleared." };
        }

        const traded = result.volumeLots > BigInt(0);
        return {
          status: "live",
          data: {
            marketId,
            batchId,
            clearingPrice: traded ? `${tickPrice(p, result.clearTick)} ${p.quoteSymbol}` : null,
            volume: `${lotsToBase(p, result.volumeLots)} ${p.baseSymbol}`,
            orderCount: null,
            clearGas: result.clearGas.toString(),
            blockNumber: null,
            clearedAtTimestamp: null,
          },
        };
      });
    },
  };
}
