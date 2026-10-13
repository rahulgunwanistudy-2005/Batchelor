import type { MarketDataResult, MarketSummary } from "@/types/market";
import { StatusLabel } from "./StatusLabel";

export function MarketHeader({ result }: { result: MarketDataResult<MarketSummary> }) {
  const market = result.data;

  return (
    <section className="market-header" aria-label="Market summary">
      <h1>{market ? `${market.baseAsset} / ${market.quoteAsset}` : "Batchelor"}</h1>
      {market && (
        <dl className="market-stats">
          <div className="market-stat">
            <dt>Last clearing price</dt>
            <dd>{market.lastClearingPrice ? `${market.lastClearingPrice} ${market.quoteAsset}` : "No trade yet"}</dd>
          </div>
          <div className="market-stat">
            <dt>Open batch</dt>
            <dd>{market.currentBatchId ? `#${market.currentBatchId}` : "None"}</dd>
          </div>
        </dl>
      )}
      <div className="market-status">
        <StatusLabel status={result.status} />
      </div>
    </section>
  );
}
