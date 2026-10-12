import { ChevronDown, CircleHelp } from "lucide-react";
import type { MarketDataResult, MarketSummary } from "@/types/market";
import { StatusLabel } from "./StatusLabel";

export function MarketHeader({ result }: { result: MarketDataResult<MarketSummary> }) {
  const market = result.data;

  return (
    <section className="market-header panel">
      <div className="market-identity">
        <div className="pair-icon" aria-hidden="true">B</div>
        <div>
          <div className="eyebrow">MARKET</div>
          <button className="market-selector" type="button" disabled aria-label="Market selector not configured">
            {market ? `${market.baseSymbol} / ${market.quoteSymbol}` : "Select market"}
            <ChevronDown size={15} />
          </button>
        </div>
      </div>
      <div className="market-price">
        <span className="eyebrow">LAST CLEARING PRICE</span>
        <strong>{market?.lastClearingPrice ?? "—"}</strong>
        <span className="muted">{market ? market.quoteSymbol : "Waiting for market data"}</span>
      </div>
      <div className="market-stat">
        <span className="eyebrow">24H CHANGE</span>
        <strong>{market?.priceChange24h ?? "—"}</strong>
      </div>
      <div className="market-stat">
        <span className="eyebrow">CURRENT BATCH</span>
        <strong>{market?.batchId ?? "—"}</strong>
        <span className="muted">{market?.batchStatus ?? "Not available"}</span>
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
