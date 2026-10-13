/** Export exact compiler metadata and hash-checked sources; no network publication. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keccak256 } from 'viem';
const root = fileURLToPath(new URL('../', import.meta.url));
for (const name of ['BatchAuction', 'DemoToken', 'Faucet']) {
  const artifact = JSON.parse(await readFile(resolve(root, 'contracts/out', `${name}.sol`, `${name}.json`), 'utf8')) as {
    rawMetadata: string; metadata: { sources: Record<string, { keccak256: string }> } };
  const sources: Record<string, string> = {};
  for (const [path, source] of Object.entries(artifact.metadata.sources)) {
    const target = resolve(root, 'contracts', path);
    if (!target.startsWith(resolve(root, 'contracts') + '/')) throw new Error('Compiler source path escaped contracts.');
    const contents = await readFile(target, 'utf8');
    if (keccak256(new TextEncoder().encode(contents)) !== source.keccak256) throw new Error(`Source changed since compilation: ${path}`);
    sources[path] = contents;
  }
  const output = resolve(root, 'deployments/verification', name);
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, 'metadata.json'), artifact.rawMetadata + '\n');
  await writeFile(resolve(output, 'sources.json'), JSON.stringify(sources, null, 2) + '\n');
  // Preserve source names from metadata for direct multi-file verification uploads.
  for (const [path, contents] of Object.entries(sources)) {
    const file = resolve(output, path); await mkdir(resolve(file, '..'), { recursive: true }); await writeFile(file, contents);
  }
  console.log(`Exported ${name} compiler metadata and ${Object.keys(sources).length} hash-checked sources. Publication/verification remains a separate step.`);
}
