import { useSyncExternalStore } from "react";
import {
  checkDeploymentStatus,
  checkNetworkStatus,
  networkConfig,
  type DeploymentStatusResult,
  type NetworkStatusResult,
} from "./status";

export interface SystemStatus {
  network: NetworkStatusResult;
  deployment: DeploymentStatusResult;
}

const RECHECK_INTERVAL_MS = 30_000;

const initialStatus: SystemStatus = {
  network: {
    state: "connecting",
    expectedChainId: networkConfig.expectedChainId,
    reportedChainId: null,
  },
  deployment: {
    state: networkConfig.marketAddress === null ? "unconfigured" : "pending",
    address: networkConfig.marketAddress,
  },
};

// One poller shared by every subscriber, so components never duplicate RPC calls.
let current = initialStatus;
let generation = 0;
let timer: number | undefined;
const listeners = new Set<() => void>();

async function refresh() {
  const run = ++generation;
  const network = await checkNetworkStatus();
  // Bytecode at an address only means something on the expected chain.
  const deployment =
    network.state === "connected" ? await checkDeploymentStatus() : initialStatus.deployment;

  if (run !== generation) return;
  current = { network, deployment };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    void refresh();
    timer = window.setInterval(() => void refresh(), RECHECK_INTERVAL_MS);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.clearInterval(timer);
      generation += 1;
    }
  };
}

export function useSystemStatus(): SystemStatus {
  return useSyncExternalStore(subscribe, () => current, () => initialStatus);
}
