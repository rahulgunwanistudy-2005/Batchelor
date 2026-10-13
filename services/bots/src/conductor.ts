import { timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { ControlError } from './pete.js';

export interface Controls {
  token: string;
  wake(): void;
  unleash(): { remainingToday: number; startBlock: string };
  health(): { status: string } & Record<string, unknown>;
}
export function createConductor(controls: Controls) {
  const app = new Hono();
  // Hosting liveness is separate from funded, synced trading readiness.
  app.get('/livez', (c) => c.json({ status: 'alive' }));
  app.get('/health', (c) => {
    const health = controls.health();
    return c.json(health, health.status === 'ok' ? 200 : 503);
  });
  app.use('*', async (c, next) => {
    const supplied = Buffer.from(c.req.header('Authorization') ?? '');
    const expected = Buffer.from(`Bearer ${controls.token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return c.json({ error: 'Unauthorized.' }, 401);
    return next();
  });
  app.post('/wake', (c) => { controls.wake(); return c.json({ awake: true }); });
  app.post('/unleash', (c) => {
    try { return c.json(controls.unleash()); }
    catch (error) {
      return c.json({ error: error instanceof ControlError ? error.message : 'Control unavailable.' }, error instanceof ControlError ? error.status : 503);
    }
  });
  app.onError((_, c) => c.json({ error: 'Request failed.' }, 500));
  return app;
}
