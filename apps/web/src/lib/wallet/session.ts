import { writable } from 'svelte/store';
import type { Secp256k1SigningSession } from '@category-labs/mera';
import type { LocalAccount } from 'viem';
export const walletAccount = writable<LocalAccount | null>(null);
export class IdleSession {
  private session: Secp256k1SigningSession | null = null;
  private account: LocalAccount | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastUsed = 0;
  constructor(private changed: (account: LocalAccount | null) => void, private idleMs = 10 * 60_000, private now = Date.now) {}
  start(session: Secp256k1SigningSession, account: LocalAccount) { this.end(); this.session = session; this.account = account; this.touch(); this.changed(account); }
  touch() { this.lastUsed = this.now(); if (this.timer) clearTimeout(this.timer); if (this.session) this.timer = setTimeout(() => this.end(), this.idleMs); }
  get() {
    if (!this.account || this.now() - this.lastUsed >= this.idleMs) { this.end(); throw new Error('Your signing session expired. Sign in with your passkey again.'); }
    this.touch(); return this.account;
  }
  end() { if (this.timer) clearTimeout(this.timer); this.timer = undefined; this.session?.end(); this.session = null; this.account = null; this.changed(null); }
}
export const signingSession = new IdleSession(account => walletAccount.set(account));
