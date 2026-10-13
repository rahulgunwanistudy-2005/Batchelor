# Security review

S8 review, 13 October 2026. This is an internal code and tooling review, not an independent audit. The deployed production market is still unset. Demo assets have no real value; this review does not approve real-asset markets.

## Static analysis

Slither 0.11.5 ran against the Foundry compilation with all 101 detectors. Findings originating in dependencies, tests, deployment scripts and bench directories are filtered from the project review; `contracts/src/lib` is included. The diagnostic `src/PageBench.sol` is included and is not deployed by `Deploy.s.sol`.

Result: **23 findings, each justified; zero unreviewed findings**. Three medium, two low and eighteen informational. No detector is disabled. [Individual IDs, exact descriptions and rationale](security/slither-reviewed.json) and [executed gate evidence](verification/s8-security.json) are committed. `python3 scripts/check-security.py` reruns analysis and rejects changed IDs, severities, analyzer version or production source hashes. CI runs this gate in addition to the storage/source/opcode gates.

| Detector | Count | Resolution |
|---|---:|---|
| divide-before-multiply | 1 | PageBench deliberately computes a page index with integer division. No settlement math is involved. |
| incorrect-equality | 1 | `orderCount == uint32.max` is an overflow sentinel before checked increment. It cannot be skipped; only valid cancellation decrements it. |
| unused-return | 1 | ECDSA's diagnostic bytes32 is unused. Both the recovered signer and error enum are checked; malformed signatures revert. |
| timestamp | 2 | Required signature expiry and 24-hour faucet cooldown. Batch sealing uses block numbers; timestamps do not choose prices. |
| assembly | 1 | Tagged ladder copy and result packing use validated bounds/widths. Uncross's assembly is manually reviewed too; static analysis does not prove it safe. |
| costly-loop | 5 | Order placement necessarily writes escrow, totals and tagged ticks. Shared clients bound chunks to measured limits; clearing scans at most 256 ticks. |
| cyclomatic-complexity | 1 | `_place` combines validation, escrow and side-specific bookkeeping, covered by unit/fuzz/invariant tests. |
| naming-convention | 10 | Uppercase immutables and `DOMAIN_SEPARATOR` retain the specified API. |
| pragma | 1 | Dependency interfaces allow wider versions; Foundry compiles everything with pinned Solidity 0.8.28. |

## Contract review

`BatchAuction` has immutable market parameters, no admin, no fees, no upgrade path and no withdrawal of rounding dust. Its first two persistent variables are the 256-slot ladders. `ReentrancyGuardTransient` adds no persistent slot; layout checks verify slots 0/256/512/513/514 and two-slot orders/results. The fixed EIP-712 domain incorporates chain ID and contract address without inherited persistent storage. Intents consume a checked uint64 nonce only after valid signer/action/deadline checks; failed calls revert nonce updates atomically.

Every state-changing external auction entrypoint is `nonReentrant` and calls `_roll` before order writes. Clearing seals the old batch before new tagged ladder data can overwrite it. Side totals are bounded to uint64 at placement, so an accepted book cannot overflow its result volume. Ranges, price products, lots and escrow widths are validated. Clearing is independent of the number of orders; claims iterate caller-selected IDs and credit their recorded owners.

Only deposits and withdrawals transfer tokens. Withdraw debits before `SafeERC20.safeTransfer`. Deposit first transfers, verifies the exact received amount, then credits the internal balance; the guard covers the whole transfer and blocks callbacks into every auction mutation. Crediting before the receipt check would create an unsafe assumption, so the pack's general “state before transfers” wording is applied to withdrawals rather than an unverified deposit. Fee-on-transfer deposits revert. The demo market uses the known immutable-minter tokens; rebasing or malicious tokens are outside its supported deployment assumptions. Faucet records the cooldown before mint/approve/deposit calls and has its own transient guard. `TokenSafetyTest` exercises malicious callbacks and short transfers on both hardforks.

## Eight economic gates

