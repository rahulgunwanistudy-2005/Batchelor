import { createServer } from 'node:http';
import { readEnv } from './chain.js';
import { startRuntime } from './runtime.js';

async function main() {
  const env = readEnv(); const runtime = await startRuntime(env);
  const server = createServer(async (request, response) => {
    try {
      // These routes accept no request body; stream bodies never enter the process.
      if (Number(request.headers['content-length'] ?? '0') > 0 || request.headers['transfer-encoding']) {
        response.writeHead(413); response.end(); request.resume(); return;
      }
      const headers = new Headers();
      if (request.headers.authorization) headers.set('Authorization', request.headers.authorization);
      const result = await runtime.app.fetch(new Request(new URL(request.url ?? '/', 'http://localhost'),
        { method: request.method ?? 'GET', headers }));
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(request.method === 'HEAD' ? undefined : await result.text());
    } catch { response.writeHead(500); response.end('{"error":"Request failed."}'); }
  });
  server.requestTimeout = 10_000; server.headersTimeout = 10_000;
  server.listen(env.PORT, '0.0.0.0', () => runtime.state.log('listening', { port: env.PORT }));
  let stopping = false;
  const stop = () => { if (stopping) return; stopping = true;
    server.close(); void runtime.stop().finally(() => process.exit(0));
    setTimeout(() => process.exit(1), 15_000).unref();
  };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
void main().catch(() => { console.error('{"event":"startup_failed","message":"Check configuration, chain and funding; no exception details logged."}'); process.exit(1); });
