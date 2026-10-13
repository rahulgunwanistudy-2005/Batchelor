import { ChevronDown, CircleHelp } from "lucide-react";
import type { MarketDataResult, MarketSummary } from "@/types/market";
import { StatusLabel } from "./StatusLabel";

export function MarketHeader({ result }: { result: MarketDataResult<MarketSummary> }) {
  const market = result.data;
  const change = market?.change24hPercent ?? null;
  const changeValue = change === null ? NaN : Number(change);
  const changeClass = changeValue > 0 ? "change--up" : changeValue < 0 ? "change--down" : undefined;

  return (
    <section className="market-header panel">
      <div className="market-identity">
        <div className="pair-icon" aria-hidden="true">B</div>
        <div>
          <div className="eyebrow">MARKET</div>
          <button className="market-selector" type="button" disabled aria-label="Market selector not configured">
            {market ? `${market.baseAsset}/${market.quoteAsset}` : "Select market"}
            <ChevronDown size={15} />
          </button>
        </div>
      </div>
      <div className="market-price">
        <span className="eyebrow">LAST CLEARING PRICE</span>
        <strong>{market?.lastClearingPrice ?? "—"}</strong>
        <span className="muted">{market ? "Price per unit" : "Waiting for market data"}</span>
      </div>
      <div className="market-stat">
        <span className="eyebrow">24H CHANGE</span>
        <strong className={changeClass}>{Number.isFinite(changeValue) ? `${changeValue > 0 ? "+" : ""}${change}%` : "—"}</strong>
      </div>
      <div className="market-stat">
        <span className="eyebrow">CURRENT BATCH</span>
        <strong>{market?.currentBatchId ? `#${market.currentBatchId}` : "—"}</strong>
        <span className="muted">{market?.currentBatchId ? "Open batch" : "Not available"}</span>
      </div>
      <div className="market-status">
        <StatusLabel status={result.status} />
        <button className="icon-button" aria-label="Market data information" title={result.message ?? "Market data status"} type="button">
          <CircleHelp size={16} />
        </button>
      </div>
    </section>
  );
}
