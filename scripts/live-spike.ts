import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, decodeEventLog, encodeFunctionData, formatEther, hexToString, http } from 'viem';
import type { Abi, Address, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from 'viem/chains';
import { resolveRpcUrl } from '../packages/core/src/rpc.ts';

async function main() {
const root = fileURLToPath(new URL('../', import.meta.url));
const privateKey = process.env.TESTNET_PK ?? process.env.TESTNET_PRIVATE_KEY;
if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new Error('Set TESTNET_PK in an ignored local environment file.');
if (process.env.CHAIN !== 'testnet') throw new Error('This script requires CHAIN=testnet.');
const rpc = resolveRpcUrl('testnet', 'http', process.env.RPC_HTTP, process.env.DWELLIR_API_KEY);
const transport = http(rpc);
const account = privateKeyToAccount(privateKey as Hex);
const publicClient = createPublicClient({ chain: monadTestnet, transport });
if (await publicClient.getChainId() !== 10143) throw new Error('Refusing to send to any chain except Monad testnet.');
const wallet = createWalletClient({ account, chain: monadTestnet, transport });
const artifact: { abi: Abi; bytecode: { object: Hex }; deployedBytecode: { object: Hex } } = JSON.parse(
  await readFile(`${root}/contracts/out/PageBench.sol/PageBench.json`, 'utf8')
);
const spike = JSON.parse(await readFile(`${root}/contracts/bench/out/spike.json`, 'utf8'));
const buffer = (estimate: bigint) => (estimate * 1075n + 999n) / 1000n;
const maxGas = 30_000_000n;
const initialGasPrice = await publicClient.getGasPrice();
const initialBalance = await publicClient.getBalance({ address: account.address });
if (initialBalance < maxGas * initialGasPrice) throw new Error(`Fund the throwaway testnet address ${account.address} with at least ${formatEther(maxGas * initialGasPrice)} testnet MON before the seed transaction. No transaction sent.`);
const deploymentGas = buffer(await publicClient.estimateGas({ account, data: artifact.bytecode.object }));
if (deploymentGas > maxGas) throw new Error('Deployment exceeds testnet transaction cap.');
console.log(`Deploy PageBench on testnet: gas limit ${deploymentGas}.`);
const deploymentHash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object, gas: deploymentGas });
const deployed = await publicClient.waitForTransactionReceipt({ hash: deploymentHash });
if (deployed.status !== 'success' || !deployed.contractAddress) throw new Error('Benchmark deployment failed.');
const address: Address = deployed.contractAddress;
const transactions: object[] = [{ action: 'deploy', hash: deploymentHash, gasLimit: deploymentGas.toString() }];

async function send(functionName: string) {
  const data = encodeFunctionData({ abi: artifact.abi, functionName });
  const gas = buffer(await publicClient.estimateGas({ account, to: address, data }));
  if (gas > maxGas) throw new Error(`${functionName} exceeds testnet transaction cap.`);
  const gasPrice = await publicClient.getGasPrice();
  const balance = await publicClient.getBalance({ address: account.address });
  const maximumCost = gas * gasPrice;
  if (balance < maximumCost) throw new Error(`Fund the throwaway testnet address ${account.address}; ${functionName} requires up to ${formatEther(maximumCost)} testnet MON at current gas price.`);
  console.log(`${functionName}: gas limit ${gas}, maximum ${formatEther(maximumCost)} testnet MON.`);
  const hash = await wallet.sendTransaction({ to: address, data, gas, gasPrice });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`${functionName} reverted: ${hash}`);
  transactions.push({ action: functionName, hash, gasLimit: gas.toString(), blockNumber: receipt.blockNumber.toString() });
  return receipt;
}

await send('seed');
const gas: Record<string, number> = {};
for (const functionName of ['readContiguous512', 'readScattered512', 'readContiguous32OnePage', 'readContiguous32FourPages', 'write64OnePage', 'write64SeparatePages']) {
  const receipt = await send(functionName);
  const log = receipt.logs.find((item) => item.address.toLowerCase() === address.toLowerCase());
  if (!log) throw new Error(`No measurement emitted: ${functionName}`);
  const event = decodeEventLog({ abi: artifact.abi, data: log.data, topics: log.topics });
  if (event.eventName !== 'Measured') throw new Error('Unexpected measurement event.');
  const args = event.args as unknown as { scenario: Hex; gasUsed: bigint; checksum: bigint };
  const scenario = hexToString(args.scenario).replace(/\0+$/, '');
  gas[scenario] = Number(args.gasUsed);
  const local = spike.profiles.default.gas[scenario] as number;
  if (!local || Math.abs(gas[scenario]! - local) / local > 0.05) throw new Error(`Testnet/local gas differs by more than 5% for ${scenario}.`);
}
const evidence = { status: 'passed', chainId: 10143, address, measuredAt: new Date().toISOString(), gas, transactions };
await writeFile(`${root}/contracts/bench/out/live-testnet.json`, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
// Certify receipts, code and accounting before a successful run is complete.
await import(new URL('./verify-live-spike.ts', import.meta.url).href);

}
void main().catch(() => { console.error('Operation failed. Check configuration, RPC access, chain ID and saved evidence. Provider error details are omitted to protect credentials.'); process.exitCode = 1; });
