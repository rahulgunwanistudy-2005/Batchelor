/** Read-only validation of the deployed probe and all recorded transaction receipts. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPublicClient, decodeEventLog, encodeFunctionData, formatEther, http } from 'viem';
import type { Abi, Address, Hex } from 'viem';
import { monadTestnet } from 'viem/chains';

interface SavedTransaction {
  action: string;
  hash: Hex;
  gasLimit: string;
  blockNumber?: string;
}
interface LiveEvidence {
  status: string;
  chainId: number;
  address: Address;
  measuredAt: string;
  gas: Record<string, number>;
  transactions: SavedTransaction[];
}
const root = fileURLToPath(new URL('../', import.meta.url));
const path = `${root}/contracts/bench/out/live-testnet.json`;
const live: LiveEvidence = JSON.parse(await readFile(path, 'utf8'));
if (live.chainId !== 10143 || live.status !== 'passed') throw new Error('Expected passed testnet evidence.');
const client = createPublicClient({ chain: monadTestnet, transport: http('https://testnet-rpc.monad.xyz') });
if (await client.getChainId() !== 10143) throw new Error('Wrong RPC chain.');
const artifact: { abi: Abi; bytecode: { object: Hex }; deployedBytecode: { object: Hex } } = JSON.parse(
  await readFile(`${root}/contracts/out/PageBench.sol/PageBench.json`, 'utf8')
);
const local: { profiles: { default: { runtimeBytecodeSha256: string; gas: Record<string, number> } } } = JSON.parse(
  await readFile(`${root}/contracts/bench/out/spike.json`, 'utf8')
);
const code = await client.getBytecode({ address: live.address });
if (code !== artifact.deployedBytecode.object) throw new Error('Deployed runtime differs from the local artifact.');
const runtimeBytecodeSha256 = createHash('sha256').update(Buffer.from(code.slice(2), 'hex')).digest('hex');
if (runtimeBytecodeSha256 !== local.profiles.default.runtimeBytecodeSha256) throw new Error('Deployed bytecode differs from the measured local baseline.');
const scenarios = [
  { action: 'readContiguous512', name: 'contiguous512', checksum: 131328n },
  { action: 'readScattered512', name: 'scattered512', checksum: 131328n },
  { action: 'readContiguous32OnePage', name: 'onePage32', checksum: 528n },
  { action: 'readContiguous32FourPages', name: 'fourPages32', checksum: 6288n },
  { action: 'write64OnePage', name: 'writeOnePage64', checksum: 0n },
  { action: 'write64SeparatePages', name: 'writeSeparatePages64', checksum: 0n }
];
const actions = ['deploy', 'seed', ...scenarios.map((s) => s.action)];
if (live.transactions.length !== actions.length) throw new Error('Expected all eight transactions.');
let sender: Address | undefined;
let previousNonce: number | undefined;
let previousBlock: bigint | undefined;
let totalCharged = 0n;
const transactions = [];
const comparisons = [];
for (const [index, saved] of live.transactions.entries()) {
  if (saved.action !== actions[index]) throw new Error('Wrong transaction sequence.');
  const [tx, receipt] = await Promise.all([client.getTransaction({ hash: saved.hash }), client.getTransactionReceipt({ hash: saved.hash })]);
  if (receipt.status !== 'success' || tx.gas !== BigInt(saved.gasLimit) || tx.value !== 0n) throw new Error(`Receipt, gas limit or zero-value check failed: ${saved.action}`);
  sender ??= tx.from;
  if (tx.from.toLowerCase() !== sender.toLowerCase() || (previousNonce !== undefined && tx.nonce !== previousNonce + 1)) throw new Error('Sender/nonce sequence mismatch.');
  if (previousBlock !== undefined && receipt.blockNumber <= previousBlock) throw new Error('Seeding and measurements must be distinct transactions in increasing blocks.');
  if (saved.blockNumber && receipt.blockNumber !== BigInt(saved.blockNumber)) throw new Error('Recorded block differs from receipt.');
  previousNonce = tx.nonce;
  previousBlock = receipt.blockNumber;
  if (saved.action === 'deploy') {
    if (receipt.contractAddress?.toLowerCase() !== live.address.toLowerCase() || tx.to !== null || tx.input !== artifact.bytecode.object) throw new Error('Deployment mismatch.');
  } else if (tx.to?.toLowerCase() !== live.address.toLowerCase() || tx.input !== encodeFunctionData({ abi: artifact.abi, functionName: saved.action })) {
    throw new Error('Probe call mismatch.');
  }
  const scenario = scenarios.find((s) => s.action === saved.action);
  if (scenario) {
    const logs = receipt.logs.filter((log) => log.address.toLowerCase() === live.address.toLowerCase());
    if (logs.length !== 1) throw new Error('Expected exactly one probe event.');
    const log = logs[0]!;
    const event = decodeEventLog({ abi: artifact.abi, data: log.data, topics: log.topics });
    const args = event.args as unknown as { scenario: Hex; gasUsed: bigint; checksum: bigint };
    const name = Buffer.from(args.scenario.slice(2), 'hex').toString().replace(/\0+$/, '');
    if (event.eventName !== 'Measured' || name !== scenario.name || args.checksum !== scenario.checksum || Number(args.gasUsed) !== live.gas[name]) throw new Error(`Measurement/checksum mismatch: ${scenario.name}`);
    const localGas = local.profiles.default.gas[name];
    if (!localGas || Math.abs(Number(args.gasUsed) - localGas) / localGas > .05) throw new Error('Local/live parity exceeds 5%.');
    comparisons.push({ scenario: name, localGas, liveGas: Number(args.gasUsed), differenceGas: Number(args.gasUsed) - localGas, checksum: args.checksum.toString() });
  }
  const charged = tx.gas * receipt.effectiveGasPrice;
  totalCharged += charged;
  transactions.push({ ...saved, nonce: tx.nonce, valueWei: tx.value.toString(), blockNumber: receipt.blockNumber.toString(), status: receipt.status,
    receiptGasUsed: receipt.gasUsed.toString(), effectiveGasPriceWei: receipt.effectiveGasPrice.toString(),
    chargedFeeWei: charged.toString(), chargedFeeMon: formatEther(charged),
    receiptBlockHash: receipt.blockHash,
    explorerUrl: `https://testnet.monadvision.com/tx/${saved.hash}` });
}
if (!sender) throw new Error('No sender found.');
const [balanceBefore, balanceAfter, balanceNow] = await Promise.all([
  client.getBalance({ address: sender, blockNumber: BigInt(transactions[0]!.blockNumber) - 1n }),
  client.getBalance({ address: sender, blockNumber: BigInt(transactions.at(-1)!.blockNumber) }),
  client.getBalance({ address: sender })
]);
if (balanceBefore - balanceAfter !== totalCharged) throw new Error('Recorded fees do not reconcile with the actual wallet balance change.');
const evidence = { ...live, verifiedAt: new Date().toISOString(), sender, runtimeBytecodeSha256,
  bytecodeMatchesLocal: true, receiptsVerified: true, comparisons, transactions,
  totalChargedFeeWei: totalCharged.toString(), totalChargedFeeMon: formatEther(totalCharged),
  balanceBeforeMon: formatEther(balanceBefore), balanceAfterMon: formatEther(balanceAfter), balanceNowMon: formatEther(balanceNow),
  walletBalanceChangeMatchesFees: true };
await writeFile(path, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ status: evidence.status, bytecodeMatchesLocal: true, receiptsVerified: transactions.length,
  measurements: comparisons, totalChargedFeeMon: evidence.totalChargedFeeMon, balanceAfterMon: evidence.balanceAfterMon }, null, 2));
