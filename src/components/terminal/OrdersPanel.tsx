import { FileClock } from "lucide-react";

export function OrdersPanel() {
  return (
    <section className="panel orders-panel">
      <div className="panel-heading">
        <div>
          <h2>Orders & fills</h2>
          <p className="panel-subtitle">Your activity on this market</p>
        </div>
        <div className="tab-list" aria-label="Order history sections">
          <button type="button" className="tab tab--active">Open orders</button>
          <button type="button" className="tab" disabled>Order history</button>
          <button type="button" className="tab" disabled>Fills</button>
        </div>
      </div>
      <div className="orders-table">
        <div className="orders-table-head"><span>Time</span><span>Side / Type</span><span>Price</span><span>Amount</span><span>Status</span></div>
        <div className="orders-empty">
          <FileClock size={22} />
          <strong>No order data available</strong>
          <p>Connect the order service to view verified activity.</p>
        </div>
      </div>
    </section>
  );
}
