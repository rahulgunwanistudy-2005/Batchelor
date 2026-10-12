import { Hono } from 'hono';

/** S1 only: no keeper, market-maker, or priority-fee bot is running. */
export function createHealthApp(chainId: number, configuredWallets: number) {
  const app = new Hono();
  app.get('/health', (c) => c.json({
    status: 'scaffold', chainId, configuredWallets,
    keeper: 'not-started', mo: 'not-started', pete: 'not-started',
    rpc: 'not-checked'
  }));
  return app;
}
