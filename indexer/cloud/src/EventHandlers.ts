import { indexer, type Batch } from 'envio';
import { DEMO_LOT, DEMO_MIN_PRICE, DEMO_TICK_SIZE, escrowFor, fill, median } from './settle';
import { batchKey, orderKey, traderKey } from './ids';

indexer.onEvent({ contract: 'BatchAuction', event: 'OrderPlaced' }, async ({ event, context }) => {
  const p = event.params;
  const market = event.srcAddress.toLowerCase();
  const id = batchKey(event.chainId, market, p.batchId);
  const traderId = traderKey(event.chainId, market, p.trader);
  const [previous, trader] = await Promise.all([context.Batch.get(id), context.Trader.get(traderId)]);
  const effective = event.transaction.effectiveGasPrice;
  const base = event.block.baseFeePerGas;
  if (effective === undefined || base === undefined || effective < base) throw new Error('Missing or invalid paid gas metadata');
  const batch: Batch = previous ?? {
    id, chainId: event.chainId, batchId: p.batchId, market, startBlock: BigInt(event.block.number),
    clearedBlock: undefined, clearTxHash: undefined, clearTick: undefined, price: undefined,
    volumeLots: 0n, buyCutoff: undefined, sellCutoff: undefined, rB: 0n, mB: 0n, rS: 0n, mS: 0n,
    orderCount: 0, placedCount: 0, relayedCount: 0, clearGas: undefined, baseFeePerGas: undefined,
    clearedAtTimestamp: undefined, maxPriorityFeePerGas: 0n, medianPriorityFeePerGas: 0n,
  };
  context.Batch.set({ ...batch, orderCount: batch.orderCount + 1, placedCount: batch.placedCount + 1, relayedCount: batch.relayedCount + Number(p.relayed) });
  context.Trader.set({ id: traderId, chainId: event.chainId, address: p.trader.toLowerCase(), market, orderCount: (trader?.orderCount ?? 0) + 1, volumeLots: trader?.volumeLots ?? 0n, volumeBase: trader?.volumeBase ?? 0n });
  context.Order.set({
    id: orderKey(event.chainId, market, p.orderId), chainId: event.chainId, market, orderId: p.orderId,
    batch_id: id, trader_id: traderId, side: Number(p.side), tick: Number(p.tick), lots: p.lots, relayed: p.relayed,
    blockNumber: BigInt(event.block.number), txIndex: event.transaction.transactionIndex,
    logIndex: event.logIndex, txHash: event.transaction.hash,
    effectiveGasPrice: effective, maxPriorityFeePerGas: event.transaction.maxPriorityFeePerGas,
    baseFeePerGas: base, priorityFeePerGas: effective - base, cancelled: false, claimed: false, claimTxHash: undefined,
    baseIn: 0n, baseOut: 0n, quoteIn: 0n, quoteOut: 0n, filledLots: 0n,
  });
});

indexer.onEvent({ contract: 'BatchAuction', event: 'OrderCancelled' }, async ({ event, context }) => {
  const order = await context.Order.getOrThrow(orderKey(event.chainId, event.srcAddress, event.params.orderId));
  const batch = await context.Batch.getOrThrow(order.batch_id);
  // Solidity makes cancellation terminal without emitting Claimed.
  context.Order.set({ ...order, cancelled: true, claimed: true });
  context.Batch.set({ ...batch, orderCount: batch.orderCount - 1 });
});

indexer.onEvent({ contract: 'BatchAuction', event: 'BatchCleared' }, async ({ event, context }) => {
  const p = { ...event.params, clearTick: Number(event.params.clearTick), buyCutoff: Number(event.params.buyCutoff), sellCutoff: Number(event.params.sellCutoff), orderCount: Number(event.params.orderCount) };
  const id = batchKey(event.chainId, event.srcAddress, p.batchId);
  const orders = await context.Order.getWhere({ batch_id: { _eq: id } });
  const batch = await context.Batch.getOrThrow(id);
  const traders = await Promise.all(orders.map(o => context.Trader.getOrThrow(o.trader_id)));
  if (context.isPreload) return;
  const active = orders.filter(o => !o.cancelled);
  if (active.length !== p.orderCount) throw new Error('Indexed order count differs from contract; check deployment start block');
  // Count fee observations per order, including cancellations, as the receipt shows every placement.
  const fees = orders.map(o => o.priorityFeePerGas);
  context.Batch.set({ ...batch, ...p, id, orderCount: p.orderCount,
    clearGas: BigInt(p.clearGas), clearedBlock: BigInt(event.block.number), clearTxHash: event.transaction.hash,
    baseFeePerGas: event.block.baseFeePerGas, clearedAtTimestamp: BigInt(event.block.timestamp),
    maxPriorityFeePerGas: fees.reduce((a, b) => a > b ? a : b, 0n), medianPriorityFeePerGas: median(fees) ?? 0n,
  });
  const totals = new Map(traders.map(t => [t.id, t]));
  for (const order of active) {
    const settled = fill({ side: order.side, tick: order.tick, lots: order.lots, escrow: escrowFor(order.side, order.lots, DEMO_MIN_PRICE + BigInt(order.tick) * DEMO_TICK_SIZE, DEMO_LOT) }, p, p.price, DEMO_LOT);
    const numerator = order.side === 0 ? settled.baseOut : settled.baseIn;
    const filledLots = numerator / DEMO_LOT;
    context.Order.set({ ...order, baseIn: settled.baseIn, baseOut: settled.baseOut, quoteIn: settled.quoteIn, quoteOut: settled.quoteOut, filledLots });
    const trader = totals.get(order.trader_id)!;
    const volumeBase = trader.volumeBase + numerator;
    totals.set(trader.id, { ...trader, volumeBase, volumeLots: volumeBase / DEMO_LOT });
  }
  for (const trader of totals.values()) context.Trader.set(trader);
});

indexer.onEvent({ contract: 'BatchAuction', event: 'Claimed' }, async ({ event, context }) => {
  const p = event.params;
  const order = await context.Order.getOrThrow(orderKey(event.chainId, event.srcAddress, p.orderId));
  const trader = await context.Trader.getOrThrow(order.trader_id);
  if (trader.address !== p.owner.toLowerCase()) throw new Error('Claim owner mismatch');
  for (const key of ['baseIn', 'baseOut', 'quoteIn', 'quoteOut'] as const) {
    if (order[key] !== p[key]) throw new Error(`Settlement mismatch for ${key}`);
  }
  context.Order.set({ ...order, claimed: true, claimTxHash: event.transaction.hash, baseIn: p.baseIn, baseOut: p.baseOut, quoteIn: p.quoteIn, quoteOut: p.quoteOut });
});

// Tracks empty blocks too; a quiet market must not look like an indexer stuck at its last trade.
indexer.onBlock({ name: 'syncProgress' }, async ({ block, context }) => {
  context.SyncState.set({ id: String(context.chain.id), chainId: context.chain.id, processedBlock: BigInt(block.number) });
});
