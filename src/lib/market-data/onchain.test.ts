import { describe, expect, it } from "vitest";
import { createOnchainAdapter, type ContractReader } from "./onchain";

const AUCTION = "0x00000000000000000000000000000000000000a1";
const BASE = "0x00000000000000000000000000000000000000b1";
const QUOTE = "0x00000000000000000000000000000000000000c1";

const openBatch = (overrides: Partial<{ id: bigint; hasOpen: boolean }> = {}) => ({
  id: BigInt(7), startBlock: BigInt(100), bidMin: 0, bidMax: 0, askMin: 0, askMax: 0, orderCount: 0, hasOpen: true, ...overrides,
});
const clearedResult = (overrides: Partial<{ clearTick: number; volumeLots: bigint; clearedAt: bigint; clearGas: number }> = {}) => ({
  clearTick: 100, buyCutoff: 100, sellCutoff: 100, volumeLots: BigInt(2500), clearedAt: BigInt(99), clearGas: 41234,
  rB: BigInt(1), mB: BigInt(1), rS: BigInt(1), mS: BigInt(1), ...overrides,
});

/** Fake reader using the demo market's parameters from the project spec. */
function fakeReader(responses: Record<string, unknown> = {}, chainId = 10143) {
  const calls: string[] = [];
  const defaults: Record<string, unknown> = {
    BASE, QUOTE, N_TICKS: 256, MIN_PRICE: BigInt(500_000), TICK_SIZE: BigInt(5_000), LOT: BigInt(10) ** BigInt(15),
    [`symbol:${BASE}`]: "ROSE", [`decimals:${BASE}`]: 18, [`symbol:${QUOTE}`]: "dUSD", [`decimals:${QUOTE}`]: 6,
    openBatch: openBatch(),
    refTick: 100,
  };
  const reader = {
    getChainId: async () => chainId,
    // Block n is given timestamp n * 60 s, so tests can place batches in time.
    getBlock: async ({ blockNumber }: { blockNumber: bigint }) => ({ timestamp: blockNumber * BigInt(60) }),
    readContract: async ({ address, functionName, args }: { address: string; functionName: string; args?: readonly unknown[] }) => {
      calls.push(functionName);
      const plain = address === AUCTION ? functionName : `${functionName}:${address}`;
      const withArg = `${functionName}:${String(args?.[0])}`;
      const key = withArg in responses ? withArg : plain;
      const value = key in responses ? responses[key] : defaults[key];
      if (value === undefined) throw new Error(`reverted: ${key}`);
      if (value instanceof Error) throw value;
      return value;
    },
  } as unknown as ContractReader;
  return { reader, calls };
}

const adapterWith = (responses?: Record<string, unknown>, chainId?: number) => {
  const fake = fakeReader(responses, chainId);
  return { ...fake, adapter: createOnchainAdapter({ reader: fake.reader, address: AUCTION, expectedChainId: 10143 }) };
};

function ladder(bids: Record<number, bigint>, asks: Record<number, bigint>) {
  const side = (entries: Record<number, bigint>) => Array.from({ length: 256 }, (_, tick) => entries[tick] ?? BigInt(0));
  return [side(bids), side(asks)];
}

