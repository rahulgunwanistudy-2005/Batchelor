/** Read-only release audit. No wallet signing, deployment, transfers or activation. */
import { mkdir, writeFile } from 'node:fs/promises';
import { createPublicClient, http, webSocket, isAddress, formatEther, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';
import { monad, monadTestnet } from 'viem/chains';
import { batchAuctionAbi, faucetAbi } from '../packages/core/src/abi.ts';
import { resolveRpcUrl, resolveArchiveRpc, rpcLabel } from '../packages/core/src/rpc.ts';

type Check = { name: string; status: 'pass' | 'pending' | 'fail'; detail: string };
const checks: Check[] = [];
const record = (name: string, status: Check['status'], detail: string) => checks.push({ name, status, detail });
const source = process.env;
const network = source.CHAIN;
if (network !== 'mainnet' && network !== 'testnet') throw new Error('Set CHAIN to mainnet or testnet.');
const chain = network === 'mainnet' ? monad : monadTestnet;
const privateNames = ['DEPLOYER_PK', 'RELAYER_PK', 'KEEPER_PK', 'MO_PK', 'PETE_PK_1', 'PETE_PK_2', 'PETE_PK_3', 'PETE_PK_4'] as const;
const wallets: { name: string; address: Hex; balanceMON?: string }[] = [];
for (const name of privateNames) {
  const key = source[name];
  if (!key) { record(name, 'pending', 'Signer is not configured.'); continue; }
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) { record(name, 'fail', 'Signer configuration is invalid.'); continue; }
  try { wallets.push({ name, address: privateKeyToAccount(key as Hex).address }); }
  catch { record(name, 'fail', 'Signer configuration is invalid.'); }
}
record('dedicated_signers', new Set(wallets.map(w => w.address.toLowerCase())).size === wallets.length ? 'pass' : 'fail', 'Relayer, bots and deployer must use distinct accounts.');
const publicValues = Object.entries(source).filter(([key]) => key.startsWith('PUBLIC_')).map(([, value]) => value ?? '');
const secrets = privateNames.map(name => source[name]).filter((value): value is string => Boolean(value));
if (source.BOTS_TOKEN) secrets.push(source.BOTS_TOKEN);
if (source.DWELLIR_API_KEY) secrets.push(source.DWELLIR_API_KEY);
const leaked = secrets.some(secret => publicValues.some(value => value.includes(secret) || value.includes(encodeURIComponent(secret))));
record('public_secret_separation', leaked ? 'fail' : 'pass', leaked ? 'A private credential is present in public settings.' : 'Private credentials are absent from public settings.');
record('public_network', source.PUBLIC_CHAIN === network ? 'pass' : 'fail', 'Web and server must select the same network.');
record('bot_control_token', (source.BOTS_TOKEN?.length ?? 0) >= 24 ? 'pass' : 'pending', 'A private bot control token of at least 24 characters is required.');

let client: ReturnType<typeof createPublicClient> | undefined;
try {
  const endpoint = resolveRpcUrl(network, 'http', source.RPC_HTTP, source.DWELLIR_API_KEY);
  client = createPublicClient({ transport: http(endpoint, { timeout: 8_000, retryCount: 0 }) });
  if (await client.getChainId() !== chain.id) { record('rpc_http', 'fail', 'RPC serves a different chain.'); client = undefined; }
  else record('rpc_http', 'pass', `${rpcLabel(endpoint)} serves chain ${chain.id}.`);
} catch { record('rpc_http', 'pending', 'Configure and verify an accessible HTTP RPC.'); client = undefined; }
try {
  const endpoint = resolveRpcUrl(network, 'ws', source.RPC_WS, source.DWELLIR_API_KEY);
  const socket = createPublicClient({ transport: webSocket(endpoint, { timeout: 8_000, retryCount: 0, reconnect: false }) });
  try {
    if (await socket.getChainId() !== chain.id) throw new Error('Wrong chain.');
    await new Promise<void>((resolve, reject) => {
      let stop = () => {};
      const timer = setTimeout(() => { stop(); reject(new Error('No head.')); }, 8_000);
      stop = socket.watchBlocks({ onBlock: () => { clearTimeout(timer); stop(); resolve(); }, onError: () => { clearTimeout(timer); stop(); reject(new Error('Head subscription failed.')); } });
    });
    record('rpc_websocket', 'pass', 'Correct chain and live head subscription verified.');
  } finally { (await socket.transport.getRpcClient()).close(); }
} catch { record('rpc_websocket', 'pending', 'Configure and verify WebSocket head delivery.'); }

