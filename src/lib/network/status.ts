import { createPublicClient, fallback, http, isAddress, type Address, type HttpTransportConfig, type Transport } from "viem";

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

/** One or more endpoints, comma-separated, in order of preference. Invalid entries are dropped. */
function parseRpcUrls(value: string | undefined): string[] {
  return (value ?? "").split(",").flatMap((entry) => parseRpcUrl(entry) ?? []);
}

const publicRpcUrls = parseRpcUrls(process.env.NEXT_PUBLIC_RPC_URL);
// Server-only endpoints (for example a keyed provider URL) never reach the browser bundle.
const serverRpcUrls = typeof window === "undefined" ? parseRpcUrls(process.env.RPC_URL) : [];

export const networkConfig = {
  expectedChainId: parseChainId(process.env.NEXT_PUBLIC_CHAIN_ID),
  /** The first public endpoint; null when none is configured. */
  rpcUrl: publicRpcUrls[0] ?? null,
  rpcUrls: publicRpcUrls,
  /** Optional Envio HyperIndex GraphQL endpoint for order history and receipts. */
  indexerUrl: parseRpcUrl(process.env.NEXT_PUBLIC_ENVIO_GRAPHQL_URL),
  /** Unset until a real deployment exists; never defaulted. */
  marketAddress: parseAddress(process.env.NEXT_PUBLIC_MARKET_ADDRESS),
  /** Optional demo-token faucet for the market above. */
  faucetAddress: parseAddress(process.env.NEXT_PUBLIC_FAUCET_ADDRESS),
};

/**
 * Transport over every configured endpoint. With more than one, a failed
 * request moves on to the next endpoint instead of failing the read.
 * On the server, RPC_URL endpoints are tried before the public ones.
 */
export function rpcTransport(options: HttpTransportConfig = {}): Transport {
  const urls = [...serverRpcUrls, ...publicRpcUrls];
  if (urls.length === 0) throw new Error("No RPC endpoint is configured.");
  const transports = urls.map((url) => http(url, { timeout: RPC_TIMEOUT_MS, retryCount: 0, ...options }));
  return transports.length === 1 ? transports[0] : fallback(transports, { rank: false });
}

function rpcClient() {
  return createPublicClient({ transport: rpcTransport() });
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
    const reportedChainId = await rpcClient().getChainId();

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
    const code = await rpcClient().getCode({ address });
    return { state: code && code !== "0x" ? "code-found" : "no-code", address };
  } catch {
    return { state: "unavailable", address };
  }
}
