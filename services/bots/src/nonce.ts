import type { Address, Hex } from 'viem';
import { keccak256 } from 'viem';

interface NonceClient {
  getTransactionCount(args: { address: Address; blockTag: 'pending' }): Promise<number>;
}

/** One queue per key. An ambiguous send is retried as the identical signed bytes,
 * never as a new transaction using the same nonce. */
export class NonceManager {
  private nextNonce: number | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private uncertain = false;
  private pendingRaw: Hex | undefined;

  constructor(private readonly client: NonceClient, private readonly address: Address) {}

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work, work);
    this.queue = result.catch(() => undefined);
    return result;
  }

  get hasUncertainSend(): boolean { return this.pendingRaw !== undefined; }

  reserve(): Promise<number> {
    return this.serial(async () => {
      if (this.uncertain) throw new Error('Reconcile the previous transaction before reserving another nonce.');
      this.nextNonce ??= await this.client.getTransactionCount({ address: this.address, blockTag: 'pending' });
      return this.nextNonce++;
    });
  }

  reconcile(): Promise<number> {
    return this.serial(async () => {
      this.uncertain = true;
      const pending = await this.client.getTransactionCount({ address: this.address, blockTag: 'pending' });
      if (this.nextNonce !== undefined && pending < this.nextNonce) {
        throw new Error('Pending nonce has not reached the reserved nonce. Resolve the original transaction first.');
      }
      this.nextNonce = pending;
      this.uncertain = false;
      this.pendingRaw = undefined;
      return pending;
    });
  }

  submit(sign: (nonce: number) => Promise<Hex>, broadcast: (raw: Hex) => Promise<Hex>, known: (hash: Hex) => Promise<boolean> = async () => false): Promise<Hex> {
    return this.serial(async () => {
      if (this.pendingRaw) {
        try { await this.broadcast(this.pendingRaw, broadcast); }
        catch (error) {
          if (!(await known(keccak256(this.pendingRaw)))) throw error;
        }
        this.pendingRaw = undefined;
        this.uncertain = false;
        // Never associate the previous transaction with the caller's new intent.
        throw new Error('Previous send recovered; retry the current intent next head.');
      }
      if (this.uncertain) throw new Error('Nonce requires reconciliation.');
      this.nextNonce ??= await this.client.getTransactionCount({ address: this.address, blockTag: 'pending' });
      for (let attempt = 0; attempt < 2; attempt++) {
        const nonce = this.nextNonce;
        const raw = await sign(nonce); // Signing failure does not consume a nonce.
        try {
          const hash = await this.broadcast(raw, broadcast);
          this.nextNonce = nonce + 1;
          return hash;
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          if (/nonce too (low|high)|nonce (is )?(too low|too high)/i.test(message)) {
            const pending = await this.client.getTransactionCount({ address: this.address, blockTag: 'pending' });
            this.nextNonce = pending;
            if (pending > nonce && await known(keccak256(raw))) return keccak256(raw);
            if (pending !== nonce && attempt === 0) continue; // Definite rejected nonce, reconciled from pending.
          }
          this.pendingRaw = raw;
          this.nextNonce = nonce + 1;
          this.uncertain = true;
          throw new Error('Send uncertain; retained signed transaction for identical rebroadcast.');
        }
      }
      throw new Error('Nonce reconciliation failed.');
    });
  }

  private async broadcast(raw: Hex, send: (raw: Hex) => Promise<Hex>): Promise<Hex> {
    try { return await send(raw); }
    catch (error) {
      if (/already known|known transaction/i.test(error instanceof Error ? error.message : '')) return keccak256(raw);
      throw error;
    }
  }
}
