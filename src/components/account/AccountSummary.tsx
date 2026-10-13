"use client";

import { useEffect, useState } from "react";
import { readAccountBalances, type BalancesResult } from "@/lib/account/balances";
import { networkConfig } from "@/lib/network/status";
import { isWrongChain, useWallet } from "@/lib/wallet/useWallet";

const REFRESH_MS = 10_000;

/** Account panel: the connected wallet and its deposited balances, read from the contract. */
export function AccountSummary() {
  const wallet = useWallet();
  const address = wallet.status === "connected" ? wallet.address : null;
  const [result, setResult] = useState<{ for: string; value: BalancesResult } | null>(null);

  useEffect(() => {
    if (!address) return;
    let active = true;

    const load = () => {
      void readAccountBalances(address).then((value) => {
        if (active) setResult({ for: address, value });
      });
    };
    load();
    const interval = window.setInterval(load, REFRESH_MS);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [address]);

  let walletText = "Not connected";
  if (wallet.status === "checking") walletText = "Checking";
  else if (wallet.status === "no-provider") walletText = "No wallet found";
  else if (wallet.status === "connecting") walletText = "Waiting for approval";
  else if (wallet.address) walletText = wallet.address;

  // A result for a previously connected address is never shown for the current one.
  const current = address && result?.for === address ? result.value : null;
  const configured = networkConfig.marketAddress !== null;

  let note = "Connect a wallet to see the balances it has deposited in the auction contract.";
  if (!configured) note = "Balances cannot be read: no auction contract address is configured.";
  else if (address && !current) note = "Reading balances from the auction contract…";
  else if (current?.status === "error") note = "The auction contract could not be read. Balances are unavailable.";
  else if (current?.status === "ready") note = "Deposited balances, read from the auction contract. Wallet token balances are not shown.";

  const balances = current?.status === "ready" ? current.balances : null;

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Account</h2>
          <p className="panel-subtitle">Balances held inside the auction contract</p>
        </div>
      </div>
      <dl className="proof-facts">
        <div><dt>Wallet</dt><dd className={wallet.address ? "proof-hash" : undefined}>{walletText}</dd></div>
        {wallet.status === "connected" && (
          <div><dt>Wallet network</dt><dd>{isWrongChain(wallet) ? `Wrong network (chain ID ${wallet.chainId ?? "unknown"})` : `Chain ID ${wallet.chainId ?? "unknown"}`}</dd></div>
        )}
        <div><dt>Base balance</dt><dd className="proof-hash">{balances ? `${balances.base.amount} ${balances.base.symbol}` : "—"}</dd></div>
        <div><dt>Quote balance</dt><dd className="proof-hash">{balances ? `${balances.quote.amount} ${balances.quote.symbol}` : "—"}</dd></div>
      </dl>
      <div className="account-actions">
        <button className="connect-button" type="button" disabled title="Transactions are not enabled in this build">Deposit unavailable</button>
        <button className="connect-button" type="button" disabled title="Transactions are not enabled in this build">Withdraw unavailable</button>
      </div>
      <p className="panel-footnote" style={{ marginBottom: 10 }} role="status">{note}</p>
    </section>
  );
}
