import { describe, expect, it } from "vitest";
import type { IndexedOrder } from "./client";
import { describeIndexedOrder, type OrderFormat } from "./orders";

const format: OrderFormat = {
  baseSymbol: "ROSE", quoteSymbol: "dUSD", baseDecimals: 18, quoteDecimals: 6,
  minPrice: BigInt(500_000), tickSize: BigInt(5_000), lot: BigInt(10) ** BigInt(15),
};
const LOT = format.lot;

function order(overrides: Partial<IndexedOrder> = {}): IndexedOrder {
  return {
    id: "10143:0xmarket:order:4", chainId: 10143, orderId: BigInt(4), market: "0x00000000000000000000000000000000000000a1",
    batch_id: "10143:0xmarket:batch:1", trader_id: "t", side: 0, tick: 120, lots: BigInt(5), relayed: false,
    blockNumber: BigInt(251460), txIndex: 4, logIndex: 0, txHash: `0x${"ab".repeat(32)}`,
    effectiveGasPrice: BigInt(102_000_000_000), maxPriorityFeePerGas: null, baseFeePerGas: BigInt(100_000_000_000), priorityFeePerGas: BigInt(2_000_000_000),
    cancelled: false, claimed: false, claimTxHash: null,
    baseIn: BigInt(0), baseOut: BigInt(5) * LOT, quoteIn: BigInt(4500), quoteOut: BigInt(0), filledLots: BigInt(5),
    trader: { address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" }, batch: { batchId: BigInt(1), clearedBlock: BigInt(251461) },
    ...overrides,
  };
}

describe("describeIndexedOrder", () => {
  it("reports a filled buy as base received and quote paid at the clearing price", () => {
    expect(describeIndexedOrder(order(), format)).toMatchObject({
      orderId: "4", batchId: "1", side: "buy", limitPrice: "1.1 dUSD", amount: "0.005 ROSE", outcome: "filled",
      filledBase: "0.005 ROSE", filledQuote: "0.0045 dUSD", priorityFeeGwei: "2", blockNumber: "251460", txIndex: 4,
    });
  });
  it("reports a sell as base delivered and quote received", () => {
    const sell = order({ side: 1, tick: 80, lots: BigInt(30), filledLots: BigInt(25), baseIn: BigInt(25) * LOT, baseOut: BigInt(0), quoteIn: BigInt(0), quoteOut: BigInt(22_500) });
    expect(describeIndexedOrder(sell, format)).toMatchObject({ side: "sell", outcome: "partial", filledBase: "0.025 ROSE", filledQuote: "0.0225 dUSD", limitPrice: "0.9 dUSD" });
  });
  it("shows no fill amounts for open or cancelled orders", () => {
    const open = describeIndexedOrder(order({ batch: { batchId: BigInt(2), clearedBlock: null } }), format);
    expect(open).toMatchObject({ outcome: "open", filledBase: null, filledQuote: null });
    const cancelled = describeIndexedOrder(order({ cancelled: true, filledLots: BigInt(0) }), format);
    expect(cancelled).toMatchObject({ outcome: "cancelled", filledBase: null, filledQuote: null });
  });
  it("distinguishes an order that cleared without a fill", () => {
    const missed = describeIndexedOrder(order({ filledLots: BigInt(0), baseOut: BigInt(0), quoteIn: BigInt(0) }), format);
    expect(missed).toMatchObject({ outcome: "unfilled", filledBase: "0 ROSE", filledQuote: "0 dUSD" });
  });
});
