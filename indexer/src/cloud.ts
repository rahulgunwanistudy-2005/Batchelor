/** Build a standalone, reproducible Cloud directory; Cloud does not upload parent folders. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const check = process.argv.includes('--check');
const deployment = process.argv.includes('--deployment');
const root = new URL('../cloud/', import.meta.url);
const sources = {
  'src/EventHandlers.ts': (await readFile(new URL('./EventHandlers.ts', import.meta.url), 'utf8')).replace("from '@batchelor/core/settle'", "from './settle'"),
  'src/ids.ts': await readFile(new URL('./ids.ts', import.meta.url), 'utf8'),
  'src/settle.ts': await readFile(new URL('../../packages/core/src/settle.ts', import.meta.url), 'utf8'),
  'schema.graphql': await readFile(new URL('../schema.graphql', import.meta.url), 'utf8'),
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, skipLibCheck: true, noEmit: true, types: [] }, include: ['src/**/*.ts', 'envio-env.d.ts'] }, null, 2) + '\n',
  'package.json': JSON.stringify({ name: 'batchelor-indexer-cloud', version: '0.0.0', private: true, type: 'module', engines: { node: '>=24 <25' }, scripts: { codegen: 'envio codegen', start: 'envio start', typecheck: 'envio codegen && tsc --noEmit' }, dependencies: { envio: '3.14.0', typescript: '5.9.3' } }, null, 2) + '\n',
};
for (const [path, source] of Object.entries(sources)) {
  const target = new URL(path, root);
  if (check) {
    if (await readFile(target, 'utf8') !== source) throw new Error(`Cloud source is stale: ${path}`);
  } else {
    await mkdir(new URL('./', target), { recursive: true });
    await writeFile(target, source);
  }
}
if (!check) {
  await writeFile(new URL('config.yaml', root), await readFile(new URL(deployment ? '../config.generated.yaml' : '../config.yaml', import.meta.url), 'utf8'));
}
const hashes = Object.fromEntries(Object.entries(sources).map(([path, source]) => [path, createHash('sha256').update(source).digest('hex')]));
const manifest = JSON.stringify(hashes, null, 2) + '\n';
if (check) {
  if (await readFile(new URL('manifest.json', root), 'utf8') !== manifest) throw new Error('Cloud source manifest is stale');
} else await writeFile(new URL('manifest.json', root), manifest);
console.log(check ? 'Cloud sources match canonical handlers and shared core settlement.' : `Prepared indexer/cloud (${deployment ? 'validated deployment' : 'inactive template'}).`);
