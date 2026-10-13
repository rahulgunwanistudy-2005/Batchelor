"use client";

import { useEffect, useState } from "react";
import { StatusLabel } from "@/components/terminal/StatusLabel";
import type { BatchResult, MarketDataResult } from "@/types/market";

interface LiveBatchResultProps {
  batchId: string;
  initial: MarketDataResult<BatchResult>;
}

const REFRESH_INTERVAL_MS = 5_000;

function formatTimestamp(timestamp: number | null | undefined): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? null
    : `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

export function LiveBatchResult({ batchId, initial }: LiveBatchResultProps) {
  const [result, setResult] = useState(initial);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const batch = result.data;
  const facts = [
    { name: "Clearing price", value: batch?.clearingPrice },
    { name: "Matched volume", value: batch?.volume },
    { name: "Orders", value: batch?.orderCount?.toString() },
    { name: "Clearing gas", value: batch?.clearGas },
    { name: "Block", value: batch?.blockNumber },
    { name: "Cleared", value: formatTimestamp(batch?.clearedAtTimestamp) },
  ];

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let inFlight = false;

    async function refresh() {
      if (inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      setRefreshError(null);

      try {
        const response = await fetch(`/api/batches/${encodeURIComponent(batchId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Receipt refresh returned HTTP ${response.status}.`);

        const next: MarketDataResult<BatchResult> = await response.json();
        if (active) setResult(next);
      } catch (error) {
        if (active && !controller.signal.aborted) {
          setRefreshError(error instanceof Error ? error.message : "Batch receipt refresh failed.");
        }
      } finally {
        inFlight = false;
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
  }, [batchId, retryKey]);

  return (
    <>
      <section className="panel proof-hero">
        <h1>Batch receipt</h1>
        <p className="batch-headline">Batch #{batchId}</p>
        <p className="proof-caveat">
          {batch
            ? "Every filled order in this batch settled at the single clearing price below."
            : (result.message ?? "This batch's result is unavailable.")}
        </p>
        <StatusLabel status={result.status} />
        <div className="data-refresh" role="status" aria-live="polite">
          <span>{refreshError ? `Refresh failed: ${refreshError}` : "Receipt checks every 5 seconds while this page is open."}</span>
          <button type="button" onClick={() => setRetryKey((key) => key + 1)}>Retry</button>
        </div>
      </section>
      <div className="proof-columns">
        <section className="panel">
          <div className="panel-heading"><h2>Result</h2></div>
          <dl className="proof-facts">
            {facts.map((fact) => (
              <div key={fact.name}><dt>{fact.name}</dt><dd>{fact.value ?? "—"}</dd></div>
            ))}
          </dl>
        </section>
        <section className="panel">
          <div className="panel-heading"><h2>Orders in this batch</h2></div>
          <p className="proof-empty">Order-level fills need an indexed order source, which is not connected.</p>
        </section>
      </div>
    </>
  );
}
