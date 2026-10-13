import type { Deployment } from '@batchelor/core/addresses';

const roles = ['base', 'quote', 'market', 'faucet'] as const;
type VerificationEvidence = {
  chainId: number;
  sourceVerificationStatus: string;
  contracts: {
    role: string;
    address: string;
    sourceVerification: { status: string; match: string; creationMatch: string; runtimeMatch: string; lookupUrl: string };
  }[];
};

/** Verification belongs to this exact chain and complete four-contract deployment.
 * Return only validated public Sourcify links, never the verifier's full evidence. */
export function deploymentVerification(chainId: number | null, deployment: Deployment | null, configuredMarket: string | null, evidence: VerificationEvidence): Record<string, string> | null {
  if (chainId !== 10143 || evidence.chainId !== chainId || !deployment || evidence.sourceVerificationStatus !== 'all_four_exact_match' || evidence.contracts.length !== 4) return null;
  if (configuredMarket && configuredMarket.toLowerCase() !== deployment.market.toLowerCase()) return null;
  const links: Record<string, string> = {};
  for (const role of roles) {
    const records = evidence.contracts.filter(contract => contract.role === role);
    const record = records[0];
    if (records.length !== 1 || !record || record.address.toLowerCase() !== deployment[role].toLowerCase()) return null;
    const verification = record.sourceVerification;
    if (verification.status !== 'verified' || verification.match !== 'exact_match' || verification.creationMatch !== 'exact_match' || verification.runtimeMatch !== 'exact_match') return null;
    try {
      const url = new URL(verification.lookupUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'sourcify.dev' || url.port || url.username || url.password || url.search || url.hash || url.pathname.toLowerCase() !== `/server/v2/contract/${chainId}/${record.address}`.toLowerCase()) return null;
      links[role] = url.href;
    } catch { return null; }
  }
  return links;
}
