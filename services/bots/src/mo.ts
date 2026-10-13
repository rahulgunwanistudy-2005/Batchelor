import type { BotEnv, OrderCall } from './chain.js';

export class Mo {
  mid = 100;
  private awakeUntil = 0;
  private seed: number;
  private quotedHead: bigint | undefined;
  constructor(private env: BotEnv, private now = Date.now) { this.seed = env.MO_SEED; }
  wake(): void { this.awakeUntil = this.now() + this.env.MO_AWAKE_SECONDS * 1000; }
  get awake(): boolean { return this.now() < this.awakeUntil; }
  private random(): number {
    this.seed ^= this.seed << 13; this.seed ^= this.seed >>> 17; this.seed ^= this.seed << 5;
    return this.seed >>> 0;
  }
  quote(head: bigint, peteActive: boolean): OrderCall | null {
    if (!this.awake || this.quotedHead === head) return null;
    this.quotedHead = head;
    this.mid = Math.max(60, Math.min(200, this.mid + (this.random() % 2 ? 1 : -1)));
    return { action: 'placeMany', sides: [0, 0, 0, 1, 1, 1],
      ticks: [-1, -2, -3, 1, 2, 3].map((d) => this.mid + d),
      lots: Array.from({ length: 6 }, (_, i) => BigInt(peteActive && i >= 3 ? 15 + this.random() % 6 : 5 + this.random() % 16)) };
  }
}
