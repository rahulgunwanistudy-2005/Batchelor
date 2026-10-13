"use client";

import { isWrongChain, useWallet } from "@/lib/wallet/useWallet";

/** Account panel. Balances stay unavailable until contract reads exist. */
export function AccountSummary() {
  const wallet = useWallet();

  let walletText = "Not connected";
  if (wallet.status === "checking") walletText = "Checking";
  else if (wallet.status === "no-provider") walletText = "No wallet found";
  else if (wallet.status === "connecting") walletText = "Waiting for approval";
  else if (wallet.address) walletText = wallet.address;

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
        <div><dt>Base balance</dt><dd>—</dd></div>
        <div><dt>Quote balance</dt><dd>—</dd></div>
        <div><dt>In open orders</dt><dd>—</dd></div>
      </dl>
      <div className="account-actions">
        <button className="connect-button" type="button" disabled title="Needs a deployed, verified auction contract">Deposit unavailable</button>
        <button className="connect-button" type="button" disabled title="Needs a deployed, verified auction contract">Withdraw unavailable</button>
      </div>
      <p className="panel-footnote" style={{ marginBottom: 10 }}>Balances cannot be read yet: no auction contract is deployed. A connected wallet identifies you only.</p>
    </section>
  );
}
