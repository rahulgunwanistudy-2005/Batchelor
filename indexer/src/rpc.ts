import { http, type Transport } from 'viem';
/** Serialize read-only audit requests at <=8/s, below the observed public testnet cap (15/s). */
export function pacedHttp(url: string): Transport {
  return options => {
    const base = http(url, { retryCount: 0, timeout: 10_000 })(options);
    let next = 0;
    let tail: Promise<void> = Promise.resolve();
    return { ...base, request: ((...args: Parameters<typeof base.request>) => {
      const result = tail.then(async () => {
        const delay = Math.max(0, next - Date.now());
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        next = Date.now() + 125;
        return base.request(...args);
      });
      tail = result.then(() => undefined, () => undefined);
      return result;
    }) as typeof base.request };
  };
}
