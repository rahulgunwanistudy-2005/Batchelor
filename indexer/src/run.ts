import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const command = process.argv[2];
if (command !== 'start' && command !== 'dev') throw new Error('Use start or dev');
await access(new URL('../config.generated.yaml', import.meta.url)).catch(() => { throw new Error('Run configure with a verified deployment before starting the indexer'); });
const child = spawn('envio', [command], { stdio: 'inherit', env: { ...process.env, ENVIO_CONFIG: 'config.generated.yaml' } });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
