export const marketKey = (chainId: number, market: string) => `${chainId}:${market.toLowerCase()}`;
export const batchKey = (chainId: number, market: string, id: bigint | string) => `${marketKey(chainId, market)}:batch:${id}`;
export const orderKey = (chainId: number, market: string, id: bigint | string) => `${marketKey(chainId, market)}:order:${id}`;
export const traderKey = (chainId: number, market: string, trader: string) => `${marketKey(chainId, market)}:trader:${trader.toLowerCase()}`;
