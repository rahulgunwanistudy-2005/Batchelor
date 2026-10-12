# Batchelor HyperIndex

HyperIndex **3.14.0** indexes placements, cancellations, clearing and claims. The app reads receipts, recent batches, trader history and live clearing-gas statistics through GraphQL; these views do not call `eth_getLogs`.

## Local development

Use the repository's Node 24 / pnpm 9 toolchain. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @batchelor/indexer typecheck
pnpm --filter @batchelor/indexer test
pnpm --filter @batchelor/indexer cloud:check
```

Tests use Envio's actual `createTestIndexer().process({ chains: { ... simulate } })`, with a separate fixture-only config. Register handlers through the configured handler file; importing it manually again registers duplicate handlers in v3. Explicit simulated block ranges keep the progress handler from processing empty history before the fixture.

`config.yaml` is deliberately inactive: no market address is invented. Supply `CHAIN`, `RPC_HTTP`, `MARKET_ADDRESS`, and the exact deployment `START_BLOCK` in the root `.env`, then:

```sh
pnpm --filter @batchelor/indexer configure
pnpm --filter @batchelor/indexer dev
```

Configuration checks the RPC chain, contract code at the deployment block and its absence in the prior block, plus `LOT`, `MIN_PRICE`, `TICK_SIZE` and `BATCH_BLOCKS`. The settlement adapter supports the demo deployment parameters; it rejects a different market. It generates an ignored `config.generated.yaml`; start/dev require that file. Local HyperSync needs `ENVIO_API_TOKEN` in the **indexer's** `.env` or process environment, and local database development needs Docker. The root `.env` is read by configure/verify only. Cloud manages HyperSync access itself.

Envio's names are `monad` / `monad-testnet`, with endpoints `https://monad.hypersync.xyz` / `https://monad-testnet.hypersync.xyz`. The verified v3 configs use numeric chain IDs **143 / 10143**.

## Model and settlement

- IDs include chain, market and the contract's numeric ID. Trader IDs additionally include the lowercased address. This prevents collisions across deployments.
- `Batch.orderCount` matches the contract's active count, excluding cancellations; `placedCount` includes every placement. Relayed count and fee summaries include all placements. Medians are per order, including repeated observations from a `placeMany` transaction; an even median uses the integer floor of the two middle values.
- Placement fee metadata uses paid `effectiveGasPrice - baseFeePerGas`, preserving the maximum priority cap separately. Missing or impossible paid metadata stops indexing.
- Clearing loads all orders by `batch_id`, applies the shared bigint settlement port with independent base and quote rounding, and persists transfers before claims. Cancelled orders remain visible with zero fills and terminal `claimed = true`, matching Solidity. Final claims must match predicted transfers and store their transaction hash.
- `Trader.volumeBase` accumulates exact base transfers before `volumeLots` is rounded down to whole lots. Each trader's volume includes both buy and sell turnover; summing trader turnover counts both sides of a trade. `Order.filledLots` floors that order's base transfer; use baseIn/baseOut for fractional fills.
- `SyncState` tracks every processed block, including blocks without market events. This avoids mistaking an idle market for a stalled indexer. Reorg rollback is enabled.

## Envio Cloud

Cloud only uploads the configured Indexer Directory; parent-folder workspace imports are unavailable. The standalone `indexer/cloud/` directory contains generated handler sources and an exact copy of the canonical shared settlement module. `cloud:check` verifies source hashes in CI. No independent settlement implementation is maintained.

After configure succeeds:

```sh
pnpm --filter @batchelor/indexer cloud:prepare -- --deployment
pnpm --filter @batchelor/indexer cloud:check
```

Review and commit the activated `indexer/cloud/config.yaml` with its verified public address/start block, then push the intended deployment commit when authorized. Set Cloud's Indexer Directory to `indexer/cloud`, configuration to `config.yaml`, and tier to development. The committed package pins Envio and TypeScript; it has no workspace dependencies. The current Cloud config is inactive, so it cannot index an unrelated contract accidentally.

Use the actual GraphQL endpoint shown by the deployed Cloud project. It is **not** the HyperSync endpoint. Set `ENVIO_GRAPHQL_URL` in the root audit environment, and set these variables in `apps/web/.env` or the hosted web environment:

```text
PUBLIC_ENVIO_GRAPHQL_URL=<actual GraphQL endpoint>
PUBLIC_CHAIN=mainnet or testnet
PUBLIC_MARKET_ADDRESS=<same verified market>
```

The Cloud account/project, mainnet deployment, hosted endpoint and hosted acceptance evidence remain unconfigured in this checkout.

## Live acceptance audit

```sh
# Root .env: CHAIN, RPC_HTTP, MARKET_ADDRESS, ENVIO_GRAPHQL_URL
VERIFY_BATCH_IDS=1,2,3 pnpm --filter @batchelor/indexer verify
```

This read-only audit checks every sampled placement against its receipt/log/block, compares contract clearing results and every noncancelled fill across three batches, requires three distinct placement transactions, and measures 20 sync-lag samples. It writes ignored `indexer/rehearsal.json` with full receipts and measured lag. RPC reads are paced to at most eight requests per second. No private key, send method or `eth_getLogs` is used.

Historical previews at the clearing block are used even after later claims. If an order was claimed in that very block, `previewFill` is zero; the audit instead checks the indexed final claim against its actual receipt. The report distinguishes preview comparisons from claim comparisons and sets `allOrdersPreviewed = false`; this is not claimed as the strict all-orders-preview acceptance gate. Lag is a conservative upper bound using block timestamps, request elapsed time, and a one-second timestamp-quantization margin. Hosted rehearsal must still pass `< 5 s`.

Optional real-chain regression:

```sh
pnpm --filter @batchelor/indexer test:chain
```

It fetches the project's existing S3 testnet placement/clearing receipts, replays them through the real Envio handlers in memory, and checks all 256 orders against historical contract previews. It produces public evidence in `indexer/evidence/testnet-replay.json`. This verifies real event/settlement compatibility; it does **not** establish hosted sync, three-batch acceptance or mainnet readiness.

## Sample GraphQL query

```graphql
query Receipt($market: String!, $id: numeric!) {
  Batch(where: {chainId: {_eq: 143}, market: {_eq: $market}, batchId: {_eq: $id}}) {
    batchId clearTick price volumeLots clearGas
    orders(order_by: [{txIndex: asc}, {logIndex: asc}]) {
      orderId txHash txIndex priorityFeePerGas baseIn baseOut quoteIn quoteOut
    }
  }
}
```

The typed app client scopes every query to the selected chain and market, validates responses with zod, preserves large integers, distinguishes unavailable/missing/partially synced data, and fetches all order pages for a receipt. Trader history is bounded and accepts offset pagination; statistics cover the last requested number of cleared batches (maximum 500). A hosted query/response sample will come from the live audit; no hosted response is fabricated.

Sources: [configuration](https://docs.envio.dev/docs/HyperIndex/config-schema-reference), [handlers](https://docs.envio.dev/docs/HyperIndex/event-handlers), [testing](https://docs.envio.dev/docs/HyperIndex/testing), [Cloud requirements](https://docs.envio.dev/docs/HyperIndex/envio-cloud-troubleshooting), [Cloud CLI](https://docs.envio.dev/docs/HyperIndex/envio-cloud-cli).
