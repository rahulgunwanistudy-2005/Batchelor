import { Activity, ArrowUpRight, BookOpen, ExternalLink, Layers3, Settings2 } from "lucide-react";
import { AuctionPanel } from "@/components/terminal/AuctionPanel";
import { MarketHeader } from "@/components/terminal/MarketHeader";
import { OrderBook } from "@/components/terminal/OrderBook";
import { OrderEntry } from "@/components/terminal/OrderEntry";
import { OrdersPanel } from "@/components/terminal/OrdersPanel";
import { marketDataAdapter } from "@/lib/market-data/adapter";

export default async function HomePage() {
  const [marketResult, bookResult] = await Promise.all([
    marketDataAdapter.getMarketSummary("default"),
    marketDataAdapter.getOrderBook("default"),
  ]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a href="/" className="brand" aria-label="Batchelor home">
          <span className="brand-mark"><Layers3 size={19} strokeWidth={2.2} /></span>
          <span>batchelor<span className="brand-period">.</span></span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <a href="/" className="nav-link nav-link--active"><Activity size={15} /> Trade</a>
          <a href="#orders" className="nav-link"><BookOpen size={15} /> Orders</a>
          <a href="#auction" className="nav-link">Auction history</a>
        </nav>
        <div className="topbar-actions">
          <span className="network-pill"><span className="network-dot" /> Monad <span className="network-env">Not connected</span></span>
          <button className="connect-button" type="button" disabled title="Wallet integration will be added after network configuration">Wallet unavailable</button>
          <button className="icon-button" type="button" aria-label="Settings" disabled><Settings2 size={17} /></button>
        </div>
      </header>

      <div className="page-content">
        <div className="page-title-row">
          <div>
            <p className="eyebrow">MARKETS / SPOT</p>
            <h1>Trading terminal</h1>
            <p className="page-description">Batch auctions, transparent execution.</p>
          </div>
          <a className="text-link" href="#methodology">How auctions work <ArrowUpRight size={14} /></a>
        </div>

        <MarketHeader result={marketResult} />

        <div className="terminal-grid">
          <div className="terminal-main">
            <section className="panel chart-panel">
              <div className="panel-heading">
                <div><h2>Market overview</h2><p className="panel-subtitle">Clearing-price history</p></div>
                <span className="chart-unavailable">Chart unavailable · no verified price feed</span>
              </div>
              <div className="chart-empty">
                <div className="chart-empty-icon"><Activity size={22} /></div>
                <strong>Price history will appear here</strong>
                <p>Connect a verified OHLCV or batch-clearing data source to enable charting.</p>
              </div>
              <div className="chart-footer"><span>Source: not connected</span><span>Time range unavailable</span></div>
            </section>
            <AuctionPanel result={marketResult} />
            <div id="orders"><OrdersPanel /></div>
          </div>
          <aside className="terminal-side">
            <OrderBook result={bookResult} />
            <OrderEntry />
          </aside>
        </div>

        <section className="methodology" id="methodology">
          <div className="method-icon"><Layers3 size={18} /></div>
          <div>
            <h2>Designed around batch execution</h2>
            <p>Orders are grouped into batches. Eligible matches target a uniform clearing price; actual allocation and settlement are determined by the deployed auction rules.</p>
          </div>
          <a href="#auction" aria-label="Learn about auction history"><ExternalLink size={16} /></a>
        </section>

        <footer className="footer">
          <span>BATCHELOR <span className="brand-period">/</span> DEVELOPMENT BUILD</span>
          <span>Market data is not connected. No trades can be submitted.</span>
        </footer>
      </div>
    </main>
  );
}
