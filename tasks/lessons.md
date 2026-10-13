# Lessons and verification notes

## S1 environment

- Repository started empty, with origin pointing to the user's Batchelor repository.
- Foundry is not on PATH. Host Node is 24; the project requires Node 22 and pnpm 9.
- External claims in the supplied source list require rechecking before being presented as measured facts.

## Toolchain source correction

Official Monad Foundry documentation now states that upstream Foundry v1.8+ supports MonadTen/MIP-8. The legacy Category Labs fork supports only MonadNine. Use upstream v1.8.0; do not use the supplied fallback installer for this spike. Source: https://docs.monad.xyz/tooling-and-infra/toolkits/foundry.md (rechecked during S1).

## Local spike

- Official Foundry v1.8.0, commit `61ae26af36320d4fa1020f7db53785885e29eeb5`; downloaded binaries verified by foundryup against the release attestation.
- Resolved default: `network=monad`, `hardfork=monad:MonadTen`; pre_mip8: `network=monad`, `hardfork=monad:MonadNine`.
- Same runtime bytecode across both profiles. `scripts/spike.py` checks hashes and refuses to proceed below 10x.
- 512 contiguous reads: MonadNine 4,226,086 gas; MonadTen 162,086 gas; 26.0731x. Includes Solidity loop/bounds/checksum work inside the measured call; these are not bare SLOAD sums or auction clearing gas.
- OZ 5.4.0 ReentrancyGuardTransient blocks reentrancy and releases its lock within the same transaction under both hardforks.
- `vm.cool` on a freshly deployed contract in setUp made that contract appear empty in the isolated next transaction under this toolchain. It is redundant: Foundry's default `isolate=true` gives the measured external call a fresh transaction/access set. Removed the redundant hook; the cold-read deltas match the page/slot gas difference exactly (4,064,000 gas).
- Mera 0.2.0 declaration: `toViemAccount(session: Secp256k1SigningSession, options?: ToViemAccountOptions): LocalAccount<"mera">`. Its declared methods include EIP-712 `signTypedData`. This confirms the adapter interface, not browser PRF/onboarding behavior.

## Scaffold corrections

- Mera 0.2.0 declares `engines.node >=24`. A strict Node 22 install fails. Root `.node-version`, engines, CI, typings, and Vercel runtime now use Node 24. pnpm stays at 9.15.9.
- OZ 5.4.0 `EIP712` is not immutable-only: it declares `_nameFallback` and `_versionFallback` storage. Do not inherit it in BatchAuction; S2 must compute the fixed domain with storage-free helpers. The auction only inherits ReentrancyGuardTransient in S1.
- The specified `Order` declarations fit in two slots, but Solidity packs `lots` at byte offset 24 in slot a. `batchId` and `escrow` occupy slot b. The bible's inline annotation for `lots` is inaccurate; no extra padding field was invented. Inspect output is saved by `scripts/check-contracts.py`.
- Invoke Forge inside `contracts/`. With `--root contracts` from the repository root, Foundry v1.8.0's post-build Solar linter fails to resolve relative imports even though Solc succeeds. Running from the contract directory succeeds.
- Whole-second RPC header timestamps yield median interval 0s over the sampled 200 contiguous headers; mean is recorded in `testnet-blocks.json`. This is quantized data, not evidence of a zero block time or a precise subsecond median.
- `broadcast/` is fully ignored. Publish sanitized deployment evidence explicitly rather than allowlisting run-latest files that can contain transaction payloads from arbitrary networks.

## Live spike preflight

The user authorized the project `.env`, which provides `TESTNET_PRIVATE_KEY`. The script accepts that alias and requires an explicit testnet chain plus RPC chain-ID verification. The account failed the 30M-gas funding preflight (3.06 testnet MON at the checked gas price). No transaction was sent. Seeding 1,024 nonzero slots makes the pack’s ~0.05 MON budget too small.

## S2 specification and harness

