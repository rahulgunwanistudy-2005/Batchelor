"use client";

import { useState } from "react";
import { LogOut, Wallet } from "lucide-react";
import { connectWallet, disconnectWallet, isWrongChain, switchToExpectedChain, useWallet } from "@/lib/wallet/useWallet";

/**
 * Connects a browser wallet for identification only. Nothing in this
 * component, or anywhere else in this build, requests a signature or
 * sends a transaction.
 */
export function WalletButton() {
  const wallet = useWallet();
  const [choosing, setChoosing] = useState(false);
  const error = wallet.error && <span className="wallet-error" role="alert">{wallet.error}</span>;

  if (wallet.status === "checking") {
    return <button className="connect-button" type="button" disabled>Wallet</button>;
  }

  if (wallet.status === "no-provider") {
    return (
      <button className="connect-button" type="button" disabled title="No browser wallet was detected. Install a wallet extension, then reload.">
        No wallet found
      </button>
    );
  }

  if (wallet.status !== "connected" || !wallet.address) {
    const mustChoose = wallet.wallets.length > 1;

    return (
      <div className="wallet-control">
        {error}
        <button
          className="connect-button"
          type="button"
          disabled={wallet.status === "connecting"}
          aria-expanded={mustChoose ? choosing : undefined}
          onClick={() => (mustChoose ? setChoosing((open) => !open) : void connectWallet())}
        >
          <Wallet size={13} /> {wallet.status === "connecting" ? "Check your wallet…" : "Connect wallet"}
        </button>
        {mustChoose && choosing && (
          <ul className="wallet-menu" aria-label="Choose a wallet">
            {wallet.wallets.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  onClick={() => {
                    setChoosing(false);
                    void connectWallet(option.id);
                  }}
                >
                  {option.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const shortAddress = `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`;

  return (
    <div className="wallet-control">
      {error}
      {isWrongChain(wallet) && (
        <button className="connect-button connect-button--warn" type="button" onClick={() => void switchToExpectedChain()}>
          Switch network
        </button>
      )}
      <span className="wallet-address" title={`${wallet.address} — connected for display only; trading is not enabled.`}>
        {shortAddress}
      </span>
      <button className="icon-button" type="button" aria-label="Disconnect wallet" title="Disconnect wallet" onClick={disconnectWallet}>
        <LogOut size={14} />
      </button>
    </div>
  );
}
