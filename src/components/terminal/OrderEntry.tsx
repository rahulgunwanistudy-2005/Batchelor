import { LockKeyhole } from "lucide-react";

export function OrderEntry() {
  return (
    <section className="panel order-entry">
      <div className="panel-heading">
        <div>
          <h2>Place order</h2>
          <p className="panel-subtitle">Limit order</p>
        </div>
        <span className="status status--unavailable"><LockKeyhole size={12} /> Not enabled</span>
      </div>
      <div className="segmented" role="group" aria-label="Order side">
        <button type="button" disabled>Buy</button>
        <button type="button" disabled>Sell</button>
      </div>
      <label className="field-label" htmlFor="limit-price">Limit price</label>
      <div className="input-shell"><input id="limit-price" placeholder="—" disabled /><span>QUOTE</span></div>
      <label className="field-label" htmlFor="order-quantity">Quantity</label>
      <div className="input-shell"><input id="order-quantity" placeholder="—" disabled /><span>BASE</span></div>
      <div className="order-summary">
        <div><span>Estimated total</span><strong>—</strong></div>
        <div><span>Available balance</span><strong>—</strong></div>
      </div>
      <button className="primary-button" type="button" disabled>Connect backend to trade</button>
      <p className="fine-print">Order submission is disabled until wallet, market and contract integration are configured.</p>
    </section>
  );
}
