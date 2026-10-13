import { parseGwei } from 'viem';
import { transactionGas } from '../packages/core/src/gas.ts';
const ceil = (value: bigint, divisor: bigint) => (value + divisor - 1n) / divisor;
/**
 * Conservative gas-cap budget for uninterrupted six-order quoting sessions.
 * Full claims consume 50 IDs. Underfilled age flushes are allowed every nine
 * active batches, plus one idle drain per awake session. Clear reservations
 * assume a dedicated crank per active batch, even though placements self-clear.
 * Assumes empty initial backlog, no failed sends/receipts, missed quote heads,
 * cancellations or additional user orders. Those require a fresh allowance.
 */
export function keeperBudget(baseFee: bigint, moQuotes: bigint, peteOrderHeads = 0n, awakeSessions = 1n) {
  if (baseFee < 0n || moQuotes < 0n || peteOrderHeads < 0n || awakeSessions < 1n) throw new Error('Invalid keeper budget inputs.');
  const keeperOrders = 6n * moQuotes + 4n * peteOrderHeads;
  const keeperActiveBatchesMax = moQuotes + peteOrderHeads; // Deliberately overcounts overlapping Pete/Mo heads.
  const keeperClaimFullTransactionsMax = keeperOrders / 50n;
  const keeperClaimPartialTransactionsMax = keeperOrders === 0n ? 0n : ceil(keeperActiveBatchesMax, 9n) + awakeSessions;
  const keeperClaimTransactionsMax = keeperClaimFullTransactionsMax + keeperClaimPartialTransactionsMax;
  const keeperClearTransactionsMax = keeperOrders === 0n ? 0n : keeperActiveBatchesMax + awakeSessions;
  const feeCap = 2n * baseFee + parseGwei('1');
  const keeperClaimMax = keeperClaimTransactionsMax * transactionGas('claim', 50) * feeCap;
  const keeperClearMax = keeperClearTransactionsMax * transactionGas('clear') * feeCap;
  return { keeperOrders, keeperActiveBatchesMax, keeperClaimFullTransactionsMax, keeperClaimPartialTransactionsMax,
    keeperClaimTransactionsMax, keeperClearTransactionsMax, keeperClaimMax, keeperClearMax, keeperMax: keeperClaimMax + keeperClearMax };
}
export type RecordingOptions = {
  bursts?: bigint; awakeSeconds?: bigint; blockIntervalMs?: bigint; awakeSessions?: bigint; moWakeSeconds?: bigint;
};
/** Recording budget, not a live fee quote. Timing and campaign limits are explicit planning assumptions. */
export function demoBudget(baseFee: bigint, multiplier = 10n, burstBlocks = 20n, options: RecordingOptions = {}) {
  if (baseFee < 0n || multiplier < 1n || multiplier > 100n || burstBlocks < 1n || burstBlocks > 100n) throw new Error('Invalid demo budget inputs.');
  const { bursts = 3n, awakeSeconds = 600n, blockIntervalMs = 300n, awakeSessions = bursts, moWakeSeconds = 90n } = options;
  if (bursts < 1n || bursts > 10n || awakeSeconds < 1n || awakeSeconds > 3600n || blockIntervalMs < 100n || blockIntervalMs > 10000n
    || awakeSessions < 1n || awakeSessions > 100n || moWakeSeconds < 1n || moWakeSeconds > 600n) throw new Error('Invalid recording campaign settings.');
  // Pete refreshes Mo's timeout on every burst head. Budget the burst time as
  // well as each session's final timeout; visits/extra wakes need a new plan.
  const minimumAwakeSeconds = ceil(bursts * burstBlocks * blockIntervalMs, 1000n) + awakeSessions * moWakeSeconds;
  if (awakeSeconds < minimumAwakeSeconds) throw new Error(`Recording awake budget must cover at least ${minimumAwakeSeconds} seconds.`);
  const durationQuotes = ceil(awakeSeconds * 1000n, blockIntervalMs);
  // Each separately timed wake can start between heads. Round each timeout
  // independently so rounding an aggregate duration cannot undercount quotes.
  const minimumMoQuotes = bursts * burstBlocks + awakeSessions * ceil(moWakeSeconds * 1000n, blockIntervalMs);
  const moQuotes = durationQuotes > minimumMoQuotes ? durationQuotes : minimumMoQuotes;
  const petePerKeyMax = bursts * burstBlocks * transactionGas('place') * (2n + multiplier) * baseFee;
  const moMax = moQuotes * transactionGas('placeMany', 6) * (2n * baseFee + parseGwei('1'));
  const keeper = keeperBudget(baseFee, moQuotes, bursts * burstBlocks, awakeSessions);
  return { bursts, awakeSeconds, blockIntervalMs, awakeSessions, moWakeSeconds, minimumAwakeSeconds, minimumMoQuotes, moQuotes,
    petePerKeyMax, peteTotalMax: 4n * petePerKeyMax, moMax, ...keeper,
    totalBotMax: 4n * petePerKeyMax + moMax + keeper.keeperMax };
}