- Original escrow is the liability for pending orders only. After clearing, solvency must sum remaining claim entitlements; counting already-spent original escrow alongside counterparties' claimed balances double-counts tokens. The S2 report gives a concrete example and invariant mapping.
- Quote settlement must compute the full fraction with one final rounding. Using the rounded base delivery/receipt to compute quote breaks the specified rational math.
- The fixed-domain EIP-712 helper remains storage-free. Test signatures independently encode the standard domain and individual fields; malformed signatures normalize through OZ tryRecover.
- Place-time side-total uint64 limits prevent an accepted batch from becoming impossible to store/clear. The totals share slot 513 and do not shift the ladder or orders.
- Permutation equality covers economic results and per-order fills. Gas telemetry and order IDs are not permutation-invariant economic data.
- Foundry v1.8.0 file-level fs_permissions with a relative `..` path did not authorize a nonexistent output file; creating the intended vectors.json file fixes canonicalization. The tracked file lets CI overwrite it using permission limited to that exact file.
- Golden-vector export is offline tooling; its 50 naive-book comparisons exceed a single 30M transaction. Only the exporter pauses harness gas metering. Default MonadTen economic/fuzz tests retain the 30M limit; never present exporter harness gas as a clearing benchmark.
- vm.expectRevert must observe a deeper external call; pure-library error tests use an external test harness rather than an internal library call.

- Historical MonadNine random-book harnesses combine up to 120 placements and two clears plus naive reference calculations in one test call, exceeding the S1 30M harness allowance. CI and the verification runner use an explicit 100M aggregate harness budget for historical correctness. The default profile and all production limits remain unchanged; no actual Monad transaction was attempted.

## S3 gas measurement and live confirmation

- Foundry isolation gives each measured production call a fresh access set. Pause metering only during large setup books, then resume before measurements; otherwise the harness can exhaust its aggregate gas budget and obscure the actual entrypoint. Production calls remain below the 30M cap.
- `clearGas` excludes the telemetry write, event, and transaction overhead. Client limits use callee gas before refunds plus 21,000 and actual calldata intrinsic cost, then the integer 7.5% buffer rounded up to 1,000.
- Ten orders cannot populate 32 ticks per side. The order-count experiment holds two occupied ticks, a 32-tick scan, and 500 lots per side fixed while repartitioning the orders. Both hardforks produce exactly constant clearing gas.
- Sparse tied-price books can cost more than dense random books. Partial claims to unique owners require both refund and receiving-balance writes; historical claims spaced across order/result pages cost more again. Include those cases in shared limits.
- The hot loops have bounded memory-safe assembly: arrays have <=256 uint64 entries; intermediate totals fit uint256; final volume is checked; every tick/index is range validated. Result packing relies on the verified two-slot layout. Differential, permutation, and handler invariants must accompany changes here.
- Absence of a global mempool does not establish transaction privacy against local RPC operators or validators. Base the headline on permutation invariance after inclusion.
- A core subpath export for `gas.ts` lets compiled Node 24 bots import the self-contained JSON-backed selector; importing the core index directly would encounter its bundler-oriented `.js` references. The compiled bot module was loaded under Node 24.
- Testnet chain ID 10143 was checked. The funded key started with 10 MON; the seven declared limits cost 2.753388 testnet MON at the checked gas price. A 256-order seed atomically occupied 128 ticks per side and self-cleared in 213,565 gas, exactly matching local telemetry. Keep the public receipt/checkpoint artifact; never save private keys.

## S4 deployment and bot operations

