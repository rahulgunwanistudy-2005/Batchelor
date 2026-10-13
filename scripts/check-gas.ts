/** Reject transaction clients that omit explicit shared limits. Legacy S1 storage
 * diagnostic is independent tooling; it is not an auction client. */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = fileURLToPath(new URL('../', import.meta.url));
const files: string[] = ['scripts/live-clear.ts', 'scripts/test-bots-local.ts'];
async function collect(dir: string): Promise<void> {
  for (const entry of await readdir(`${root}${dir}`, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await collect(path);
    else if ((path.endsWith('.ts') || path.endsWith('.svelte'))) files.push(path);
  }
}
await collect('apps/web/src'); await collect('services/bots/src');
const failures: string[] = [];
for (const file of files) {
  const raw = await readFile(`${root}${file}`, 'utf8');
  const text = file.endsWith('.svelte') ? (raw.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? '') : raw;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const action = node.expression.name.text;
      if (action === 'estimateGas' || action === 'estimateContractGas') failures.push(`${file}: use a measured gas limit`);
      if (['sendTransaction', 'writeContract', 'deployContract'].includes(action)) {
        const args = node.arguments[0];
        const gas = args && ts.isObjectLiteralExpression(args)
          ? args.properties.find((p) => p.name?.getText(source) === 'gas') : undefined;
        if (!gas) failures.push(`${file}: ${action} needs explicit gas`);
        if (gas && ts.isPropertyAssignment(gas) && (ts.isNumericLiteral(gas.initializer) || ts.isBigIntLiteral(gas.initializer))) failures.push(`${file}: literal gas limit`);
        if (!text.includes('transactionGas')) failures.push(`${file}: import shared transactionGas`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
if (failures.length) throw new Error(failures.join('\n'));
console.log(`Gas policy passed for ${files.length} client files.`);
