"use client";

import { useEffect, useState } from "react";
import { createPublicClient, hexToBytes, isAddress } from "viem";
import { networkConfig, rpcTransport } from "@/lib/network/status";

type CheckState = "checking" | "match" | "mismatch" | "no-code" | "unavailable" | "skipped";

interface LiveBytecodeCheckProps {
  address: string;
  chainId: number;
  expectedSha256: string;
}

const TEXT: Record<CheckState, { tone: string; label: string }> = {
  checking: { tone: "pending", label: "Checking the chain from your browser…" },
  match: { tone: "ok", label: "Checked from your browser just now: the deployed bytecode matches the recorded hash." },
  mismatch: { tone: "error", label: "The bytecode at this address does not match the recorded hash." },
  "no-code": { tone: "error", label: "No contract bytecode was found at this address." },
  unavailable: { tone: "off", label: "Could not reach the RPC endpoint to re-check the bytecode." },
  skipped: { tone: "off", label: "Not re-checked: this build is not configured for the evidence's chain." },
};

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Re-verifies the recorded evidence instead of trusting it: asks the RPC
 * for the benchmark contract's bytecode and compares its SHA-256 with the
 * hash stored in the repository.
 */
export function LiveBytecodeCheck({ address, chainId, expectedSha256 }: LiveBytecodeCheckProps) {
  const [state, setState] = useState<CheckState>("checking");

  useEffect(() => {
    let active = true;
    const { rpcUrl, expectedChainId } = networkConfig;

    async function check(): Promise<CheckState> {
      if (!rpcUrl || expectedChainId !== chainId || !isAddress(address)) return "skipped";
      try {
        const client = createPublicClient({ transport: rpcTransport() });
        if ((await client.getChainId()) !== chainId) return "skipped";
        const code = await client.getCode({ address });
        if (!code || code === "0x") return "no-code";
        return (await sha256Hex(new Uint8Array(hexToBytes(code)))) === expectedSha256.toLowerCase() ? "match" : "mismatch";
      } catch {
        return "unavailable";
      }
    }

    void check().then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, [address, chainId, expectedSha256]);

  const { tone, label } = TEXT[state];

  return (
    <p className="live-check" role="status">
      <span className={`system-dot system-dot--${tone}`} aria-hidden="true" />
      {label}
    </p>
  );
}
