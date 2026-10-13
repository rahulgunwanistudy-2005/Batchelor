/** Dry-run first; no broadcasting unless explicitly requested. Never print signer env. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPublicClient, formatEther, http } from 'viem';
import { monad, monadTestnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';
import { deploymentFromBroadcast, sanitizedBroadcast } from './deployments.ts';

async function main() {
const root = fileURLToPath(new URL('../', import.meta.url));
const network = process.env.CHAIN ?? 'testnet';
if (!['testnet', 'mainnet'].includes(network)) throw new Error('Unknown CHAIN.');
const execute = process.argv.includes('--execute');
const mainnet = network === 'mainnet';
if (execute && mainnet && process.env.MAINNET_DEPLOY_APPROVED !== 'true') throw new Error('Review the dry-run calls and cost and obtain explicit approval before enabling mainnet deployment.');
const chain = mainnet ? monad : monadTestnet;
const key = process.env.DEPLOYER_PK ?? (!mainnet ? process.env.TESTNET_PRIVATE_KEY ?? process.env.TESTNET_PK : undefined);
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('Configure DEPLOYER_PK (or the existing testnet key alias).');
const rpc = process.env.RPC_HTTP ?? chain.rpcUrls.default.http[0];
const account = privateKeyToAccount(key as Hex);
const client = createPublicClient({ chain, transport: http(rpc, { timeout: 10_000 }) });
if (await client.getChainId() !== chain.id) throw new Error('RPC chain mismatch.');
if (await client.getTransactionCount({ address: account.address, blockTag: 'latest' }) !== await client.getTransactionCount({ address: account.address, blockTag: 'pending' })) throw new Error('Wait for outstanding deployer transactions before predicting CREATE addresses.');
const forge = existsSync(`${root}.tools/foundry/bin/forge`) ? `${root}.tools/foundry/bin/forge` : 'forge';
const baseArgs = ['script', 'script/Deploy.s.sol:Deploy', '--rpc-url', rpc, '--gas-estimate-multiplier', '108', '--json'];
const run = (broadcast: boolean) => {
  const result = spawnSync(forge, [...baseArgs, ...(broadcast ? ['--broadcast', '--slow'] : [])], {
    cwd: `${root}contracts`, env: { ...process.env, DEPLOYER_PK: key, MAINNET_DEPLOY_APPROVED: 'true' }, encoding: 'utf8', maxBuffer: 16_000_000
  });
  // Raw Forge exceptions may contain secret RPC URLs. Persist no stderr.
  if (result.status !== 0) throw new Error(`Forge ${broadcast ? 'broadcast' : 'dry run'} failed. Check chain, signer balance and compiler locally.`);
};
run(false);
const dryPath = `${root}contracts/broadcast/Deploy.s.sol/${chain.id}/dry-run/run-latest.json`;
const dry = JSON.parse(await readFile(dryPath, 'utf8')) as { transactions: { contractName: string; arguments: string[]; transaction: { gas: string; input: Hex; nonce: string; from: string } }[] };
if (dry.transactions.length !== 4) throw new Error('Dry run did not yield four CREATEs.');
const block = await client.getBlock();
if (block.baseFeePerGas === null) throw new Error('No live base fee.');
const gasPrice = await client.getGasPrice();
const totalGas = dry.transactions.reduce((sum, tx) => sum + BigInt(tx.transaction.gas), 0n);
if (dry.transactions.some((tx) => BigInt(tx.transaction.gas) > 30_000_000n)) throw new Error('Deployment exceeds the transaction cap.');
const cost = totalGas * gasPrice;
const balance = await client.getBalance({ address: account.address });
const plan = { chainId: chain.id, account: account.address, liveBaseFee: block.baseFeePerGas.toString(), gasPrice: gasPrice.toString(),
  calls: dry.transactions.map((tx) => ({ constructor: tx.contractName, args: tx.arguments, nonce: tx.transaction.nonce,
    gasLimit: BigInt(tx.transaction.gas).toString(), costMON: formatEther(BigInt(tx.transaction.gas) * gasPrice), data: tx.transaction.input })),
  totalGas: totalGas.toString(), costMON: formatEther(cost), balanceMON: formatEther(balance), broadcast: false };
await mkdir(`${root}deployments/plans`, { recursive: true });
await writeFile(`${root}deployments/plans/${chain.id}.json`, JSON.stringify(plan, null, 2) + '\n');
console.log(JSON.stringify({ ...plan, calls: plan.calls.map(({ data: _data, ...call }) => call) }, null, 2));
console.log(`Exact deployment calldata is in deployments/plans/${chain.id}.json; this was a dry run.`);
if (execute) {
  if (balance < cost) throw new Error('Insufficient deployment funds.');
  const currentNonce = await client.getTransactionCount({ address: account.address, blockTag: 'pending' });
  if (BigInt(currentNonce) !== BigInt(dry.transactions[0]!.transaction.nonce)) throw new Error('Deployer nonce changed since planning.');
  run(true);
  const broadcast = JSON.parse(await readFile(`${root}contracts/broadcast/Deploy.s.sol/${chain.id}/run-latest.json`, 'utf8'));
  const deployment = deploymentFromBroadcast(broadcast, chain.id);
  // Publish only whitelisted fields, sufficient to validate and regenerate addresses in CI.
  const sanitized = sanitizedBroadcast(broadcast, chain.id);
  await writeFile(`${root}deployments/${chain.id}.json`, JSON.stringify(sanitized, null, 2) + '\n');
  console.log(JSON.stringify({ deployment, status: 'deployed', verification: 'pending' }, null, 2));
}

}
void main().catch(() => { console.error("Preflight failed. Check configuration, signer funding, RPC access and local Foundry output; no transport exception details logged."); process.exitCode = 1; });
