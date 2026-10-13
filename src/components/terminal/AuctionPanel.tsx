import { Clock3, ShieldCheck } from "lucide-react";
import type { MarketDataResult, MarketSummary } from "@/types/market";

export function AuctionPanel({ result }: { result: MarketDataResult<MarketSummary> }) {
  const market = result.data;
  const headline = !market ? "Awaiting connection" : market.currentBatchId ? "Batch open or awaiting clearing" : "No open batch";
  return (
    <section className="panel auction-panel" id="auction">
      <div className="panel-heading">
        <div>
          <h2>Auction status</h2>
          <p className="panel-subtitle">Batch-based execution</p>
        </div>
        <Clock3 size={17} className="muted-icon" />
      </div>
      <div className="auction-state">
        <span className={`state-dot ${market ? "state-dot--ready" : ""}`} />
        <div>
          <strong>{headline}</strong>
          <p>{market?.currentBatchId ? `Batch #${market.currentBatchId}` : market ? "The next order opens a new batch" : "Batch information unavailable"}</p>
        </div>
      </div>
      <div className="auction-rule">
        <ShieldCheck size={17} />
        <p>Eligible orders in a batch target a common clearing price, subject to the auction contract&apos;s matching and allocation rules.</p>
      </div>
      <div className="auction-metrics">
        <div><span>Last clearing price</span><strong>{market?.lastClearingPrice ? `${market.lastClearingPrice} ${market.quoteAsset}` : "—"}</strong></div>
        <div><span>Open batch</span><strong>{market?.currentBatchId ? `#${market.currentBatchId}` : "—"}</strong></div>
      </div>
      <p className="panel-footnote">{result.message ?? (market ? "Read from the auction contract." : "Auction feed will be connected to the verified source.")}</p>
    </section>
  );
}
