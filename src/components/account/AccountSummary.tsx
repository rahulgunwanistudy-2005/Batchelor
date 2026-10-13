"use client";

import { useEffect, useId, useState } from "react";
import { readAccountBalances, type BalancesResult } from "@/lib/account/balances";
import { networkConfig } from "@/lib/network/status";
import { dripFaucet, withdraw } from "@/lib/trading/actions";
import { loadMarketParams, parseTokenAmount, type MarketParams } from "@/lib/trading/params";
import { useTradingBlocker } from "@/lib/trading/useTradingBlocker";
import { useTransaction } from "@/lib/trading/useTransaction";
import { isWrongChain, useWallet } from "@/lib/wallet/useWallet";
import { TxStatus } from "@/components/trading/TxStatus";

const REFRESH_MS = 10_000;

/** Account panel: the connected wallet and its deposited balances, read from the contract. */
export function AccountSummary() {
  const wallet = useWallet();
  const address = wallet.status === "connected" ? wallet.address : null;
  const [result, setResult] = useState<{ for: string; value: BalancesResult } | null>(null);
  const id = useId();
  const blocker = useTradingBlocker();
  const { state, run, busy } = useTransaction();
  const [params, setParams] = useState<MarketParams | null>(null);
  const [token, setToken] = useState<"base" | "quote">("quote");
  const [amount, setAmount] = useState("");
  const [successText, setSuccessText] = useState("Done.");

  useEffect(() => {
    let live = true;
    loadMarketParams().then(
      (loaded) => { if (live) setParams(loaded); },
      () => { if (live) setParams(null); },
    );
    return () => { live = false; };
  }, []);

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
  }, [address, state.phase]);

  const decimals = params ? (token === "base" ? params.baseDecimals : params.quoteDecimals) : null;
  const units = decimals !== null && amount.trim() !== "" ? parseTokenAmount(amount, decimals) : null;
  const amountError = amount.trim() !== "" && units === null ? "Enter a positive amount with no more decimals than the token has." : null;
  const hasFaucet = networkConfig.faucetAddress !== null;

  const submitWithdraw = async () => {
    if (!params || units === null) return;
    setSuccessText("Withdrawn to your wallet.");
    const done = await run((onPhase) => withdraw(token === "base" ? params.base : params.quote, units, onPhase));
    if (done !== undefined) setAmount("");
  };

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
    <section className="panel" aria-labelledby="account-title">
      <div className="panel-heading">
        <div>
          <h2 id="account-title">Account</h2>
          <p className="panel-subtitle">Balances held inside the auction contract, ready to trade</p>
        </div>
      </div>
      <dl className="proof-facts">
        <div><dt>Wallet</dt><dd className={wallet.address ? "proof-hash" : undefined}>{walletText}</dd></div>
        {wallet.status === "connected" && (
          <div><dt>Wallet network</dt><dd>{isWrongChain(wallet) ? `Wrong network (chain ID ${wallet.chainId ?? "unknown"})` : `Chain ID ${wallet.chainId ?? "unknown"}`}</dd></div>
        )}
        <div><dt>{params?.baseSymbol ?? "Base"} balance</dt><dd>{balances ? `${balances.base.amount} ${balances.base.symbol}` : "—"}</dd></div>
        <div><dt>{params?.quoteSymbol ?? "Quote"} balance</dt><dd>{balances ? `${balances.quote.amount} ${balances.quote.symbol}` : "—"}</dd></div>
      </dl>
      <p className="panel-footnote" role="status">{note}</p>

      <form
        className="account-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submitWithdraw();
        }}
      >
        <label className="field-label" htmlFor={`${id}-amount`}>Withdraw to your wallet</label>
        <div className="account-row">
          <select aria-label="Token to withdraw" value={token} onChange={(event) => setToken(event.target.value === "base" ? "base" : "quote")}>
            <option value="quote">{params?.quoteSymbol ?? "Quote"}</option>
            <option value="base">{params?.baseSymbol ?? "Base"}</option>
          </select>
          <div className={`input-shell ${amountError ? "input-shell--error" : ""}`}>
            <input
              id={`${id}-amount`}
              inputMode="decimal"
              autoComplete="off"
              maxLength={40}
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-invalid={amountError !== null}
            />
          </div>
          <button className="connect-button" type="submit" disabled={blocker !== null || busy || units === null}>Withdraw</button>
        </div>
        {amountError && <p className="field-error">{amountError}</p>}
        <div className="account-row">
          <button
            className="connect-button"
            type="button"
            disabled={blocker !== null || busy || !hasFaucet}
            title={hasFaucet ? "Credits demo tokens to your deposited balance, once per address per 24 hours" : "No faucet address is configured"}
            onClick={() => {
              setSuccessText("Demo tokens credited to your deposited balance.");
              void run((onPhase) => dripFaucet(onPhase));
            }}
          >
            {hasFaucet ? "Get demo tokens" : "Faucet not configured"}
          </button>
        </div>
        <TxStatus state={state} success={successText} />
        <p className="fine-print">
          {blocker ?? "The faucet credits demo tokens straight to your balance here, once per address every 24 hours."}
        </p>
      </form>
    </section>
  );
}
