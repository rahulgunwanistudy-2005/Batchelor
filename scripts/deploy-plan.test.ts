import { describe, expect, it } from 'vitest';
import { getContractAddress } from 'viem';
import { assertApprovedPlan, deploymentPlan, planHash } from './deploy-plan.ts';
import type { DryDeployment } from './deploy-plan.ts';
const account = '0x0000000000000000000000000000000000000001';
const fees = { base: 100_000_000_000n, max: 102_000_000_000n, tip: 2_000_000_000n };
function fixture(): DryDeployment {
  return { transactions: ['DemoToken', 'DemoToken', 'BatchAuction', 'Faucet'].map((name, i) => ({
    contractName: name, arguments: [String(i)], transactionType: 'CREATE',
    contractAddress: getContractAddress({ from: account, nonce: BigInt(i) }),
    transaction: { from: account, to: null, value: '0x0', nonce: String(i), chainId: '10143', gas: '100000', input: '0x6000' }
  })) };
}
function plan(dry = fixture()) { return deploymentPlan(dry, 10143, account, 'source-hash', fees.base, fees.max, fees.tip, 10n ** 18n); }
describe('reviewed deployment caps', () => {
  it('uses each exact simulated gas limit, not gas used or another fee estimate', () => {
    const p = plan();
    expect(p.totalGas).toBe('400000'); expect(p.costMON).toBe('0.0408');
    expect(p.calls.map(c => c.gasLimit)).toEqual(['100000', '100000', '100000', '100000']);
    expect(() => assertApprovedPlan(p, p, planHash(p), 0, 0, fees.base, 40_800_000_000_000_000n)).not.toThrow();
  });
  it('never changes the saved plan while comparing fresh observations', () => {
    const p = plan(), before = JSON.stringify(p);
    const observed = { ...p, balanceMON: '9', liveBaseFee: '99000000000' };
    assertApprovedPlan(p, observed, planHash(p), 0, 0, 99_000_000_000n, 10n ** 18n);
    expect(JSON.stringify(p)).toBe(before);
  });
  it('rejects changed account, source, nonce, calldata or simulated limit', () => {
    const p = plan();
    for (const mutate of [
      (v: ReturnType<typeof plan>) => { v.account = '0x0000000000000000000000000000000000000002'; },
      (v: ReturnType<typeof plan>) => { v.sourceHash = 'other-source'; },
      (v: ReturnType<typeof plan>) => { v.calls[0]!.nonce = '4'; },
      (v: ReturnType<typeof plan>) => { v.calls[0]!.data = '0x6001'; },
      (v: ReturnType<typeof plan>) => { v.calls[0]!.gasLimit = '100001'; }
    ]) {
      const changed = structuredClone(p); mutate(changed);
      expect(() => assertApprovedPlan(p, changed, planHash(p), 0, 0, fees.base, 10n ** 18n)).toThrow(/changed/);
    }
  });
  it('refuses partial deployment, pending nonce, increased live fee, insufficient funds and unapproved hash', () => {
    const p = plan();
    expect(() => assertApprovedPlan(p, p, planHash(p), 0, 0, fees.base, 10n ** 18n, 1)).toThrow(/checkpoint/);
    expect(() => assertApprovedPlan(p, p, planHash(p), 0, 1, fees.base, 10n ** 18n)).toThrow(/nonce/);
    expect(() => assertApprovedPlan(p, p, planHash(p), 1, 1, fees.base, 10n ** 18n)).toThrow(/nonce/);
    expect(() => assertApprovedPlan(p, p, planHash(p), 0, 0, fees.base + 1n, 10n ** 18n)).toThrow(/fee cap/);
    expect(() => assertApprovedPlan(p, p, planHash(p), 0, 0, fees.base, 0n)).toThrow(/funds/);
    expect(() => assertApprovedPlan(p, p, 'unreviewed', 0, 0, fees.base, 10n ** 18n)).toThrow(/hash/);
  });
  it('rejects nonzero CREATE value, wrong network and excess transaction commitment', () => {
    const value = fixture(); value.transactions[0]!.transaction.value = '1'; expect(() => plan(value)).toThrow();
    const network = fixture(); network.transactions[0]!.transaction.chainId = '143'; expect(() => plan(network)).toThrow();
    const gas = fixture(); gas.transactions[0]!.transaction.gas = '30000001'; expect(() => plan(gas)).toThrow();
    expect(() => deploymentPlan(fixture(), 10143, account, 'source', fees.base, 101n * 10n ** 12n, 0n, 10n ** 18n)).toThrow();
  });
});
