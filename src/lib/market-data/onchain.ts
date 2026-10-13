import { BaseError, ContractFunctionRevertedError, erc20Abi, formatUnits, type Address, type PublicClient } from "viem";
import { batchAuctionAbi } from "../../../packages/core/src/abi";
import { uncross } from "../../../packages/core/src/uncross";
import { CANDLE_INTERVALS, type CandleInterval } from "./intervals";
import type {
  BatchResult,
  BookLevel,
  Candle,
  MarketDataResult,
  MarketSummary,
  OrderBookSnapshot,
} from "@/types/market";
import type { MarketDataAdapter } from "./adapter";

/**
 * Market data read straight from a deployed BatchAuction contract.
 *
 * Semantics taken from contracts/src/BatchAuction.sol:
 *   - `ladder(from, to)` includes `to` and returns one entry per tick.
 *   - `openBatch().id` is the open batch while `hasOpen`, otherwise the
 *     last batch that existed; ids start at 1.
 *   - `result(id).clearedAt` is the clearing block number, 0 if not cleared;
 *     `result` reverts with NotOpenBatch for an id that has no result yet.
 */
export type ContractReader = Pick<PublicClient, "readContract" | "getChainId" | "getBlock">;

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

/** A cleared batch as stored on chain; immutable once cleared, so safe to cache. */
interface ClearedBatch {
  id: bigint;
  clearTick: number;
  volumeLots: bigint;
  clearGas: number;
  block: bigint;
  timestampMs: number;
}

const INTERVAL_MS: Record<CandleInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

