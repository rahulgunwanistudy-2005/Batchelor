import { env } from '$env/dynamic/public';
import { createPublicClient, http, webSocket, isAddress, type Address } from 'viem';
import { monad, monadTestnet } from 'viem/chains';
export function chainConfig() {
  if (!['mainnet', 'testnet'].includes(env.PUBLIC_CHAIN ?? '') || !isAddress(env.PUBLIC_MARKET_ADDRESS ?? '') || !env.PUBLIC_RPC_HTTP) return null;
  try { if (!['https:', 'http:'].includes(new URL(env.PUBLIC_RPC_HTTP).protocol)) return null; } catch { return null; }
  let ws = env.PUBLIC_RPC_WS;
  try { if (ws && !['wss:', 'ws:'].includes(new URL(ws).protocol)) ws = undefined; } catch { ws = undefined; }
  const chain = env.PUBLIC_CHAIN === 'mainnet' ? monad : monadTestnet;
  return { chain, market: env.PUBLIC_MARKET_ADDRESS as Address, rpc: env.PUBLIC_RPC_HTTP, ws };
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
