import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  http,
  parseEventLogs,
  UserRejectedRequestError,
  type Address,
  type Hash,
} from "viem";
import { batchAuctionAbi, faucetAbi } from "../../../packages/core/src/abi";
import gasLimits from "../../../packages/core/src/gas.json";
import { networkConfig } from "@/lib/network/status";
import { getWalletSession } from "@/lib/wallet/useWallet";
import type { Side } from "./params";

/**
 * Wallet transactions against the auction contract.
 *
 * Every function here runs only from an explicit user action, simulates
 * the call first so a doomed transaction never reaches the wallet, and
 * then needs the user's approval in their wallet. Trading is limited to
 * Monad testnet: nothing in this module will send on any other chain.
 */
export const TESTNET_CHAIN_ID = 10143;

export type TxPhase = "checking" | "wallet" | "pending";
export type PhaseListener = (phase: TxPhase, hash?: Hash) => void;

export class TradingError extends Error {}

// Monad bills the declared gas limit, so every call sends a measured bound (packages/core/src/gas.json).
export const GAS = {
  place: BigInt(gasLimits.placeSelfClear),
  cancel: BigInt(gasLimits.cancel),
  claimOne: BigInt(gasLimits.claim1),
  claimMany: BigInt(gasLimits.claim50),
  clear: BigInt(gasLimits.clear),
  drip: BigInt(gasLimits.drip),
  withdraw: BigInt(gasLimits.withdraw),
} as const;

export const MAX_CLAIM = 50;

/** Why trading is unavailable right now, or null when a transaction may be attempted. */
export function tradingBlocker(): string | null {
  const { rpcUrl, expectedChainId, marketAddress } = networkConfig;
  if (!marketAddress || !rpcUrl || expectedChainId === null) return "No auction contract is configured.";
  if (expectedChainId !== TESTNET_CHAIN_ID) return "Trading is enabled on Monad testnet only.";
  const session = getWalletSession();
  if (!session) return "Connect a wallet to trade.";
  if (session.chainId !== expectedChainId) return "Switch your wallet to Monad testnet to trade.";
  return null;
}