- DemoToken's minter is immutable. The correct deployment predicts the fourth consecutive CREATE's Faucet address; adding a role grant would change both the authority model and deployment nonce sequence. DeployTest exercises the prediction and all demo parameters.
- A Forge dry-run writes under `broadcast/Deploy.s.sol/<chain>/dry-run/`. Never use those predicted addresses as public deployments. Address generation requires successful receipts from the executed script and validates constructor wiring, chain and CREATE nonces.
- The live testnet dry-run command `CHAIN=testnet pnpm deploy:plan` succeeded (no transaction sent). Foundry declared 7,217,349 gas total, 0.736169598 testnet MON at sampled 102 MON-gwei. The exact local calldata plan is ignored; sanitized budget evidence is versioned. No live S4 verification command succeeded because no S4 deployment was broadcast; do not invent one.
- At 100 MON-gwei base fee, four keys × 20 blocks × the S3 586,000 order limit × 11× fee is 51.568 MON, not the S4 pack's approximate 25 MON. Maximum EIP1559 fee reservations are 56.256 MON. Always recompute with shared limits and current base fee.
- An ambiguous send must retain its original signed bytes and gas commitment. Recovering it cannot return its hash as though it were a different new claim/order intent. Signing failures consume no nonce; accepted/known sends do. Startup refuses unresolved pending transactions from a prior bot instance.
- Trading heads and maintenance must run independently; fifty serial order reads can hold up block-by-block quoting. Keeper terminal status comes from complete event replay and it catches up log windows separately from WS-driven trading.
- Track placements across log windows, rather than searching only the last 100 blocks at each clear; a delayed clear or restart could otherwise lose older placement IDs. Require the deployment START_BLOCK for complete reconstruction.
- previewFill returns zero for terminal claimed orders. Rehearsal prints that actual value and uses Claimed event deltas to verify the original price; it never presents reconstructed settlement as a still-claimable preview.
- Idle Anvil (even with MonadTen execution enabled) lets its base fee decay far below the live chain's 100 MON-gwei floor. The first local priority demo failed because 10× that fee was below the normal 1-gwei priority. The loopback-only fixture explicitly initializes the sampled 100 MON-gwei fee; production fee logic remains unchanged.
- Unsubscribing viem watchers does not close the underlying WS RPC client. Shutdown closes getRpcClient() after pending work finishes. Start failures exit the process so a bad configuration cannot leave a disconnected zombie worker.
- Use a single HTTP-capable Fly machine with immediate replacement. A Render background worker does not expose the required public HTTP control surface. Docker/Fly are not installed here; package/source review is not a successful image build or hosted deployment.
- RPC-budget review removed redundant per-order terminal reads (complete event replay already establishes eligibility), repeated immutable-window reads and same-head maintenance scans. Dedicated-key MON budgets refresh every ten seconds and subtract maximum confirmed costs conservatively; health keeps actual balance measurements. This reduces pressure on 50-rps public RPCs without reducing reserve commitments.

## S5 indexer integration

- Envio 3.14.0 uses `indexer.onEvent` / `indexer.onBlock`, module-augmented types emitted to `.envio/`, and `createTestIndexer().process({ chains: { ... simulate } })`. The old v2 `generated` / `MockDb` examples do not apply. Every ABI unsigned event parameter arrives as bigint, including uint8/uint16/uint32; explicitly convert bounded ticks, sides and counts for GraphQL Int fields.
- Official Envio pages confirm mainnet `monad` / 143 and testnet `monad-testnet` / 10143, with matching HyperSync endpoints. Code generation successfully validates numeric-ID v3 configs.
- `envio init` without an API token refuses noninteractive scaffolding. No token exists here; the project was scaffolded explicitly and verified through actual codegen and runtime mock-event tests. Never provide a fake credential to make an initialization log look successful.
- Configured handler files are loaded by the test runtime. A manual import in the test registers each handler twice, double-counting placements. Let the runtime load the handler once. Non-wildcard simulated source addresses must be included in the fixture config, and log indices are unique across the entire block, including different markets.
- Envio block handlers process empty blocks too. Always set the actual start/end block range for simulated historical events; leaving start at zero for a 70-million-block receipt attempted genesis history and exhausted the test process. The fixtures now bound the range explicitly. Production configure requires the exact deployment block.
- The expanded Solidity golden exporter initially exceeded Foundry's memory ceiling by repeatedly concatenating all books and their fills in one call frame. Serialize each seed in a separate view call; canonical output still comes from Solidity Settle and includes market parameters plus 1,275 order fills.
- Cancellation sets the Solidity order's claimed bit without a Claimed event. The read model must represent both cancelled and terminal status, keep the placement in receipts, and exclude it from active liquidity/count. Contract orderCount excludes cancellations; placedCount is a separate receipt count.
- Accumulate each trader's base transfer before converting to whole-lot turnover; flooring every partial order first loses fractional volume unnecessarily. Fees/relayed summaries remain weighted per placement, including placeMany and cancellations.
- Cloud uploads only the selected Indexer Directory and cannot resolve parent workspace imports. `indexer/cloud` is a standalone generated package with pinned Envio/TypeScript and an exact shared settlement copy, verified by a source manifest in CI. Never present a code-generated Cloud directory as a hosted deployment.
- The public testnet endpoint returned `requests limited to 15/sec` during replay, despite prior sessions' broader RPC-budget assumption. A read-only paced transport stays at <=8 requests/sec. With this pacing, the real S3 receipt replay matched all 256 historical previews and 213,565 clearGas.
- JSON numeric values are accepted only if safely representable integers; large quantities require decimal strings. Receipt pagination validates complete count, unique entities, and chain/market scope. Unavailable data is not a zero-filled mock batch.
- Claims in the same block as clearing make even a historical preview terminal/zero. The live audit records final-claim comparisons separately and does not call that the strict all-orders-preview gate. Sync progress follows empty blocks; lag uses a conservative timestamp/roundtrip upper bound, not guessed block-time arithmetic.

