import type { Metadata } from "next";
import { AccountSummary } from "@/components/account/AccountSummary";
import { OrdersPanel } from "@/components/terminal/OrdersPanel";
import { TopBar } from "@/components/terminal/TopBar";

export const metadata: Metadata = { title: "My orders — Batchelor" };

export default function MyOrdersPage() {
  return (
    <main className="app-shell">
      <TopBar active="orders" />
      <div id="content" className="page-content page-content--narrow">
        <header className="page-heading">
          <h1>Your account</h1>
          <p className="page-lede">Balances you hold inside the auction contract, and the orders you have placed from this browser.</p>
        </header>
        <AccountSummary />
        <OrdersPanel />
        <footer className="footer">
          <span>Balances and order status are read from the auction contract.</span>
          <span>Demo tokens on Monad testnet. No real value.</span>
        </footer>
      </div>
    </main>
  );
}
