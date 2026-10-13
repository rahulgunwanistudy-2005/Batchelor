import { tickToPrice } from './format.ts';
export type Actor = 'pete' | 'mo' | 'everyone';
export interface ReplayOrder {
  id: string; side: number; tick: number; lots: bigint;
  blockNumber: bigint; txIndex: number; logIndex: number; actor?: Actor; cancelled?: boolean;
}
/** Average price is an exact rational in quote units per ROSE. */
export interface ReplayTotal { filledLots: bigint; priceLots: bigint; averagePrice: { numerator: bigint; denominator: bigint } | null }
export interface ReplayFill extends ReplayTotal { id: string }
export const replayLabel = "Simulated replay of this batch's real orders, in the order the block included them, on a continuous order book.";
export function arrivalOrder<T extends Pick<ReplayOrder, 'blockNumber' | 'txIndex' | 'logIndex'>>(a: T, b: T): number {
  return a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : a.txIndex - b.txIndex || a.logIndex - b.logIndex;
}
export function replay(input: readonly ReplayOrder[]) {
  const orders = [...input].sort(arrivalOrder);
  const totals = new Map<string, ReplayFill>();
  // Each tick is a FIFO queue. Walking a bounded tick grid avoids sorting or
  // repeatedly scanning every resting order for each new arrival.
  const queues = Array.from({length:2},()=>Array.from({length:256},()=>[] as {order:ReplayOrder;remaining:bigint}[]));
  const heads = Array.from({length:2},()=>Array<number>(256).fill(0));
  const empty = (): ReplayTotal => ({ filledLots: 0n, priceLots: 0n, averagePrice: null });
  const actors: Record<Actor, ReplayTotal> = { pete: empty(), mo: empty(), everyone: empty() };
  let matchedLots = 0n;
  for (const [sequence, order] of orders.entries()) {
    tickToPrice(order.tick);
    if (!order.id || totals.has(order.id) || ![0, 1].includes(order.side) || order.lots <= 0n || order.blockNumber < 0n || !Number.isSafeInteger(order.txIndex) || order.txIndex < 0 || !Number.isSafeInteger(order.logIndex) || order.logIndex < 0) throw new Error('Invalid replay order');
    if (sequence && arrivalOrder(orders[sequence - 1]!, order) === 0) throw new Error('Ambiguous replay arrival');
    totals.set(order.id, { id: order.id, ...empty() });
    let remaining = order.lots;
    // Cancellation timing is unavailable in the indexed placement model. Exclude
    // cancelled liquidity consistently, and disclose this limitation in receipts.
    if (order.cancelled) continue;
    const oppositeSide = 1 - order.side;
    const step = order.side === 0 ? 1 : -1;
    for (let tick = order.side === 0 ? 0 : 255; remaining && (step > 0 ? tick <= order.tick : tick >= order.tick); tick += step) {
      const queue = queues[oppositeSide]![tick]!;
      while (remaining && heads[oppositeSide]![tick]! < queue.length) {
        const rest = queue[heads[oppositeSide]![tick]!]!;
        const quantity = remaining < rest.remaining ? remaining : rest.remaining;
        const priceLots = quantity * tickToPrice(tick);
        for (const participant of [order, rest.order]) {
          const total = totals.get(participant.id)!;
          total.filledLots += quantity; total.priceLots += priceLots;
          const group = actors[participant.actor ?? 'everyone'];
          group.filledLots += quantity; group.priceLots += priceLots;
        }
        remaining -= quantity; rest.remaining -= quantity; matchedLots += quantity;
        if (!rest.remaining) heads[oppositeSide]![tick]!++;
      }
    }
    if (remaining) queues[order.side]![order.tick]!.push({order,remaining});
  }
  for (const total of [...totals.values(), ...Object.values(actors)]) if (total.filledLots) total.averagePrice = { numerator: total.priceLots, denominator: total.filledLots };
  return { orders: orders.map(o => totals.get(o.id)!), actors, matchedLots };
}
