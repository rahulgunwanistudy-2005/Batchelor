import type { BookLevel } from "@/types/market";

interface UncrossChartProps {
  bids: BookLevel[];
  asks: BookLevel[];
  /** Price where the batch would clear now, if the two sides cross. */
  clearingPrice: string | null;
  quoteAsset: string;
  baseAsset: string;
}

const W = 720;
const H = 280;
const PAD = { top: 36, right: 12, bottom: 36, left: 12 };

interface Point { price: number; quantity: number }

function toPoints(levels: BookLevel[]): Point[] {
  return levels
    .map((level) => ({ price: Number(level.price), quantity: Number(level.quantity) }))
    .filter((point) => Number.isFinite(point.price) && Number.isFinite(point.quantity) && point.quantity > 0);
}

/**
 * The picture of a batch auction: cumulative demand stepping down as price
 * rises, cumulative supply stepping up, and the single price where they meet.
 * Drawn from the open batch's real orders; the order book beside it is the
 * same data as a table.
 */
export function UncrossChart({ bids, asks, clearingPrice, quoteAsset, baseAsset }: UncrossChartProps) {
  const demand = toPoints(bids).sort((a, b) => b.price - a.price);
  const supply = toPoints(asks).sort((a, b) => a.price - b.price);

  if (demand.length === 0 && supply.length === 0) {
    return (
      <div className="uncross-empty">
        <strong>No orders in this batch yet</strong>
        <span>Buy and sell orders will appear here as two staircases that meet at one price.</span>
      </div>
    );
  }

  const prices = [...demand, ...supply].map((point) => point.price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  // Room either side so the outermost steps are visible even with a single price level.
  const pad = high > low ? (high - low) * 0.12 : Math.max(low * 0.02, 0.01);
  const xMin = low - pad;
  const xMax = high + pad;
  const total = (points: Point[]) => points.reduce((sum, point) => sum + point.quantity, 0);
  const yMax = Math.max(total(demand), total(supply));

  const x = (price: number) => PAD.left + ((price - xMin) / (xMax - xMin)) * (W - PAD.left - PAD.right);
  const y = (quantity: number) => H - PAD.bottom - (quantity / yMax) * (H - PAD.top - PAD.bottom);

  // Demand: walk from the highest price leftwards, stepping up at each bid.
  let cumulative = 0;
  let demandPath = `M ${x(xMax)} ${y(0)}`;
  for (const point of demand) {
    demandPath += ` H ${x(point.price)}`;
    cumulative += point.quantity;
    demandPath += ` V ${y(cumulative)}`;
  }
  demandPath += ` H ${x(xMin)}`;

  // Supply: walk from the lowest price rightwards, stepping up at each ask.
  cumulative = 0;
  let supplyPath = `M ${x(xMin)} ${y(0)}`;
  for (const point of supply) {
    supplyPath += ` H ${x(point.price)}`;
    cumulative += point.quantity;
    supplyPath += ` V ${y(cumulative)}`;
  }
  supplyPath += ` H ${x(xMax)}`;

  const clearing = clearingPrice !== null ? Number(clearingPrice) : null;
  const clearX = clearing !== null && Number.isFinite(clearing) ? x(Math.min(xMax, Math.max(xMin, clearing))) : null;
  const round = (value: number) => Number(value.toPrecision(6)).toString();
  const summary =
    `Cumulative demand and supply for the open batch. ${demand.length} bid level${demand.length === 1 ? "" : "s"} and ` +
    `${supply.length} ask level${supply.length === 1 ? "" : "s"}, from ${round(low)} to ${round(high)} ${quoteAsset}. ` +
    (clearing !== null ? `They cross at ${clearingPrice} ${quoteAsset}.` : "They do not cross yet.");

  return (
    <div className="uncross">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
        {[0.25, 0.5, 0.75, 1].map((fraction) => (
          <line key={fraction} className="uncross-grid" x1={PAD.left} x2={W - PAD.right} y1={y(yMax * fraction)} y2={y(yMax * fraction)} />
        ))}
        <line className="uncross-grid" x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} />
        {supply.length > 0 && <path className="uncross-supply" d={supplyPath} />}
        {demand.length > 0 && <path className="uncross-demand" d={demandPath} />}
        {clearX !== null && <line className="uncross-clear" x1={clearX} x2={clearX} y1={PAD.top - 4} y2={y(0)} />}
        <text className="uncross-label" x={PAD.left} y={H - 8}>{round(xMin)} {quoteAsset}</text>
        <text className="uncross-label" x={W - PAD.right} y={H - 8} textAnchor="end">{round(xMax)} {quoteAsset}</text>
        <text className="uncross-label" x={PAD.left} y={y(yMax) - 10}>{round(yMax)} {baseAsset} in total</text>
        {clearX !== null && (
          <text className="uncross-label uncross-label--clear" x={clearX} y={H - 8} textAnchor="middle">{clearingPrice}</text>
        )}
      </svg>
    </div>
  );
}
