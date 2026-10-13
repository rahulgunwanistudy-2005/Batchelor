import { expect, it } from 'vitest';
import { connectSources, secureHeaders } from './security';
import { requireRelayReserve } from './reserve';
import { parseEther } from 'viem';
import { respond } from './http';

it('allows only public RPC/indexer origins without broad hosts or query credentials', () => {
  expect(connectSources({ PUBLIC_RPC_HTTP: 'https://rpc.example/path?token=abc', PUBLIC_RPC_WS: 'wss://rpc.example/socket', PUBLIC_ENVIO_GRAPHQL_URL: 'https://index.example/graphql', BOTS_URL: 'https://bots.example' }))
    .toEqual(["'self'", 'https://rpc.example', 'wss://rpc.example', 'https://index.example']);
  for (const value of ['http://rpc.example', 'https://user:secret@rpc.example', 'https://*.example.com', 'https://rpc.example;', "https://rpc.example; script-src *", 'data:text/plain,abc']) expect(() => connectSources({ PUBLIC_RPC_HTTP: value })).toThrow();
  expect(connectSources({ PUBLIC_RPC_HTTP: 'http://127.0.0.1:1234' }, true)).toContain('http://127.0.0.1:1234');
  expect(() => connectSources({ PUBLIC_RPC_HTTP: 'http://127.0.0.1:1234' })).toThrow();
});
it('retains script nonces and frame restrictions while setting a runtime allowlist', () => {
  const headers = new Headers({ 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'nonce-123'; connect-src 'self'; frame-ancestors 'none'" });
  secureHeaders(headers, connectSources({ PUBLIC_RPC_HTTP: 'https://rpc.example' }));
  expect(headers.get('Content-Security-Policy')).toContain("script-src 'self' 'nonce-123'");
  expect(headers.get('Content-Security-Policy')).toContain("connect-src 'self' https://rpc.example");
  expect(headers.get('Content-Security-Policy')).not.toContain('unsafe-inline');
  expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
});
it('allows generated Dwellir transports using only a separately public key', () => {
  expect(connectSources({ PUBLIC_CHAIN: 'testnet', PUBLIC_DWELLIR_API_KEY: 'browser-key', DWELLIR_API_KEY: 'server-secret' }))
    .toEqual(["'self'", 'https://api-monad-testnet-full.n.dwellir.com', 'wss://api-monad-testnet-full.n.dwellir.com']);
  expect(connectSources({ PUBLIC_CHAIN: 'testnet', DWELLIR_API_KEY: 'server-secret' })).toEqual(["'self'"]);
  expect(() => connectSources({ PUBLIC_CHAIN: 'mainnet', PUBLIC_RPC_HTTP: 'https://api-monad-testnet-full.n.dwellir.com/browser-key' })).toThrow('network');
});
it('pauses underfunded gasless sends with typed, actionable UI copy', async () => {
  for (const balance of [parseEther('11.99'), parseEther('12') + 999n]) {
    const response = await respond(async () => { requireRelayReserve(balance, 100n, 10n); return {}; });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: 'RELAYER_LOW_BALANCE', message: 'Gasless orders are paused. Please try again after network fees are replenished.' } });
  }
  expect(() => requireRelayReserve(parseEther('12') + 1000n, 100n, 10n)).not.toThrow();
});
