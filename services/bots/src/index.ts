import { createServer } from 'node:http';
import { createChainClients, readEnv } from './chain.js';
import { createHealthApp } from './health.js';

const env = readEnv();
const clients = createChainClients(env);
const app = createHealthApp(clients.chain.id, Object.keys(clients.wallets).length);
const server = createServer(async (request, response) => {
  try {
    // S1 exposes a read-only health route; reject bodies and mutations.
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }
    const result = await app.fetch(new Request(new URL(request.url ?? '/', 'http://localhost'), { method: request.method }));
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(request.method === 'HEAD' ? undefined : await result.text());
  } catch {
    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Health request failed.' }));
  }
});
server.listen(env.PORT, '127.0.0.1', () => console.log(`Bot health service: http://127.0.0.1:${env.PORT}/health`));
const stop = () => server.close(() => process.exit(0));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
