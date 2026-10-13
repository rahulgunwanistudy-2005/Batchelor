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
  liveTestnetStatus: spike.liveTestnet.status,
  liveTestnetReason: spike.liveTestnet.reason,
};

export const deployments = [
  { chain: "Monad mainnet", chainId: 143, deployment: addresses[143] },
  { chain: "Monad testnet", chainId: 10143, deployment: addresses[10143] },
];