/** How many recent batches the chart reads; each costs two RPC calls the first time. */
const HISTORY_BATCHES = 60;

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

  const cleared = new Map<string, ClearedBatch>();
  const loading = new Map<string, Promise<ClearedBatch | null>>();

  /** A cleared batch by id, or null if it has no result yet. Concurrent callers share one read. */
  function loadCleared(id: bigint): Promise<ClearedBatch | null> {
    const key = id.toString();
    const cached = cleared.get(key);
    if (cached) return Promise.resolve(cached);
    let pending = loading.get(key);
    if (!pending) {
      pending = readCleared(id).finally(() => loading.delete(key));
      loading.set(key, pending);
    }
    return pending;
  }

  async function readCleared(id: bigint): Promise<ClearedBatch | null> {

    let result;
    try {
      result = await reader.readContract({ ...auction, functionName: "result", args: [id] });
    } catch (error) {
      const revert = error instanceof BaseError ? error.walk((cause) => cause instanceof ContractFunctionRevertedError) : null;
      if (revert instanceof ContractFunctionRevertedError && revert.data?.errorName === "NotOpenBatch") return null;
      throw error;
    }
    if (result.clearedAt === BigInt(0)) return null;

    const block = await reader.getBlock({ blockNumber: result.clearedAt });
    const batch: ClearedBatch = {
      id,
      clearTick: result.clearTick,
      volumeLots: result.volumeLots,
      clearGas: result.clearGas,
      block: result.clearedAt,
      timestampMs: Number(block.timestamp) * 1000,
    };
    cleared.set(id.toString(), batch);
    return batch;
  }

  // One page render asks for the open batch several times; share a single read briefly.
  let openRead: { at: number; value: ReturnType<typeof readOpen> } | null = null;
  function readOpen() {
    return reader.readContract({ ...auction, functionName: "openBatch" });
  }
  function openBatch() {
    const now = Date.now();
    if (!openRead || now - openRead.at > 500) {
      const value = readOpen();
      openRead = { at: now, value };
      value.catch(() => {
        if (openRead?.value === value) openRead = null;
      });
    }
    return openRead.value;
  }

  /** The last batch that can have a result: before an open batch, or the last batch once none is open. */
  async function lastResultId(): Promise<bigint> {
    const open = await openBatch();
    return open.hasOpen ? open.id - BigInt(1) : open.id;
  }

  /** Up to `limit` cleared batches, newest first. */
  async function recentCleared(limit: number): Promise<ClearedBatch[]> {
    const lastId = await lastResultId();
    const ids: bigint[] = [];
    for (let id = lastId; id >= BigInt(1) && ids.length < limit; id -= BigInt(1)) ids.push(id);
    const batches = await Promise.all(ids.map((id) => loadCleared(id)));
    return batches.filter((batch): batch is ClearedBatch => batch !== null);
  }

  function toBatchResult(p: MarketParams, marketId: string, batch: ClearedBatch): BatchResult {
    return {
      marketId,
      batchId: batch.id.toString(),
      clearingPrice: batch.volumeLots > BigInt(0) ? `${tickPrice(p, batch.clearTick)} ${p.quoteSymbol}` : null,
      volume: `${lotsToBase(p, batch.volumeLots)} ${p.baseSymbol}`,
      orderCount: null,
      clearGas: batch.clearGas.toString(),
      blockNumber: batch.block.toString(),
      clearedAtTimestamp: batch.timestampMs,
    };
  }

  return {
    getMarketSummary(marketId) {
      return guarded<MarketSummary>(async () => {
        const p = await loadParams();
        const open = await openBatch();

        // The most recent batch that can have a result: the one before an
        // open batch, or the last batch itself once nothing is open.
        const lastId = open.hasOpen ? open.id - BigInt(1) : open.id;
        const previous = lastId >= BigInt(1) ? await loadCleared(lastId) : null;
        const traded = previous !== null && previous.volumeLots > BigInt(0);

        return {
          status: "live",
          data: {
            marketId,
            baseAsset: p.baseSymbol,
            quoteAsset: p.quoteSymbol,
            lastClearingPrice: traded ? tickPrice(p, previous.clearTick) : null,
            change24hPercent: null,
            currentBatchId: open.hasOpen ? open.id.toString() : null,
            lastClearingTimestamp: traded ? previous.timestampMs : null,
          },
        };
      });
    },

    getOrderBook(marketId) {
      return guarded<OrderBookSnapshot>(async () => {
        const p = await loadParams();
        const open = await openBatch();
        const snapshot = (bids: BookLevel[], asks: BookLevel[]): MarketDataResult<OrderBookSnapshot> => ({
          status: "live",
          data: { marketId, batchId: open.hasOpen ? open.id.toString() : null, bids, asks, timestamp: Date.now(), indicative },
        });
        let indicative: OrderBookSnapshot["indicative"] = null;
        if (!open.hasOpen) return snapshot([], []);

        const [[bidLots, askLots], refTick] = await Promise.all([
          reader.readContract({ ...auction, functionName: "ladder", args: [0, p.nTicks - 1] }),
          reader.readContract({ ...auction, functionName: "refTick" }),
        ]);
        if (bidLots.length !== p.nTicks || askLots.length !== p.nTicks) {
          return failure<OrderBookSnapshot>("The contract returned a ladder of unexpected length.");
        }

        const levels = (lots: readonly bigint[]): BookLevel[] =>
          lots.flatMap((quantity, tick) =>
            quantity > BigInt(0) ? [{ price: tickPrice(p, tick), quantity: lotsToBase(p, quantity) }] : [],
          );
        // The contract's own uncrossing rules, mirrored in packages/core and checked against Solidity vectors.
        const crossing = uncross(bidLots, askLots, 0, refTick);
        if (crossing.volumeLots > BigInt(0)) {
          indicative = { price: tickPrice(p, crossing.clearTick), volume: lotsToBase(p, crossing.volumeLots) };
        }
        // Best price first on both sides: highest bid, lowest ask.
        return snapshot(levels(bidLots).reverse(), levels(askLots));
      });
    },

    getCandles(marketId, interval) {
      if (!(CANDLE_INTERVALS as readonly string[]).includes(interval)) {
        return Promise.resolve(failure<Candle[]>("Unsupported candle interval."));
      }
      const bucketMs = INTERVAL_MS[interval as CandleInterval];

      return guarded<Candle[]>(async () => {
        const p = await loadParams();
        const batches = (await recentCleared(HISTORY_BATCHES)).filter((batch) => batch.volumeLots > BigInt(0)).reverse();
        if (batches.length === 0) {
          return { status: "unavailable", data: null, message: "No batch has traded on this market yet." };
        }

        // Oldest first. Each candle summarises the clearing prices of the batches in its interval.
        const candles: { time: number; open: bigint; high: bigint; low: bigint; close: bigint; lots: bigint }[] = [];
        for (const batch of batches) {
          const price = p.minPrice + BigInt(batch.clearTick) * p.tickSize;
          const time = Math.floor(batch.timestampMs / bucketMs) * bucketMs;
          const last = candles[candles.length - 1];
          if (last && last.time === time) {
            if (price > last.high) last.high = price;
            if (price < last.low) last.low = price;
            last.close = price;
            last.lots += batch.volumeLots;
          } else {
            candles.push({ time, open: price, high: price, low: price, close: price, lots: batch.volumeLots });
          }
        }

        return {
          status: "live",
          data: candles.map((candle) => ({
            time: candle.time,
            open: formatUnits(candle.open, p.quoteDecimals),
            high: formatUnits(candle.high, p.quoteDecimals),
            low: formatUnits(candle.low, p.quoteDecimals),
            close: formatUnits(candle.close, p.quoteDecimals),
            volume: lotsToBase(p, candle.lots),
          })),
          message: `Built from the last ${batches.length} traded batch${batches.length === 1 ? "" : "es"} read from the contract.`,
        };
      });
    },

    getBatchResult(marketId, batchId) {
      if (!/^[1-9]\d{0,18}$/.test(batchId)) {
        return Promise.resolve(failure<BatchResult>("A batch ID must be a positive whole number."));
      }

      return guarded<BatchResult>(async () => {
        const p = await loadParams();
        const batch = await loadCleared(BigInt(batchId));
        if (!batch) {
          return { status: "unavailable", data: null, message: "This batch does not exist yet or has not been cleared." };
        }
        return { status: "live", data: toBatchResult(p, marketId, batch) };
      });
    },

    getRecentBatches(marketId, limit) {
      return guarded<BatchResult[]>(async () => {
        const p = await loadParams();
        const batches = await recentCleared(Math.max(1, Math.min(limit, HISTORY_BATCHES)));
        return { status: "live", data: batches.map((batch) => toBatchResult(p, marketId, batch)) };
      });
    },
  };
}
