import { ExternalLink, Layers3 } from "lucide-react";
import { LiveMarketPanels } from "@/components/terminal/LiveMarketPanels";
import { marketDataAdapter } from "@/lib/market-data/adapter";
import { parseCandleInterval } from "@/lib/market-data/intervals";
import Link from "next/link";
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

      <div id="content" className="page-content">
        <h1 className="sr-only">Trading terminal</h1>

        <LiveMarketPanels
          key={interval}
          initial={{ market: marketResult, book: bookResult, candles: candleResult }}
          interval={interval}
        />

        <section className="methodology" id="methodology">
          <div className="method-icon"><Layers3 size={18} /></div>
          <div>
            <h2>Designed around batch execution</h2>
            <p>Orders are grouped into batches. Eligible matches target a uniform clearing price; actual allocation and settlement are determined by the deployed auction rules.</p>
          </div>
          <Link href="#auction" aria-label="Learn about auction status"><ExternalLink size={16} /></Link>
        </section>

        <footer className="footer">
          <span>BATCHELOR <span className="brand-period">/</span> DEVELOPMENT BUILD</span>
          <span>Market data is not connected. No trades can be submitted.</span>
        </footer>
      </div>
    </main>
  );
}
