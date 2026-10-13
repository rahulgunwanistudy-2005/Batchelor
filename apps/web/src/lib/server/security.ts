import { resolveRpcUrl } from '@batchelor/core/rpc';

/** Public browser endpoints only. Paths/query strings (which may carry credentials)
 * never enter a CSP header. Reject insecure production endpoints and userinfo. */
export function connectSources(config: Record<string, string | undefined>, dev = false): string[] {
  const sources = new Set(["'self'"]);
  for (const [name, protocols] of [
    ['PUBLIC_RPC_HTTP', ['https:', 'http:']],
    ['PUBLIC_RPC_WS', ['wss:', 'ws:']],
    ['PUBLIC_ENVIO_GRAPHQL_URL', ['https:', 'http:']]
  ] as const) {
    let value = config[name];
    if (name !== 'PUBLIC_ENVIO_GRAPHQL_URL' && ['mainnet', 'testnet'].includes(config.PUBLIC_CHAIN ?? '')) {
      const network = config.PUBLIC_CHAIN as 'mainnet' | 'testnet';
      if (value || config.PUBLIC_DWELLIR_API_KEY) value = resolveRpcUrl(network, name === 'PUBLIC_RPC_HTTP' ? 'http' : 'ws', value, config.PUBLIC_DWELLIR_API_KEY);
    }
    if (!value) continue;
    const url = new URL(value);
    const local = dev && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!(protocols as readonly string[]).includes(url.protocol) || url.username || url.password || /[;*]/.test(url.hostname) ||
      (!local && ['http:', 'ws:'].includes(url.protocol))) throw new Error('Invalid public endpoint configuration.');
    sources.add(url.origin);
  }
  return [...sources];
}

export function secureHeaders(headers: Headers, sources: string[], dev = false): void {
  const policy = headers.get('content-security-policy');
  if (policy) {
    // Retain SvelteKit's script hashes/nonces; change only the connection allowlist.
    const directives = policy.split(';').map(v => v.trim()).filter(v => v && !v.startsWith('connect-src '));
    directives.push(`connect-src ${sources.join(' ')}${dev ? ' ws://localhost:* ws://127.0.0.1:*' : ''}`);
    headers.set('content-security-policy', directives.join('; '));
  }
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
}
