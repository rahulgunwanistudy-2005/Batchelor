/** Read-only budget. Never transfers MON or generates bot keys. */
import { createPublicClient, formatEther, http, parseEther, parseGwei } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monad, monadTestnet } from 'viem/chains';
import type { Hex } from 'viem';
import { transactionGas } from '../packages/core/src/gas.ts';
import { demoBudget } from './demo-budget.ts';
async function main() {
const network = process.env.CHAIN ?? 'testnet';
if (!['testnet', 'mainnet'].includes(network)) throw new Error('Unknown CHAIN.');
const chain = network === 'mainnet' ? monad : monadTestnet;
const client = createPublicClient({ chain, transport: http(process.env.RPC_HTTP ?? chain.rpcUrls.default.http[0], { timeout: 10_000 }) });
if (await client.getChainId() !== chain.id) throw new Error('RPC chain mismatch.');
const block = await client.getBlock(); if (block.baseFeePerGas === null) throw new Error('Missing base fee.');
const mult = BigInt(process.env.PETE_PRIORITY_MULT ?? '10');
const blocks = BigInt(process.env.PETE_BURST_BLOCKS ?? '20');
if (mult < 1n || mult > 100n || blocks < 1n || blocks > 100n) throw new Error('Invalid burst policy.');
const base = block.baseFeePerGas;
const demo = demoBudget(base, mult, blocks);
const expectedPerPete = blocks * transactionGas('place') * (base + mult * base);
const reservedPerPete = blocks * transactionGas('place') * (2n * base + mult * base);
const defaults = { RELAYER_PK: '40', KEEPER_PK: '20', MO_PK: '80', PETE_PK_1: '50', PETE_PK_2: '50', PETE_PK_3: '50', PETE_PK_4: '50' };
const wallets = [];
for (const [name, targetMON] of Object.entries(defaults)) {
  const key = process.env[name];
  const minimum = name.startsWith('PETE') ? parseEther('15') + demo.petePerKeyMax
    : name === 'MO_PK' ? parseEther('15') + demo.moMax : parseEther('15');
  const target = parseEther(targetMON) > minimum ? parseEther(targetMON) : minimum;
  if (!key) { wallets.push({ name, status: 'key_missing', targetMON: formatEther(target), recordingReady: false }); continue; }
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error(`Invalid key configuration: ${name}`);
  const account = privateKeyToAccount(key as Hex);
  const balance = await client.getBalance({ address: account.address });
  wallets.push({ name, address: account.address, balanceMON: formatEther(balance), targetMON: formatEther(target),
    topUpMON: formatEther(target > balance ? target - balance : 0n), aboveReserve: balance > parseEther('12'), recordingReady: balance >= target });
}
console.log(JSON.stringify({ chainId: chain.id, block: block.number?.toString(), baseFeePerGas: base.toString(),
  priorityMultiplier: mult.toString(), burstBlocks: blocks.toString(), declaredPlaceGas: transactionGas('place').toString(),
  peteBurstExpectedMON: formatEther(4n * expectedPerPete), peteBurstMaxReservedMON: formatEther(4n * reservedPerPete),
  moBurstExpectedMON: formatEther(blocks * transactionGas('placeMany', 6) * (base + parseGwei('1'))),
  keeperClaim50ExpectedMON: formatEther(transactionGas('claim', 50) * (base + parseGwei('1'))),
  recording: { bursts: Number(demo.bursts), moAwakeSeconds: Number(demo.awakeSeconds), blockIntervalPlanningMs: Number(demo.blockIntervalMs), moQuotes: Number(demo.moQuotes),
    peteThreeBurstsMaxMON: formatEther(demo.peteTotalMax), moTenMinutesMaxMON: formatEther(demo.moMax),
    ready: wallets.every(w => w.recordingReady), note: 'Maximum EIP1559 caps at the sampled base fee; excludes keeper/relayer spend. Recheck immediately before recording; faster blocks or rising fees need more MON.' },
  wallets, transfersSent: 0 }, null, 2));

}
void main().catch(() => { console.error("Preflight failed. Check configuration, signer funding, RPC access and local Foundry output; no transport exception details logged."); process.exitCode = 1; });
