import { env } from '$env/dynamic/public';
import { createIndexerClient } from './graphql';
export function publicIndexer(fetcher: typeof fetch = fetch) {
  if (!env.PUBLIC_ENVIO_GRAPHQL_URL || !env.PUBLIC_MARKET_ADDRESS) return null;
  const chainId = env.PUBLIC_CHAIN === 'mainnet' ? 143 : env.PUBLIC_CHAIN === 'testnet' ? 10143 : null;
  if (!chainId) return null;
  return createIndexerClient({ endpoint: env.PUBLIC_ENVIO_GRAPHQL_URL, chainId, market: env.PUBLIC_MARKET_ADDRESS, fetch: fetcher });
}
