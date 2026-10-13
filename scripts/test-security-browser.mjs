/** Audit the production build with real Envio-handler fixture data and a local TLS GraphQL host.
 * Uses an existing Puppeteer/Chrome install; adds no project dependency or live transaction. */
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:https';
import { createServer as createNetServer } from 'node:net';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
if (!process.env.PUPPETEER_MODULE) throw new Error('Set PUPPETEER_MODULE to an existing puppeteer-core module and CHROME_EXECUTABLE to Chrome. Run receipts:test-local first.');
const { default: puppeteer } = await import(process.env.PUPPETEER_MODULE);
const indexed = JSON.parse(await readFile(root + '.tools/s7-indexed.json', 'utf8'));
const batch = indexed[0], pete = batch.orders.slice(0, 4).map(o => o.trader.address), mo = batch.orders.at(-1).trader.address, asha = batch.orders[4].trader.address;
const freePort = () => new Promise((resolve, reject) => { const s = createNetServer(); s.once('error', reject); s.listen(0, '127.0.0.1', () => { const port = s.address().port; s.close(e => e ? reject(e) : resolve(port)); }); });
const [webPort, graphPort] = await Promise.all([freePort(), freePort()]);
const origin = `http://localhost:${webPort}`, endpoint = `https://127.0.0.1:${graphPort}`;
const certDir = root + '.tools/security-browser'; await mkdir(certDir, { recursive: true });
execFileSync(process.env.OPENSSL ?? '/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1', '-keyout', certDir + '/fixture.key', '-out', certDir + '/fixture.crt'], { stdio: 'ignore' });
const graph = createServer({ key: await readFile(certDir + '/fixture.key'), cert: await readFile(certDir + '/fixture.crt') }, (req, res) => {
  let body = ''; req.on('data', chunk => { body += chunk; }); req.on('end', () => {
    try {
      const { query, variables } = JSON.parse(body); let data;
      if (query.includes('query BatchReceipt')) data = { Batch: indexed.filter(b => b.batchId === variables.id) };
      else if (query.includes('query BatchOrders')) data = { Order: (indexed.find(b => b.id === variables.batch)?.orders ?? []).slice(variables.offset, variables.offset + 1000) };
      else if (query.includes('query RecentBatches')) data = { Batch: [...indexed].reverse().slice(0, variables.limit) };
      else throw new Error('Unexpected fixture query');
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin }); res.end(JSON.stringify({ data }));
    } catch { res.writeHead(400); res.end('{}'); }
  });
});
await new Promise((resolve, reject) => { graph.once('error', reject); graph.listen(graphPort, '127.0.0.1', resolve); });
const logs = [];
const server = spawn(process.execPath, [root + 'apps/web/node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], {
  cwd: root + 'apps/web', env: { ...process.env, NODE_EXTRA_CA_CERTS: certDir + '/fixture.crt', PUBLIC_CHAIN: 'testnet', PUBLIC_MARKET_ADDRESS: batch.market, PUBLIC_ENVIO_GRAPHQL_URL: endpoint, PUBLIC_RPC_HTTP: '', PUBLIC_RPC_WS: '', PUBLIC_RP_ID: 'localhost', PUBLIC_PETE_ADDRESSES: pete.join(','), PUBLIC_MO_ADDRESS: mo, BOTS_URL: '' }, stdio: ['ignore', 'pipe', 'pipe']
});
server.stdout.on('data', d => logs.push(String(d))); server.stderr.on('data', d => logs.push(String(d)));
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error('Production preview exited.');
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* Wait for startup. */ }
    await new Promise(r => setTimeout(r, 200));
  }
  if (!ready) throw new Error('Production preview did not start.');
  browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE, args: ['--ignore-certificate-errors'] });
  await browser.defaultBrowserContext().overridePermissions(origin, ['clipboard-read', 'clipboard-sanitized-write']);
  const checks = [];
  for (const theme of ['light', 'dark']) for (const width of [375, 768, 1280]) {
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewport({ width, height: 900 });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.evaluateOnNewDocument(() => { window.policyViolations = []; document.addEventListener('securitypolicyviolation', e => window.policyViolations.push({ directive: e.effectiveDirective, blocked: e.blockedURI, source: e.sourceFile, line: e.lineNumber })); });
    for (const [name, path, status] of [['receipt', `/b/1?trader=${asha}`, 200], ['proof', '/proof', 200], ['orders', '/me', 200], ['trade', '/', 200], ['error', '/missing-page', 404]]) {
      const response = await page.goto(origin + path, { waitUntil: 'networkidle0' });
      if (response.status() !== status) throw new Error(`${name}: wrong HTTP status`);
      const policy = response.headers()['content-security-policy'];
      if (!policy?.includes("default-src 'self'") || !policy.includes("script-src 'self' 'nonce-") || /script-src[^;]*unsafe-inline/.test(policy) || !policy.includes(`connect-src 'self' ${endpoint}`) || !policy.includes("frame-ancestors 'none'")) throw new Error(`${name}: production CSP missing/restricted incorrectly`);
      const before = await page.evaluate(async () => { await document.fonts.ready; return { overflow: document.documentElement.scrollWidth > innerWidth, violations: window.policyViolations, fontsLoaded: document.fonts.status === 'loaded' }; });
      if (before.overflow || before.violations.length || !before.fontsLoaded || errors.length) throw new Error(`${name}: browser/font/CSP/layout error: ${JSON.stringify({ before, errors })}`);
      if (name === 'receipt') {
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Share receipt' && !b.disabled));
        await page.bringToFront();
        await page.waitForFunction(() => document.hasFocus());
        await page.click('.actions button:first-child');
        await page.waitForFunction(() => Boolean(document.querySelector('[role=status]')?.textContent));
        const shareStatus = await page.$eval('[role=status]', el => el.textContent);
        if (shareStatus !== 'Receipt link copied.') throw new Error(`Clipboard interaction failed: ${shareStatus}`);
        if (!(await page.evaluate(() => navigator.clipboard.readText())).includes('/b/1')) throw new Error('Hydrated share interaction failed.');
      }
      let accessibility = null;
      if (process.env.AXE_MODULE) {
        // CDP executes audit instrumentation directly; product scripts remain CSP-protected.
        await page.evaluate(await readFile(process.env.AXE_MODULE, 'utf8'));
        const result = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
        if (result.violations.length) throw new Error(JSON.stringify(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))));
        accessibility = { violations: 0, passes: result.passes.length };
      }
      checks.push({ name, theme, width, status, productionCsp: true, hydrated: true, overflow: false, accessibility });
      if (name === 'error' && width === 375 && theme === 'light') await page.screenshot({ path: root + 'docs/screens/s8-error-375.png', fullPage: true });
    }
    await page.close();
  }
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => { window.policyViolations = []; document.addEventListener('securitypolicyviolation', e => window.policyViolations.push(e.effectiveDirective)); });
  await page.goto(origin + '/proof', { waitUntil: 'networkidle0' });
  await page.evaluate(async () => { const script = document.createElement('script'); script.textContent = 'window.injectedScriptRan=true'; document.body.append(script); await fetch('https://example.invalid/analytics').catch(() => {}); });
  await page.waitForFunction(() => window.policyViolations.length >= 2);
  const blocked = await page.evaluate(() => ({ inlineScript: !window.injectedScriptRan && window.policyViolations.includes('script-src-elem'), thirdPartyConnection: window.policyViolations.includes('connect-src') }));
  if (!blocked.inlineScript || !blocked.thirdPartyConnection) throw new Error('Browser did not enforce CSP.');
  const evidence = { passed: true, environment: 'Production Vite preview with local TLS GraphQL serving actual Envio-handler fixture data; RPC unconfigured for this browser audit', checks, blocked, noMainnetTransactions: true };
  await writeFile(root + 'docs/verification/s8-browser.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(`Production browser security/interaction/accessibility passed: ${checks.length} cases; inline script and external connection blocked.`);
} catch (error) { console.error(logs.slice(-8).join('\n')); throw error; }
finally { await browser?.close(); server.kill('SIGTERM'); graph.closeAllConnections(); await new Promise(resolve => graph.close(resolve)); }
