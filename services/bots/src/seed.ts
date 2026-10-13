import { batchAuctionAbi, faucetAbi } from '@batchelor/core/abi';
import { parseGwei } from 'viem';
import type { Address } from 'viem';
import { ChainWriter, createChainClients, keyNames, readEnv } from './chain.js';

/** Each bot invokes the existing daily faucet. No owner or new minting authority. */
async function main() {
  const env = readEnv();
  if (env.CHAIN !== 'testnet') throw new Error('Seed tooling defaults to testnet; mainnet seed calls require a separately approved plan.');
  if (!env.MARKET_ADDRESS || !env.FAUCET_ADDRESS) throw new Error('Configure deployed contracts.');
  const clients = createChainClients(env);
  if (await clients.publicClient.getChainId() !== clients.chain.id) throw new Error('Chain mismatch.');
  const writer = new ChainWriter(env, clients);
  for (const name of keyNames) {
    const wallet = clients.wallets.get(name); if (!wallet) throw new Error(`Missing ${name}.`);
    const balances = await clients.publicClient.readContract({ address: env.MARKET_ADDRESS as Address, abi: batchAuctionAbi, functionName: 'balances', args: [wallet.account.address] });
    if (balances[0] > 0n && balances[1] > 0n) { console.log(JSON.stringify({ key: name, status: 'already_seeded' })); continue; }
    await clients.publicClient.simulateContract({ address: env.FAUCET_ADDRESS as Address, abi: faucetAbi, functionName: 'drip', args: [wallet.account.address], account: wallet.account });
    const block = await clients.publicClient.getBlock(); if (block.baseFeePerGas === null) throw new Error('Missing base fee.');
    const hash = await writer.send(name, { action: 'drip', to: wallet.account.address }, block.baseFeePerGas, parseGwei('1'));
    console.log(JSON.stringify({ key: name, action: 'drip', hash }));
    const receipt = await clients.publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== 'success') throw new Error('Drip reverted.');
  }
}
void main().catch(() => { console.error('Seeding failed. Check keys, contracts, daily cooldown and funding.'); process.exitCode = 1; });
