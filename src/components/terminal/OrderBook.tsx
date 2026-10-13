import { withDepth, type DepthLevel } from "@/lib/market-data/depth";
import type { MarketDataResult, OrderBookSnapshot } from "@/types/market";

interface OrderBookProps {
  result: MarketDataResult<OrderBookSnapshot>;
  /** Price of the most recent cleared batch, when known. */
  lastClearingPrice?: string | null;
  baseAsset?: string;
  quoteAsset?: string;
}

/** Levels shown per side; the rest are summarised so the panel never grows without bound. */
const MAX_ROWS = 10;

function BookRow({ row }: { row: DepthLevel }) {
  return (
    <div className="book-row" role="row">
      <span role="cell">{row.price}</span><span role="cell">{row.quantity}</span><span role="cell">{row.total ?? "—"}</span>
      <i className="book-depth" style={{ width: `${Math.min(100, row.depth * 100)}%` }} aria-hidden="true" />
    </div>
  );
}

function Side({ rows, kind }: { rows: DepthLevel[]; kind: "asks" | "bids" }) {
  // Levels arrive best price first. Asks are drawn best price nearest the middle, so reversed.
  const visible = rows.slice(0, MAX_ROWS);
  const hidden = rows.length - visible.length;
  const ordered = kind === "asks" ? [...visible].reverse() : visible;

  return (
    <div className={`book-side book-side--${kind}`} role="rowgroup" aria-label={kind === "asks" ? "Sell orders" : "Buy orders"}>
      {kind === "asks" && hidden > 0 && <p className="book-more">{hidden} more sell level{hidden === 1 ? "" : "s"} above</p>}
      {ordered.length > 0
        ? ordered.map((row) => <BookRow row={row} key={row.price} />)
        : <p className="book-empty">No {kind === "asks" ? "sell" : "buy"} orders in this batch</p>}
      {kind === "bids" && hidden > 0 && <p className="book-more">{hidden} more buy level{hidden === 1 ? "" : "s"} below</p>}
    </div>
  );
}

export function OrderBook({ result, lastClearingPrice, baseAsset = "", quoteAsset = "" }: OrderBookProps) {
  const book = result.data;
  const { bids, asks } = withDepth(book?.bids ?? [], book?.asks ?? []);
  const indicative = book?.indicative ?? null;

  return (
    <section className="panel" aria-labelledby="book-title">
      <div className="panel-heading">
        <div>
          <h2 id="book-title">Order book</h2>
          <p className="panel-subtitle">{book?.batchId ? `Orders in batch #${book.batchId}` : "Orders in the open batch"}</p>
        </div>
      </div>
      {result.status === "live" ? (
        <div className="book" role="table" aria-label="Order book">
          <div className="book-columns book-labels" role="row">
            <span role="columnheader">Price{quoteAsset ? ` (${quoteAsset})` : ""}</span>
            <span role="columnheader">Quantity{baseAsset ? ` (${baseAsset})` : ""}</span>
            <span role="columnheader">Total</span>
          </div>
          <Side rows={asks} kind="asks" />
          <div className="spread-line">
            <span>{indicative ? "Indicative clearing price" : "Last clearing price"}</span>
            <strong className={indicative ? undefined : "is-quiet"}>{indicative?.price ?? lastClearingPrice ?? "—"}</strong>
          </div>
          <Side rows={bids} kind="bids" />
        </div>
      ) : (
        <p className="table-empty">{result.message ?? "The order book is unavailable."}</p>
      )}
    </section>
  );
}
