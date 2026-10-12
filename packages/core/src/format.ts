export const N_TICKS = 256;
export const MIN_PRICE = 500_000n;
export const TICK_SIZE = 5_000n;
export const LOT = 1_000_000_000_000_000n;
export const BASE_SCALE = 1_000_000_000_000_000_000n;
export const QUOTE_DECIMALS = 6;

export function tickToPrice(tick: number): bigint {
  if (!Number.isInteger(tick) || tick < 0 || tick >= N_TICKS) throw new RangeError('Tick must be an integer from 0 to 255.');
  return MIN_PRICE + BigInt(tick) * TICK_SIZE;
}

/** Exact grid conversion; reject prices between ticks rather than silently rounding. */
export function priceToTick(price: bigint): number {
  const offset = price - MIN_PRICE;
  if (offset < 0n || offset % TICK_SIZE !== 0n || offset / TICK_SIZE >= BigInt(N_TICKS)) throw new RangeError('Price must lie on the tick grid.');
  return Number(offset / TICK_SIZE);
}

export function lotsToBase(lots: bigint): bigint {
  if (lots < 0n) throw new RangeError('Lots cannot be negative.');
  return lots * LOT;
}

export function baseToLots(base: bigint): bigint {
  if (base < 0n || base % LOT !== 0n) throw new RangeError('ROSE amount must be a whole number of lots.');
  return base / LOT;
}

/** Exact fixed-point text. Values never pass through floating-point arithmetic. */
export function formatUnits(value: bigint, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw new RangeError('Unsupported decimals.');
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const scale = 10n ** BigInt(decimals);
  const whole = absolute / scale;
  if (decimals === 0) return `${sign}${whole}`;
  return `${sign}${whole}.${(absolute % scale).toString().padStart(decimals, '0')}`;
}

export function formatRose(base: bigint): string { return `${formatUnits(base, 18)} ROSE`; }
export function formatDusd(quote: bigint): string { return `${formatUnits(quote, QUOTE_DECIMALS)} dUSD`; }
