import live from "../../../contracts/bench/out/live-testnet.json";
import spike from "../../../contracts/bench/out/spike.json";
import bench from "../../../packages/core/src/bench.json";
import gasBounds from "../../../packages/core/src/gas.json";
import { addresses } from "../../../packages/core/src/addresses";

/**
 * Read-only view over benchmark files produced by scripts in this repo.
 * Nothing here is computed from assumptions: a value that is missing or
 * malformed in the source file is reported as absent.
 */
export interface StorageScenario {
  key: string;
  label: string;
  /** Gas under MonadNine (before MIP-8). */
  before: number;
  /** Gas under MonadTen (after MIP-8). */
  after: number;
}

const SCENARIO_LABELS: Record<string, string> = {
  contiguous512: "512 contiguous reads",
  scattered512: "512 mapping reads",
  onePage32: "32 reads, one page",
  fourPages32: "32 reads, four pages",
  writeOnePage64: "64 existing-slot writes, one page",
  writeSeparatePages64: "64 existing-slot writes, separate pages",
};

function validGas(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

const before = spike.profiles.pre_mip8;
const after = spike.profiles.default;
const beforeGas: Record<string, unknown> = before.gas;
const afterGas: Record<string, unknown> = after.gas;

export const storageScenarios: StorageScenario[] = Object.entries(SCENARIO_LABELS).flatMap(([key, label]) => {
  const beforeValue = beforeGas[key];
  const afterValue = afterGas[key];
  return validGas(beforeValue) && validGas(afterValue)
    ? [{ key, label, before: beforeValue, after: afterValue }]
    : [];
});

export const storageProvenance = {
  measuredAt: spike.measuredAt,
  forgeVersion: spike.forgeVersion.split("\n")[0].replace(/^forge Version:\s*/, ""),
  beforeHardfork: before.hardfork,
  afterHardfork: after.hardfork,
  bytecodeSha256: after.runtimeBytecodeSha256,
  sameBytecode: before.runtimeBytecodeSha256 === after.runtimeBytecodeSha256,
  sourceFile: "contracts/bench/out/spike.json",
};

export const pendingMeasurements = {
  auctionClearingMeasured: bench.status === "measured" && bench.auctionClearing !== null,
  gasBoundsMeasured: gasBounds.status === "measured" && gasBounds.bounds !== null,
  liveTestnetPassed: spike.liveTestnet.status === "passed" && live.status === "passed",
  liveTestnetReason: spike.liveTestnet.reason,
};

export interface LiveComparison {
  key: string;
  label: string;
  localGas: number;
  liveGas: number;
  /** Explorer link for the measuring transaction, when the evidence has a well-formed one. */
  txHash: string | null;
  explorerUrl: string | null;
}

// Evidence names each measuring transaction by action, not by scenario key.
const SCENARIO_ACTIONS: Record<string, string> = {
  contiguous512: "readContiguous512",
  scattered512: "readScattered512",
  onePage32: "readContiguous32OnePage",
  fourPages32: "readContiguous32FourPages",
  writeOnePage64: "write64OnePage",
  writeSeparatePages64: "write64SeparatePages",
};

const TX_HASH = /^0x[0-9a-f]{64}$/;
const EXPLORER_TX_PREFIX = "https://testnet.monadvision.com/tx/";

/** Only link out when the URL is exactly the known explorer plus this transaction's hash. */
function safeExplorerUrl(hash: string, url: unknown): string | null {
  return TX_HASH.test(hash) && url === `${EXPLORER_TX_PREFIX}${hash}` ? url : null;
}

const successfulTransactions = live.transactions.filter((tx) => tx.status === "success");

export const liveComparisons: LiveComparison[] = live.comparisons.flatMap((row) => {
  const label = SCENARIO_LABELS[row.scenario];
  if (!label || !validGas(row.localGas) || !validGas(row.liveGas)) return [];
  const tx = successfulTransactions.find((candidate) => candidate.action === SCENARIO_ACTIONS[row.scenario]);
  const explorerUrl = tx ? safeExplorerUrl(tx.hash, tx.explorerUrl) : null;
  return [{ key: row.scenario, label, localGas: row.localGas, liveGas: row.liveGas, txHash: tx && TX_HASH.test(tx.hash) ? tx.hash : null, explorerUrl }];
});

const deployTx = successfulTransactions.find((tx) => tx.action === "deploy");

export const liveEvidence = {
  passed: pendingMeasurements.liveTestnetPassed,
  chainId: live.chainId,
  address: /^0x[0-9a-fA-F]{40}$/.test(live.address) ? live.address : null,
  measuredAt: live.measuredAt,
  verifiedAt: live.verifiedAt,
  runtimeBytecodeSha256: live.runtimeBytecodeSha256,
  bytecodeMatchesLocal: live.bytecodeMatchesLocal === true && live.runtimeBytecodeSha256 === spike.profiles.default.runtimeBytecodeSha256,
  receiptsVerified: live.receiptsVerified === true,
  transactionCount: successfulTransactions.length,
  allTransactionsSucceeded: successfulTransactions.length === live.transactions.length,
  exactMatches: liveComparisons.filter((row) => row.localGas === row.liveGas).length,
  totalFeeMon: /^\d+(\.\d+)?$/.test(live.totalChargedFeeMon) ? live.totalChargedFeeMon : null,
  deployExplorerUrl: deployTx ? safeExplorerUrl(deployTx.hash, deployTx.explorerUrl) : null,
  sourceFile: "contracts/bench/out/live-testnet.json",
};

export const deployments = [
  { chain: "Monad mainnet", chainId: 143, deployment: addresses[143] },
  { chain: "Monad testnet", chainId: 10143, deployment: addresses[10143] },
];
