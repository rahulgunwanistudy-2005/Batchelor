import { writeFile } from 'node:fs/promises';
import { readEnv } from './chain.js';

async function main() {
  const env = readEnv(); if (env.CHAIN !== 'testnet') throw new Error('Soak tooling is testnet only.');
  if (!env.BOTS_TOKEN) throw new Error('Configure BOTS_TOKEN.');
  const url = new URL(process.env.BOTS_URL ?? 'http://127.0.0.1:3001');
  const samples: unknown[] = []; const until = Date.now() + 300_000;
  while (Date.now() < until) {
    const wake = await fetch(new URL('/wake', url), { method: 'POST', headers: { Authorization: `Bearer ${env.BOTS_TOKEN}` }, signal: AbortSignal.timeout(10_000) });
    if (!wake.ok) throw new Error('Wake failed.');
    const response = await fetch(new URL('/health', url), { signal: AbortSignal.timeout(10_000) });
    const sample = await response.json() as { chainId: number; status: string; stats: { maxClearLagBlocks: string; oldestClaimBatchAge: string; reverts: number; skippedHeads: number }; errorsLast5Minutes: unknown[] };
    if (sample.chainId !== 10143) throw new Error('Wrong conductor chain.');
    samples.push(sample);
    const passed = response.ok && BigInt(sample.stats.maxClearLagBlocks) <= 2n && BigInt(sample.stats.oldestClaimBatchAge) <= 10n
      && sample.stats.reverts === 0 && sample.errorsLast5Minutes.length === 0;
    console.log(JSON.stringify({ event: 'soak_sample', passed, stats: sample.stats }));
    if (!passed) { await writeFile(process.env.SOAK_OUTPUT ?? 'soak-testnet.json', JSON.stringify({ passed: false, samples }, null, 2) + '\n'); throw new Error('Soak acceptance failed.'); }
    await new Promise((r) => setTimeout(r, 5_000));
  }
  await writeFile(process.env.SOAK_OUTPUT ?? 'soak-testnet.json', JSON.stringify({ passed: true, durationSeconds: 300, samples }, null, 2) + '\n');
}
void main().catch(() => { console.error('Soak did not pass. Inspect its health samples.'); process.exitCode = 1; });
