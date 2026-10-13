/** Read-only planning; execution signs exactly the reviewed CREATEs and bounded fees. */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, getContractAddress, http, keccak256 } from 'viem';
import { monad, monadTestnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';
import { deploymentFromBroadcast, sanitizedBroadcast } from './deployments.ts';
import { assertApprovedPlan, deploymentPlan, DeploymentPlanError, planHash } from './deploy-plan.ts';
import type { DeploymentPlan, DryDeployment } from './deploy-plan.ts';
import { resolveRpcUrl } from '../packages/core/src/rpc.ts';

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const network = process.env.CHAIN ?? 'testnet';
  if (!['testnet', 'mainnet'].includes(network)) throw new DeploymentPlanError('Unknown CHAIN.');
  const execute = process.argv.includes('--execute'), mainnet = network === 'mainnet';
  if (execute && mainnet && process.env.MAINNET_DEPLOY_APPROVED !== 'true') throw new DeploymentPlanError('Mainnet deployment requires explicit approval of the saved calls and maximum cost.');
  const chain = mainnet ? monad : monadTestnet;
  const key = process.env.DEPLOYER_PK ?? (!mainnet ? process.env.TESTNET_PRIVATE_KEY ?? process.env.TESTNET_PK : undefined);
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new DeploymentPlanError('Configure DEPLOYER_PK (or the existing testnet key alias).');
  const rpc = resolveRpcUrl(mainnet ? 'mainnet' : 'testnet', 'http', process.env.RPC_HTTP, process.env.DWELLIR_API_KEY);
  const account = privateKeyToAccount(key as Hex);
  const client = createPublicClient({ chain, transport: http(rpc, { timeout: 10_000 }) });
  const wallet = createWalletClient({ account, chain, transport: http(rpc, { retryCount: 0, timeout: 10_000 }) });
  if (await client.getChainId() !== chain.id) throw new DeploymentPlanError('RPC chain mismatch.');
  const paths = { plan: `${root}deployments/plans/${chain.id}.json`, checkpoint: `${root}deployments/plans/${chain.id}.execution.json` };
  if (existsSync(paths.checkpoint)) throw new DeploymentPlanError('An execution checkpoint exists. Preserve it and inspect every hash before any manual recovery or new deployment.');
  const approved = execute ? JSON.parse(await readFile(paths.plan, 'utf8')) as DeploymentPlan : undefined;
  if (approved && (approved.version !== 2 || process.env.DEPLOY_PLAN_HASH !== planHash(approved))) {
    throw new DeploymentPlanError('Review a version 2 deployment plan and set its exact DEPLOY_PLAN_HASH before execution.');
  }
  const [nonce, pendingNonce, block, gasPrice, balance] = await Promise.all([
    client.getTransactionCount({ address: account.address, blockTag: 'latest' }),
    client.getTransactionCount({ address: account.address, blockTag: 'pending' }), client.getBlock(), client.getGasPrice(),
    client.getBalance({ address: account.address })
  ]);
  if (nonce !== pendingNonce) throw new DeploymentPlanError('Wait for outstanding deployer transactions before predicting CREATE addresses.');
  if (block.baseFeePerGas === null) throw new DeploymentPlanError('No live base fee.');
  const maxFee = approved ? BigInt(approved.maxFeePerGas) : gasPrice;
  const priorityFee = approved ? BigInt(approved.maxPriorityFeePerGas) : gasPrice > block.baseFeePerGas ? gasPrice - block.baseFeePerGas : 0n;
  if (block.baseFeePerGas + priorityFee > maxFee) throw new DeploymentPlanError('Live fees exceed the saved fee cap. Review a new plan instead of increasing fees automatically.');
  const sourceFiles = (await readdir(`${root}contracts/src`, { recursive: true })).filter(p => p.endsWith('.sol')).map(p => `contracts/src/${p}`);
  sourceFiles.push('contracts/script/Deploy.s.sol', 'contracts/foundry.toml',
    'scripts/deploy.ts', 'scripts/deploy-plan.ts', 'scripts/deployments.ts');
  const source = createHash('sha256');
  for (const path of sourceFiles.sort()) { source.update(path); source.update(await readFile(`${root}${path}`)); }
  const sourceHash = source.digest('hex');
  const forge = existsSync(`${root}.tools/foundry/bin/forge`) ? `${root}.tools/foundry/bin/forge` : 'forge';
  // Pinned Forge help: with-gas-price is the EIP1559 max fee; priority-gas-price is the tip cap.
  const result = spawnSync(forge, ['script', 'script/Deploy.s.sol:Deploy', '--rpc-url', rpc,
    '--sender-nonce', String(nonce), '--gas-estimate-multiplier', '108', '--with-gas-price', String(maxFee),
    '--priority-gas-price', String(priorityFee), '--json'], {
    cwd: `${root}contracts`, env: { ...process.env, DEPLOYER_PK: key, MAINNET_DEPLOY_APPROVED: 'true' },
    encoding: 'utf8', maxBuffer: 16_000_000
  });
  // Neither Forge output nor transport exceptions may expose a credential-bearing RPC URL.
  if (result.status !== 0) throw new DeploymentPlanError('Read-only Forge simulation failed. Check chain, signer balance and compiler locally.');
  const dry = JSON.parse(await readFile(`${root}contracts/broadcast/Deploy.s.sol/${chain.id}/dry-run/run-latest.json`, 'utf8')) as DryDeployment;
  const plan = deploymentPlan(dry, chain.id, account.address, sourceHash, block.baseFeePerGas, maxFee, priorityFee, balance);
  await mkdir(`${root}deployments/plans`, { recursive: true });
  if (!execute) await writeFile(paths.plan, JSON.stringify(plan, null, 2) + '\n');
  const reviewed = approved ?? plan;
  console.log(JSON.stringify({ ...reviewed, planHash: planHash(reviewed), calls: reviewed.calls.map(({ data: _data, ...call }) => call) }, null, 2));
  if (!execute) {
    console.log(`Exact calldata is saved in deployments/plans/${chain.id}.json. CostMON is the maximum gas-limit × fee-cap commitment; no transaction was sent.`);
    return;
  }
  const [latestNow, pendingNow, currentBlock, currentBalance] = await Promise.all([
    client.getTransactionCount({ address: account.address, blockTag: 'latest' }),
    client.getTransactionCount({ address: account.address, blockTag: 'pending' }), client.getBlock(), client.getBalance({ address: account.address })
  ]);
  if (currentBlock.baseFeePerGas === null) throw new DeploymentPlanError('No live base fee.');
  assertApprovedPlan(reviewed, plan, process.env.DEPLOY_PLAN_HASH, latestNow, pendingNow, currentBlock.baseFeePerGas, currentBalance);
  const checkpoint: { planHash: string; chainId: number; account: string; transactions: { hash: Hex; nonce: string; gasLimit: string; status: string }[] } = {
    planHash: planHash(reviewed), chainId: chain.id, account: account.address, transactions: []
  };
  // Exclusive creation prevents two local deployment processes from sharing a plan.
  await writeFile(paths.checkpoint, JSON.stringify(checkpoint, null, 2) + '\n', { flag: 'wx' });
  const broadcast = { transactions: [] as { hash: Hex; contractName: string; contractAddress: string; transactionType: string; arguments: string[];
    transaction: { from: typeof account.address; nonce: string; chainId: string } }[],
    receipts: [] as { transactionHash: Hex; status: string; blockNumber: string; contractAddress: string }[] };
  for (const call of reviewed.calls) {
    const [latest, pending, head, available] = await Promise.all([
      client.getTransactionCount({ address: account.address, blockTag: 'latest' }), client.getTransactionCount({ address: account.address, blockTag: 'pending' }),
      client.getBlock(), client.getBalance({ address: account.address })
    ]);
    if (await client.getChainId() !== chain.id || latest !== pending || BigInt(latest) !== BigInt(call.nonce)) throw new DeploymentPlanError('Chain or deployer nonce changed; inspect the execution checkpoint.');
    if (head.baseFeePerGas === null || head.baseFeePerGas + priorityFee > maxFee || available < BigInt(call.gasLimit) * maxFee) throw new DeploymentPlanError('Reviewed fee cap or funding no longer permits deployment; inspect the execution checkpoint.');
    const raw = await wallet.signTransaction({ data: call.data, value: 0n, nonce: Number(call.nonce), gas: BigInt(call.gasLimit),
      maxFeePerGas: maxFee, maxPriorityFeePerGas: priorityFee });
    const hash = keccak256(raw);
    const attempt = { hash, nonce: call.nonce, gasLimit: call.gasLimit, status: 'submission_pending' };
    checkpoint.transactions.push(attempt);
    await writeFile(paths.checkpoint, JSON.stringify(checkpoint, null, 2) + '\n');
    // Persist the signed transaction hash before submission. Never retry an ambiguous send automatically.
    await client.sendRawTransaction({ serializedTransaction: raw });
    const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 4, timeout: 120_000 });
    attempt.status = receipt.status;
    await writeFile(paths.checkpoint, JSON.stringify(checkpoint, null, 2) + '\n');
    if (receipt.status !== 'success' || receipt.contractAddress?.toLowerCase() !== call.address.toLowerCase()) throw new DeploymentPlanError('Deployment receipt failed or CREATE address mismatched; preserve the checkpoint.');
    broadcast.transactions.push({ hash, contractName: call.constructor, contractAddress: getContractAddress({ from: account.address, nonce: BigInt(call.nonce) }),
      transactionType: 'CREATE', arguments: call.args, transaction: { from: account.address, nonce: call.nonce, chainId: String(chain.id) } });
    broadcast.receipts.push({ transactionHash: hash, status: '0x1', blockNumber: String(receipt.blockNumber), contractAddress: receipt.contractAddress });
  }
  const deployment = deploymentFromBroadcast(broadcast, chain.id);
  await writeFile(`${root}deployments/${chain.id}.json`, JSON.stringify(sanitizedBroadcast(broadcast, chain.id), null, 2) + '\n');
  console.log(JSON.stringify({ deployment, status: 'deployed', verification: 'pending' }, null, 2));
}
void main().catch(error => {
  console.error(error instanceof DeploymentPlanError ? error.message : 'Preflight failed. Check configuration, signer funding, RPC access and local output; no transport exception details logged.');
  process.exitCode = 1;
});
