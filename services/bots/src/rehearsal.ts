export interface DemoFill {
  orderId: string; batchId: string; hash: string; txIndex: number; block: string;
  baseFee: bigint; priorityFee: bigint; baseDelta: bigint; quoteDelta: bigint; price: bigint;
}
export function verifyDemo(asha: DemoFill, pete: DemoFill[], priorityMultiplier: bigint) {
  const peers = pete.filter((p) => p.batchId === asha.batchId && p.block === asha.block);
  if (!peers.length) throw new Error('Asha and Pete did not enter the same batch. Retry the rehearsal.');
  if (!peers.some((p) => p.txIndex < asha.txIndex)) throw new Error('Asha did not follow Pete in transaction order. Retry the rehearsal.');
  if (asha.baseDelta <= 0n || peers.some((p) => p.baseDelta <= 0n)) throw new Error('Demo orders did not fill.');
  if (peers.some((p) => p.price !== asha.price)) throw new Error('Execution prices differ.');
  if (peers.some((p) => p.priorityFee < priorityMultiplier * p.baseFee)) throw new Error('Pete inclusion priority was below the required base-fee multiple.');
  // Five 0.001-ROSE lots settle exactly on this grid, so the paid price is observable.
  if (asha.quoteDelta >= 0n || -asha.quoteDelta * 10n ** 18n !== asha.baseDelta * asha.price
    || peers.some((p) => p.quoteDelta >= 0n || -p.quoteDelta * 10n ** 18n !== p.baseDelta * p.price)) throw new Error('Observed settlement does not match the uniform price.');
  return { passed: true, batchId: asha.batchId, price: asha.price.toString(), asha, pete: peers };
}
