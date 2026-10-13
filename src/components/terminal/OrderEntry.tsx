"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { formatUnits } from "viem";
import { readAccountBalances, type AccountBalances } from "@/lib/account/balances";
import { GAS, placeOrder } from "@/lib/trading/actions";
import { saveLocalOrder } from "@/lib/trading/orders";
import { escrowFor, loadMarketParams, priceToTick, quantityToLots, type MarketParams, type Side } from "@/lib/trading/params";
import { useTradingBlocker } from "@/lib/trading/useTradingBlocker";
import { useTransaction } from "@/lib/trading/useTransaction";
import { useWallet } from "@/lib/wallet/useWallet";
import { TxStatus } from "@/components/trading/TxStatus";

interface OrderEntryProps {
  baseAsset?: string;
  quoteAsset?: string;
}

const gasFormat = new Intl.NumberFormat("en-US");

/**
 * Order ticket. Places a single-batch limit order from the connected
 * wallet, on Monad testnet only. Nothing is sent without a click here
 * and an approval in the wallet.
 */
export function OrderEntry({ baseAsset = "BASE", quoteAsset = "QUOTE" }: OrderEntryProps) {
  const id = useId();
  const router = useRouter();
  const wallet = useWallet();
  const blocker = useTradingBlocker();
  const { state, run, busy } = useTransaction();
  const [side, setSide] = useState<Side>("buy");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [params, setParams] = useState<MarketParams | null>(null);
  const [balances, setBalances] = useState<{ for: string; value: AccountBalances } | null>(null);
  const [placedBatch, setPlacedBatch] = useState<string | null>(null);

  const address = wallet.status === "connected" ? wallet.address : null;
  const confirmedCount = state.phase === "confirmed" ? state.hash : null;

  useEffect(() => {
    let active = true;
    loadMarketParams().then(
      (loaded) => { if (active) setParams(loaded); },
      () => { if (active) setParams(null); },
    );
    return () => { active = false; };
  }, []);

  // Deposited balances for the connected account; re-read after each confirmed order.
  useEffect(() => {
    if (!address) return;
    let active = true;
    void readAccountBalances(address).then((result) => {
      if (active && result.status === "ready") setBalances({ for: address, value: result.balances });
    });
    return () => { active = false; };
  }, [address, confirmedCount]);

  const tick = params && price.trim() !== "" ? priceToTick(params, price) : null;
  const lots = params && quantity.trim() !== "" ? quantityToLots(params, quantity) : null;
  const priceError = tick && !tick.ok ? tick.reason : null;
  const quantityError = lots && !lots.ok ? lots.reason : null;
  const ready = params !== null && tick?.ok === true && lots?.ok === true;
  const escrow = ready ? escrowFor(params, side, tick.value, lots.value) : null;
  const escrowText = escrow !== null && params
    ? side === "buy"
      ? `${formatUnits(escrow, params.quoteDecimals)} ${params.quoteSymbol}`
      : `${formatUnits(escrow, params.baseDecimals)} ${params.baseSymbol}`
    : null;

  const mine = address && balances?.for === address ? balances.value : null;
  const available = mine ? (side === "buy" ? `${mine.quote.amount} ${mine.quote.symbol}` : `${mine.base.amount} ${mine.base.symbol}`) : "—";
  const base = params?.baseSymbol ?? baseAsset;
  const quote = params?.quoteSymbol ?? quoteAsset;

  const submit = async () => {
    if (!ready || !address) return;
    setPlacedBatch(null);
    const placed = await run((onPhase) => placeOrder(side, tick.value, lots.value, onPhase));
    if (!placed) return;
    saveLocalOrder(address, {
      orderId: placed.orderId,
      batchId: placed.batchId,
      side,
      tick: tick.value,
      lots: lots.value.toString(),
      hash: placed.hash,
      placedAt: Date.now(),
    });
    setPlacedBatch(placed.batchId);
    setQuantity("");
    router.refresh();
  };

  return (
    <form
      className="panel order-entry"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="panel-heading">
        <div>
          <h2>Place order</h2>
          <p className="panel-subtitle">Limit order · one batch</p>
        </div>
        {blocker && <span className="status status--unavailable"><LockKeyhole size={12} /> Not enabled</span>}
      </div>
      <div className="segmented" role="group" aria-label="Order side">
        <button type="button" className={side === "buy" ? "segmented--buy" : undefined} aria-pressed={side === "buy"} onClick={() => setSide("buy")}>Buy</button>
        <button type="button" className={side === "sell" ? "segmented--sell" : undefined} aria-pressed={side === "sell"} onClick={() => setSide("sell")}>Sell</button>
      </div>

      <label className="field-label" htmlFor={`${id}-price`}>Limit price</label>
      <div className={`input-shell ${priceError ? "input-shell--error" : ""}`}>
        <input
          id={`${id}-price`}
          inputMode="decimal"
          autoComplete="off"
          maxLength={32}
          placeholder="0.00"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          aria-invalid={priceError !== null}
          aria-describedby={priceError ? `${id}-price-error` : undefined}
        />
        <span>{quote}</span>
      </div>
      {priceError && <p className="field-error" id={`${id}-price-error`}>{priceError}</p>}

      <label className="field-label" htmlFor={`${id}-quantity`}>Quantity</label>
      <div className={`input-shell ${quantityError ? "input-shell--error" : ""}`}>
        <input
          id={`${id}-quantity`}
          inputMode="decimal"
          autoComplete="off"
          maxLength={32}
          placeholder="0.00"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          aria-invalid={quantityError !== null}
          aria-describedby={quantityError ? `${id}-quantity-error` : undefined}
        />
        <span>{base}</span>
      </div>
      {quantityError && <p className="field-error" id={`${id}-quantity-error`}>{quantityError}</p>}

      <div className="order-summary">
        <div>
          <span>{side === "buy" ? "You'll pay at most" : "You'll sell at most"}</span>
          <strong>{escrowText ?? "—"}</strong>
        </div>
        <div><span>Available (deposited)</span><strong>{available}</strong></div>
        <div><span>Network fee</span><strong>charged on {gasFormat.format(GAS.place)} gas</strong></div>
      </div>
      <button className="primary-button" type="submit" disabled={blocker !== null || !ready || busy}>
        {busy ? "Working…" : `Place ${side} order`}
      </button>
      <TxStatus state={state} success={placedBatch ? `Order placed in batch #${placedBatch}. It clears with the next transaction after the batch seals.` : "Order placed."} />
      <p className="fine-print">
        {blocker ?? "Testnet demo tokens only. The amount shown is locked when you place the order; anything unfilled is returned when you claim."}
      </p>
    </form>
  );
}
