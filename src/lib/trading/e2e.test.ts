import { createPublicClient, createWalletClient, http, parseAbi, parseEther, type Address, type EIP1193Provider, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * End-to-end trading test: the terminal's real action functions, with real
 * signatures and real transactions, against a live chain.
 *
 * Skipped unless E2E_RPC_URL is set. Two ways to run it:
 *
 *   Tenderly Virtual TestNet (no real funds; the test funds its own accounts):
 *     E2E_RPC_URL=<virtual testnet admin RPC> E2E_MARKET=0x… E2E_FAUCET=0x… pnpm terminal:test
 *
 *   Real Monad testnet (two throwaway keys that already hold testnet MON):
 *     E2E_RPC_URL=https://testnet-rpc.monad.xyz E2E_MARKET=0x… E2E_FAUCET=0x… \
 *     E2E_BUYER_PK=0x… E2E_SELLER_PK=0x… pnpm terminal:test
 *
 * It refuses any chain other than Monad testnet (10143) or a fork of it.
 */
const RPC = process.env.E2E_RPC_URL;
const MARKET = process.env.E2E_MARKET as Address | undefined;
const FAUCET = process.env.E2E_FAUCET as Address | undefined;
const enabled = Boolean(RPC && MARKET && FAUCET);

const views = parseAbi([
  "function balances(address who) view returns (uint256 base, uint256 quote)",
  "function openBatch() view returns ((uint64 id, uint64 startBlock, uint16 bidMin, uint16 bidMax, uint16 askMin, uint16 askMax, uint32 orderCount, bool hasOpen))",
  "function result(uint64 id) view returns ((uint16 clearTick, uint16 buyCutoff, uint16 sellCutoff, uint64 volumeLots, uint64 clearedAt, uint32 clearGas, uint64 rB, uint64 mB, uint64 rS, uint64 mS))",
  "function BASE() view returns (address)",
]);

// The wallet the terminal sees. Tests switch `active` to act as the buyer or the seller.
const session: { active: { provider: EIP1193Provider; address: Address; chainId: number } | null } = { active: null };
vi.mock("@/lib/wallet/useWallet", () => ({ getWalletSession: () => session.active }));

describe.skipIf(!enabled)("trading end to end", () => {
  // The suite body still runs when skipped, so the client needs some URL even then.
  const reader = createPublicClient({ transport: http(RPC ?? "http://127.0.0.1:1") });
  const buyer = privateKeyToAccount((process.env.E2E_BUYER_PK as Hex | undefined) ?? generatePrivateKey());
  const seller = privateKeyToAccount((process.env.E2E_SELLER_PK as Hex | undefined) ?? generatePrivateKey());
  let actions: typeof import("./actions");

  /** A wallet provider backed by a local key: signs for real, exactly as an extension would after approval. */
  function walletFor(account: typeof buyer) {
    const client = createWalletClient({ account, transport: http(RPC) });
    const provider = {
      request: async ({ method, params }: { method: string; params?: unknown[] }) => {
        if (method === "eth_chainId") return "0x279f";
        if (method === "eth_accounts" || method === "eth_requestAccounts") return [account.address];
        if (method === "eth_sendTransaction") {
          const tx = (params as [{ to: Address; data: Hex; gas?: Hex; value?: Hex }])[0];
          return client.sendTransaction({ chain: null, to: tx.to, data: tx.data, gas: tx.gas ? BigInt(tx.gas) : undefined, value: tx.value ? BigInt(tx.value) : undefined });
        }
        return reader.request({ method, params } as never);
      },
      on: () => {},
      removeListener: () => {},
    } as unknown as EIP1193Provider;
    return { provider, address: account.address, chainId: 10143 };
  }

  const phases = () => () => {};
  const balancesOf = (who: Address) => reader.readContract({ address: MARKET!, abi: views, functionName: "balances", args: [who] });

  beforeAll(async () => {
    expect(await reader.getChainId(), "this test only runs on Monad testnet or a fork of it").toBe(10143);
    process.env.NEXT_PUBLIC_CHAIN_ID = "10143";
    process.env.NEXT_PUBLIC_RPC_URL = RPC;
    process.env.NEXT_PUBLIC_MARKET_ADDRESS = MARKET;
    process.env.NEXT_PUBLIC_FAUCET_ADDRESS = FAUCET;
    actions = await import("./actions");

    // On a Tenderly Virtual TestNet the test funds its own throwaway accounts; on real testnet the keys must hold MON.
    if (!process.env.E2E_BUYER_PK) {
      await reader.request({ method: "tenderly_setBalance", params: [[buyer.address, seller.address], `0x${parseEther("20").toString(16)}`] } as never);
    }
    for (const account of [buyer, seller]) {
      expect(await reader.getBalance({ address: account.address }), `${account.address} needs MON for fees`).toBeGreaterThan(parseEther("1"));
    }
  }, 120_000);

  it("drips, crosses a buy and a sell, clears, claims and withdraws", async () => {
    // 1. Faucet credits both accounts inside the auction contract.
    for (const account of [buyer, seller]) {
      session.active = walletFor(account);
      const [base] = await balancesOf(account.address);
      if (base === BigInt(0)) await actions.dripFaucet(phases());
      const [afterBase, afterQuote] = await balancesOf(account.address);
      expect(afterBase).toBeGreaterThan(BigInt(0));
      expect(afterQuote).toBeGreaterThan(BigInt(0));
    }

    // 2. A sell at tick 100 and a buy at tick 104 for the same 10 lots cross.
    session.active = walletFor(seller);
    const sell = await actions.placeOrder("sell", 100, BigInt(10), phases());
    session.active = walletFor(buyer);
    const [, quoteBefore] = await balancesOf(buyer.address);
    const buy = await actions.placeOrder("buy", 104, BigInt(10), phases());
    expect(buy.batchId).toBe(sell.batchId);

    // 3. Anyone may clear once the batch has sealed (one block later).
    await vi.waitFor(async () => {
      await actions.clearBatch(phases());
      const open = await reader.readContract({ address: MARKET!, abi: views, functionName: "openBatch" });
      expect(open.hasOpen && open.id.toString() === buy.batchId).toBe(false);
    }, { timeout: 60_000, interval: 2_000 });

    const result = await reader.readContract({ address: MARKET!, abi: views, functionName: "result", args: [BigInt(buy.batchId)] });
    expect(result.volumeLots).toBe(BigInt(10));
    expect(result.clearTick).toBeGreaterThanOrEqual(100);
    expect(result.clearTick).toBeLessThanOrEqual(104);

    // 4. Claiming credits the buyer's base and returns the unspent part of the escrow.
    const [baseBeforeClaim] = await balancesOf(buyer.address);
    await actions.claimOrders([buy.orderId], phases());
    const [baseAfterClaim, quoteAfterClaim] = await balancesOf(buyer.address);
    expect(baseAfterClaim - baseBeforeClaim).toBe(BigInt(10) * BigInt(10) ** BigInt(15));
    expect(quoteAfterClaim).toBeLessThan(quoteBefore);

    // 5. Withdrawing moves the bought base out to the wallet.
    const base = await reader.readContract({ address: MARKET!, abi: views, functionName: "BASE" });
    await actions.withdraw(base, baseAfterClaim - baseBeforeClaim, phases());
    expect((await balancesOf(buyer.address))[0]).toBe(baseBeforeClaim);
  }, 300_000);
});
