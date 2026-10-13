import { expect, it } from 'vitest';
import { addresses } from '@batchelor/core/addresses';
import evidence from '../../../../../docs/verification/testnet-deployment.json';
import { deploymentVerification } from './deployment-verification';

const deployment = addresses[10143]!;
const other = `0x${'11'.repeat(20)}` as const;
it('exposes exactly the four recorded Sourcify links for the verified testnet deployment', () => {
  const links = deploymentVerification(10143, deployment, deployment.market, evidence);
  expect(links).toEqual(Object.fromEntries(evidence.contracts.map(contract => [contract.role, contract.sourceVerification.lookupUrl])));
});
it('cannot borrow testnet verification for mainnet, unconfigured chains or a custom connected market', () => {
  expect(deploymentVerification(143, deployment, deployment.market, evidence)).toBeNull();
  expect(deploymentVerification(null, deployment, deployment.market, evidence)).toBeNull();
  expect(deploymentVerification(10143, null, null, evidence)).toBeNull();
  expect(deploymentVerification(10143, deployment, other, evidence)).toBeNull();
});
it.each(['base', 'quote', 'market', 'faucet'] as const)('requires the generated %s address to match, not just the market', role => {
  expect(deploymentVerification(10143, { ...deployment, [role]: other }, null, evidence)).toBeNull();
});
it('requires all four exact creation and runtime matches and the final verification status', () => {
  const incomplete = structuredClone(evidence);
  incomplete.contracts[0]!.sourceVerification.runtimeMatch = 'partial_match';
  expect(deploymentVerification(10143, deployment, null, incomplete)).toBeNull();
  expect(deploymentVerification(10143, deployment, null, { ...evidence, sourceVerificationStatus: 'pending' })).toBeNull();
  expect(deploymentVerification(10143, deployment, null, { ...evidence, chainId: 143 })).toBeNull();
});
it('rejects unsafe or unrelated lookup URLs instead of publishing them as verification links', () => {
  for (const lookupUrl of ['http://sourcify.dev/server/v2/contract/10143/' + deployment.base, 'https://example.com/verified', 'https://sourcify.dev/server/v2/contract/143/' + deployment.base]) {
    const changed = structuredClone(evidence);
    changed.contracts[0]!.sourceVerification.lookupUrl = lookupUrl;
    expect(deploymentVerification(10143, deployment, null, changed)).toBeNull();
  }
});
