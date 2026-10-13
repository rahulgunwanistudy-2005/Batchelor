/** Restarts stalled subscriptions and supplies bounded HTTP heads while recovering.
 * One timer invocation can be in flight; stop waits for it before closing clients. */
export class HeadWatchdog<T> {
  private lastProgress: number;
  private lastRestart = -Infinity;
  private highest: bigint | null = null;
  private ended = false;
  private work: Promise<void> | undefined;
  constructor(private deps: {
    poll(): Promise<T>; restart(): Promise<void>; deliver(block: T): Promise<void>;
    error(component: string, message: string): void; now?: () => number;
  }) { this.lastProgress = this.now(); }
  private now() { return (this.deps.now ?? Date.now)(); }
  observed(number: bigint): void {
    if (this.highest === null || number > this.highest) {
      this.highest = number; this.lastProgress = this.now();
    }
  }
  tick(): Promise<void> {
    if (this.ended || this.now() - this.lastProgress < 4000) return Promise.resolve();
    return this.work ??= this.recover().finally(() => { this.work = undefined; });
  }
  private async recover(): Promise<void> {
    // Poll before rebuilding the socket so transport connection timeouts cannot
    // delay the HTTP fallback. HTTP progress does not mask a stale subscription.
    try { const block = await this.deps.poll(); if (!this.ended) await this.deps.deliver(block); }
    catch { this.deps.error('http', 'Fallback head unavailable; retrying.'); }
    if (!this.ended && this.now() - this.lastRestart >= 10_000) {
      this.lastRestart = this.now();
      this.deps.error('websocket', 'Head subscription stalled; restarting with HTTP catch-up.');
      try { await this.deps.restart(); }
      catch { this.deps.error('websocket', 'Subscription restart failed; HTTP catch-up remains active.'); }
    }
  }
  async stop(): Promise<void> { this.ended = true; await this.work; }
}
