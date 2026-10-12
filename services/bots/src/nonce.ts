import type { Address } from 'viem';

interface NonceClient {
  getTransactionCount(args: { address: Address; blockTag: 'pending' }): Promise<number>;
}

/** One instance per key; serialize reservations and never hand out the same nonce twice.
 * If a send is uncertain, reconciliation stops the key until pending state catches up.
 * Callers must retain/rebroadcast the original signed transaction to resolve a gap.
 */
export class NonceManager {
  private nextNonce: number | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private uncertain = false;

  constructor(private readonly client: NonceClient, private readonly address: Address) {}

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work, work);
    this.queue = result.catch(() => undefined);
    return result;
  }

  reserve(): Promise<number> {
    return this.serial(async () => {
      if (this.uncertain) throw new Error('Reconcile the previous transaction before reserving another nonce.');
      this.nextNonce ??= await this.client.getTransactionCount({ address: this.address, blockTag: 'pending' });
      return this.nextNonce++;
    });
  }

  /** Use after any send error. An unobserved reserved nonce cannot safely be reused. */
  reconcile(): Promise<number> {
    return this.serial(async () => {
      this.uncertain = true;
      const pending = await this.client.getTransactionCount({ address: this.address, blockTag: 'pending' });
      if (this.nextNonce !== undefined && pending < this.nextNonce) {
        throw new Error('Pending nonce has not reached the reserved nonce. Resolve the original transaction first.');
      }
      this.nextNonce = pending;
      this.uncertain = false;
      return pending;
    });
  }
}
