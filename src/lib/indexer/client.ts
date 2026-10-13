import { createIndexerClient } from "../../../apps/web/src/lib/api/graphql";
import { networkConfig } from "@/lib/network/status";

export { IndexerError, type BatchReceipt, type IndexedOrder } from "../../../apps/web/src/lib/api/graphql";

/**
 * The Envio HyperIndex client, shared with the web app in apps/web so both
 * frontends run the same validated queries. Null until an endpoint, a
 * supported chain and a market address are all configured.
 */
export const indexer = (() => {
  const { indexerUrl, expectedChainId, marketAddress } = networkConfig;
  if (!indexerUrl || !marketAddress || (expectedChainId !== 143 && expectedChainId !== 10143)) return null;
  return createIndexerClient({ endpoint: indexerUrl, chainId: expectedChainId, market: marketAddress });
})();
