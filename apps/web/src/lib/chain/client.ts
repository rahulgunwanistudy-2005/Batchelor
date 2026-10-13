import { env } from '$env/dynamic/public';
import { createPublicClient, http, webSocket, isAddress, type Address } from 'viem';
import { monad, monadTestnet } from 'viem/chains';
import { resolveRpcUrl } from '@batchelor/core/rpc';
export function chainConfig() {
  if (!['mainnet', 'testnet'].includes(env.PUBLIC_CHAIN ?? '') || !isAddress(env.PUBLIC_MARKET_ADDRESS ?? '')) return null;
  const network = env.PUBLIC_CHAIN as 'mainnet' | 'testnet';
  try {
    // PUBLIC_* is intentionally separate from the private server's Dwellir key.
    const rpc = resolveRpcUrl(network, 'http', env.PUBLIC_RPC_HTTP, env.PUBLIC_DWELLIR_API_KEY);
    const ws = env.PUBLIC_RPC_WS || env.PUBLIC_DWELLIR_API_KEY
      ? resolveRpcUrl(network, 'ws', env.PUBLIC_RPC_WS, env.PUBLIC_DWELLIR_API_KEY) : undefined;
    const chain = network === 'mainnet' ? monad : monadTestnet;
    return { chain, market: env.PUBLIC_MARKET_ADDRESS as Address, rpc, ws };
  } catch { return null; }
}
let shared: ReturnType<typeof createPublicClient> | undefined;
export function publicClient() {
  const c = chainConfig(); if (!c) throw new Error('The market is not connected yet.');
  return shared ??= createPublicClient({ chain: c.chain, transport: http(c.rpc, { retryCount: 1, timeout: 8000 }), pollingInterval: 1000 });
}
export function socketClient() {
  const c = chainConfig(); if (!c?.ws) return null;
  return createPublicClient({ chain: c.chain, transport: webSocket(c.ws, { retryCount: 1, reconnect: { attempts: 3, delay: 1000 }, timeout: 5000 }) });
}
