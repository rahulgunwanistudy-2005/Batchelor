import { expect, it } from 'vitest';
import { createHealthApp } from './health.js';
import { createChainClients, readEnv } from './chain.js';

it('reports the scaffold honestly without RPC calls or secrets', async () => {
  const clients = createChainClients(readEnv({ CHAIN: 'testnet' }));
  expect(clients.chain.id).toBe(10143);
  expect(clients.wallets).toEqual({});
  const result = await createHealthApp(clients.chain.id, 0).request('/health');
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ status: 'scaffold', rpc: 'not-checked', pete: 'not-started' });
});

it('rejects unknown networks instead of silently using mainnet', () => {
  expect(() => readEnv({ CHAIN: 'wrong' })).toThrow();
  expect(readEnv({ KEEPER_PK: '' }).KEEPER_PK).toBeUndefined();
});