describe("on-chain adapter: order book", () => {
  it("converts ticks and lots to decimal prices and quantities, best price first", async () => {
    const { adapter } = adapterWith({ ladder: ladder({ 98: BigInt(1500), 99: BigInt(1) }, { 101: BigInt(2000), 103: BigInt(250) }) });
    const result = await adapter.getOrderBook("default");
    expect(result.status).toBe("live");
    expect(result.data?.batchId).toBe("7");
    expect(result.data?.bids).toEqual([{ price: "0.995", quantity: "0.001" }, { price: "0.99", quantity: "1.5" }]);
    expect(result.data?.asks).toEqual([{ price: "1.005", quantity: "2" }, { price: "1.015", quantity: "0.25" }]);
  });
  it("reports where a crossing book would clear, using the contract's rules", async () => {
    // 2.0 ROSE bid at 1.02 against 1.5 ROSE offered at 1.00: 1.5 trades, buy pressure picks the highest tick.
    const { adapter } = adapterWith({ ladder: ladder({ 104: BigInt(2000) }, { 100: BigInt(1500) }) });
    expect((await adapter.getOrderBook("default")).data?.indicative).toEqual({ price: "1.02", volume: "1.5" });
    const apart = adapterWith({ ladder: ladder({ 98: BigInt(1500) }, { 101: BigInt(2000) }) });
    expect((await apart.adapter.getOrderBook("default")).data?.indicative).toBeNull();
  });
  it("reports an empty live book, without reading the ladder, when no batch is open", async () => {
    const { adapter, calls } = adapterWith({ openBatch: openBatch({ hasOpen: false }) });
    const result = await adapter.getOrderBook("default");
    expect(result).toMatchObject({ status: "live", data: { batchId: null, bids: [], asks: [] } });
    expect(calls).not.toContain("ladder");
  });
  it("errors on a ladder of the wrong length instead of guessing ticks", async () => {
    const { adapter } = adapterWith({ ladder: [[BigInt(1)], [BigInt(1)]] });
    expect((await adapter.getOrderBook("default")).status).toBe("error");
  });
});

describe("on-chain adapter: failures never produce data", () => {
  it("returns an error when a view reverts, as the unimplemented contract does", async () => {
    const { adapter } = adapterWith({ openBatch: new Error("NotImplemented()") });
    for (const result of [await adapter.getMarketSummary("default"), await adapter.getOrderBook("default")]) {
      expect(result).toMatchObject({ status: "error", data: null });
    }
  });
  it("refuses to read from the wrong chain", async () => {
    const { adapter, calls } = adapterWith({}, 143);
    expect((await adapter.getMarketSummary("default")).status).toBe("error");
    expect(calls).toEqual([]);
  });
  it("retries market parameters after a failed first read", async () => {
    const responses: Record<string, unknown> = { LOT: new Error("rpc down"), result: clearedResult() };
    const { adapter } = adapterWith(responses);
    expect((await adapter.getMarketSummary("default")).status).toBe("error");
    delete responses.LOT;
    expect((await adapter.getMarketSummary("default")).status).toBe("live");
  });
  it("reports no candles, not an empty chart, when nothing has traded", async () => {
    const { adapter } = adapterWith({ openBatch: openBatch({ id: BigInt(1) }) });
    expect(await adapter.getCandles("default", "1h")).toMatchObject({ status: "unavailable", data: null });
    expect((await adapter.getCandles("default", "2h")).status).toBe("error");
  });
});

