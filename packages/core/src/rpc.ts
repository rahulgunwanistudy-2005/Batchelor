export type RpcNetwork = 'mainnet' | 'testnet';
export type RpcProtocol = 'http' | 'ws';

/** Official catalog snapshot: Monad exposes full nodes, not archive nodes. */
export const dwellirHosts: Record<RpcNetwork, string> = {
  mainnet: 'api-monad-mainnet-full.n.dwellir.com',
  testnet: 'api-monad-testnet-full.n.dwellir.com'
};
export const legacyArchiveRpc: Record<RpcNetwork, string> = {
  mainnet: 'https://rpc.monad.xyz', testnet: 'https://testnet-rpc.monad.xyz'
};

export function isDwellirRpc(endpoint: string): boolean {
  try { return new URL(endpoint).hostname.endsWith('.dwellir.com'); } catch { return false; }
}

/** Resolve private or separately restricted public credentials; callers choose
 * their own key source. Never default to viem's previous provider implicitly. */
export function resolveRpcUrl(network: RpcNetwork, protocol: RpcProtocol, supplied: string | undefined, apiKey?: string): string {
  const key = apiKey?.trim();
  if (!supplied?.trim()) {
    if (!key) throw new Error('Configure a Dwellir API key or an explicit RPC endpoint.');
    return `${protocol === 'http' ? 'https' : 'wss'}://${dwellirHosts[network]}/${encodeURIComponent(key)}`;
  }
  let url: URL;
  try { url = new URL(supplied.trim()); } catch { throw new Error('Invalid RPC endpoint configuration.'); }
  if (!url.hostname || !(protocol === 'http' ? ['http:', 'https:'] : ['ws:', 'wss:']).includes(url.protocol) || url.username || url.password) {
    throw new Error('Invalid RPC protocol or embedded user credentials.');
  }
  if (isDwellirRpc(url.href)) {
    if (url.hostname !== dwellirHosts[network]) throw new Error('Dwellir endpoint does not match the selected Monad network.');
    if (url.protocol !== (protocol === 'http' ? 'https:' : 'wss:') || url.search || url.hash) throw new Error('Use the canonical secure Dwellir endpoint.');
    let path: string;
    try { path = decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, ''); }
    catch { throw new Error('Invalid Dwellir credential encoding.'); }
    if (!path || ['<key>', 'DWELLIR_API_KEY', 'YOUR_API_KEY', '${DWELLIR_API_KEY}'].includes(path)) {
      if (!key) throw new Error('Configure the Dwellir API key before connecting.');
      url.pathname = `/${encodeURIComponent(key)}`;
    }
  }
  return url.href;
}

/** Historical proof calls keep their existing provider, or an explicit archive override.
 * Dwellir full endpoints cannot satisfy this project's archive requirement. */
export function resolveArchiveRpc(network: RpcNetwork, source: { ARCHIVE_RPC_HTTP?: string; RPC_HTTP?: string }): string {
  const endpoint = source.ARCHIVE_RPC_HTTP || (source.RPC_HTTP && !isDwellirRpc(source.RPC_HTTP) ? source.RPC_HTTP : legacyArchiveRpc[network]);
  if (isDwellirRpc(endpoint)) throw new Error('Dwellir lists no Monad archive endpoint; configure a separate archive provider.');
  return resolveRpcUrl(network, 'http', endpoint);
}

/** Safe evidence/log label. Authentication is omitted, regardless of provider. */
export function rpcLabel(endpoint: string): string {
  try { return new URL(endpoint).origin; } catch { return 'invalid RPC configuration'; }
}
