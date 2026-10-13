"use client";

import type { NetworkStatusResult } from "@/lib/network/status";
import { useSystemStatus } from "@/lib/network/useSystemStatus";

const CHAIN_NAMES: Record<number, string> = {
  143: "Monad",
  10143: "Monad testnet",
};

export function describeNetwork(result: NetworkStatusResult): { label: string; detail: string } {
  switch (result.state) {
    case "connecting":
      return { label: "Connecting", detail: "Checking the configured RPC endpoint." };
    case "connected":
      return {
        label: "RPC connected",
        detail: `RPC endpoint reports chain ID ${result.reportedChainId}. This does not confirm a deployed market or that trading is available.`,
      };
    case "wrong-chain":
      return {
        label: "Wrong chain",
        detail: `RPC endpoint reports chain ID ${result.reportedChainId}; expected ${result.expectedChainId}.`,
      };
    case "unavailable":
      return { label: "RPC unavailable", detail: "The configured RPC endpoint did not respond." };
    case "unconfigured":
      return {
        label: "Not configured",
        detail: "Set NEXT_PUBLIC_CHAIN_ID and NEXT_PUBLIC_RPC_URL to enable the network check.",
      };
  }
}

export function NetworkStatus() {
  const { network: result } = useSystemStatus();

  const { label, detail } = describeNetwork(result);
  const chainName =
    result.expectedChainId === null
      ? "Network"
      : (CHAIN_NAMES[result.expectedChainId] ?? `Chain ${result.expectedChainId}`);

  return (
    <span className="network-pill" role="status" title={detail} aria-label={`${chainName}: ${label}. ${detail}`}>
      <span className={`network-dot network-dot--${result.state}`} aria-hidden="true" />
      {chainName} <span className="network-env">{label}</span>
    </span>
  );
}
