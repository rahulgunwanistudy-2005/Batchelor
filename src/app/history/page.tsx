import type { Metadata } from "next";
import { RecentBatches } from "@/components/terminal/RecentBatches";
import { TopBar } from "@/components/terminal/TopBar";
import { marketDataAdapter } from "@/lib/market-data/adapter";

export const metadata: Metadata = { title: "Auction history — Batchelor" };
export const dynamic = "force-dynamic";

const HISTORY_LIMIT = 60;

export default async function HistoryPage() {
  const [market, history] = await Promise.all([
    marketDataAdapter.getMarketSummary("default"),
    marketDataAdapter.getRecentBatches("default", HISTORY_LIMIT),
  ]);
  const count = history.data?.length ?? 0;
  const pair = market.data ? `${market.data.baseAsset} / ${market.data.quoteAsset}` : null;

  return (
    <main className="app-shell">
      <TopBar active="history" />
      <div id="content" className="page-content page-content--narrow">
        <header className="page-heading">
          {pair && <p className="page-kicker">{pair}</p>}
          <h1>Auction history</h1>
          <p className="page-lede">
            Every cleared batch settled all of its filled orders at one price. Open a batch to see its receipt.
          </p>
        </header>
        <RecentBatches
          result={history}
          title="Cleared batches"
          subtitle={count > 0 ? `The ${count === HISTORY_LIMIT ? `latest ${count}` : count} cleared batch${count === 1 ? "" : "es"}, newest first, read from the contract` : "Newest first, read from the contract"}
        />
        <footer className="footer">
          <span>Read directly from the auction contract.</span>
          <span>Demo tokens on Monad testnet. No real value.</span>
        </footer>
      </div>
    </main>
  );
}
