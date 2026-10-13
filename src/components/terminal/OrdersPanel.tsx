"use client";

import { useId, useState } from "react";
import { FileClock } from "lucide-react";

const TABS = [
  { key: "open", label: "Open orders", empty: "No open-order data available" },
  { key: "history", label: "Order history", empty: "No order-history data available" },
  { key: "fills", label: "Fills", empty: "No fill data available" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function OrdersPanel() {
  const id = useId();
  const [active, setActive] = useState<TabKey>("open");
  const activeTab = TABS.find((tab) => tab.key === active) ?? TABS[0];

  return (
    <section className="panel orders-panel">
      <div className="panel-heading">
        <div>
          <h2>Orders & fills</h2>
          <p className="panel-subtitle">Your activity on this market</p>
        </div>
        <div className="tab-list" role="tablist" aria-label="Order history sections">
          {TABS.map((tab) => (
            <button
              type="button"
              role="tab"
              key={tab.key}
              id={`${id}-tab-${tab.key}`}
              aria-selected={tab.key === active}
              aria-controls={`${id}-panel`}
              className={`tab ${tab.key === active ? "tab--active" : ""}`}
              onClick={() => setActive(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="orders-table" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${active}`}>
        <div className="orders-table-head">
          <span>Time</span><span>Side / Type</span><span>Price</span><span>Amount</span><span>{active === "fills" ? "Batch" : "Status"}</span>
        </div>
        <div className="orders-empty">
          <FileClock size={22} />
          <strong>{activeTab.empty}</strong>
          <p>Needs a verified order source for this market.</p>
        </div>
      </div>
    </section>
  );
}
