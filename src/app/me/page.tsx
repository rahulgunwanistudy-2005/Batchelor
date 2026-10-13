import type { Metadata } from "next";
import { AccountSummary } from "@/components/account/AccountSummary";
import { OrdersPanel } from "@/components/terminal/OrdersPanel";
import { TopBar } from "@/components/terminal/TopBar";

export const metadata: Metadata = { title: "My orders — Batchelor" };

export default function MyOrdersPage() {
  return (
    <main className="app-shell">
      <TopBar active="orders" />
      <div id="content" className="page-content proof-page">
        <h1 className="sr-only">My orders</h1>
        <AccountSummary />
        <OrdersPanel />
        <footer className="footer">
          <span>BATCHELOR <span className="brand-period">/</span> DEVELOPMENT BUILD</span>
          <span>Read-only. No trades can be submitted.</span>
        </footer>
      </div>
    </main>
  );
}
