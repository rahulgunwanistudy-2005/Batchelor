import { useCallback, useRef, useState } from "react";
import type { Hash } from "viem";
import { describeTxError, type PhaseListener, type TxPhase } from "./actions";

export type TxState =
  | { phase: "idle" }
  | { phase: TxPhase; hash?: Hash }
  | { phase: "confirmed"; hash?: Hash }
  | { phase: "failed"; message: string; hash?: Hash };

export const TX_PHASE_TEXT: Record<TxPhase, string> = {
  checking: "Checking the transaction…",
  wallet: "Approve it in your wallet…",
  pending: "Sent. Waiting for confirmation…",
};

/** Tracks one transaction at a time for a control; ignores a second click while one is running. */
export function useTransaction() {
  const [state, setState] = useState<TxState>({ phase: "idle" });
  const running = useRef(false);

  const run = useCallback(async <T,>(action: (onPhase: PhaseListener) => Promise<T>): Promise<T | undefined> => {
    if (running.current) return undefined;
    running.current = true;
    let lastHash: Hash | undefined;
    try {
      const result = await action((phase, hash) => {
        lastHash = hash ?? lastHash;
        setState({ phase, hash: lastHash });
      });
      setState({ phase: "confirmed", hash: lastHash });
      return result;
    } catch (error) {
      setState({ phase: "failed", message: describeTxError(error), hash: lastHash });
      return undefined;
    } finally {
      running.current = false;
    }
  }, []);

  const busy = state.phase === "checking" || state.phase === "wallet" || state.phase === "pending";
  return { state, run, busy };
}