| Requirement | Evidence and interpretation |
|---|---|
| Solvency | Independent handler sums free balances plus **remaining settlement entitlements**. Original escrow is used before clearing; adding full original escrow after counterparties claim would double-count liabilities. |
| Conservation | Buyer base output ≤ seller delivery; buyer quote payment ≥ seller receipt. Dust is bounded by batch order count in token smallest units. |
| Uniform price | Rational settlement always uses the batch result's one tick/price. Rounding can change a tiny order's effective per-unit rate; the contract does not promise equal rounding or quantities. |
| Permutation | Same multiset placed in different same-block orders produces identical economic results/fills. IDs and `clearGas` telemetry are excluded from economic equality. |
| Limits | Price priority and cutoff ratios ensure buy limit ≥ clearing tick ≥ sell limit for fills. |
| Complete refund | No-fill orders recover the full escrow at claim. Cancellation is terminal and credits escrow once. |
| Reference model | Differential fuzz tests use an independent naive reference auction; Solidity-exported vectors also test TypeScript settlement/uncrossing. |
| No priority inputs | CI checks production sources and disassembled runtime instructions for gasprice, blockhash, coinbase and prevrandao. PUSH payload/metadata bytes are excluded from opcode interpretation. |

The proof exporter requires ≥1,000 fuzz runs and the 256-run, depth-200 invariant campaign. See [design](DESIGN.md), [current proof evidence](verification/s8-contracts.json) and the [S2 report](S2_REPORT.md). No S8 change modifies contract bytecode or its measured gas budgets.

## Service boundaries

Relayer requests have strict schemas, signature/domain/nonce/deadline validation, simulation, bounded JSON bodies, origin checks and typed errors. Per-address/per-IP limits are bounded and expire after a minute. The relayer preserves 12 MON **after the full maximum fee commitment**, checks chain ID and latest/pending nonce, and retains ambiguous sends. Insufficient funding returns `RELAYER_LOW_BALANCE` and “Gasless orders are paused” in the ticket. Quotas and send queues are per process; they are not distributed exactly-once guarantees. Use one dedicated relayer key, monitor it, and rely on onchain intent nonces for replay protection. A timeout after submission can require checking the account/receipt before resending.

Bot controls require a timing-safe bearer comparison. Pete is explicitly started and capped per UTC day. The head watchdog detects lack of increasing WS heads after four seconds, supplies HTTP heads, rebuilds subscriptions at most every ten seconds, and drains on shutdown. Historical claims are recovered by bounded log windows from the deployment block. Health exposes the last safe error and funding warnings; keys below 15 MON emit transition logs. The 12 MON send floor remains enforced. Restarting the process resets in-memory daily caps; run one instance and treat caps as spend controls, not durable authorization quotas.

Web CSP restricts scripts/fonts/images to self and uses SvelteKit-generated script nonces/hashes. Runtime `connect-src` includes only self and configured public RPC/GraphQL origins. Origins are validated and strip paths/query strings; production rejects plaintext/userinfo. Browser styles permit inline CSS because Svelte's charts bind dynamic styles, but inline scripts are not allowed. Loopback HTTP/WS and Vite HMR are development-only. No analytics, trackers, remote fonts, external scripts or frames are added. Route, client, render and fallback error boundaries use plain recovery copy and do not expose exception details. Secret scan checks complete reachable history and all non-ignored project files; installed dependencies/submodules/private env are outside that scan. Only precisely shaped source SHA-256 lines in four review/evidence files are excepted.

## Release risks

Mainnet funding, permanent RP ID, hosted Envio/bots/web, source verification and fresh-device passkey behavior remain required release checks. In-memory quotas/caps reset on process replacement. Fee/budget maxima are measured fixtures with a margin, not universal proofs. Provider outages and inclusion differences can place people in different batches. No mempool privacy, equal quantities or fairness between batches is promised. Public operation for two weeks has not been demonstrated. See [operations runbook](OPERATIONS.md) and [S8 report](S8_REPORT.md).