## S6 passkeys and web services

- A permanent production RP ID must be explicitly configured; deriving it from a preview hostname would strand accounts. Development fallback is limited to localhost. Save credential metadata only, derive standard BIP-44 from PRF entropy, and wipe transient byte arrays after session creation.
- A Svelte prop named `state` conflicts with the `$state` rune. Alias it when a component also declares state runes. Async account refreshes must run inside `untrack` when triggered by an account effect; otherwise balance/order reads can accidentally retrigger account resets. Serialize slow refreshes so HTTP polling never piles up.
- Golden vector quantities remain bigint. The chart converts only scaled display coordinates; price, escrow, cutoff and settlement math never pass through floating point.
- Withdrawal can self-clear the worst sparse plateau and write a previously empty recipient token balance. It needs its own measured shared limit; do not reuse the smaller place/cancel budget. Full benchmark runs reproduce both forks and preserve all earlier limits.
- Local Anvil lacks the canonical Multicall3 deployment. The loopback-only test injects a minimal fixture at its canonical address and starts at viem's recorded deployment block; starting at block zero causes viem to refuse a historical multicall before that block. This changes the local fixture only, never the live-chain client.
- A watcher can stall without reporting a transport error. Add a watchdog and HTTP polling, pin every snapshot to its head, retain the last good snapshot, and close the underlying RPC connection after final unsubscribe. Head-arrival timing is an observation with network jitter, not a precise protocol block interval.
- Lighthouse initially reported a prohibited aria-label on the batch tape's generic div (95). Explicit group roles fix it (100). A first audit browser closed unexpectedly; explicitly selecting the installed Chrome and headless mode succeeded. Hardware PRF behavior and phone video remain separate from mocked ceremony tests and local chain transactions.
- Hosted in-memory quotas/nonce queues are per instance; latest/pending nonce checks reduce dedicated-key overlap but do not provide distributed exactly-once submission. Onchain intent nonces are the replay authority. Keep ambiguous-send messages actionable and never print underlying transport exceptions that may contain credentials.

- Local fixture verification uses independent free ports and checks child-process readiness. A fixed-port retry while an earlier browser fixture was still alive accidentally reached its state and hit the faucet cooldown. Never reuse an existing fixture after a bind error. The final isolated run with lowercase environment addresses passes.

## S7 receipts and proof

