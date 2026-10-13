import { expect, it, vi } from 'vitest';
import { HeadWatchdog } from './watchdog.js';

it('recovers a silent socket, throttles restarts and ignores duplicate heads', async () => {
  let now = 0;
  const deps = { now: () => now, poll: vi.fn(async () => 7n), restart: vi.fn(async () => {}), deliver: vi.fn(async () => {}), error: vi.fn() };
  const watchdog = new HeadWatchdog(deps);
  watchdog.observed(1n); now = 3999; await watchdog.tick(); expect(deps.poll).not.toHaveBeenCalled();
  now = 4000; await watchdog.tick(); expect(deps.deliver).toHaveBeenCalledWith(7n); expect(deps.restart).toHaveBeenCalledOnce();
  now = 5000; watchdog.observed(1n); await watchdog.tick(); expect(deps.poll).toHaveBeenCalledTimes(2); expect(deps.restart).toHaveBeenCalledOnce();
  now = 14000; await watchdog.tick(); expect(deps.restart).toHaveBeenCalledTimes(2);
  watchdog.observed(2n); now = 15000; await watchdog.tick(); expect(deps.poll).toHaveBeenCalledTimes(3);
  await watchdog.stop(); now = 30000; await watchdog.tick(); expect(deps.poll).toHaveBeenCalledTimes(3);
});
it('serializes fallback calls, drains on shutdown and never delivers after stop', async () => {
  let resolve!: (block: bigint) => void;
  const deps = { now: () => 5000, poll: vi.fn(() => new Promise<bigint>(r => { resolve = r; })), restart: vi.fn(async () => {}), deliver: vi.fn(async () => {}), error: vi.fn() };
  let now = 0; const watchdog = new HeadWatchdog({ ...deps, now: () => now }); now = 5000;
  const one = watchdog.tick(), two = watchdog.tick(); expect(one).toBe(two);
  const stopped = watchdog.stop(); resolve(7n); await stopped;
  expect(deps.poll).toHaveBeenCalledOnce(); expect(deps.deliver).not.toHaveBeenCalled(); expect(deps.restart).not.toHaveBeenCalled();
});
it('continues retrying after failed polling and reconnection without exposing transport errors', async () => {
  let now = 0;
  const deps = { now: () => now, poll: vi.fn(async () => { throw new Error('secret endpoint'); }), restart: vi.fn(async () => { throw new Error('private key'); }), deliver: vi.fn(async () => {}), error: vi.fn() };
  const watchdog = new HeadWatchdog(deps); now = 5000;
  await watchdog.tick(); now = 15000; await watchdog.tick();
  expect(deps.poll).toHaveBeenCalledTimes(2); expect(deps.restart).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(deps.error.mock.calls)).not.toMatch(/secret endpoint|private key/);
});
