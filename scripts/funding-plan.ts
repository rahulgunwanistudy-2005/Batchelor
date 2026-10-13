/** Read-only budget. Never transfers MON or generates bot keys. */
import { createPublicClient, formatEther, http, parseEther, parseGwei } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monad, monadTestnet } from 'viem/chains';
import type { Hex } from 'viem';
import { transactionGas } from '../packages/core/src/gas.ts';
import { demoBudget } from './demo-budget.ts';
import { resolveRpcUrl } from '../packages/core/src/rpc.ts';
async function main() {
const network = process.env.CHAIN ?? 'testnet';
if (!['testnet', 'mainnet'].includes(network)) throw new Error('Unknown CHAIN.');
const chain = network === 'mainnet' ? monad : monadTestnet;
const client = createPublicClient({ chain, transport: http(resolveRpcUrl(network as 'mainnet' | 'testnet', 'http', process.env.RPC_HTTP, process.env.DWELLIR_API_KEY), { timeout: 10_000 }) });
if (await client.getChainId() !== chain.id) throw new Error('RPC chain mismatch.');
const block = await client.getBlock(); if (block.baseFeePerGas === null) throw new Error('Missing base fee.');
const mult = BigInt(process.env.PETE_PRIORITY_MULT ?? '10');
const blocks = BigInt(process.env.PETE_BURST_BLOCKS ?? '20');
if (mult < 1n || mult > 100n || blocks < 1n || blocks > 100n) throw new Error('Invalid burst policy.');
const base = block.baseFeePerGas;
const demo = demoBudget(base, mult, blocks, {
  bursts: BigInt(process.env.RECORDING_BURSTS ?? '3'), awakeSeconds: BigInt(process.env.RECORDING_AWAKE_SECONDS ?? '600'),
  blockIntervalMs: BigInt(process.env.RECORDING_BLOCK_INTERVAL_MS ?? '300'),
  awakeSessions: BigInt(process.env.RECORDING_AWAKE_SESSIONS ?? process.env.RECORDING_BURSTS ?? '3'),
  moWakeSeconds: BigInt(process.env.MO_AWAKE_SECONDS ?? '90')
});
const expectedPerPete = blocks * transactionGas('place') * (base + mult * base);
const reservedPerPete = blocks * transactionGas('place') * (2n * base + mult * base);
const defaults = { RELAYER_PK: '40', KEEPER_PK: '20', MO_PK: '80', PETE_PK_1: '50', PETE_PK_2: '50', PETE_PK_3: '50', PETE_PK_4: '50' };
const wallets = [];
const signerAddresses = new Set<string>();
for (const [name, targetMON] of Object.entries(defaults)) {
  const key = process.env[name];
  const minimum = name.startsWith('PETE') ? parseEther('15') + demo.petePerKeyMax
    : name === 'MO_PK' ? parseEther('15') + demo.moMax
    : name === 'KEEPER_PK' ? parseEther('15') + demo.keeperMax : parseEther('15');
  const target = parseEther(targetMON) > minimum ? parseEther(targetMON) : minimum;
  if (!key) { wallets.push({ name, status: 'key_missing', targetMON: formatEther(target), recordingReady: false }); continue; }
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error(`Invalid key configuration: ${name}`);
  const account = privateKeyToAccount(key as Hex);
  if (signerAddresses.has(account.address.toLowerCase())) throw new Error('Funding reservations require distinct relayer and bot keys.');
  signerAddresses.add(account.address.toLowerCase());
  const balance = await client.getBalance({ address: account.address });
  wallets.push({ name, address: account.address, balanceMON: formatEther(balance), targetMON: formatEther(target),
    topUpMON: formatEther(target > balance ? target - balance : 0n), aboveReserve: balance > parseEther('12'), recordingReady: balance >= target });
}
console.log(JSON.stringify({ chainId: chain.id, block: block.number?.toString(), baseFeePerGas: base.toString(),
  priorityMultiplier: mult.toString(), burstBlocks: blocks.toString(), declaredPlaceGas: transactionGas('place').toString(),
  peteBurstExpectedMON: formatEther(4n * expectedPerPete), peteBurstMaxReservedMON: formatEther(4n * reservedPerPete),
  moBurstExpectedMON: formatEther(blocks * transactionGas('placeMany', 6) * (base + parseGwei('1'))),
  keeperClaim50ExpectedMON: formatEther(transactionGas('claim', 50) * (base + parseGwei('1'))),
  recording: { bursts: Number(demo.bursts), awakeSessions: Number(demo.awakeSessions), moAwakeSeconds: Number(demo.awakeSeconds),
    moWakeSeconds: Number(demo.moWakeSeconds), minimumAwakeSeconds: Number(demo.minimumAwakeSeconds),
    blockIntervalPlanningMs: Number(demo.blockIntervalMs), minimumMoQuotes: Number(demo.minimumMoQuotes), moQuotes: Number(demo.moQuotes),
    peteMaxMON: formatEther(demo.peteTotalMax), moMaxMON: formatEther(demo.moMax),
    keeperOrders: Number(demo.keeperOrders), keeperClaimTransactionsMax: Number(demo.keeperClaimTransactionsMax),
    keeperClearTransactionsMax: Number(demo.keeperClearTransactionsMax), keeperClaimsMaxMON: formatEther(demo.keeperClaimMax),
    keeperClearsMaxMON: formatEther(demo.keeperClearMax), keeperMaxMON: formatEther(demo.keeperMax), totalBotMaxMON: formatEther(demo.totalBotMax),
    walletsFunded: wallets.every(w => w.recordingReady), scope: 'Wallet funding targets only; not deployment or recording readiness.',
    relayerAllowanceMON: defaults.RELAYER_PK, relayerSpendBudgeted: false, deploymentGasBudgeted: false, seedingGasBudgeted: false,
    note: `Maximum EIP1559 caps at the sampled base fee; includes keeper claim and clear reservations, excludes relayer, deployment and faucet-seeding spend. The relayer target is an initial allowance, not a calculated judge-traffic budget. Assumes ${demo.awakeSessions} uninterrupted awake sessions totaling no more than ${demo.awakeSeconds} seconds, ${demo.bursts} Pete bursts, empty initial claim backlog, no failed transactions, missed quote heads, cancellations or extra user orders. These settings only plan costs; they do not enforce a runtime campaign limit. Control visits and extra wakes, then recheck before recording; faster blocks, rising fees or other traffic need more MON.` },
  wallets, transfersSent: 0 }, null, 2));

}
void main().catch(() => { console.error("Preflight failed. Check configuration, signer funding, RPC access and local Foundry output; no transport exception details logged."); process.exitCode = 1; });
