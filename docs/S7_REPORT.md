# S7 — Batch receipts, replay and measured proof

## Built

- Exact bigint price/time replay: sort by block, transaction and log; match the best opposite resting price, then FIFO within each tick. Partial remainders rest at their limit. Per-order and Pete/Mo/everyone totals retain rational weighted average prices. Tick queues bound the matching scan to the demo grid.
- Server-rendered receipts with data-driven headlines, configured actor labels, logarithmic paid-priority bars, a shared clearing-price line, viewer highlighting, exact price comparisons, pro-rata facts, UTC time, MonadVision transaction links and clipboard sharing.
- A server PNG endpoint and Open Graph/Twitter metadata. The card uses a committed glyph atlas of the existing self-hosted Bricolage Grotesque and IBM Plex Sans fonts; there is no new runtime dependency.
- Generated Proof page: paired hardfork bars, a fixed-book order-count chart, median/p95 indexed clearing gas and block-capacity shares, all eight correctness gates, recorded/configured address distinctions, explicit unconfirmed verification status and four sourced paragraphs generated from `docs/WHY_MONAD.md`.
- Illustrated collect/seal/clear panels below the trading flow.
- CI exports current Forge JSON. Build generation rejects missing or stale evidence, failed tests and insufficient runs. The exporter expands every grouped invariant predicate, checks MonadTen/settings and invalidates previous evidence before running.

## Verification

The local rehearsal uses an ephemeral MonadTen Anvil chain with simulated MON and worthless tokens. Actual transaction logs pass through the real HyperIndex handlers. A loopback GraphQL fixture serves their output to the normal validated client and SSR routes; this is **not** hosted Envio evidence.

Three independent batches each contain four Pete buys, one later Asha buy and one Mo sell. Pete occupies transaction indices 0–3; Asha is at index 4. Every Pete placement pays 10× the actual block base fee as priority. All 18 indexed fills match the contract `previewFill` values before claims.

| Batch | Shared batch price | Pete replay average | Asha replay average | Pete replay − batch |
|---|---:|---:|---:|---:|
| 1 | 0.900000 dUSD | 1.200000 dUSD | 1.100000 dUSD | 0.300000 dUSD / ROSE |
| 2 | 0.905000 dUSD | 1.205000 dUSD | 1.105000 dUSD | 0.300000 dUSD / ROSE |
| 3 | 0.910000 dUSD | 1.210000 dUSD | 1.110000 dUSD | 0.300000 dUSD / ROSE |

Reproduce with `pnpm receipts:test-local`. Evidence: `docs/verification/s7-local.json`. Crawler-style requests verify the headline, actor labels, comparison values and OG metadata without JavaScript. The image endpoint returns a valid 1200 × 630 PNG generated from that batch.

Quality commands:

```sh
pnpm proof:tests
pnpm proof:generate
# Inside contracts:
forge fmt --check
forge build --sizes
FOUNDRY_PROFILE=pre_mip8 forge test --gas-limit 100000000
# At repository root:
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm test:tooling
pnpm exec tsc -p tsconfig.scripts.json
pnpm --filter web build
pnpm check:gas
pnpm --filter @batchelor/indexer cloud:check
python3 scripts/check-contrast.py
```

Both hardforks pass 79 Forge result entries, representing 81 test functions and invariant predicates. Unit/differential/permutation fuzzing uses 1,000 runs; the three handler predicates share a 256-run campaign at depth 200 (51,200 calls, zero reverts). Storage slots/packed sizes and source/runtime forbidden-input checks pass. A deliberately stale source digest was rejected by the proof generator. Replay covers hand cases and 1,000 deterministic random books with conservation and limit assertions. Core tests pass 118 checks; web tests pass 34 checks.

The production build passes with the existing optional `ws` native-module warnings. No Solidity production code, ABI, dependency lockfile or public deployment address changed.

## Visual and accessibility audit

The optional browser audit uses an existing Playwright/Chrome installation, without adding a project dependency. Set `PLAYWRIGHT_MODULE` to its module file, optionally `AXE_MODULE` to an existing `axe-core/axe.js`, and `CHROME_EXECUTABLE` if required, then run `pnpm receipts:test-local`. It runs the audit before stopping its own fixture. Alternatively start a fixture with `LOCAL_WEB_HOLD_SECONDS=300` and invoke `node scripts/capture-receipts.mjs` with the same browser variables.

Light and dark receipts/Proof screenshots are saved at 375, 768 and 1280 pixels in `docs/screens/s7-*`; the generated link card is `s7-receipt-og.png`. Browser evidence is saved to `docs/verification/s7-browser.json`. All twelve final browser cases passed with zero WCAG A/AA violations in the selected axe tags, no outer horizontal overflow and no page errors. The audit also verifies actor/viewer rows and hydrated clipboard sharing. Horizontally scrolling data tables remain keyboard focusable. Reduced motion uses static visualizations.

## Deferred and risks

- Mainnet/hosted receipt rehearsal, an actual hosted Envio endpoint and a public link-preview debugger require the previously deferred production services and domain. Local crawler/PNG checks pass but cannot prove a social platform fetched a hosted URL. No mainnet transaction, hosting publish or Git push was performed.
- Public contract source verification has not been confirmed. The Proof page distinguishes the real S3 benchmark deployment, recorded production deployments and an environment-configured market.
- Cancelled orders are excluded from the hypothetical continuous replay because the current indexer does not record cancellation timing. Receipts disclose this limitation. It is a hypothetical empty continuous book, not an observation of another exchange or a guarantee about another batch's inclusion.
- Displayed weighted averages round down to quote precision; exact rational totals remain in the replay output. Comparisons are per ROSE, and the UI shows both replay and batch quantities.
- Public actor addresses must be configured correctly; no address is inferred from its fees. Unconfigured actors retain neutral address labels.
- A clean clone must run `pnpm proof:tests` before the web production build. The build intentionally rejects unavailable/stale test evidence.
