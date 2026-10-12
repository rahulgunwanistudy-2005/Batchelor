import { ArrowDownUp } from "lucide-react";
import type { MarketDataResult, OrderBookSnapshot } from "@/types/market";

function EmptyRows({ side }: { side: "bids" | "asks" }) {
  return (
    <div className="book-empty">
      <span>{side === "bids" ? "Buy orders" : "Sell orders"}</span>
      <p>Order-book feed not connected</p>
    </div>
  );
}

export function OrderBook({ result }: { result: MarketDataResult<OrderBookSnapshot> }) {
  const book = result.data;

  return (
    <section className="panel orderbook">
      <div className="panel-heading">
        <div>
          <h2>Order book</h2>
          <p className="panel-subtitle">Limit orders by price</p>
        </div>
        <button className="icon-button" type="button" aria-label="Order book display options" disabled>
          <ArrowDownUp size={16} />
        </button>
      </div>
      <div className="book-columns book-labels">
        <span>Price</span><span>Quantity</span><span>Total</span>
      </div>
      <div className="book-side book-side--asks">
        {book?.asks.length ? [...book.asks].reverse().map((row) => (
          <div className="book-row" key={`ask-${row.price}`}>
            <span>{row.price}</span><span>{row.quantity}</span><span>—</span>
          </div>
        )) : <EmptyRows side="asks" />}
      </div>
      <div className="spread-line">
        <span>Clearing price</span><strong>—</strong>
      </div>
      <div className="book-side book-side--bids">
        {book?.bids.length ? book.bids.map((row) => (
          <div className="book-row" key={`bid-${row.price}`}>
            <span>{row.price}</span><span>{row.quantity}</span><span>—</span>
          </div>
        )) : <EmptyRows side="bids" />}
      </div>
      <div className="panel-footnote">{result.message ?? "Price and quantity data will appear when a verified feed is connected."}</div>
    </section>
  );
}
