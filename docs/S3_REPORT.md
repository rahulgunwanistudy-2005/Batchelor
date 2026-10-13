# S3 — Gas proof and explicit limits

## Built

- Deterministic production clearing benchmarks for 8/32/128/256 active ticks per side.
- Fixed-ladder 10/100/1,000-order comparison; generated mapping-layout ablation.
- Cold-call transaction maxima covering self-clears, signed cancellation, partial claims, and scattered historical claim records.
- Reproducible two-hardfork runner, generated gas limits, TypeScript selectors/chunk guards, CI policy/freshness gates.
- Optimized tagged ladder copy, uncrossing loops, candidate reuse, and two-slot result packing.
- Testnet-only deployment/parity script with nonce and funding checks, broadcast checkpoints, and a completed real-contract confirmation.
- Updated proof page with measured charts, accessible numeric table, and a real explorer link.

## Headline measurements

- Full-range clearing: **4,436,713 gas → 342,713 gas (12.946×)**.
- Self-clearing order declared limit: **586,000 gas**.
- Live 128-tick-per-side self-clear: **213,565 gas**, exactly matching the identical local fixture.
- Full table, cost conversions, layout ablation, and all nine entrypoint limits: [WHY_MONAD.md](WHY_MONAD.md).

## Verified

| Check | Result |
|---|---|
| `pnpm bench` | 35 measurements under each hardfork, reproduced exactly twice; same production bytecode; 12.946× full-range ratio; order-count variance 0% |
| `forge fmt --check`, `forge fmt --check bench`, `forge build --sizes` | Pass; production runtime remains under the contract-size limit |
| `forge test` and historical 100M aggregate harness | 73 tests passed under each hardfork before the additional scattered-history fixture; that final fixture and all 29 current benchmark tests then passed twice under both hardforks |
| Differential and permutation stress | 10,000 runs each passed |
| Handler invariant | 256 runs × 200 actions = 51,200 calls, zero reverts |
| Storage, forbidden-input, generated ABI gates | Pass; bid array slot 0, ask array slot 256; Order and Result remain two slots |
| `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test` | Pass; 12 TS tests; final web diagnostics have zero errors and warnings |
| `pnpm -r build`, script typecheck, bot module import | Pass on Node 24; final web production build passes |
| `pnpm check:gas`, contrast check, `git diff --check` | Pass |
| Browser proof-page QA | Loaded actual values and explorer link at 375/768/1280; no document overflow; mobile/desktop screenshots saved |
| Testnet real contract | Seven successful transactions; 256 seed orders in one batch; emitted clearGas differs by 0% |

Testnet evidence: `contracts/bench/out/clear-live-testnet.json`. Regression evidence: `contracts/bench/out/s3/`. Screenshots: `docs/screens/s3-proof-desktop.png` and `s3-proof-mobile.png`.

## Deferred and risks

- The 250K full-range clearing optimization target is unmet (342,713 gas). The required optimization pass was performed and the >=10× ratio gate passes; no lower number is claimed.
- Limits are measured fixture maxima with a 7.5% margin for the demo parameters. They are not formal bounds for arbitrary immutable parameters, arbitrary calldata shapes, or unbounded arrays. Shared clients enforce <=6 placements and <=50 claims.
- Existing bot service is a scaffold; relayer, wallet flows, live indexer, full trading UI, and production hosting remain later sessions. The shared limits and static gates are ready for those clients.
- Mainnet deployment is pending; no mainnet transaction was sent. The earlier S1 raw-storage live parity gate remains a separate historical pending task; S3 real-auction parity is complete.
- S3 is saved as five focused local commits: contract optimization, benchmarks, gas policy/testnet validation, proof UI, and documentation/evidence. Pushing is outside the user's commit request.

## Reproduce

```sh
pnpm bench
pnpm check:gas
python3 scripts/verify-auction.py --out contracts/bench/out/s3
python3 scripts/verify-auction.py --stress --out contracts/bench/out/s3
pnpm bench:live  # uses/preserves the completed testnet checkpoint
```