- Forge v1.8 groups the three handler invariants into one campaign in JSON. Expand `invariant_predicate_results` and check every predicate status; the parent entry alone omits solvency and accounting names. The current 79 Forge result entries represent 81 test functions/invariant predicates. Each handler predicate shares the measured 256-run, 51,200-call campaign.
- A source hash and settings hash guard keep the build from showing stale contract evidence. A fresh clone must run `pnpm proof:tests` before the web build. Generated test evidence is not a source-verification claim.
- Indexed cancellations have no cancellation block/log metadata. The hypothetical continuous replay excludes cancelled orders and says so; it cannot reconstruct temporary liquidity. Weighted prices and differences stay bigint rationals; display formatting is the only rounding.
- Native Node type stripping needs real `.ts` imports on the replay subpath; the core and web no-emit configurations explicitly allow these. Compiled bot gas imports remain self-contained.
- A server-rendered button can be clicked before Svelte hydration attaches its handler. Browser load and `document.fonts.ready` do not establish hydration. Keep the share/refresh controls disabled until `onMount`; browser checks then wait for an enabled control. A static successful page fetch alone does not verify interaction. Run builds before starting the browser fixture to avoid shared generated-file churn.
- PNG link cards rasterize the existing licensed brand fonts into a committed glyph atlas. Runtime generation uses Node zlib only; Pillow is optional offline regeneration tooling and adds no production dependency.

## S8 security and release

- Slither 0.11.5 with Foundry emits project findings as JSON and exits 255 when findings exist. Check JSON success and individually reviewed IDs/severities, not exit code alone. Filtering `lib/` would accidentally hide production `src/lib`; filter only test/script/bench paths and external dependencies. Source hashes invalidate a review when code changes.
- `solc-select` initializes its cache on import even when Slither uses Foundry. A local verification venv's `VIRTUAL_ENV` keeps that cache inside ignored tooling without changing HOME. Corepack's project-local cache avoids protected host cache writes. No production dependency was added.
- Gitleaks's generic-key detector matched three test/source SHA-256 values. History paths are relative, while filesystem paths are absolute; an exception needs the exact evidence-path suffix AND the exact `"contracts/...sol": "64 hex"` line shape. Do not ignore a whole evidence file or an entire hash/key rule.
- Zod 4's optional optimizer probes `Function`, causing a strict CSP violation even when the resulting exception is caught. Configure `jitless:true` in a side-effect import before Mera schemas initialize. The production browser audit then passed without unsafe-eval; never weaken the script policy to satisfy the optimizer.
- Browser clipboard audits need a focused native click and Chrome's sanitized-write permission. An evaluated `.click()` and broad unsanitized permission were unreliable across new headless tabs; the final audit verifies actual copied text and has no product clipboard workaround.
- A real six-second socket outage retained HTTP heads/nonce/claim state, rebuilt subscriptions twice and resumed WS delivery with zero reverts. Health correctly stays degraded for five minutes after recorded errors; a recovery test must verify resumed progress and diagnostics rather than falsely require an immediate green status.
- At the sampled 100 MON-gwei base fee, three Pete bursts reserve 168.768 MON total, and ten minutes of Mo at an assumed 300 ms cadence reserve 379.488 MON, before keeper/relayer spending and per-key retained balances. Missing keys are not zero funded wallets or a passed recording gate.
- Installed Envio 3.14.0 does not declare MIT. Its own license README distinguishes generator/generated terms and states it is not OSI recognized. Mera is dual MIT OR Apache-2.0. Record actual dependency notices without inventing human review or dashboard eligibility.
- Current official action manifests use Node 24 for checkout/setup-node/setup-python/pnpm/Foundry/Gitleaks v3/upload-artifact v6. The inspected upload-artifact v5 still uses Node 20. Validate action runtime manifests instead of guessing from major versions. Remote CI remains unrun until authorized pushing.

## S1 live storage gate completed — 13 October 2026

The wallet was funded with 12.246612 testnet MON before this run. Eight transactions succeeded on chain 10143, and all six emitted gas deltas exactly matched the local MonadTen baseline. Deployed bytecode, receipt/calldata/nonce sequence and event checksums were verified. Actual declared-limit fees total 3.20404338 testnet MON; post-validation balance is 9.04256862 testnet MON and reconciles exactly. Raw evidence is in contracts/bench/out/live-testnet.json. scripts/spike.py retains verified matching evidence across local reruns and marks changed bytecode/receipt failures/deviation stale. No mainnet transaction or key disclosure occurred.
