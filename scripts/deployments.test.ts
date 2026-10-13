import { describe, expect, it } from 'vitest';
import { getContractAddress } from 'viem';
import { deploymentFromBroadcast, sanitizedBroadcast } from './deployments.ts';
const sender = '0x0000000000000000000000000000000000000001';
function fixture() {
  const addresses = [0, 1, 2, 3].map((n) => getContractAddress({ from: sender, nonce: BigInt(n) }));
  const names = ['DemoToken', 'DemoToken', 'BatchAuction', 'Faucet'];
  const args = [['Rose','ROSE','18',addresses[3]!], ['Demo USD','dUSD','6',addresses[3]!],
    [addresses[0]!,addresses[1]!,'500000','5000','1000000000000000','1','100'], addresses.slice(0, 3)];
  return { transactions: addresses.map((a,i) => ({ hash: `0x${String(i).repeat(64)}`, contractName: names[i], contractAddress: a,
    transactionType: 'CREATE', transaction: { from: sender, nonce: String(i), chainId: '10143' }, arguments: args[i]! })),
    receipts: addresses.map((a,i) => ({ transactionHash: `0x${String(i).repeat(64)}`, status: '0x1', blockNumber: String(100+i), contractAddress: a })) };
}
describe('confirmed deployment generation', () => {
  it('starts indexing at market creation even when the faucet mines later', () => {
    const f = fixture(); expect(deploymentFromBroadcast(f,10143)).toMatchObject({ market: f.transactions[2]!.contractAddress, faucet: f.transactions[3]!.contractAddress, startBlock: '102' });
  });
  it('refuses dry run, failed receipts, wrong chain, shifted faucet nonce and wrong demo parameters', () => {
    const mutations = [
      (f: ReturnType<typeof fixture>) => { f.receipts = []; },
      (f: ReturnType<typeof fixture>) => { f.receipts[0]!.status = '0x0'; },
      (f: ReturnType<typeof fixture>) => { f.transactions[0]!.transaction.chainId = '143'; },
      (f: ReturnType<typeof fixture>) => { f.transactions[3]!.transaction.nonce = '5'; },
      (f: ReturnType<typeof fixture>) => { f.transactions[0]!.arguments[3] = sender; },
      (f: ReturnType<typeof fixture>) => { f.transactions[2]!.arguments[2] = '1'; }
    ];
    for (const mutate of mutations) { const f = fixture(); mutate(f); expect(() => deploymentFromBroadcast(f, 10143)).toThrow(); }
  });
});

it('publishes only whitelisted fields and remains sufficient to regenerate addresses', () => {
  const input = { ...fixture(), secret: 'never-publish', metadata: { RPC_HTTP: 'secret-url' } };
  const sanitized = sanitizedBroadcast(input, 10143);
  expect(JSON.stringify(sanitized)).not.toContain('secret');
  expect(deploymentFromBroadcast(sanitized, 10143)).toEqual(deploymentFromBroadcast(input, 10143));
});
