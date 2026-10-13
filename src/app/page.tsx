import { ExternalLink, Layers3 } from "lucide-react";
import { AuctionPanel } from "@/components/terminal/AuctionPanel";
import { MarketHeader } from "@/components/terminal/MarketHeader";
import { OrderBook } from "@/components/terminal/OrderBook";
import { OrderEntry } from "@/components/terminal/OrderEntry";
import { OrdersPanel } from "@/components/terminal/OrdersPanel";
import { contractReadsConfigured, marketDataAdapter } from "@/lib/market-data/adapter";
import { parseCandleInterval } from "@/lib/market-data/intervals";
import Link from "next/link";
import { MarketChart } from "@/components/terminal/MarketChart";
import { SystemStatus } from "@/components/terminal/SystemStatus";
import { AutoRefresh } from "@/components/terminal/AutoRefresh";
import { TopBar } from "@/components/terminal/TopBar";

interface HomePageProps {
  searchParams: Promise<{ interval?: string | string[] }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const interval = parseCandleInterval((await searchParams).interval);
  const [marketResult, bookResult, candleResult] = await Promise.all([
    marketDataAdapter.getMarketSummary("default"),
    marketDataAdapter.getOrderBook("default"),
    marketDataAdapter.getCandles("default", interval),
  ]);

  return (
    <main className="app-shell">
      <TopBar active="trade" />
      {contractReadsConfigured && <AutoRefresh intervalMs={5_000} />}

      <div id="content" className="page-content">
        <h1 className="sr-only">Trading terminal</h1>

        <MarketHeader result={marketResult} />

        <div className="terminal-grid">
          <div className="terminal-main">
            <MarketChart result={candleResult} interval={interval} />
            <div id="orders"><OrdersPanel /></div>
          </div>
          <div className="terminal-book">
            <OrderBook result={bookResult} lastClearingPrice={marketResult.data?.lastClearingPrice} />
            <SystemStatus feedStatus={candleResult.status} feedMessage={candleResult.message} readsConfigured={contractReadsConfigured} readsStatus={bookResult.status} />
          </div>
          <aside className="terminal-side">
            <OrderEntry baseAsset={marketResult.data?.baseAsset} quoteAsset={marketResult.data?.quoteAsset} />
            <AuctionPanel result={marketResult} />
          </aside>
        </div>

        <section className="methodology" id="methodology">
          <div className="method-icon"><Layers3 size={18} /></div>
          <div>
            <h2>Designed around batch execution</h2>
            <p>Orders are grouped into batches. Eligible matches target a uniform clearing price; actual allocation and settlement are determined by the deployed auction rules.</p>
          </div>
          <Link href="#auction" aria-label="Learn about auction history"><ExternalLink size={16} /></Link>
        </section>

        <footer className="footer">
          <span>BATCHELOR <span className="brand-period">/</span> DEVELOPMENT BUILD</span>
          <span>{contractReadsConfigured ? "Read-only: the order book comes from the configured contract." : "Market data is not connected."} No trades can be submitted.</span>
        </footer>
      </div>
    </main>
  );
}
