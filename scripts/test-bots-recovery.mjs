/** Real local WS outage with HTTP retained; ephemeral chain and proxy only. */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
if (!process.env.WS_MODULE) throw new Error('Set WS_MODULE to an existing ws module; build bots first.');
const { WebSocket, WebSocketServer } = await import(process.env.WS_MODULE);
const freePort = () => new Promise((resolve, reject) => { const s = createNetServer(); s.once('error', reject); s.listen(0, '127.0.0.1', () => { const port = s.address().port; s.close(e => e ? reject(e) : resolve(port)); }); });
const [rpcPort, proxyPort] = await Promise.all([freePort(), freePort()]);
const rpc = `http://127.0.0.1:${rpcPort}`;
const chain = spawn(root + '.tools/foundry/bin/anvil', ['--chain-id', '10143', '--network', 'monad', '--hardfork', 'MonadTen', '--port', String(rpcPort), '--block-time', '1', '--order', 'fees', '--silent'], { stdio: ['ignore', 'pipe', 'pipe'] });
let downUntil = 0;
const proxy = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/drop') { downUntil = Date.now() + 6000; for (const socket of wsServer.clients) socket.close(); res.writeHead(200); res.end('{}'); }
  else { res.writeHead(404); res.end(); }
});
const wsServer = new WebSocketServer({ server: proxy });
wsServer.on('connection', incoming => {
  if (Date.now() < downUntil) { incoming.close(); return; }
  const upstream = new WebSocket(rpc.replace('http:', 'ws:')); const pending = [];
  incoming.on('message', (data, binary) => { if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary }); else pending.push([data, binary]); });
  upstream.on('open', () => { for (const [data, binary] of pending) upstream.send(data, { binary }); });
  upstream.on('message', (data, binary) => { if (incoming.readyState === WebSocket.OPEN) incoming.send(data, { binary }); });
  upstream.on('close', () => incoming.close()); incoming.on('close', () => upstream.close());
  upstream.on('error', () => incoming.close()); incoming.on('error', () => upstream.close());
});
await new Promise((resolve, reject) => { proxy.once('error', reject); proxy.listen(proxyPort, '127.0.0.1', resolve); });
try {
  let ready = false;
  for (let i = 0; i < 50; i++) { if (chain.exitCode !== null) throw new Error('Anvil startup failed'); try { const r = await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' }); if ((await r.json()).result === '0x279f') { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 100)); }
  if (!ready) throw new Error('Local chain not ready');
  const test = spawn(process.execPath, ['--experimental-strip-types', root + 'scripts/test-bots-local.ts'], { cwd: root, env: { ...process.env, LOCAL_MONAD_RPC: rpc, LOCAL_MONAD_WS: `ws://127.0.0.1:${proxyPort}`, S8_SOCKET_RECOVERY: '1', LOCAL_SOAK_SECONDS: '10', LOCAL_EVIDENCE_OUTPUT: root + 'docs/verification/s8-bots.json' }, stdio: 'inherit' });
  await new Promise((resolve, reject) => { test.once('error', reject); test.once('exit', code => code === 0 ? resolve() : reject(new Error('Bot recovery integration failed'))); });
} finally { for (const socket of wsServer.clients) socket.terminate(); wsServer.close(); proxy.closeAllConnections(); await new Promise(r => proxy.close(r)); chain.kill('SIGTERM'); }
