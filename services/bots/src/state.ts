import { formatEther } from 'viem';
import type { KeyName } from './chain.js';

export class BotState {
  lastHead: bigint | null = null;
  lastHeadAt = 0;
  lastClear: bigint | null = null;
  clears = 0;
  sent = 0;
  receipts = 0;
  reverts = 0;
  skippedHeads = 0;
  maxClearLag = 0n;
  claimsPending = 0;
  oldestClaimBatchAge = 0n;
  balances = new Map<KeyName, bigint>();
  private errors: { at: number; component: string; message: string }[] = [];
  constructor(private now = Date.now) {}
  error(component: string, message: string): void {
    // Only caller-owned messages; transport exceptions can contain keys or URLs.
    this.errors.push({ at: this.now(), component, message });
    this.errors = this.errors.slice(-100);
    this.log('error', { component, message });
  }
  log(event: string, fields: Record<string, unknown> = {}): void {
    console.log(JSON.stringify({ at: new Date(this.now()).toISOString(), event, ...fields }, (_, v: unknown) => typeof v === 'bigint' ? v.toString() : v));
  }
  snapshot(awake: boolean, unleashed: boolean) {
    const errors = this.errors.filter((e) => this.now() - e.at < 300_000);
    const funded = this.balances.size === 6 && [...this.balances.values()].every((b) => b > 12n * 10n ** 18n);
    const fresh = this.lastHead !== null && this.now() - this.lastHeadAt < 15_000;
    return { status: fresh && funded && errors.length === 0 ? 'ok' : 'degraded', awake, unleashed,
      lastHead: this.lastHead?.toString() ?? null, lastClear: this.lastClear?.toString() ?? null,
      balances: Object.fromEntries([...this.balances].map(([k, v]) => [k, formatEther(v)])),
      errorsLast5Minutes: errors, stats: { clears: this.clears, sent: this.sent, receipts: this.receipts,
        reverts: this.reverts, skippedHeads: this.skippedHeads, maxClearLagBlocks: this.maxClearLag.toString(),
        claimsPending: this.claimsPending, oldestClaimBatchAge: this.oldestClaimBatchAge.toString() } };
  }
}
