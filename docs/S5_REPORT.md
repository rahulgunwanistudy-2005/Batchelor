# S5 — Indexed receipts and history

Implemented 13 Oct 2026 on the S4 repository. The supplied S5 document sets the implementation scope; the project bible supplies constraints. The user's explicit request authorizes systematic local commits, overriding the bible's historical Git prohibition. No push or new chain transaction was performed.

## Built

- Pinned Envio HyperIndex 3.14.0 workspace, v3 event field selection, schema and generated types, actual handlers for all four events and block-level progress.
- Chain/market-scoped Batch, Order and Trader records, cancellation semantics, paid priority fees, placement-weighted fee summaries, pre-claim asset transfers and independently checked final claims.
- Shared exact bigint Settle port. Foundry exports parameters and all **1,275 fills across 50 seeded books**, using the same independent-reference-checked uncrossing results as S2. Quote rounding is independent of base rounding.
- Read-only deployment configuration checks with exact deployment block and demo immutable parameters. Start/dev refuse unconfigured markets.
- Standalone Cloud package with a source manifest and CI freshness gate; no unavailable parent-folder imports or workspace dependency remains in the hosted artifact.
- Typed fetch/zod queries for one batch, recent batches, trader orders, last-N gas/volume statistics and sync progress. Complete receipt pagination, exact integers, query scope and error handling are tested.
- Web receipt table in transaction/log order, fee bars, fills, viewer highlighting, explorer links and batch facts. Indexed recent-batch links, address-based order history, and live gas statistics are wired. Unconfigured endpoints show honest unavailable states.
- Read-only hosted audit across three batches, all placement metadata, contract results/fills, three distinct transaction samples and 20 lag samples. A same-block final claim is explicitly distinguished from preview parity.

## Verified

| Check | Result |
|---|---|
| `forge fmt --check`, `forge build --sizes` | Passed; production auction remains 17,331 runtime bytes |
| `forge test` | 77 tests passed, including 1,000-run fuzz tests and 256 × 200 invariant calls; zero handler reverts |
| Final exporter test | Passed after adding parameters; golden artifact regenerated |
| Core tests | 59 passed, including 50 Foundry books with every exported fill plus independent rounding/median cases |
| Envio real mock-event tests | 7 passed: full Pete/Mo/Asha batch, all transfers, claim, cancellation, no trade, fractional cutoffs, market isolation, invalid metadata, inconsistent claims and trader-volume accumulation |
| Optional real testnet replay | Passed: all 256 noncancelled orders equal historical `previewFill`, actual receipt metadata replayed, clearGas 213,565 |
| Web GraphQL tests | 6 passed: exact uint64 quantities, query scope, >1,000-order pagination, missing/partial data, bad fees, GraphQL/transport errors, statistics and input limits |
| Existing bot/tooling regressions | 26 bot tests and 3 deployment-tool tests passed |
| Workspace typecheck / lint / build | Passed; Svelte reports zero errors and warnings; production Vercel build passed |
| Standalone Cloud codegen/typecheck and manifest | Passed |
| Storage / priority-input / explicit-gas / contrast gates | Passed; ladder at slots 0/256, no forbidden inputs, WCAG AA text colors in both themes |
| Browser smoke | Unconfigured receipt/history/proof states verified; no page overflow at 375, 768 and 1280px. Populated receipt data is covered by handler/API tests, not a hosted-browser rehearsal. |

Real-chain evidence: [testnet replay](../indexer/evidence/testnet-replay.json). It is explicitly an in-memory replay of real chain receipts, **not** a synced hosted indexer. It uses the existing S3 diagnostic contract, rather than publishing it as the S4 production deployment.

Example observed batch from that replay:

```json
{
  "chainId": 10143,
  "batchId": "1",
  "clearTick": 127,
  "price": "1135000",
  "volumeLots": "323",
  "orderCount": 256,
  "clearGas": "213565",
  "fillsCompared": 256,
  "hosted": false
}
```

Exact sample order entities and the public placement/clearing hashes are in the evidence file. The query and deployment instructions are in [indexer/README.md](../indexer/README.md).

## Deferred external acceptance

No Envio Cloud account/project or GraphQL endpoint was supplied, and S4's mainnet market remains undeployed/unconfigured. Consequently:

- GraphQL URL: **not assigned**. `.env.example` and public web configuration define the actual endpoint fields without placeholders masquerading as a deployment.
- Envio Cloud deployment, mainnet sync, `<5 s` hosted rehearsal lag and hosted query/response sample: **pending**.
- Three distinct live transaction samples and three live mainnet batches with every order's fill checked: **pending**. The one-batch 256-order archival testnet parity is additional verified evidence, not a substitute.
- The configured CLI initialization requires an API token; explicit scaffolding plus actual codegen/runtime tests were used instead. No credentials were fabricated.

Follow the documented configure → Cloud-package activation → authorized publishing → endpoint configuration → read-only live audit sequence. Deployment config and addresses must be real before activation.

## Limits and risks

The adapter supports the specified demo market parameters; configure rejects other immutables. The Cloud package must be regenerated after source changes (CI checks this). Trader/history/statistics queries have explicit bounds; full receipts paginate every order. Whole-lot turnover rounds down after accumulating exact base units. Claims in the clearing block require final-event checks and are reported separately from strict preview acceptance. Hosted latency and populated mainnet UI remain unverified until the external deployment exists.
