"use client";

import { useEffect, useState } from "react";
import { AuctionPanel } from "@/components/terminal/AuctionPanel";
import { MarketChart } from "@/components/terminal/MarketChart";
import { MarketHeader } from "@/components/terminal/MarketHeader";
import { OrderBook } from "@/components/terminal/OrderBook";
import { OrderEntry } from "@/components/terminal/OrderEntry";
import { OrdersPanel } from "@/components/terminal/OrdersPanel";
import { SystemStatus } from "@/components/terminal/SystemStatus";
import type {
  Candle,
  MarketDataResult,
  MarketSummary,
  OrderBookSnapshot,
} from "@/types/market";
import type { CandleInterval } from "@/lib/market-data/intervals";

interface MarketSnapshot {
  market: MarketDataResult<MarketSummary>;
  book: MarketDataResult<OrderBookSnapshot>;
  candles: MarketDataResult<Candle[]>;
}

interface LiveMarketPanelsProps {
  initial: MarketSnapshot;
  interval: CandleInterval;
}

const REFRESH_INTERVAL_MS = 3_000;

export function LiveMarketPanels({ initial, interval }: LiveMarketPanelsProps) {
  const [snapshot, setSnapshot] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let inFlight = false;

    async function refresh() {
      if (inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      setRefreshing(true);
      setRefreshError(null);

      try {
        const response = await fetch(`/api/market?interval=${encodeURIComponent(interval)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Market refresh returned HTTP ${response.status}.`);

        const next: MarketSnapshot = await response.json();
        if (active) {
          setSnapshot(next);
          setLastUpdated(Date.now());
        }
      } catch (error) {
        if (active && !controller.signal.aborted) {
          setRefreshError(error instanceof Error ? error.message : "Market data refresh failed.");
        }
      } finally {
        inFlight = false;
        if (active) setRefreshing(false);
      }
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") void refresh();
    }

    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [interval, retryKey]);

  return (
    <>
      <MarketHeader result={snapshot.market} />
      <div className="data-refresh" role="status" aria-live="polite">
        <span>
          {refreshError
            ? `Refresh failed: ${refreshError}`
            : refreshing
              ? "Refreshing verified market data…"
              : lastUpdated
                ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}`
                : "Market data has not refreshed yet."}
        </span>
        <button type="button" onClick={() => setRetryKey((key) => key + 1)} disabled={refreshing}>
          Refresh
        </button>
      </div>
      <div className="terminal-grid">
        <div className="terminal-main">
          <MarketChart result={snapshot.candles} interval={interval} />
          <div id="orders"><OrdersPanel /></div>
        </div>
        <div className="terminal-book">
          <OrderBook result={snapshot.book} />
          <SystemStatus feedStatus={snapshot.market.status} feedMessage={snapshot.market.message} />
        </div>
        <aside className="terminal-side">
          <OrderEntry baseAsset={snapshot.market.data?.baseAsset} quoteAsset={snapshot.market.data?.quoteAsset} />
          <AuctionPanel result={snapshot.market} />
        </aside>
      </div>
    </>
  );
}
