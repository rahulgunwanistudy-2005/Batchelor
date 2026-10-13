import { batchAuctionAbi } from '@batchelor/core/abi';
import type { Address, Hex } from 'viem';
import type { ChainClients, OrderCall } from './chain.js';
import { BotState } from './state.js';

export function logRanges(from: bigint, to: bigint): { fromBlock: bigint; toBlock: bigint }[] {
  const ranges = [];
  for (let cursor = from; cursor <= to; cursor += 100n) ranges.push({ fromBlock: cursor, toBlock: cursor + 99n < to ? cursor + 99n : to });
  return ranges;
}
export const KEEPER_CLAIM_SIZE = 50;
// Dispatch before the ten-batch health limit, leaving one batch for inclusion.
export const KEEPER_MAX_CLAIM_AGE = 9n;
export const KEEPER_IDLE_BLOCKS = 2n;
export type SendKeeper = (call: OrderCall) => Promise<Hex>;
export class Keeper {
  private cursor: bigint;
  private placed = new Map<bigint, Set<bigint>>();
  private claims = new Map<bigint, bigint>(); // order -> cleared batch, rebuilt from chain
  private submitted = new Map<Hex, bigint[]>();
  private clearHash: Hex | undefined;
  private lastPlacementBlock: bigint | undefined;
  private retryClaims = new Set<bigint>();
  constructor(private clients: ChainClients, private market: Address, startBlock: bigint, private state: BotState) { this.cursor = startBlock; }

  get nextScanBlock(): bigint { return this.cursor; }

  async scan(head: bigint): Promise<void> {
    // At most five windows per head: bound catch-up load and resume from cursor.
    for (const range of logRanges(this.cursor, head).slice(0, 5)) {
      const logs = await this.clients.publicClient.getContractEvents({ address: this.market, abi: batchAuctionAbi,
        ...range, strict: true });
      for (const log of logs) {
        if (log.eventName === 'OrderPlaced') {
          if (log.blockNumber !== null && log.blockNumber !== undefined) this.lastPlacementBlock = log.blockNumber;
          const ids = this.placed.get(log.args.batchId) ?? new Set<bigint>();
          ids.add(log.args.orderId); this.placed.set(log.args.batchId, ids);
        } else if (log.eventName === 'BatchCleared') {
          this.state.lastClear = log.args.batchId; this.state.clears++;
          for (const id of this.placed.get(log.args.batchId) ?? []) this.claims.set(id, log.args.batchId);
          this.placed.delete(log.args.batchId);
        } else if (log.eventName === 'Claimed' || log.eventName === 'OrderCancelled') {
          this.claims.delete(log.args.orderId); this.retryClaims.delete(log.args.orderId);
          for (const ids of this.placed.values()) ids.delete(log.args.orderId);
        }
      }
      this.cursor = range.toBlock + 1n; // Advance only after complete successful ingestion.
    }
    this.updateClaims();
  }

  private updateClaims(): void {
    this.state.claimsPending = this.claims.size;
    this.state.oldestClaimBatchAge = [...this.claims.values()].reduce((age, batch) => {
      const delta = (this.state.lastClear ?? batch) - batch; return delta > age ? delta : age;
    }, 0n);
  }

  async onHead(head: bigint, send: SendKeeper, tradersActive = false): Promise<void> {
    const meta = await this.clients.publicClient.readContract({ address: this.market, abi: batchAuctionAbi, functionName: 'openBatch' });
    // Runtime verifies the immutable one-block window once at startup.
    const seal = meta.startBlock + 1n;
    if (meta.hasOpen && head >= seal) {
      const lag = head - seal; if (lag > this.state.maxClearLag) this.state.maxClearLag = lag;
      if (lag >= 1n && !this.clearHash) { this.clearHash = await send({ action: 'clear' }); }
    } else this.clearHash = undefined;
    // Complete replay is required before submitting. A failed/catch-up scan may
    // still contain terminal events beyond the cursor that invalidate a claim.
    if (this.cursor <= head || this.submitted.size) return;
    const candidates = [...this.claims].sort((a, b) => a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)
      .slice(0, KEEPER_CLAIM_SIZE);
    if (!candidates.length) return;
    const oldestAge = (this.state.lastClear ?? candidates[0]![1]) - candidates[0]![1];
    const idle = !tradersActive || (this.lastPlacementBlock !== undefined && head - this.lastPlacementBlock >= KEEPER_IDLE_BLOCKS);
    const retry = candidates.some(([id]) => this.retryClaims.has(id));
    // Reuse the measured claim50 limit. Six-order quotes accumulate instead of
    // paying that limit every head; age and idle flushes bound retained claims.
    if (candidates.length < KEEPER_CLAIM_SIZE && oldestAge < KEEPER_MAX_CLAIM_AGE && !idle && !retry) return;
    const ids = candidates.map(([id]) => id);
    this.submitted.set(await send({ action: 'claim', ids }), ids);
  }

  receipt(hash: Hex, success: boolean): void {
    const ids = this.submitted.get(hash);
    if (ids) for (const id of ids) {
      if (success) { this.claims.delete(id); this.retryClaims.delete(id); }
      else if (this.claims.has(id)) this.retryClaims.add(id);
    }
    this.submitted.delete(hash);
    if (hash === this.clearHash) this.clearHash = undefined;
    this.updateClaims();
  }
}
