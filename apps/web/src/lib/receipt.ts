import { arrivalOrder, replay, type Actor, type ReplayTotal } from '@batchelor/core/replay';
import { formatUnits, tickToPrice, LOT, BASE_SCALE } from '@batchelor/core/format';
import type { BatchReceipt, IndexedOrder } from '$lib/api/graphql';
export interface ActorConfig { pete: string[]; mo: string | null }
export function actorOf(address: string, actors: ActorConfig): Actor {
  const normalized = address.toLowerCase();
  return actors.pete.includes(normalized) ? 'pete' : normalized === actors.mo ? 'mo' : 'everyone';
}
export const shortAddress = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
export function amountText(value: bigint, decimals: number) { return formatUnits(value, decimals).replace(/\.?0+$/, ''); }
export function priceText(price: bigint) { return `${formatUnits(price, 6).replace(/0{1,2}$/, '')} dUSD`; }
export function receiptHeadline(receipt: BatchReceipt) {
  const count = `${receipt.placedCount} ${receipt.placedCount === 1 ? 'order' : 'orders'}`;
  return receipt.clearedBlock === null ? `${count}, awaiting clearing.` : receipt.volumeLots === 0n ? `${count}, no matched volume.` : `${count}, one price: ${priceText(receipt.price!)}`;
}
export function receiptModel(receipt: BatchReceipt, actors: ActorConfig) {
  const orders = [...receipt.orders].sort(arrivalOrder);
  const simulation = replay(orders.map(o => ({ ...o, actor: actorOf(o.trader.address, actors) })));
  const pete = orders.filter(o => actorOf(o.trader.address, actors) === 'pete');
  const multiples = pete.filter(o => o.baseFeePerGas > 0n).map(o => o.priorityFeePerGas * 100n / o.baseFeePerGas);
  const min = multiples.length ? multiples.reduce((a,b) => a < b ? a : b) : null;
  const max = multiples.length ? multiples.reduce((a,b) => a > b ? a : b) : null;
  const multiple = min === null ? null : min === max ? formatUnits(min, 2).replace(/\.?0+$/, '') : `${formatUnits(min, 2)}–${formatUnits(max!, 2)}`;
  const peteFilled = pete.some(o => !o.cancelled && o.baseOut > 0n);
  const description = pete.length && multiple !== null && multiples.length === pete.length
    ? `Pete paid ${multiple}× the base fee as priority on ${pete.length} of them. ${peteFilled ? 'It bought him nothing on the clearing price.' : 'It did not guarantee a fill.'}`
    : `${receipt.orderCount} active orders · ${formatUnits(receipt.volumeLots * LOT, 18)} ROSE matched. Filled orders settle at the same price.`;
  return { orders, simulation, description, headline: receiptHeadline(receipt) };
}
/** Difference in weighted average price; no money calculations in Number. */
export function comparison(orders: IndexedOrder[], simulation: { orders: (ReplayTotal & {id:string})[] }, price: bigint | null) {
  let filledLots = 0n, priceLots = 0n;
  const ids = new Set(orders.map(o => o.id));
  for (const o of simulation.orders) if (ids.has(o.id)) { filledLots += o.filledLots; priceLots += o.priceLots; }
  const batchBase = orders.reduce((s,o) => s + (o.side === 0 ? o.baseOut : o.baseIn),0n);
  if (!filledLots || price === null || !batchBase) return { average: null, difference: null, percent: null, filledLots, batchBase };
  const differenceNumerator = priceLots - filledLots * price;
  return { average: priceLots / filledLots, difference: differenceNumerator / filledLots,
    percent: differenceNumerator * 10_000n / (filledLots * price), filledLots, batchBase };
}
export function logFeeWidth(fee: bigint, max: bigint): number {
  // Number is used only for visual coordinates, never settlement or prices.
  const logarithm = (n: bigint) => { if (!n) return 0; const s=(n+1n).toString(); return Math.log10(Number(s.slice(0,15))) + Math.max(0,s.length-15); };
  return max ? Math.max(0,Math.min(100,logarithm(fee)/logarithm(max)*100)) : 0;
}
export function batchFillLots(order: IndexedOrder) { return formatUnits((order.side === 0 ? order.baseOut : order.baseIn) * BASE_SCALE / LOT, 18).replace(/\.?0+$/, ''); }
export { tickToPrice };
