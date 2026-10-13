import { createPublicClient, erc20Abi, formatUnits, http, parseAbi, parseUnits, type Address } from "viem";
import { networkConfig } from "@/lib/network/status";

export type Side = "buy" | "sell";

/** Immutable parameters of one deployed market, read from the contract. */
export interface MarketParams {
  base: Address;
  quote: Address;
  baseSymbol: string;
  quoteSymbol: string;
  baseDecimals: number;
  quoteDecimals: number;
  nTicks: number;
  minPrice: bigint;
  tickSize: bigint;
  lot: bigint;
}

const paramViews = parseAbi([
  "function BASE() view returns (address)",
  "function QUOTE() view returns (address)",
  "function N_TICKS() view returns (uint16)",
  "function MIN_PRICE() view returns (uint256)",
  "function TICK_SIZE() view returns (uint256)",
  "function LOT() view returns (uint256)",
]);

// The contract prices one whole BASE token (1e18 units) regardless of decimals.
const PRICE_SCALE = BigInt(10) ** BigInt(18);
const MAX_LOTS = (BigInt(1) << BigInt(64)) - BigInt(1);

let cached: Promise<MarketParams> | null = null;

/** Reads the configured market's parameters once per page; a failed read is retried. */
export function loadMarketParams(): Promise<MarketParams> {
  const { rpcUrl, expectedChainId, marketAddress } = networkConfig;
  if (!rpcUrl || expectedChainId === null || !marketAddress) {
    return Promise.reject(new Error("No auction contract is configured."));
  }

  cached ??= (async () => {
    const client = createPublicClient({ transport: http(rpcUrl, { timeout: 8_000, retryCount: 0 }) });
    if ((await client.getChainId()) !== expectedChainId) throw new Error("The RPC endpoint is on the wrong chain.");

    const market = { address: marketAddress, abi: paramViews } as const;
    const [base, quote, nTicks, minPrice, tickSize, lot] = await Promise.all([
      client.readContract({ ...market, functionName: "BASE" }),
      client.readContract({ ...market, functionName: "QUOTE" }),
      client.readContract({ ...market, functionName: "N_TICKS" }),
      client.readContract({ ...market, functionName: "MIN_PRICE" }),
      client.readContract({ ...market, functionName: "TICK_SIZE" }),
      client.readContract({ ...market, functionName: "LOT" }),
    ]);
    const [baseSymbol, baseDecimals, quoteSymbol, quoteDecimals] = await Promise.all([
      client.readContract({ address: base, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address: base, abi: erc20Abi, functionName: "decimals" }),
      client.readContract({ address: quote, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address: quote, abi: erc20Abi, functionName: "decimals" }),
    ]);
    return { base, quote, baseSymbol, quoteSymbol, baseDecimals, quoteDecimals, nTicks, minPrice, tickSize, lot };
  })().catch((error: unknown) => {
    cached = null;
    throw error;
  });
  return cached;
}

const DECIMAL = /^\d+(\.\d+)?$/;

function parseAmount(value: string, decimals: number): bigint | null {
  const trimmed = value.trim();
  if (!DECIMAL.test(trimmed)) return null;
  const fraction = trimmed.split(".")[1] ?? "";
  // More decimals than the token has would be silently rounded by parseUnits.
  if (fraction.length > decimals) return null;
  return parseUnits(trimmed, decimals);
}

export function tickPrice(params: MarketParams, tick: number): bigint {
  return params.minPrice + BigInt(tick) * params.tickSize;
}

export type Conversion<T> = { ok: true; value: T } | { ok: false; reason: string };

/** Exact price -> tick. Prices between ticks are rejected, never rounded. */
export function priceToTick(params: MarketParams, price: string): Conversion<number> {
  const units = parseAmount(price, params.quoteDecimals);
  if (units === null) return { ok: false, reason: "Enter a price as a plain number." };
  const maxPrice = tickPrice(params, params.nTicks - 1);
  const fmt = (value: bigint) => `${formatUnits(value, params.quoteDecimals)} ${params.quoteSymbol}`;
  if (units < params.minPrice || units > maxPrice) {
    return { ok: false, reason: `Price must be between ${fmt(params.minPrice)} and ${fmt(maxPrice)}.` };
  }
  const offset = units - params.minPrice;
  if (offset % params.tickSize !== BigInt(0)) {
    const below = units - (offset % params.tickSize);
    return { ok: false, reason: `Price must be on the tick grid: ${fmt(below)} or ${fmt(below + params.tickSize)}.` };
  }
  return { ok: true, value: Number(offset / params.tickSize) };
}

/** Exact quantity -> whole lots. Partial lots are rejected, never rounded. */
export function quantityToLots(params: MarketParams, quantity: string): Conversion<bigint> {
  const units = parseAmount(quantity, params.baseDecimals);
  if (units === null) return { ok: false, reason: "Enter a quantity as a plain number." };
  if (units === BigInt(0)) return { ok: false, reason: "Quantity must be more than zero." };
  if (units % params.lot !== BigInt(0)) {
    return { ok: false, reason: `Quantity must be a multiple of ${formatUnits(params.lot, params.baseDecimals)} ${params.baseSymbol}.` };
  }
  const lots = units / params.lot;
  if (lots > MAX_LOTS) return { ok: false, reason: "Quantity is too large." };
  return { ok: true, value: lots };
}

/** What the contract locks when the order is placed: QUOTE for a buy (rounded up), BASE for a sell. */
export function escrowFor(params: MarketParams, side: Side, tick: number, lots: bigint): bigint {
  const baseUnits = lots * params.lot;
  if (side === "sell") return baseUnits;
  const product = baseUnits * tickPrice(params, tick);
  return product / PRICE_SCALE + (product % PRICE_SCALE === BigInt(0) ? BigInt(0) : BigInt(1));
}

/** Token amount -> units for a withdrawal. */
export function parseTokenAmount(value: string, decimals: number): bigint | null {
  const units = parseAmount(value, decimals);
  return units !== null && units > BigInt(0) ? units : null;
}
