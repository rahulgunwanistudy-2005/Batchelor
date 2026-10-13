import { createPublicClient, erc20Abi, formatUnits, parseAbi, type Address } from "viem";
import { networkConfig, rpcTransport } from "@/lib/network/status";

export interface AccountBalances {
  base: { symbol: string; amount: string };
  quote: { symbol: string; amount: string };
}

export type BalancesResult =
  | { status: "unconfigured" }
  | { status: "error" }
  | { status: "ready"; balances: AccountBalances };

// Only the views this module needs; signatures match contracts/src/BatchAuction.sol.
const auctionViews = parseAbi([
  "function BASE() view returns (address)",
  "function QUOTE() view returns (address)",
  "function balances(address who) view returns (uint256 base, uint256 quote)",
]);

/**
 * Balances the trader holds INSIDE the auction contract (deposited funds),
 * not their wallet's token balances. Read-only; never sends a transaction.
 */
export async function readAccountBalances(trader: Address): Promise<BalancesResult> {
  const { rpcUrl, expectedChainId, marketAddress } = networkConfig;
  if (!rpcUrl || expectedChainId === null || !marketAddress) return { status: "unconfigured" };

  try {
    const client = createPublicClient({ transport: rpcTransport({ batch: { wait: 10 } }) });
    if ((await client.getChainId()) !== expectedChainId) return { status: "error" };

    const auction = { address: marketAddress, abi: auctionViews } as const;
    const [base, quote, [baseAmount, quoteAmount]] = await Promise.all([
      client.readContract({ ...auction, functionName: "BASE" }),
      client.readContract({ ...auction, functionName: "QUOTE" }),
      client.readContract({ ...auction, functionName: "balances", args: [trader] }),
    ]);
    const [baseSymbol, baseDecimals, quoteSymbol, quoteDecimals] = await Promise.all([
      client.readContract({ address: base, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address: base, abi: erc20Abi, functionName: "decimals" }),
      client.readContract({ address: quote, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address: quote, abi: erc20Abi, functionName: "decimals" }),
    ]);

    return {
      status: "ready",
      balances: {
        base: { symbol: baseSymbol, amount: formatUnits(baseAmount, baseDecimals) },
        quote: { symbol: quoteSymbol, amount: formatUnits(quoteAmount, quoteDecimals) },
      },
    };
  } catch {
    return { status: "error" };
  }
}
