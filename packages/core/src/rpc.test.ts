import { describe, expect, it } from 'vitest';
import { dwellirHosts, resolveArchiveRpc, resolveRpcUrl, rpcLabel } from './rpc.ts';

describe('Dwellir endpoint configuration', () => {
  it('selects the correct full-node hosts for both networks and protocols', () => {
    for (const network of ['mainnet', 'testnet'] as const) {
      expect(resolveRpcUrl(network, 'http', undefined, 'test-key')).toBe(`https://${dwellirHosts[network]}/test-key`);
      expect(resolveRpcUrl(network, 'ws', undefined, 'test-key')).toBe(`wss://${dwellirHosts[network]}/test-key`);
    }
  });
  it('fills documented templates without silently using the old provider', () => {
    expect(resolveRpcUrl('testnet', 'http', 'https://api-monad-testnet-full.n.dwellir.com/<key>', 'a/b')).toBe('https://api-monad-testnet-full.n.dwellir.com/a%2Fb');
    expect(() => resolveRpcUrl('testnet', 'http', undefined)).toThrow('Configure');
    expect(() => resolveRpcUrl('testnet', 'ws', 'wss://api-monad-testnet-full.n.dwellir.com/<key>')).toThrow('key');
  });
  it('rejects network/protocol mistakes without exposing credential-bearing input', () => {
    expect(() => resolveRpcUrl('mainnet', 'http', 'https://api-monad-testnet-full.n.dwellir.com/secret')).toThrow('network');
    expect(() => resolveRpcUrl('testnet', 'http', 'wss://api-monad-testnet-full.n.dwellir.com/secret')).toThrow('protocol');
    for (const url of ['invalid-secret', 'https://user:secret@rpc.example', 'http://api-monad-testnet-full.n.dwellir.com/secret']) {
      try { resolveRpcUrl('testnet', 'http', url); throw new Error('expected rejection'); }
      catch (error) { expect(String(error)).not.toContain('secret'); }
    }
  });
  it('preserves explicit local and alternative-provider transports', () => {
    expect(resolveRpcUrl('testnet', 'http', 'http://127.0.0.1:18545', 'private-key')).toBe('http://127.0.0.1:18545/');
    expect(resolveRpcUrl('testnet', 'ws', 'ws://localhost:18545')).toBe('ws://localhost:18545/');
  });
  it('preserves archive workflows and rejects Dwellir full-node archive substitutions', () => {
    expect(resolveArchiveRpc('testnet', { RPC_HTTP: 'https://api-monad-testnet-full.n.dwellir.com/secret' })).toBe('https://testnet-rpc.monad.xyz/');
    expect(resolveArchiveRpc('testnet', { ARCHIVE_RPC_HTTP: 'https://archive.example/key', RPC_HTTP: 'https://api-monad-testnet-full.n.dwellir.com/secret' })).toBe('https://archive.example/key');
    expect(() => resolveArchiveRpc('testnet', { ARCHIVE_RPC_HTTP: 'https://api-monad-testnet-full.n.dwellir.com/secret' })).toThrow('no Monad archive');
    expect(resolveArchiveRpc('testnet', { RPC_HTTP: 'http://127.0.0.1:18545' })).toBe('http://127.0.0.1:18545/');
  });
  it('redacts path, query and userinfo from evidence labels', () => {
    expect(rpcLabel('https://user:secret@node.example/path-key?key=query-key')).toBe('https://node.example');
  });
});
