"use client";

import { useId, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { formatDecimal, multiplyDecimals, parseDecimal, trimDecimal, type Decimal } from "@/lib/market-data/decimal";

type Side = "buy" | "sell";

interface OrderEntryProps {
  baseAsset?: string;
  quoteAsset?: string;
}

function parsePositive(value: string): Decimal | null {
  const parsed = parseDecimal(value);
  return parsed && parsed.units > BigInt(0) ? parsed : null;
}

function fieldError(value: string, name: string): string | null {
  if (value.trim() === "") return null;
  return parsePositive(value) ? null : `${name} must be a positive number.`;
}

/**
 * Order ticket. Inputs and the estimate work locally; nothing here can
 * submit, sign or send anything until contract integration exists.
 */
export function OrderEntry({ baseAsset = "BASE", quoteAsset = "QUOTE" }: OrderEntryProps) {
  const id = useId();
  const [side, setSide] = useState<Side>("buy");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");

  const priceError = fieldError(price, "Limit price");
  const quantityError = fieldError(quantity, "Quantity");
  const parsedPrice = parsePositive(price);
  const parsedQuantity = parsePositive(quantity);
  const total =
    parsedPrice && parsedQuantity
      ? formatDecimal(trimDecimal(multiplyDecimals(parsedPrice, parsedQuantity)))
      : null;

  return (
    <form className="panel order-entry" onSubmit={(event) => event.preventDefault()} noValidate>
      <div className="panel-heading">
        <div>
          <h2>Place order</h2>
          <p className="panel-subtitle">Limit order · one batch</p>
        </div>
        <span className="status status--unavailable"><LockKeyhole size={12} /> Not enabled</span>
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
        <span>{quoteAsset}</span>
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
        <span>{baseAsset}</span>
      </div>
      {quantityError && <p className="field-error" id={`${id}-quantity-error`}>{quantityError}</p>}

      <div className="percent-row" role="group" aria-label="Share of available balance">
        {[25, 50, 75, 100].map((percent) => (
          <button type="button" key={percent} disabled title="Needs a connected wallet balance">{percent}%</button>
        ))}
      </div>
      <div className="order-summary">
        <div>
          <span>{side === "buy" ? "Estimated cost" : "Estimated proceeds"}</span>
          <strong>{total ? `${total} ${quoteAsset}` : "—"}</strong>
        </div>
        <div><span>Available balance</span><strong>—</strong></div>
      </div>
      <button className="primary-button" type="submit" disabled>
        {side === "buy" ? "Buy" : "Sell"} unavailable
      </button>
      <p className="fine-print">
        The estimate is limit price × quantity, before the market&apos;s tick and lot rounding. Order submission is disabled until wallet, market and contract integration are configured.
      </p>
    </form>
  );
}
