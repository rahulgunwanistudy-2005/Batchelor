"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { indexer, IndexerError } from "@/lib/indexer/client";
import { describeIndexedOrder, OUTCOME_TEXT, type OrderRow } from "@/lib/indexer/orders";
import { loadMarketParams } from "@/lib/trading/params";
import { useWallet } from "@/lib/wallet/useWallet";

const REFRESH_MS = 10_000;
const PAGE_SIZE = 50;

type State = { for: string; rows: OrderRow[] } | { for: string; error: string } | null;

/**
 * Every order this account has placed on the market, from the indexer, so
 * it also covers orders placed on other devices. Rendered only when an
 * indexer endpoint is configured.
 */
export function OrderHistory() {
  const wallet = useWallet();
  const address = wallet.status === "connected" ? wallet.address : null;
  const [state, setState] = useState<State>(null);

  useEffect(() => {
    if (!indexer || !address) return;
    const client = indexer;
    let live = true;

    const load = async () => {
      try {
        const [params, orders] = await Promise.all([loadMarketParams(), client.ordersByTrader(address, PAGE_SIZE)]);
        if (live) setState({ for: address, rows: orders.map((order) => describeIndexedOrder(order, params)) });
      } catch (error) {
        if (live) setState({ for: address, error: error instanceof IndexerError ? error.message : "Order history could not be loaded. Try again shortly." });
      }
    };
    void load();
    const interval = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      live = false;
      window.clearInterval(interval);
    };
  }, [address]);

  if (!indexer) return null;
  const current = address && state?.for === address ? state : null;

  return (
    <section className="panel" aria-labelledby="history-title">
      <div className="panel-heading">
        <div>
          <h2 id="history-title">Order history</h2>
          <p className="panel-subtitle">Every order this account has placed on this market, newest first</p>
        </div>
      </div>
      {!address ? (
        <p className="table-empty">Connect a wallet to see its order history.</p>
      ) : !current ? (
        <p className="table-empty" role="status">Loading order history…</p>
      ) : "error" in current ? (
        <p className="table-empty" role="alert">{current.error}</p>
      ) : current.rows.length === 0 ? (
        <p className="table-empty">This account has not placed an order on this market yet.</p>
      ) : (
        <div className="table-scroll" style={{ marginTop: 12 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Side</th>
                <th scope="col" className="num">Limit price</th>
                <th scope="col" className="num">Amount</th>
                <th scope="col">Result</th>
                <th scope="col" className="num">Filled</th>
                <th scope="col" className="num">For</th>
              </tr>
            </thead>
            <tbody>
              {current.rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">#{row.orderId} <span className="muted">· <Link href={`/b/${row.batchId}`}>batch {row.batchId}</Link></span></th>
                  <td className={row.side === "buy" ? "bid" : "ask"}>{row.side === "buy" ? "Buy" : "Sell"}</td>
                  <td className="num">{row.limitPrice}</td>
                  <td className="num">{row.amount}</td>
                  <td>{OUTCOME_TEXT[row.outcome]}{row.outcome !== "open" && row.outcome !== "cancelled" ? (row.claimed ? " · claimed" : " · ready to claim") : ""}</td>
                  <td className="num">{row.filledBase ?? "—"}</td>
                  <td className="num">{row.filledQuote ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
