import { useWallet } from "@/lib/wallet/useWallet";
import { tradingBlocker } from "./actions";

/** Re-evaluates the trading gate whenever the wallet state changes. */
export function useTradingBlocker(): string | null {
  const wallet = useWallet();
  if (wallet.status === "checking") return "Checking for a wallet…";
  return tradingBlocker();
}
