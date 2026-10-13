import { formatUnits } from "viem";
import type { IndexedOrder } from "./client";

/** The market parameters needed to turn indexed integers into display amounts. */
export interface OrderFormat {
  baseSymbol: string;
  quoteSymbol: string;
  baseDecimals: number;
  quoteDecimals: number;
  minPrice: bigint;
  tickSize: bigint;
  lot: bigint;
}

export type OrderOutcome = "open" | "cancelled" | "unfilled" | "partial" | "filled";

export interface OrderRow {
  key: string;
  orderId: string;
  batchId: string;
  side: "buy" | "sell";
  trader: string;
  limitPrice: string;
  amount: string;
  outcome: OrderOutcome;
  /** Base the trader bought or sold, and the quote paid or received for it; null until the batch clears. */
  filledBase: string | null;
  filledQuote: string | null;
  claimed: boolean;
  /** Priority fee the placing transaction paid per gas, in gwei. */
  priorityFeeGwei: string;
  /** Position in the chain: block and index of the placing transaction. */
  blockNumber: string;
  txIndex: number;
  txHash: string;
}

export const OUTCOME_TEXT: Record<OrderOutcome, string> = {
  open: "In open batch",
  cancelled: "Cancelled",
  unfilled: "Not filled",
  partial: "Partly filled",
  filled: "Filled",
};

/**
 * One indexed order as a display row. Amounts follow the contract's view of
 * a fill: a buyer pays `quoteIn` and receives `baseOut`; a seller delivers
 * `baseIn` and receives `quoteOut`.
 */
export function describeIndexedOrder(order: IndexedOrder, format: OrderFormat): OrderRow {
  const buy = order.side === 0;
  const cleared = order.batch.clearedBlock !== null;
  const base = buy ? order.baseOut : order.baseIn;
  const quote = buy ? order.quoteIn : order.quoteOut;

  let outcome: OrderOutcome;
  if (order.cancelled) outcome = "cancelled";
  else if (!cleared) outcome = "open";
  else if (order.filledLots === BigInt(0)) outcome = "unfilled";
  else outcome = order.filledLots < order.lots ? "partial" : "filled";

  const settled = cleared && !order.cancelled;
  return {
    key: order.id,
    orderId: order.orderId.toString(),
    batchId: order.batch.batchId.toString(),
    side: buy ? "buy" : "sell",
    trader: order.trader.address,
    limitPrice: `${formatUnits(format.minPrice + BigInt(order.tick) * format.tickSize, format.quoteDecimals)} ${format.quoteSymbol}`,
    amount: `${formatUnits(order.lots * format.lot, format.baseDecimals)} ${format.baseSymbol}`,
    outcome,
    filledBase: settled ? `${formatUnits(base, format.baseDecimals)} ${format.baseSymbol}` : null,
    filledQuote: settled ? `${formatUnits(quote, format.quoteDecimals)} ${format.quoteSymbol}` : null,
    claimed: order.claimed,
    priorityFeeGwei: formatUnits(order.priorityFeePerGas, 9),
    blockNumber: order.blockNumber.toString(),
    txIndex: order.txIndex,
    txHash: order.txHash,
  };
}
