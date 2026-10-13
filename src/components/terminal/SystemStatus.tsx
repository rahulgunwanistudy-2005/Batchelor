"use client";

import { useSystemStatus } from "@/lib/network/useSystemStatus";
import { useTradingBlocker } from "@/lib/trading/useTradingBlocker";
import { isWrongChain, useWallet, type WalletState } from "@/lib/wallet/useWallet";
import type { DataStatus } from "@/types/market";
import { describeNetwork } from "./NetworkStatus";

type Tone = "ok" | "pending" | "warn" | "error" | "off";

interface Row {
  name: string;
  tone: Tone;
  label: string;
  detail: string;
}

const NETWORK_TONES = {
  connecting: "pending",
  connected: "ok",
  "wrong-chain": "warn",
  unavailable: "error",
  unconfigured: "off",
} as const satisfies Record<string, Tone>;

function describeReads(configured: boolean, status: DataStatus): Omit<Row, "name"> {
  if (!configured) return { tone: "off", label: "No market configured", detail: "No market contract address is set, so nothing is read from a contract." };
  if (status === "live") return { tone: "ok", label: "From the contract", detail: "The order book and batch results are read from the configured contract." };
  if (status === "error") return { tone: "error", label: "Read failed", detail: "The configured contract could not be read." };
  return { tone: "pending", label: "Waiting", detail: "No contract read has completed yet." };
}

function describeWallet(wallet: WalletState): Omit<Row, "name"> {
  if (wallet.status === "checking") return { tone: "pending", label: "Checking", detail: "Looking for a browser wallet." };
  if (wallet.status === "no-provider") return { tone: "off", label: "None found", detail: "No browser wallet was detected." };
  if (wallet.status === "connecting") return { tone: "pending", label: "Connecting", detail: "Waiting for approval in the wallet." };
  if (wallet.status === "disconnected") return { tone: "off", label: "Not connected", detail: "No wallet account is connected." };
  if (isWrongChain(wallet)) return { tone: "warn", label: "Wrong network", detail: `The wallet is on chain ID ${wallet.chainId ?? "unknown"}, not the expected chain.` };
  return { tone: "ok", label: "Connected", detail: "An account is connected." };
}

function describeTrading(blocker: string | null): Omit<Row, "name"> {
  return blocker === null
    ? { tone: "ok", label: "Testnet, by approval", detail: "Orders can be sent on Monad testnet. Each one needs your approval in the wallet." }
    : { tone: "off", label: "Unavailable", detail: blocker };
}

interface SystemStatusProps {
  /** Whether a chain, RPC and market address are configured for contract reads. */
  readsConfigured: boolean;
  /** Outcome of the latest order-book read from the contract. */
  readsStatus: DataStatus;
}

/**
 * Four independent checks in one line. A green item never implies the next:
 * a reachable network says nothing about market data, a wallet or trading.
 */
export function SystemStatus({ readsConfigured, readsStatus }: SystemStatusProps) {
  const { network } = useSystemStatus();
  const wallet = useWallet();
  const blocker = useTradingBlocker();

  const rows: Row[] = [
    { name: "Network", tone: NETWORK_TONES[network.state], ...describeNetwork(network) },
    { name: "Market data", ...describeReads(readsConfigured, readsStatus) },
    { name: "Wallet", ...describeWallet(wallet) },
    { name: "Trading", ...describeTrading(blocker) },
  ];

  return (
    <ul className="system-status-list" aria-label="System status">
      {rows.map((row) => (
        <li key={row.name} title={row.detail}>
          <span className={`system-dot system-dot--${row.tone}`} aria-hidden="true" />
          <span>{row.name}</span>
          <span className="system-label">{row.label}</span>
          <span className="sr-only">{row.detail}</span>
        </li>
      ))}
    </ul>
  );
}
