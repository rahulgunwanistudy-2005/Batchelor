import { explorerTxUrl } from "@/lib/trading/actions";
import { TX_PHASE_TEXT, type TxState } from "@/lib/trading/useTransaction";

/** One line of honest feedback for a transaction: what is happening, or what went wrong. */
export function TxStatus({ state, success }: { state: TxState; success: string }) {
  if (state.phase === "idle") return null;

  const text =
    state.phase === "confirmed" ? success : state.phase === "failed" ? state.message : TX_PHASE_TEXT[state.phase];
  const tone = state.phase === "confirmed" ? "ok" : state.phase === "failed" ? "error" : "pending";
  const url = state.hash ? explorerTxUrl(state.hash) : null;

  return (
    <p className={`tx-status tx-status--${tone}`} role={state.phase === "failed" ? "alert" : "status"}>
      {text}
      {url && <> <a href={url} target="_blank" rel="noopener noreferrer">View transaction<span className="sr-only"> (opens the block explorer)</span></a></>}
    </p>
  );
}
