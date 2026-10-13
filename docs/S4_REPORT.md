# S4 — Deployment and controlled demo bots

Implementation completed on 13 October 2026 (Asia/Kolkata). The supplied bible defines the product, and S4 defines this session's code scope. The user's request authorizes implementation and systematic local commits; document instructions are not fresh authorization to spend mainnet MON or publish hosted services.

## Built

- `contracts/script/Deploy.s.sol`: four consecutive CREATEs deploy ROSE, dUSD, the immutable one-block auction with the specified grid, and the daily faucet. Faucet prediction preserves the existing immutable minter design. Mainnet deployment has an explicit activation guard.
- Read-only deployment simulation and funding-plan tools. Deployment simulation prints actual Foundry gas limits, constructor arguments, nonces and sampled fee cost, and saves exact calldata locally. Explicit execution exports sanitized successful receipts; `pnpm gen` validates chain, consecutive CREATE addresses, receipts and constructor parameters before generating public addresses.
- One Node service with HTTP sends, WS heads and clear logs, measured explicit gas, EIP1559 caps, per-key nonce queues, identical-byte recovery of uncertain sends and inflight gas reservations that preserve 12 MON.
- Keeper history recovery in ≤100-block windows, delayed permissionless clears, terminal-order tracking and ≤50-order claim chunks. Maintenance runs separately from time-sensitive quoting and priority orders.
- Seeded Mo, bounded mid walk, wake expiry, six quotes per observed head and burst asks totalling ≥45 lots. Four distinct Pete keys, capped UTC-day bursts and actual head-base-fee priority multiples.
- Authenticated `/wake` and `/unleash`, public measured `/health`, bounded HTTP request handling, safe structured logs, non-root Docker packaging and a one-instance Fly configuration with an HTTP health check.
- Daily faucet seeding, testnet-first rehearsal with inclusion/fee/settlement assertions, five-minute soak tooling, and compiler metadata/source export with source-hash checks.

## Verified

- `forge fmt --check`, build/sizes and storage/runtime forbidden-input gates pass. **77 tests pass under MonadTen and 77 under MonadNine.** Default fuzz runs remain 1,000 and handler invariants complete **256 × 200 = 51,200 actions with zero reverts**. Historical correctness uses the existing 100M aggregate harness allowance. Production auction bytecode is unchanged in S4.
- Workspace typecheck, lint, tests and production builds pass; Svelte reports zero errors/warnings. Core has seven tests, bots have 26 behavior tests, and deployment tooling has three tests covering malformed/failing receipt and constructor cases. The web package currently has no tests and uses its existing `--passWithNoTests` setting.
- Shared-gas policy, generated ABI/address freshness, contrast and whitespace gates pass. The production bot build runs using the repository's existing Node 24 toolchain.
- Foundry's read-only **live testnet dry run** produced **7,217,349 gas**, costing **0.736169598 testnet MON** at a sampled 102 MON-gwei gas price. The configured deployer had 7.246612 testnet MON. These are estimates, not deployed addresses or spent funds. See `contracts/bench/out/s4/deploy-plan-testnet.json`.
- `funding-plan.ts` sampled a live testnet base fee of 100 MON-gwei. Its measured 586,000-gas order limit puts a 20-block, four-key Pete burst at **51.568 MON expected**, **56.256 MON maximum gas reserved**. This supersedes the pack's approximate 25 MON estimate. Funding is never executed by the planner.
- A **300-second local MonadTen Anvil soak** passed: 304 clears, 650 sends, 648 receipts at the final snapshot, zero reverted transactions, zero skipped heads, zero recent errors, maximum observed clear lag zero blocks, and oldest pending claim age zero batches. Six latest claims were pending at the snapshot; none was old. All six simulated balances exceeded 12 MON. Asha entered batch 3 at transaction index 6; four Pete orders were at indices 0–3. See `contracts/bench/out/s4/local-bots.json`.
- A brief integration regression on the final runtime additionally checks actual mined priority and exact uniform settlement, alongside the focused recovery/reserve tests. Its evidence is `contracts/bench/out/s4/local-regression.json`.

## Live status and remaining gates

**S4 live deployment, source verification, source publication, testnet rehearsal and live soak are pending.** Only the earlier testnet deployer key is configured; the relayer and six bot keys are absent. Mainnet deployer credentials/approval and hosting credentials are absent. Public S4 addresses remain `null`, rather than publishing predicted or local addresses. The earlier S3 diagnostic deployment and receipts remain intact and separate.

**Additional live MON spent in S4: 0.** Dry-run RPC reads/simulation send no chain transactions. Integration transactions use local simulated balances only. Source bundles were exported locally, not published to Sourcify. No successful live S4 verification command exists to record; the operations guide gives the supported procedure and asks the operator to retain the actual successful result. Docker and Fly binaries are not installed, so image build and hosted deployment remain unverified.

Configure dedicated keys and funding, review the current funding/deployment calls, execute and verify testnet deployment, seed the daily faucet, and run the real rehearsal and five-minute soak. Then review actual mainnet calls and budgets and obtain the required explicit approval before mainnet deployment, funding or activation. Record real-chain demonstration hashes in `docs/WHY_MONAD.md` only after a passing rehearsal.

## Operational limits

- Run one service instance per set of keys. Startup rejects unresolved pending transactions from a prior instance; immediate Fly replacement avoids overlapping senders. HTTP degraded status is intentional when a balance is low, heads are stale or recent errors exist.
- In-memory UTC-day caps reset on restart. There is no new database. Keys must never be shared with another process; operators resolve uncertain transactions before rotating or restarting.
- Head-to-inclusion delay and base-fee changes can fail rehearsal requirements; assertions use mined receipts and actual settlement. A failing demo is not marked passed.
- The local fixture initializes its base fee because idle Anvil fees decay below the real chain's minimum. This is local test setup, not a production workaround or proof of live ordering/performance.
- The 300-second local soak uses one-second simulated blocks. It does not establish the live ~300ms chain's throughput, inclusion or RPC latency. Missed heads and maintenance lag are visible; the live gate remains required.
- Testnet rehearsal uses a funded throwaway Asha key. Gasless passkey trading belongs to the later relayer/web sessions. Current seed/rehearsal/soak commands deliberately default to testnet.
