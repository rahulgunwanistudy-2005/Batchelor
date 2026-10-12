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
