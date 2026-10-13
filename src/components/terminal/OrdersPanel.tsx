"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatUnits } from "viem";
import { cancelOrder, claimOrders, clearBatch, MAX_CLAIM } from "@/lib/trading/actions";
import {
  loadLocalOrders,
  ORDERS_CHANGED_EVENT,
  readOrderStatuses,
  type LocalOrder,
  type OrdersSnapshot,
  type OrderStatus,
} from "@/lib/trading/orders";
import { loadMarketParams, tickPrice, type MarketParams } from "@/lib/trading/params";
import { useTradingBlocker } from "@/lib/trading/useTradingBlocker";
import { useTransaction } from "@/lib/trading/useTransaction";
import { useWallet } from "@/lib/wallet/useWallet";
import { TxStatus } from "@/components/trading/TxStatus";

const REFRESH_MS = 5_000;

const STATE_TEXT: Record<OrderStatus["state"], string> = {
  open: "In open batch",
  claimable: "Ready to claim",
  closed: "Claimed or cancelled",
  unknown: "Status unavailable",
};

function signed(value: string, decimals: number, symbol: string): string | null {
  const units = BigInt(value);
  if (units === BigInt(0)) return null;
  return `${units > BigInt(0) ? "+" : "−"}${formatUnits(units < BigInt(0) ? -units : units, decimals)} ${symbol}`;
}

/** What claiming an order would credit: its fill at the clearing price plus any returned escrow. */
function outcome(order: LocalOrder, status: OrderStatus, params: MarketParams): string {
  if (status.state !== "claimable") return "—";
  const refundToken = order.side === "buy" ? { decimals: params.quoteDecimals, symbol: params.quoteSymbol } : { decimals: params.baseDecimals, symbol: params.baseSymbol };
  const parts = [
    signed(status.baseDelta, params.baseDecimals, params.baseSymbol),
    signed(status.quoteDelta, params.quoteDecimals, params.quoteSymbol),
    BigInt(status.refund) > BigInt(0) ? `${formatUnits(BigInt(status.refund), refundToken.decimals)} ${refundToken.symbol} returned` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(", ") : "—";
}

export function OrdersPanel() {
  const router = useRouter();
  const wallet = useWallet();
  const blocker = useTradingBlocker();
  const { state, run, busy } = useTransaction();
  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [snapshot, setSnapshot] = useState<OrdersSnapshot | null>(null);
  const [params, setParams] = useState<MarketParams | null>(null);
  const [successText, setSuccessText] = useState("Done.");

  const address = wallet.status === "connected" ? wallet.address : null;

  useEffect(() => {
    let live = true;
    loadMarketParams().then(
      (loaded) => { if (live) setParams(loaded); },
      () => { if (live) setParams(null); },
    );
    return () => { live = false; };
  }, []);

  // Orders this browser placed for the connected account, kept in sync with the ticket.
  useEffect(() => {
    const reload = () => setOrders(address ? loadLocalOrders(address) : []);
    reload();
    window.addEventListener(ORDERS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(ORDERS_CHANGED_EVENT, reload);
  }, [address]);

  useEffect(() => {
    let live = true;
    const load = () => {
      void readOrderStatuses(orders).then((next) => {
        if (live) setSnapshot(next);
      });
    };
    load();
    const interval = window.setInterval(load, REFRESH_MS);
    return () => {
      live = false;
      window.clearInterval(interval);
    };
  }, [orders, state.phase]);

  const act = async (text: string, action: Parameters<typeof run>[0]) => {
    setSuccessText(text);
    const result = await run(action);
    if (result !== undefined) router.refresh();
  };

  const claimable = orders.filter((order) => snapshot?.statuses[order.orderId]?.state === "claimable").slice(0, MAX_CLAIM);
  const disabled = blocker !== null || busy;

  return (
    <section className="panel" aria-labelledby="orders-title">
      <div className="panel-heading">
        <div>
          <h2 id="orders-title">My orders</h2>
          <p className="panel-subtitle">Orders placed from this browser, with their status read from the contract</p>
        </div>
      </div>
      {address && (
      <div className="orders-actions">
        <button
          type="button"
          className="connect-button"
          disabled={disabled || !snapshot?.openBatchId}
          title="Anyone may clear a sealed batch. It does nothing if the batch is still open for orders."
          onClick={() => void act("Clear sent. If the batch was sealed, it is now cleared.", (onPhase) => clearBatch(onPhase))}
        >
          {snapshot?.openBatchId ? `Clear batch #${snapshot.openBatchId}` : "No batch to clear"}
        </button>
        <button
          type="button"
          className="connect-button"
          disabled={disabled || claimable.length === 0}
          onClick={() => void act("Claimed. Your balance is updated.", (onPhase) => claimOrders(claimable.map((order) => order.orderId), onPhase))}
        >
          {claimable.length > 0 ? `Claim ${claimable.length} order${claimable.length === 1 ? "" : "s"}` : "Nothing to claim"}
        </button>
        <TxStatus state={state} success={successText} />
      </div>
      )}
      {orders.length > 0 && params ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Side</th>
                <th scope="col" className="num">Limit price</th>
                <th scope="col" className="num">Amount</th>
                <th scope="col">Status</th>
                <th scope="col">On claim</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const status = snapshot?.statuses[order.orderId];
                return (
                  <tr key={order.orderId}>
                    <th scope="row">#{order.orderId} <span className="muted">· batch {order.batchId}</span></th>
                    <td className={order.side === "buy" ? "bid" : "ask"}>{order.side === "buy" ? "Buy" : "Sell"}</td>
                    <td className="num">{formatUnits(tickPrice(params, order.tick), params.quoteDecimals)} {params.quoteSymbol}</td>
                    <td className="num">{formatUnits(BigInt(order.lots) * params.lot, params.baseDecimals)} {params.baseSymbol}</td>
                    <td>{status ? STATE_TEXT[status.state] : "Checking…"}</td>
                    <td>{status ? outcome(order, status, params) : "—"}</td>
                    <td>
                      {status?.state === "open" && (
                        <button
                          type="button"
                          className="connect-button"
                          disabled={disabled}
                          onClick={() => void act(`Order #${order.orderId} cancelled.`, (onPhase) => cancelOrder(order.orderId, onPhase))}
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="orders-empty">
          <strong>{address ? "No orders placed from this browser yet" : "Connect a wallet to see your orders"}</strong>
          {address ? "Place an order and it will appear here with its fill." : "Orders you place here are listed with their status and fill."}
        </div>
      )}
    </section>
  );
}
