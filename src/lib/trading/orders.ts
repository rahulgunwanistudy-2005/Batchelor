import { createPublicClient, parseAbi, type Address } from "viem";
import { networkConfig, rpcTransport } from "@/lib/network/status";
import type { Side } from "./params";

/** An order this browser placed. Kept locally because there is no indexer to list orders by owner. */
export interface LocalOrder {
  orderId: string;
  batchId: string;
  side: Side;
  tick: number;
  lots: string;
  hash: string;
  placedAt: number;
}

export type OrderState = "open" | "claimable" | "closed" | "unknown";

export interface OrderStatus {
  state: OrderState;
  /** Signed deltas the owner would receive on claim; base/quote units as strings. */
  baseDelta: string;
  quoteDelta: string;
  refund: string;
}

const MAX_STORED = 100;

function storageKey(owner: Address): string | null {
  const { expectedChainId, marketAddress } = networkConfig;
  if (expectedChainId === null || !marketAddress) return null;
  return `batchelor.orders.${expectedChainId}.${marketAddress.toLowerCase()}.${owner.toLowerCase()}`;
}

function isLocalOrder(value: unknown): value is LocalOrder {
  if (typeof value !== "object" || value === null) return false;
  const order = value as Record<string, unknown>;
  return (
    typeof order.orderId === "string" && /^\d+$/.test(order.orderId) &&
    typeof order.batchId === "string" && /^\d+$/.test(order.batchId) &&
    (order.side === "buy" || order.side === "sell") &&
    typeof order.tick === "number" && Number.isInteger(order.tick) &&
    typeof order.lots === "string" && /^\d+$/.test(order.lots) &&
    typeof order.hash === "string" &&
    typeof order.placedAt === "number"
  );
}

export function loadLocalOrders(owner: Address): LocalOrder[] {
  const key = storageKey(owner);
  if (!key) return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isLocalOrder) : [];
  } catch {
    return [];
  }
}

export const ORDERS_CHANGED_EVENT = "batchelor:orders-changed";

export function saveLocalOrder(owner: Address, order: LocalOrder): void {
  const key = storageKey(owner);
  if (!key) return;
  try {
    const orders = [order, ...loadLocalOrders(owner).filter((existing) => existing.orderId !== order.orderId)].slice(0, MAX_STORED);
    window.localStorage.setItem(key, JSON.stringify(orders));
  } catch {
    // Storage can be blocked; the order still exists on chain, it is just not listed here.
  }
  window.dispatchEvent(new Event(ORDERS_CHANGED_EVENT));
}

const orderViews = parseAbi([
  "function openBatch() view returns ((uint64 id, uint64 startBlock, uint16 bidMin, uint16 bidMax, uint16 askMin, uint16 askMax, uint32 orderCount, bool hasOpen))",
  "function previewFill(uint256 id) view returns (int256 baseDelta, int256 quoteDelta, uint256 refund)",
]);

export interface OrdersSnapshot {
  openBatchId: string | null;
  statuses: Record<string, OrderStatus>;
}

/**
 * Current on-chain state of locally known orders. An order is "open" while
 * its batch is the open one, "claimable" when the contract reports a fill
 * or refund waiting, and otherwise "closed" (claimed or cancelled).
 */
export async function readOrderStatuses(orders: LocalOrder[]): Promise<OrdersSnapshot | null> {
  const { rpcUrl, marketAddress } = networkConfig;
  if (!rpcUrl || !marketAddress) return null;

  try {
    const client = createPublicClient({ transport: rpcTransport({ batch: { wait: 10 } }) });
    const market = { address: marketAddress, abi: orderViews } as const;
    const open = await client.readContract({ ...market, functionName: "openBatch" });
    const openBatchId = open.hasOpen ? open.id.toString() : null;

    const entries = await Promise.all(
      orders.map(async (order): Promise<[string, OrderStatus]> => {
        const blank = { baseDelta: "0", quoteDelta: "0", refund: "0" };
        if (openBatchId !== null && order.batchId === openBatchId) return [order.orderId, { state: "open", ...blank }];
        try {
          const [baseDelta, quoteDelta, refund] = await client.readContract({ ...market, functionName: "previewFill", args: [BigInt(order.orderId)] });
          const waiting = baseDelta !== BigInt(0) || quoteDelta !== BigInt(0) || refund !== BigInt(0);
          return [order.orderId, { state: waiting ? "claimable" : "closed", baseDelta: baseDelta.toString(), quoteDelta: quoteDelta.toString(), refund: refund.toString() }];
        } catch {
          return [order.orderId, { state: "unknown", ...blank }];
        }
      }),
    );
    return { openBatchId, statuses: Object.fromEntries(entries) };
  } catch {
    return null;
  }
}