if (client) {
  for (const wallet of wallets) {
    try {
      const balance = await client.getBalance({ address: wallet.address });
      wallet.balanceMON = formatEther(balance);
      record(`${wallet.name}_funding`, balance > parseEther(wallet.name === 'DEPLOYER_PK' ? '0' : '15') ? 'pass' : 'pending', wallet.name === 'DEPLOYER_PK' ? 'A separate exact deployment-cost check is still required.' : 'Operating balance must exceed 15 MON; a campaign allowance is additional.');
    } catch { record(`${wallet.name}_funding`, 'pending', 'Wallet balance query unavailable.'); }
  }
  const market = source.MARKET_ADDRESS, faucet = source.FAUCET_ADDRESS, start = source.START_BLOCK;
  if (!market || !isAddress(market) || !faucet || !isAddress(faucet) || !start || !/^\d+$/.test(start) || BigInt(start) === 0n) {
    record('deployment', 'pending', 'Successful deployment addresses and start block are required.');
  } else {
    try {
      if (market.toLowerCase() !== source.PUBLIC_MARKET_ADDRESS?.toLowerCase()) throw new Error('Public market mismatch.');
      if (!((await client.getCode({ address: market })) ?? '').replace(/^0x$/, '')) throw new Error('No code.');
      const actualMarket = await client.readContract({ address: faucet, abi: faucetAbi, functionName: 'MARKET' });
      if (actualMarket.toLowerCase() !== market.toLowerCase()) throw new Error('Faucet mismatch.');
      for (const [functionName, expected] of [['MIN_PRICE', 500_000n], ['TICK_SIZE', 5_000n], ['LOT', 10n ** 15n], ['BATCH_BLOCKS', 1]] as const) {
        if (await client.readContract({ address: market, abi: batchAuctionAbi, functionName }) !== expected) throw new Error('Parameters mismatch.');
      }
      record('deployment', 'pass', 'Market parameters, faucet and public market agree.');
      const archive = createPublicClient({ transport: http(resolveArchiveRpc(network, source), { timeout: 8_000, retryCount: 0 }) });
      if (await archive.getChainId() !== chain.id || !((await archive.getCode({ address: market, blockNumber: BigInt(start) })) ?? '').replace(/^0x$/, '') || ((await archive.getCode({ address: market, blockNumber: BigInt(start) - 1n })) ?? '0x') !== '0x') throw new Error('Historical deployment check failed.');
      record('historical_rpc', 'pass', 'Code at deployment and absence in prior block verified.');
      const head = await client.getBlockNumber();
      await client.getContractEvents({ address: market, abi: batchAuctionAbi, fromBlock: head, toBlock: head });
      record('recent_logs', 'pass', 'A recent bounded log query succeeded.');
    } catch { record('deployment_services', 'fail', 'Check addresses, parameters, historical state and log-capable RPC.'); }
  }
}
function secureUrl(value?: string) {
  if (!value) return undefined;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url : undefined; } catch { return undefined; }
}
const site = secureUrl(source.RELEASE_WEB_URL);
if (!site || !source.PUBLIC_RP_ID || (site.hostname !== source.PUBLIC_RP_ID && !site.hostname.endsWith(`.${source.PUBLIC_RP_ID}`))) record('web_hostname', 'pending', 'Set permanent RELEASE_WEB_URL and matching PUBLIC_RP_ID.');
else {
  try {
    const responses = await Promise.all(['/', '/proof', '/me'].map(path => fetch(new URL(path, site), { signal: AbortSignal.timeout(8_000), redirect: 'error' })));
    if (responses.some(response => !response.ok)) throw new Error('Unavailable page.');
    record('web_hostname', 'pass', 'HTTPS trade, proof and account pages respond on the selected hostname.');
  } catch { record('web_hostname', 'pending', 'Host and verify trade, proof and account pages.'); }
}
const bot = secureUrl(source.BOTS_URL);
if (!bot) record('bots_host', 'pending', 'Set the hosted HTTPS bot service URL.');
else {
  try {
    const response = await fetch(new URL('/health', bot), { signal: AbortSignal.timeout(8_000), redirect: 'error' });
    const health = await response.json() as { chainId?: number };
    if (!response.ok || health.chainId !== chain.id) throw new Error('Unhealthy.');
    record('bots_host', 'pass', 'Hosted bot service is healthy on the intended chain.');
  } catch { record('bots_host', 'pending', 'Host and verify the funded single bot instance.'); }
}
const graph = secureUrl(source.PUBLIC_ENVIO_GRAPHQL_URL);
if (!graph || source.ENVIO_GRAPHQL_URL !== source.PUBLIC_ENVIO_GRAPHQL_URL) record('indexer_host', 'pending', 'Set matching actual Envio GraphQL endpoints.');
else {
  try {
    const response = await fetch(graph, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: '{ __typename }' }), signal: AbortSignal.timeout(8_000), redirect: 'error' });
    const result = await response.json() as { data?: { __typename?: string }; errors?: unknown[] };
    if (!response.ok || !result.data?.__typename || result.errors?.length) throw new Error('GraphQL unavailable.');
    record('indexer_host', 'pass', 'GraphQL query succeeded; sampled receipt/lag verification is still required.');
  } catch { record('indexer_host', 'pending', 'Deploy and verify the actual GraphQL endpoint.'); }
}
// These cannot be established by environment variables or mocked ceremonies.
record('physical_device_flow', 'pending', 'Record a fresh passkey, drip, order and receipt flow on the final host.');
record('submission_and_video', 'pending', 'Verify portal rules, actual public demo video and completed submission.');
const report = { generatedAt: new Date().toISOString(), chainId: chain.id, scope: 'Read-only configuration/service checks; not complete release acceptance.', automatedPrerequisitesPassed: checks.filter(check => !['physical_device_flow', 'submission_and_video'].includes(check.name)).every(check => check.status === 'pass'), wallets, checks, transactionsSent: 0 };
await mkdir('.tools', { recursive: true });
await writeFile(`.tools/release-readiness-${network}.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (checks.some(check => check.status !== 'pass')) process.exitCode = 1;
