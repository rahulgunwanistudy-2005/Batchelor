/** S3 testnet-only confirmation. Persists every broadcast before waiting for it. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, decodeEventLog, encodeAbiParameters, encodeDeployData,
  encodeFunctionData, formatEther, getContractAddress, http, keccak256 } from 'viem';
import type { Abi, Address, Hex, TransactionReceipt } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from 'viem/chains';
import { batchAuctionAbi } from '../packages/core/src/abi.ts';
import { transactionGas } from '../packages/core/src/gas.ts';
import { resolveRpcUrl } from '../packages/core/src/rpc.ts';
import bench from '../packages/core/src/bench.json' with { type: 'json' };

async function main() {
const root = fileURLToPath(new URL('../', import.meta.url));
const output = `${root}contracts/bench/out/clear-live-testnet.json`;
type Tx = { action: string; hash: Hex; gasLimit: string; dataHash: Hex; blockNumber?: string; status?: string };
type Evidence = { status: string; reason?: string; chainId: number; account: Address; startNonce: number;
  benchmarkHash: string; addresses: Record<string, Address>; transactions: Tx[];
  parity?: { local: number; live: number; relativeDifference: number; hash: Hex }; generatedAt: string };
const key = process.env.TESTNET_PK ?? process.env.TESTNET_PRIVATE_KEY;
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('Configure TESTNET_PK or TESTNET_PRIVATE_KEY in an ignored local .env.');
if (process.env.CHAIN !== 'testnet') throw new Error('Requires explicit CHAIN=testnet.');
const account = privateKeyToAccount(key as Hex);
const transport = http(resolveRpcUrl('testnet', 'http', process.env.RPC_HTTP, process.env.DWELLIR_API_KEY));
const client = createPublicClient({ chain: monadTestnet, transport });
const wallet = createWalletClient({ account, chain: monadTestnet, transport });
if (await client.getChainId() !== monadTestnet.id) throw new Error('Refusing any chain except Monad testnet 10143.');
const artifacts: Record<string, { abi: Abi; bytecode: { object: Hex }; deployedBytecode: { object: Hex } }> = {};
for (const name of ['DemoToken', 'BatchAuction', 'Faucet']) {
  artifacts[name] = JSON.parse(await readFile(`${root}contracts/out/${name}.sol/${name}.json`, 'utf8'));
}
const artifact = (name: string) => {
  const result = artifacts[name];
  if (!result) throw new Error(`Missing artifact ${name}`);
  return result;
};
const benchmarkHash = bench.profiles.MonadTen.runtimeBytecodeSha256;
const compiledHash = createHash('sha256').update(Buffer.from(artifact('BatchAuction').deployedBytecode.object.slice(2), 'hex')).digest('hex');
if (compiledHash !== benchmarkHash) throw new Error('Artifacts differ from measured bytecode. Re-run pnpm bench before sending.');
let evidence: Evidence;
try {
  evidence = JSON.parse(await readFile(output, 'utf8')) as Evidence;
  if (evidence.account.toLowerCase() !== account.address.toLowerCase() || evidence.benchmarkHash !== benchmarkHash) {
    throw new Error('Checkpoint belongs to a different key or bytecode. Preserve it and use a separate evidence file before starting a new run.');
  }
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  const startNonce = await client.getTransactionCount({ address: account.address, blockTag: 'pending' });
  const addresses = Object.fromEntries(['base', 'quote', 'market', 'faucet'].map((name, offset) =>
    [name, getContractAddress({ from: account.address, nonce: BigInt(startNonce + offset) })]));
  evidence = { status: 'preflight', chainId: monadTestnet.id, account: account.address, startNonce,
    benchmarkHash, addresses, transactions: [], generatedAt: new Date().toISOString() };
}
const address = (name: string): Address => {
  const result = evidence.addresses[name];
  if (!result) throw new Error(`Missing address ${name}`);
  return result;
};
const persist = () => writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
const tooling = (name: keyof typeof bench.toolingGas) => BigInt(bench.toolingGas[name]);
const sides: number[] = [], ticks: number[] = [], lots: bigint[] = [];
for (let j = 0; j < 256; j++) {
  sides.push(j % 2); ticks.push(64 + Math.floor(j / 2));
  lots.push(BigInt(keccak256(encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [42n, BigInt(j)]))) % 9n + 1n);
}
type Step = { action: string; data: Hex; to?: Address; gas: bigint };
const steps: Step[] = [
  { action: 'deployBase', data: encodeDeployData({ ...artifact('DemoToken'), bytecode: artifact('DemoToken').bytecode.object,
    args: ['Rose', 'ROSE', 18, address('faucet')] }), gas: tooling('tooling:deployBase') },
  { action: 'deployQuote', data: encodeDeployData({ ...artifact('DemoToken'), bytecode: artifact('DemoToken').bytecode.object,
    args: ['Demo USD', 'dUSD', 6, address('faucet')] }), gas: tooling('tooling:deployQuote') },
  { action: 'deployMarket', data: encodeDeployData({ ...artifact('BatchAuction'), bytecode: artifact('BatchAuction').bytecode.object,
    args: [address('base'), address('quote'), 500_000n, 5_000n, 10n ** 15n, 1, 100] }), gas: tooling('tooling:deployMarket') },
  { action: 'deployFaucet', data: encodeDeployData({ ...artifact('Faucet'), bytecode: artifact('Faucet').bytecode.object,
    args: [address('base'), address('quote'), address('market')] }), gas: tooling('tooling:deployFaucet') },
  { action: 'drip', to: address('faucet'), data: encodeFunctionData({ abi: artifact('Faucet').abi, functionName: 'drip', args: [account.address] }), gas: transactionGas('drip') },
  { action: 'seed128', to: address('market'), data: encodeFunctionData({ abi: batchAuctionAbi, functionName: 'placeMany', args: [sides, ticks, lots] }), gas: tooling('tooling:seed128') },
  { action: 'selfClear', to: address('market'), data: encodeFunctionData({ abi: batchAuctionAbi, functionName: 'place', args: [0, 100, 1n] }), gas: transactionGas('place') }
];
if (steps.some((step) => step.gas > 30_000_000n)) throw new Error('Measured transaction exceeds Monad cap.');
const gasPrice = await client.getGasPrice();
const required = steps.filter((step) => !evidence.transactions.some((tx) => tx.action === step.action))
  .reduce((sum, step) => sum + step.gas, 0n) * gasPrice;
const balance = await client.getBalance({ address: account.address });
console.log(`Testnet ${account.address}: ${formatEther(balance)} MON; remaining declared gas costs ${formatEther(required)} MON at current gas price.`);
if (balance < required) {
  evidence.status = 'funding_required';
  evidence.reason = `Needs ${formatEther(required)} testnet MON for the remaining steps; balance ${formatEther(balance)} MON. No new transaction sent.`;
  await persist();
  throw new Error(evidence.reason);
}
if (evidence.status === 'passed') { console.log('Existing testnet confirmation passed; no new transaction sent.'); process.exit(0); }
let clearingReceipt: TransactionReceipt | undefined;
try {
  for (const [index, step] of steps.entries()) {
    let tx = evidence.transactions.find((item) => item.action === step.action);
    if (tx && tx.dataHash !== keccak256(step.data)) throw new Error(`Checkpoint payload changed for ${step.action}.`);
    if (!tx) {
      const nonce = evidence.startNonce + index;
      if (await client.getTransactionCount({ address: account.address, blockTag: 'pending' }) !== nonce) {
        throw new Error('Account nonce changed outside this run. Refusing to reuse precomputed deployment addresses.');
      }
      const price = await client.getGasPrice();
      if (await client.getBalance({ address: account.address }) < step.gas * price) throw new Error('Testnet funding fell below next declared cost.');
      console.log(`${step.action}: gas ${step.gas}; cost ${formatEther(step.gas * price)} testnet MON.`);
      const hash = await wallet.sendTransaction({ ...(step.to ? { to: step.to } : {}), data: step.data,
        gas: step.gas, gasPrice: price, nonce });
      tx = { action: step.action, hash, gasLimit: step.gas.toString(), dataHash: keccak256(step.data) };
      evidence.transactions.push(tx); evidence.status = 'running'; await persist();
    }
    const receipt = await client.waitForTransactionReceipt({ hash: tx.hash, timeout: 60_000 });
    tx.blockNumber = receipt.blockNumber.toString(); tx.status = receipt.status; await persist();
    if (receipt.status !== 'success') throw new Error(`${step.action} reverted: ${tx.hash}. Preserve this evidence; do not automatically resend.`);
    if (!step.to && receipt.contractAddress?.toLowerCase() !== address(['base', 'quote', 'market', 'faucet'][index] ?? '').toLowerCase()) {
      throw new Error('Deployment address differs from precomputed faucet/token addresses.');
    }
    if (step.action === 'selfClear') clearingReceipt = receipt;
  }
  const log = clearingReceipt?.logs.find((item) => item.address.toLowerCase() === address('market').toLowerCase()
    && item.topics[0] === keccak256(new TextEncoder().encode('BatchCleared(uint64,uint16,uint256,uint64,uint16,uint16,uint64,uint64,uint64,uint64,uint32,uint32)')));
  if (!log || !clearingReceipt) throw new Error('Self-clear did not emit BatchCleared.');
  const event = decodeEventLog({ abi: batchAuctionAbi, eventName: 'BatchCleared', data: log.data, topics: log.topics });
  if (event.args.batchId !== 1n || event.args.orderCount !== 256) throw new Error('Seed was not contained in one 256-order batch.');
  const local = bench.profiles.MonadTen.measurements.live128.gas;
  const live = Number(event.args.clearGas);
  const relativeDifference = Math.abs(live - local) / local;
  evidence.parity = { local, live, relativeDifference, hash: clearingReceipt.transactionHash };
  evidence.status = relativeDifference <= 0.05 ? 'passed' : 'parity_failed';
  evidence.reason = relativeDifference <= 0.05 ? 'Emitted clearGas is within 5% of the identical local fixture.' : 'Stop: Monad behavior needs investigation before a workaround.';
  await persist();
  console.log(`clearGas local ${local}, live ${live}; difference ${(relativeDifference * 100).toFixed(3)}%.`);
  if (evidence.status !== 'passed') throw new Error(evidence.reason);
} catch (error) {
  // Provider exceptions can embed API keys, so persist only our parity result.
  if (evidence.status !== 'parity_failed') evidence.reason = 'Run interrupted. Check configuration, funding and saved transaction receipts before retrying.';
  if (evidence.status !== 'parity_failed') evidence.status = 'interrupted';
  await persist();
  throw error;
}

}
void main().catch(() => { console.error('Operation failed. Check configuration, RPC access, chain ID and saved evidence. Provider error details are omitted to protect credentials.'); process.exitCode = 1; });
