"use client";

import type { DeploymentStatusResult } from "@/lib/network/status";
import { useSystemStatus } from "@/lib/network/useSystemStatus";
import { isWrongChain, useWallet, type WalletState } from "@/lib/wallet/useWallet";
import type { DataStatus } from "@/types/market";
import { useTradingBlocker } from "@/lib/trading/useTradingBlocker";
import { describeNetwork } from "./NetworkStatus";

type Tone = "ok" | "pending" | "warn" | "error" | "off";

interface Row {
  name: string;
  tone: Tone;
  label: string;
  detail: string;
}

function describeDeployment(result: DeploymentStatusResult): Omit<Row, "name"> {
  switch (result.state) {
    case "unconfigured":
      return { tone: "off", label: "Not configured", detail: "No market contract address is set." };
    case "pending":
      return { tone: "pending", label: "Waiting", detail: "Checked once the RPC endpoint is confirmed on the expected chain." };
    case "code-found":
      return { tone: "warn", label: "Code found", detail: "Bytecode exists at the configured address. It has not been verified as the auction contract." };
    case "no-code":
      return { tone: "error", label: "No contract", detail: "No bytecode exists at the configured address on this chain." };
    case "unavailable":
      return { tone: "error", label: "Check failed", detail: "The RPC endpoint did not answer the bytecode request." };
  }
}

function describeWallet(wallet: WalletState): Omit<Row, "name"> {
  if (wallet.status === "checking") return { tone: "pending", label: "Checking", detail: "Looking for a browser wallet." };
  if (wallet.status === "no-provider") return { tone: "off", label: "No wallet found", detail: "No browser wallet was detected." };
  if (wallet.status === "connecting") return { tone: "pending", label: "Connecting", detail: "Waiting for approval in the wallet." };
  if (wallet.status === "disconnected") return { tone: "off", label: "Not connected", detail: "No wallet account is connected." };
  if (isWrongChain(wallet)) {
    return { tone: "warn", label: "Wrong network", detail: `The wallet is on chain ID ${wallet.chainId ?? "unknown"}, not the expected chain.` };
  }
  return { tone: "ok", label: "Connected", detail: "An account is connected for display only. This does not enable trading." };
}

function describeTrading(blocker: string | null): Omit<Row, "name"> {
  return blocker === null
    ? { tone: "ok", label: "Testnet, by approval", detail: "Orders can be sent on Monad testnet. Each one needs your approval in the wallet." }
    : { tone: "off", label: "Unavailable", detail: blocker };
}

const NETWORK_TONES = {
  connecting: "pending",
  connected: "ok",
  "wrong-chain": "warn",
  unavailable: "error",
  unconfigured: "off",
} as const satisfies Record<string, Tone>;

const FEED: Record<DataStatus, Omit<Row, "name" | "detail">> = {
  live: { tone: "ok", label: "Live" },
  loading: { tone: "pending", label: "Loading" },
  unavailable: { tone: "off", label: "Not connected" },
  error: { tone: "error", label: "Error" },
};

interface SystemStatusProps {
  feedStatus: DataStatus;
  feedMessage?: string;
  /** Whether a chain, RPC and market address are configured for contract reads. */
  readsConfigured: boolean;
  /** Outcome of the latest order-book read from the contract. */
  readsStatus: DataStatus;
}

function describeReads(configured: boolean, status: DataStatus): Omit<Row, "name"> {
  if (!configured) return { tone: "off", label: "Not configured", detail: "No market contract address is set, so nothing is read from a contract." };
  if (status === "live") return { tone: "ok", label: "Reading", detail: "The order book and batch results are read from the configured contract." };
  if (status === "error") return { tone: "error", label: "Read failed", detail: "The configured contract could not be read. It may not be the auction contract." };
  return { tone: "pending", label: "Waiting", detail: "No contract read has completed yet." };
}

/**
 * Six independent readiness checks. A green row never implies the rows
 * below it: a reachable RPC says nothing about deployment, data or trading.
 */
export function SystemStatus({ feedStatus, feedMessage, readsConfigured, readsStatus }: SystemStatusProps) {
  const { network, deployment } = useSystemStatus();
  const networkText = describeNetwork(network);
  const wallet = useWallet();
  const blocker = useTradingBlocker();

  const rows: Row[] = [
    { name: "RPC connection", tone: NETWORK_TONES[network.state], ...networkText },
    { name: "Contract deployment", ...describeDeployment(deployment) },
    { name: "Contract reads", ...describeReads(readsConfigured, readsStatus) },
    { name: "Price history feed", ...FEED[feedStatus], detail: feedMessage ?? "Status reported by the market-data adapter." },
    { name: "Wallet", ...describeWallet(wallet) },
    { name: "Transactions", ...describeTrading(blocker) },
  ];

  return (
    <section className="panel system-status" aria-label="System status">
      <div className="panel-heading">
        <div>
          <h2>System status</h2>
          <p className="panel-subtitle">Each check is independent</p>
        </div>
      </div>
      <ul className="system-status-list">
        {rows.map((row) => (
          <li key={row.name} title={row.detail}>
            <span className={`system-dot system-dot--${row.tone}`} aria-hidden="true" />
            <span className="system-name">{row.name}</span>
            <span className="system-label">{row.label}</span>
            <span className="sr-only">{row.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
