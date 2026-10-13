import { AutoRefresh } from "@/components/terminal/AutoRefresh";
import { BatchPanel, type BatchView } from "@/components/terminal/BatchPanel";
import { MarketHeader } from "@/components/terminal/MarketHeader";
import { OrderBook } from "@/components/terminal/OrderBook";
import { OrderEntry } from "@/components/terminal/OrderEntry";
import { OrdersPanel } from "@/components/terminal/OrdersPanel";
import { RecentBatches } from "@/components/terminal/RecentBatches";
import { SystemStatus } from "@/components/terminal/SystemStatus";
import { TopBar } from "@/components/terminal/TopBar";
import { contractReadsConfigured, marketDataAdapter } from "@/lib/market-data/adapter";
import { parseCandleInterval } from "@/lib/market-data/intervals";

interface HomePageProps {
  searchParams: Promise<{ interval?: string | string[]; view?: string | string[] }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const query = await searchParams;
  const interval = parseCandleInterval(query.interval);
  const view: BatchView = query.view === "history" ? "history" : "batch";

  const [marketResult, bookResult, candleResult, historyResult] = await Promise.all([
    marketDataAdapter.getMarketSummary("default"),
    marketDataAdapter.getOrderBook("default"),
    marketDataAdapter.getCandles("default", interval),
    marketDataAdapter.getRecentBatches("default", 60),
  ]);
  const market = marketResult.data;

  return (
    <main className="app-shell">
      <TopBar active="trade" />
      {contractReadsConfigured && <AutoRefresh intervalMs={5_000} />}

      <div id="content" className="page-content">
        <MarketHeader result={marketResult} />

        <div className="terminal-grid">
          <div className="terminal-main">
            <BatchPanel view={view} interval={interval} market={marketResult} book={bookResult} candles={candleResult} />
            <OrdersPanel />
            <RecentBatches result={historyResult} title="Recent batches" subtitle="Each cleared batch has one price for every order in it" preview={5} />
          </div>
          <aside className="terminal-side">
            <OrderEntry referencePrice={bookResult.data?.indicative?.price ?? market?.lastClearingPrice ?? null} />
            <OrderBook result={bookResult} lastClearingPrice={market?.lastClearingPrice} baseAsset={market?.baseAsset} quoteAsset={market?.quoteAsset} />
          </aside>
        </div>

        <footer className="footer">
          <SystemStatus readsConfigured={contractReadsConfigured} readsStatus={bookResult.status} />
          <span>Demo tokens on Monad testnet. No real value.</span>
        </footer>
      </div>
    </main>
  );
}