function context() {
  const blocker = tradingBlocker();
  const session = getWalletSession();
  const { rpcUrl, expectedChainId, marketAddress } = networkConfig;
  if (blocker || !session || !rpcUrl || expectedChainId === null || !marketAddress) {
    throw new TradingError(blocker ?? "Trading is unavailable.");
  }

  const chain = defineChain({
    id: expectedChainId,
    name: "Monad Testnet",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  return {
    account: session.address,
    market: marketAddress,
    reader: createPublicClient({ chain, transport: http(rpcUrl, { timeout: 10_000, retryCount: 0 }) }),
    wallet: createWalletClient({ account: session.address, chain, transport: custom(session.provider) }),
  };
}

type Ctx = ReturnType<typeof context>;

const REVERT_MESSAGES: Record<string, string> = {
  Insufficient: "Not enough deposited balance for this.",
  BatchSealed: "This batch is already sealed; it can no longer be changed.",
  NotOpenBatch: "That order's batch is no longer open.",
  BadTick: "That price is outside the market's range.",
  BadSide: "Unknown order side.",
  ZeroLots: "Quantity must be more than zero.",
  NotOwner: "This order belongs to a different account.",
  AlreadyClaimed: "This order has already been claimed.",
  BadOrder: "That order does not exist.",
  Overflow: "That quantity is too large for this price level.",
  Cooldown: "The faucet was already used for this address in the last 24 hours.",
  UnsupportedToken: "That token is not part of this market.",
};

/** A short, honest sentence for any failure in the send path. */
export function describeTxError(error: unknown): string {
  if (error instanceof TradingError) return error.message;
  if (error instanceof BaseError) {
    if (error.walk((cause) => cause instanceof UserRejectedRequestError)) return "You rejected the request in your wallet.";
    const revert = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      return (name && REVERT_MESSAGES[name]) || `The contract rejected this transaction${name ? ` (${name})` : ""}.`;
    }
    if (/insufficient funds|reserve balance/i.test(error.message)) return "This wallet does not have enough MON to pay the network fee.";
  }
  return "The transaction could not be sent. Check your connection and wallet, then try again.";
}

async function confirm(ctx: Ctx, hash: Hash, onPhase: PhaseListener) {
  onPhase("pending", hash);
  const receipt = await ctx.reader.waitForTransactionReceipt({ hash, pollingInterval: 1_000, timeout: 60_000 });
  if (receipt.status !== "success") throw new TradingError("The transaction was included but reverted.");
  return receipt;
}

export interface PlacedOrder {
  orderId: string;
  batchId: string;
  hash: Hash;
}

export async function placeOrder(side: Side, tick: number, lots: bigint, onPhase: PhaseListener): Promise<PlacedOrder> {
  const ctx = context();
  const call = {
    address: ctx.market,
    abi: batchAuctionAbi,
    functionName: "place",
    args: [side === "buy" ? 0 : 1, tick, lots],
    account: ctx.account,
    gas: GAS.place,
  } as const;

  onPhase("checking");
  await ctx.reader.simulateContract(call);
  onPhase("wallet");
  const hash = await ctx.wallet.writeContract(call);
  const receipt = await confirm(ctx, hash, onPhase);

  const placed = parseEventLogs({ abi: batchAuctionAbi, eventName: "OrderPlaced", logs: receipt.logs }).find(
    (log) => log.address.toLowerCase() === ctx.market.toLowerCase() && log.args.trader.toLowerCase() === ctx.account.toLowerCase(),
  );
  if (!placed) throw new TradingError("The transaction succeeded but no order was recorded in it.");
  return { orderId: placed.args.orderId.toString(), batchId: placed.args.batchId.toString(), hash };
}

export async function cancelOrder(orderId: string, onPhase: PhaseListener): Promise<Hash> {
  const ctx = context();
  const call = { address: ctx.market, abi: batchAuctionAbi, functionName: "cancel", args: [BigInt(orderId)], account: ctx.account, gas: GAS.cancel } as const;
  onPhase("checking");
  await ctx.reader.simulateContract(call);
  onPhase("wallet");
  const hash = await ctx.wallet.writeContract(call);
  await confirm(ctx, hash, onPhase);
  return hash;
}

export async function claimOrders(orderIds: string[], onPhase: PhaseListener): Promise<Hash> {
  if (orderIds.length === 0 || orderIds.length > MAX_CLAIM) throw new TradingError(`Claim between 1 and ${MAX_CLAIM} orders at a time.`);
  const ctx = context();
  const call = {
    address: ctx.market,
    abi: batchAuctionAbi,
    functionName: "claim",
    args: [orderIds.map((id) => BigInt(id))],
    account: ctx.account,
    gas: orderIds.length === 1 ? GAS.claimOne : GAS.claimMany,
  } as const;
  onPhase("checking");
  await ctx.reader.simulateContract(call);
  onPhase("wallet");
  const hash = await ctx.wallet.writeContract(call);
  await confirm(ctx, hash, onPhase);
  return hash;
}

/** Permissionless: clears the open batch if it is sealed, and does nothing otherwise. */
export async function clearBatch(onPhase: PhaseListener): Promise<Hash> {
  const ctx = context();
  const call = { address: ctx.market, abi: batchAuctionAbi, functionName: "clear", account: ctx.account, gas: GAS.clear } as const;
  onPhase("checking");
  await ctx.reader.simulateContract(call);
  onPhase("wallet");
  const hash = await ctx.wallet.writeContract(call);
  await confirm(ctx, hash, onPhase);
  return hash;
}

export async function withdraw(token: Address, amount: bigint, onPhase: PhaseListener): Promise<Hash> {
  const ctx = context();
  const call = { address: ctx.market, abi: batchAuctionAbi, functionName: "withdraw", args: [token, amount], account: ctx.account, gas: GAS.withdraw } as const;
  onPhase("checking");
  await ctx.reader.simulateContract(call);
  onPhase("wallet");
  const hash = await ctx.wallet.writeContract(call);
  await confirm(ctx, hash, onPhase);
  return hash;
}

/** Asks the demo faucet to credit this account's balance inside the auction contract. */
export async function dripFaucet(onPhase: PhaseListener): Promise<Hash> {
  const ctx = context();
  const faucet = networkConfig.faucetAddress;
  if (!faucet) throw new TradingError("No faucet is configured for this market.");
  const call = { address: faucet, abi: faucetAbi, functionName: "drip", args: [ctx.account], account: ctx.account, gas: GAS.drip } as const;
  onPhase("checking");
  await ctx.reader.simulateContract(call);
  onPhase("wallet");
  const hash = await ctx.wallet.writeContract(call);
  await confirm(ctx, hash, onPhase);
  return hash;
}

/** Explorer link for a transaction on the chains this build can send on. */
export function explorerTxUrl(hash: Hash): string | null {
  return networkConfig.expectedChainId === TESTNET_CHAIN_ID ? `https://testnet.monadvision.com/tx/${hash}` : null;
}
