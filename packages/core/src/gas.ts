import limits from './gas.json' with { type: 'json' };

export const gasLimits = Object.freeze(limits);
export type GasOperation = keyof typeof limits;

/** Orders may arrive after sealing: always budget for a self-clear. */
export function transactionGas(action: 'place' | 'placeFor' | 'placeMany' | 'cancel' | 'cancelFor' | 'claim' | 'clear' | 'drip' | 'withdraw', count = 1): bigint {
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('Expected a positive item count.');
  switch (action) {
    case 'place': return BigInt(limits.placeSelfClear);
    case 'placeFor': return BigInt(limits.placeForSelfClear);
    case 'placeMany':
      if (count > 6) throw new Error('Split orders into chunks of at most 6.');
      return BigInt(limits.placeManySelfClear);
    case 'cancel': case 'cancelFor': return BigInt(limits.cancel);
    case 'claim':
      if (count > 50) throw new Error('Split claims into chunks of at most 50.');
      return BigInt(count === 1 ? limits.claim1 : limits.claim50);
    case 'clear': return BigInt(limits.clear);
    case 'drip': return BigInt(limits.drip);
    case 'withdraw': return BigInt(limits.withdraw);
  }
}

export function gasLimit(operation: GasOperation): bigint {
  return BigInt(limits[operation]);
}
