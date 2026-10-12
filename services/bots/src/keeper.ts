import { batchAuctionAbi } from '@batchelor/core/abi';
import type { Address, Hex } from 'viem';
import type { ChainClients, OrderCall } from './chain.js';
import { BotState } from './state.js';

export function logRanges(from: bigint, to: bigint): { fromBlock: bigint; toBlock: bigint }[] {
  const ranges = [];
  for (let cursor = from; cursor <= to; cursor += 100n) ranges.push({ fromBlock: cursor, toBlock: cursor + 99n < to ? cursor + 99n : to });
  return ranges;
}
export type SendKeeper = (call: OrderCall) => Promise<Hex>;
export class Keeper {
  private cursor: bigint;
  private placed = new Map<bigint, Set<bigint>>();
  private claims = new Map<bigint, bigint>(); // order -> cleared batch, rebuilt from chain
  private submitted = new Map<Hex, bigint[]>();
  private clearHash: Hex | undefined;
  constructor(private clients: ChainClients, private market: Address, startBlock: bigint, private state: BotState) { this.cursor = startBlock; }

  get nextScanBlock(): bigint { return this.cursor; }

  async scan(head: bigint): Promise<void> {
    // At most five windows per head: bound catch-up load and resume from cursor.
    for (const range of logRanges(this.cursor, head).slice(0, 5)) {
      const logs = await this.clients.publicClient.getContractEvents({ address: this.market, abi: batchAuctionAbi,
        ...range, strict: true });
      for (const log of logs) {
        if (log.eventName === 'OrderPlaced') {
          const ids = this.placed.get(log.args.batchId) ?? new Set<bigint>();
          ids.add(log.args.orderId); this.placed.set(log.args.batchId, ids);
        } else if (log.eventName === 'BatchCleared') {
          this.state.lastClear = log.args.batchId; this.state.clears++;
          for (const id of this.placed.get(log.args.batchId) ?? []) this.claims.set(id, log.args.batchId);
          this.placed.delete(log.args.batchId);
        } else if (log.eventName === 'Claimed' || log.eventName === 'OrderCancelled') {
          this.claims.delete(log.args.orderId);
          for (const ids of this.placed.values()) ids.delete(log.args.orderId);
        }
      }
      this.cursor = range.toBlock + 1n; // Advance only after complete successful ingestion.
    }
    this.state.claimsPending = this.claims.size;
    this.state.oldestClaimBatchAge = [...this.claims.values()].reduce((age, batch) => {
      const delta = (this.state.lastClear ?? batch) - batch; return delta > age ? delta : age;
    }, 0n);
  }

  async onHead(head: bigint, send: SendKeeper): Promise<void> {
    const meta = await this.clients.publicClient.readContract({ address: this.market, abi: batchAuctionAbi, functionName: 'openBatch' });
    // Runtime verifies the immutable one-block window once at startup.
    const seal = meta.startBlock + 1n;
    if (meta.hasOpen && head >= seal) {
      const lag = head - seal; if (lag > this.state.maxClearLag) this.state.maxClearLag = lag;
      if (lag >= 1n && !this.clearHash) { this.clearHash = await send({ action: 'clear' }); }
    } else this.clearHash = undefined;
    const busy = new Set([...this.submitted.values()].flat());
    const candidates = [...this.claims.keys()].filter((id) => !busy.has(id)).slice(0, 50);
    // Complete event replay through this head already removed every terminal order.
    // Re-reading every ID adds one RPC call per order without removing a next-block claim race.
    const eligible = candidates;
    if (eligible.length) this.submitted.set(await send({ action: 'claim', ids: eligible }), eligible);
  }
  receipt(hash: Hex, success: boolean): void {
    const ids = this.submitted.get(hash);
    if (success && ids) for (const id of ids) this.claims.delete(id);
    this.submitted.delete(hash);
    if (hash === this.clearHash) this.clearHash = undefined;
  }
}