describe("on-chain adapter: summary and batch results", () => {
  it("reports symbols, the open batch and the previous batch's clearing price", async () => {
    const { adapter } = adapterWith({ result: clearedResult({ clearTick: 107 }) });
    expect((await adapter.getMarketSummary("default")).data).toEqual({
      marketId: "default", baseAsset: "ROSE", quoteAsset: "dUSD", lastClearingPrice: "1.035",
      change24hPercent: null, currentBatchId: "7", lastClearingTimestamp: 99 * 60_000,
    });
  });
  it("leaves the last price empty when the previous batch did not trade or nothing is open", async () => {
    const noTrade = adapterWith({ result: clearedResult({ volumeLots: BigInt(0) }) });
    expect((await noTrade.adapter.getMarketSummary("default")).data?.lastClearingPrice).toBeNull();
    const first = adapterWith({ openBatch: openBatch({ id: BigInt(1) }) });
    expect((await first.adapter.getMarketSummary("default")).data?.lastClearingPrice).toBeNull();
    expect(first.calls).not.toContain("result");
    const never = adapterWith({ openBatch: openBatch({ id: BigInt(0), hasOpen: false }) });
    expect((await never.adapter.getMarketSummary("default")).data).toMatchObject({ lastClearingPrice: null, currentBatchId: null });
    expect(never.calls).not.toContain("result");
  });
  it("uses the last batch itself for the price once nothing is open", async () => {
    const { adapter } = adapterWith({ openBatch: openBatch({ hasOpen: false }), result: clearedResult({ clearTick: 107 }) });
    expect((await adapter.getMarketSummary("default")).data).toMatchObject({ lastClearingPrice: "1.035", currentBatchId: null });
  });
  it("formats a cleared batch and marks an uncleared one unavailable", async () => {
    const cleared = adapterWith({ result: clearedResult({ clearTick: 107 }) });
    expect((await cleared.adapter.getBatchResult("default", "6")).data).toEqual({
      marketId: "default", batchId: "6", clearingPrice: "1.035 dUSD", volume: "2.5 ROSE",
      orderCount: null, clearGas: "41234", blockNumber: "99", clearedAtTimestamp: 99 * 60_000,
    });
    const pending = adapterWith({ result: clearedResult({ clearedAt: BigInt(0) }) });
    expect(await pending.adapter.getBatchResult("default", "6")).toMatchObject({ status: "unavailable", data: null });
  });
  it("rejects malformed batch IDs before touching the chain", async () => {
    const { adapter, calls } = adapterWith();
    for (const id of ["0", "-1", "abc", "1.5", ""]) expect((await adapter.getBatchResult("default", id)).status).toBe("error");
    expect(calls).toEqual([]);
  });
});

describe("on-chain adapter: history", () => {
  // Open batch 6; batches 1-5 cleared at blocks 10, 11, 70, 71, 72 (minutes, see fake getBlock).
  const history = {
    openBatch: openBatch({ id: BigInt(6) }),
    "result:1": clearedResult({ clearTick: 100, volumeLots: BigInt(1000), clearedAt: BigInt(10) }),
    "result:2": clearedResult({ clearTick: 104, volumeLots: BigInt(2000), clearedAt: BigInt(11) }),
    "result:3": clearedResult({ clearTick: 90, volumeLots: BigInt(0), clearedAt: BigInt(70) }), // cleared, no trade
    "result:4": clearedResult({ clearTick: 102, volumeLots: BigInt(500), clearedAt: BigInt(71) }),
    "result:5": clearedResult({ clearTick: 98, volumeLots: BigInt(1500), clearedAt: BigInt(72) }),
  };

  it("lists cleared batches newest first, including ones that did not trade", async () => {
    const { adapter } = adapterWith(history);
    const result = await adapter.getRecentBatches("default", 3);
    expect(result.data?.map((batch) => [batch.batchId, batch.clearingPrice])).toEqual([["5", "0.99 dUSD"], ["4", "1.01 dUSD"], ["3", null]]);
  });
  it("builds candles from clearing prices, skipping batches with no trade", async () => {
    const { adapter } = adapterWith(history);
    const hourly = (await adapter.getCandles("default", "1h")).data;
    expect(hourly).toEqual([
      { time: 0, open: "1", high: "1.02", low: "1", close: "1.02", volume: "3" },
      { time: 3_600_000, open: "1.01", high: "1.01", low: "0.99", close: "0.99", volume: "2" },
    ]);
    expect((await adapter.getCandles("default", "1m")).data?.map((candle) => candle.time)).toEqual([600_000, 660_000, 4_260_000, 4_320_000]);
  });
  it("reads each cleared batch from the chain only once", async () => {
    const { adapter, calls } = adapterWith(history);
    await adapter.getRecentBatches("default", 5);
    const before = calls.filter((name) => name === "result").length;
    await adapter.getCandles("default", "1h");
    await adapter.getBatchResult("default", "4");
    expect(calls.filter((name) => name === "result").length).toBe(before);
  });
});
