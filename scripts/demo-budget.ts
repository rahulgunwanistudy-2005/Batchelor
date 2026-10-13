import { parseGwei } from 'viem';
import { transactionGas } from '../packages/core/src/gas.ts';
/** Recording budget, not a live fee quote. 300 ms is an explicit planning assumption. */
export function demoBudget(baseFee: bigint, multiplier = 10n, burstBlocks = 20n) {
  if (baseFee < 0n || multiplier < 1n || multiplier > 100n || burstBlocks < 1n || burstBlocks > 100n) throw new Error('Invalid demo budget inputs.');
  const bursts = 3n, awakeSeconds = 600n, blockIntervalMs = 300n;
  const moQuotes = (awakeSeconds * 1000n + blockIntervalMs - 1n) / blockIntervalMs;
  const petePerKeyMax = bursts * burstBlocks * transactionGas('place') * (2n + multiplier) * baseFee;
  const moMax = moQuotes * transactionGas('placeMany', 6) * (2n * baseFee + parseGwei('1'));
  return { bursts, awakeSeconds, blockIntervalMs, moQuotes, petePerKeyMax, peteTotalMax: 4n * petePerKeyMax, moMax };
}
