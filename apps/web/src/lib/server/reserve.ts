import { parseEther } from 'viem';
import { ApiError } from './service';
/** Cover the full fee commitment while keeping 12 MON available after this send. */
export function requireRelayReserve(balance: bigint, gas: bigint, maxFeePerGas: bigint): void {
  if (balance < parseEther('12') + gas * maxFeePerGas) {
    throw new ApiError('RELAYER_LOW_BALANCE', 'Gasless orders are paused. Please try again after network fees are replenished.', 503);
  }
}
