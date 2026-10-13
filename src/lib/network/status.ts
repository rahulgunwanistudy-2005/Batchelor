import { createPublicClient, http, isAddress, type Address } from "viem";

export type NetworkState =
  | "connecting"
  | "connected"
  | "wrong-chain"
  | "unavailable"
  | "unconfigured";

export interface NetworkStatusResult {
  state: NetworkState;
  expectedChainId: number | null;
  /** Chain ID reported by the RPC endpoint, when it answered. */
  reportedChainId: number | null;
}

export type DeploymentState =
  | "unconfigured"
  | "pending"
  | "code-found"
  | "no-code"
  | "unavailable";

export interface DeploymentStatusResult {
  state: DeploymentState;
  address: Address | null;
}

const RPC_TIMEOUT_MS = 8_000;

function parseChainId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value.trim())) return null;
  const chainId = Number(value.trim());
  return Number.isSafeInteger(chainId) && chainId > 0 ? chainId : null;
}

function parseRpcUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseAddress(value: string | undefined): Address | null {
  const trimmed = value?.trim();
  return trimmed && isAddress(trimmed) ? trimmed : null;
}

export const networkConfig = {
  expectedChainId: parseChainId(process.env.NEXT_PUBLIC_CHAIN_ID),
  rpcUrl: parseRpcUrl(process.env.NEXT_PUBLIC_RPC_URL),
  /** Unset until a real deployment exists; never defaulted. */
  marketAddress: parseAddress(process.env.NEXT_PUBLIC_MARKET_ADDRESS),
};

function rpcClient(rpcUrl: string) {
  return createPublicClient({
    transport: http(rpcUrl, { timeout: RPC_TIMEOUT_MS, retryCount: 0 }),
  });
}

/**
 * Asks the configured RPC endpoint for its chain ID. A "connected" result
 * establishes RPC reachability and chain identity only; it says nothing
 * about contract deployment, market data or trading.
 */
export async function checkNetworkStatus(): Promise<NetworkStatusResult> {
  const { expectedChainId, rpcUrl } = networkConfig;

  if (expectedChainId === null || rpcUrl === null) {
    return { state: "unconfigured", expectedChainId, reportedChainId: null };
  }

  try {
    const reportedChainId = await rpcClient(rpcUrl).getChainId();

    return {
      state: reportedChainId === expectedChainId ? "connected" : "wrong-chain",
      expectedChainId,
      reportedChainId,
    };
  } catch {
    return { state: "unavailable", expectedChainId, reportedChainId: null };
  }
}

/**
 * Checks whether contract bytecode exists at the configured market address.
 * Call only after the chain ID has been confirmed. "code-found" means some
 * contract is deployed there; it does not prove it is the auction contract
 * or that its functions work.
 */
export async function checkDeploymentStatus(): Promise<DeploymentStatusResult> {
  const { rpcUrl, marketAddress: address } = networkConfig;

  if (address === null) return { state: "unconfigured", address };
  if (rpcUrl === null) return { state: "pending", address };

  try {
    const code = await rpcClient(rpcUrl).getCode({ address });
    return { state: code && code !== "0x" ? "code-found" : "no-code", address };
  } catch {
    return { state: "unavailable", address };
  }
}
