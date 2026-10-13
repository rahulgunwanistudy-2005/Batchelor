import type { BotEnv, KeyName, OrderCall } from './chain.js';
import { Mo } from './mo.js';
export const peteKeys: KeyName[] = ['PETE_PK_1', 'PETE_PK_2', 'PETE_PK_3', 'PETE_PK_4'];
export class ControlError extends Error { constructor(message: string, readonly status: 409 | 429 | 503) { super(message); } }

export class Pete {
  private until = -1n;
  private start = 0n;
  private lastHead: bigint | undefined;
  private date = '';
  private used = 0;
  constructor(private env: BotEnv, private mo: Mo, private now = Date.now) {}
  private refreshDay(): void {
    const date = new Date(this.now()).toISOString().slice(0, 10); // UTC day, declared in operations docs.
    if (date !== this.date) { this.date = date; this.used = 0; }
  }
  get remainingToday(): number { this.refreshDay(); return this.env.PETE_DAILY_CAP - this.used; }
  active(head: bigint): boolean { return head <= this.until; }
  unleash(head: bigint) {
    if (this.active(head)) throw new ControlError('Pete is already running.', 409);
    if (this.remainingToday <= 0) throw new ControlError('Daily burst cap reached.', 429);
    this.used++; this.start = head + 1n;
    this.until = head + BigInt(this.env.PETE_BURST_BLOCKS);
    this.mo.wake();
    return { remainingToday: this.remainingToday, startBlock: this.start.toString() };
  }
  orders(head: bigint): { name: KeyName; call: OrderCall }[] {
    if (!this.active(head) || head < this.start || this.lastHead === head) return [];
    this.lastHead = head; this.mo.wake();
    return peteKeys.map((name) => ({ name, call: { action: 'place', side: 0, tick: this.mo.mid + 6, lots: 5n } }));
  }
}
