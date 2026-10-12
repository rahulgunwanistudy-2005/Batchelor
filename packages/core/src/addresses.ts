import type { Address } from 'viem';

export type ChainId = 143 | 10143;
export interface Deployment {
  market: Address;
  faucet: Address;
  base: Address;
  quote: Address;
}

// Missing means undeployed; do not substitute zero or fabricated addresses.
export const addresses: Record<ChainId, Deployment | null> = { 143: null, 10143: null };
