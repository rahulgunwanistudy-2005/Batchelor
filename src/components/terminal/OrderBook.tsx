import { ArrowDownUp } from "lucide-react";
import { withDepth, type DepthLevel } from "@/lib/market-data/depth";
import type { MarketDataResult, OrderBookSnapshot } from "@/types/market";

function EmptyRows({ side, connected }: { side: "bids" | "asks"; connected: boolean }) {
  return (
    <div className="book-empty">
      <span>{side === "bids" ? "Buy orders" : "Sell orders"}</span>
      <p>{connected ? "No orders in the open batch" : "Order-book feed not connected"}</p>
    </div>
  );
}

function BookRow({ row }: { row: DepthLevel }) {
  return (
    <div className="book-row">
      <span>{row.price}</span><span>{row.quantity}</span><span>{row.total ?? "—"}</span>
      <i className="book-depth" style={{ width: `${Math.min(100, row.depth * 100)}%` }} aria-hidden="true" />
    </div>
  );
}

interface OrderBookProps {
  result: MarketDataResult<OrderBookSnapshot>;
  /** Price of the most recent cleared batch, when known. */
  lastClearingPrice?: string | null;
}

export function OrderBook({ result, lastClearingPrice }: OrderBookProps) {
  const book = result.data;
  // Levels arrive best price first; totals accumulate outward from the spread.
  const { bids, asks } = withDepth(book?.bids ?? [], book?.asks ?? []);

  return (
    <section className="panel orderbook">
      <div className="panel-heading">
        <div>
          <h2>Order book</h2>
          <p className="panel-subtitle">{book?.batchId ? `Open batch #${book.batchId}` : "Limit orders by price"}</p>
        </div>
        <button className="icon-button" type="button" aria-label="Order book display options" disabled>
          <ArrowDownUp size={16} />
        </button>
      </div>
      <div className="book-columns book-labels">
        <span>Price</span><span>Quantity</span><span>Total</span>
      </div>
      <div className="book-side book-side--asks">
        {asks.length ? [...asks].reverse().map((row) => (
          <BookRow row={row} key={`ask-${row.price}`} />
        )) : <EmptyRows side="asks" connected={result.status === "live"} />}
      </div>
      <div className="spread-line">
        <span>Last clearing price</span><strong>{lastClearingPrice ?? "—"}</strong>
      </div>
      <div className="book-side book-side--bids">
        {bids.length ? bids.map((row) => (
          <BookRow row={row} key={`bid-${row.price}`} />
        )) : <EmptyRows side="bids" connected={result.status === "live"} />}
      </div>
      <div className="panel-footnote">{result.message ?? (result.status === "live" ? "Read from the auction contract. Orders in one batch all clear at a single price." : "Price and quantity data will appear when a verified feed is connected.")}</div>
    </section>
  );
}
