import { describe, expect, it } from 'vitest';
import { createConductor } from './conductor.js';
import { createChainClients, feeCaps, readEnv } from './chain.js';
import { Mo } from './mo.js';
import { Pete } from './pete.js';
import { BotState } from './state.js';

const token = 'a-secure-test-token-at-least-24-chars';
function setup(now = () => 1_000) {
  const env = readEnv({ PETE_DAILY_CAP: '2', MO_AWAKE_SECONDS: '2' });
  const mo = new Mo(env, now); const pete = new Pete(env, mo, now);
  const app = createConductor({ token, wake: () => mo.wake(), unleash: () => pete.unleash(100n), health: () => ({ status: 'ok', awake: mo.awake }) });
  return { app, mo, pete };
}
describe('authenticated conductor', () => {
  it('allows health and requires bearer auth on both spending controls', async () => {
    const { app, mo } = setup();
    expect((await app.request('/health')).status).toBe(200);
    for (const path of ['/wake', '/unleash']) expect((await app.request(path, { method: 'POST' })).status).toBe(401);
    expect(mo.awake).toBe(false);
    expect((await app.request('/wake', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })).status).toBe(200);
    expect(mo.awake).toBe(true);
  });
  it('returns service unavailable when health is degraded', async () => {
    const app = createConductor({ token, wake: () => {}, unleash: () => ({ remainingToday: 1, startBlock: '1' }), health: () => ({ status: 'degraded' }) });
    expect((await app.request('/health')).status).toBe(503);
  });
  it('does not consume multiple caps for concurrent requests during one burst', async () => {
    const { app } = setup();
    const responses = await Promise.all(Array.from({ length: 4 }, () => app.request('/unleash', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })));
    expect(responses.map((r) => r.status)).toEqual([200, 409, 409, 409]);
    expect(await responses[0]!.json()).toEqual({ remainingToday: 1, startBlock: '101' });
  });
});
it('validates configuration without leaking malformed key values', () => {
  expect(() => readEnv({ CHAIN: 'wrong' })).toThrow('CHAIN');
  expect(() => readEnv({ KEEPER_PK: 'secret-value' })).toThrow('KEEPER_PK');
  try { readEnv({ KEEPER_PK: 'secret-value' }); } catch (error) { expect(String(error)).not.toContain('secret-value'); }
  expect(readEnv({ KEEPER_PK: '' }).KEEPER_PK).toBeUndefined();
  expect(createChainClients(readEnv({})).wallets.size).toBe(0);
  expect(feeCaps(100n, 1000n)).toEqual({ maxFeePerGas: 1200n, maxPriorityFeePerGas: 1000n });
});
it('health is honest about stale heads, missing balances and five-minute error expiry', () => {
  let now = 0; const state = new BotState(() => now);
  expect(state.snapshot(false, false).status).toBe('degraded');
  state.error('keeper', 'Safe diagnostic'); now = 300_001;
  expect(state.snapshot(false, false).errorsLast5Minutes).toEqual([]);
});
