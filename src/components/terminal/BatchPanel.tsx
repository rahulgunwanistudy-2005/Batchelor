import Link from "next/link";
import type { CandleInterval } from "@/lib/market-data/intervals";
import type { Candle, MarketDataResult, MarketSummary, OrderBookSnapshot } from "@/types/market";
import { MarketChart } from "./MarketChart";
import { UncrossChart } from "./UncrossChart";

export type BatchView = "batch" | "history";

interface BatchPanelProps {
  view: BatchView;
  interval: CandleInterval;
  market: MarketDataResult<MarketSummary>;
  book: MarketDataResult<OrderBookSnapshot>;
  candles: MarketDataResult<Candle[]>;
}

/** The hero of the terminal: where this batch would clear, and the two staircases that set it. */
export function BatchPanel({ view, interval, market, book, candles }: BatchPanelProps) {
  const summary = market.data;
  const snapshot = book.data;
  const quote = summary?.quoteAsset ?? "";
  const base = summary?.baseAsset ?? "";
  const indicative = snapshot?.indicative ?? null;
  const lastPrice = summary?.lastClearingPrice ?? null;

  let title = "Batch";
  if (snapshot?.batchId) title = `Batch #${snapshot.batchId}`;
  else if (book.status === "live") title = "No open batch";

  let caption: string;
  if (indicative) caption = `Indicative clearing price · ${indicative.volume} ${base} would trade if the batch sealed now`;
  else if (book.status !== "live") caption = book.message ?? "The order book is unavailable.";
  else if (!snapshot?.batchId) caption = lastPrice ? "Last clearing price · the next order opens a new batch" : "The first order opens the first batch";
  else caption = lastPrice ? "Last clearing price · buy and sell orders in this batch do not cross yet" : "Buy and sell orders in this batch do not cross yet";

  const price = indicative?.price ?? lastPrice;

  return (
    <section className="panel" aria-labelledby="batch-title">
      <div className="panel-heading">
        <div>
          <h2 id="batch-title">{view === "batch" ? title : "Price history"}</h2>
          <p className="panel-subtitle">
            {view === "batch" ? "Every order in a batch clears at one price" : "Clearing prices of recent batches"}
          </p>
        </div>
        <nav className="view-tabs" aria-label="Chart view">
          <Link href="/" scroll={false} className={`view-tab ${view === "batch" ? "view-tab--active" : ""}`} aria-current={view === "batch" ? "true" : undefined}>This batch</Link>
          <Link href={`/?view=history&interval=${interval}`} scroll={false} className={`view-tab ${view === "history" ? "view-tab--active" : ""}`} aria-current={view === "history" ? "true" : undefined}>Price history</Link>
        </nav>
      </div>

      {view === "batch" ? (
        <>
          <div className="batch-hero">
            {price ? (
              <>
                <span className={`batch-price ${indicative ? "" : "batch-price--quiet"}`}>{price}</span>
                <span className="batch-price-unit">{quote}</span>
              </>
            ) : (
              <span className="batch-price batch-price--quiet" aria-hidden="true">—</span>
            )}
            <p className="batch-caption">{caption}</p>
          </div>
          {book.status === "live" && snapshot && (
            <>
              <div className="batch-legend" aria-hidden="true">
                <span><i style={{ background: "var(--bid)" }} /> Buy orders</span>
                <span><i style={{ background: "var(--ask)" }} /> Sell orders</span>
                {indicative && <span><i style={{ background: "var(--clear)" }} /> Clearing price</span>}
              </div>
              <UncrossChart bids={snapshot.bids} asks={snapshot.asks} clearingPrice={indicative?.price ?? null} quoteAsset={quote} baseAsset={base} />
            </>
          )}
        </>
      ) : (
        <MarketChart result={candles} interval={interval} />
      )}
    </section>
  );
}
