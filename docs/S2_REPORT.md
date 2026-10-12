# S2 — Auction core verification

Built locally on 12 October 2026 from `00_PROJECT_BIBLE.md`, `12_SOURCES.md`, and `S2_auction_core.md`. The attached S2 document scopes this session to contracts and correctness tests. Existing S1 corrections were retained: Foundry v1.8.0, Solidity 0.8.28, OZ 5.4.0, Node 24, and storage-free EIP-712. The current user request supersedes the old S1 session boundary; the pending live spike remains pending.

## Built

- `BatchAuction`: supported-token deposits and withdrawals, internal balances, direct/bulk/signed orders, cancellation, automatic clear-before-write rollover, permissionless settlement and claims, all requested events and views.
- `Uncross`: descending demand and ascending supply, maximum volume, minimum absolute surplus, buy/sell pressure, closest reference with lower-tick tie handling, and price-priority pro-rata cutoffs. Empty/no-cross batches retain the previous reference.
- `Settle`: exact rational base and quote settlement using explicit floor/ceiling `Math.mulDiv`. Quote calculations never use an already-rounded base fill.
- `DemoToken` retains its immutable faucet minter and ERC20Permit; `Faucet` drips 100 ROSE and 100 dUSD into market balances once per recipient per day. The faucet deployment test checks predicted-address minter wiring.
- Independent `RefAuction` scans plain orders for every tick and calculates settlement with direct integer arithmetic. It imports shared data types, never production auction or math implementations.
- Unit, differential, permutation, token-callback, fee-on-transfer, and four-actor stateful tests. The invariant handler retains independent order/escrow and per-batch conservation ghosts, plus deposit/withdraw/settlement balance accounting.
- 50 deterministic golden books (1,275 orders) in `packages/core/test/vectors.json`. Every exported result is compared to `RefAuction`; amounts are decimal strings.
- Updated generated ABI, source/runtime forbidden-input checks, CI source and vector freshness gates, and a reproducible evidence runner.

## Verification

`python3 scripts/verify-auction.py` passes format, size/build, full tests, storage, and forbidden-input gates. Foundry reports **45 tests passed, 0 failed, 0 skipped** across 11 suites (it groups the three stateful invariants as one suite test). Unit fuzz and both random-book tests run 1,000 cases. Stateful checks run 256 sequences × 200 actions, **51,200 calls, zero reverts**, with `fail_on_revert = true`.

`python3 scripts/verify-auction.py --stress` runs the exact extra command below. Both tests pass at 10,000 runs; measured command wall time: **150.309 seconds** (the two-test suite reports 149.24 seconds).

```sh
cd contracts
forge test --match-test 'test_SameBlockOrderNeverMatters|testFuzz_ReferenceModel' --fuzz-runs 10000 -vv
```

The EIP-712 signing helper was then made independent of the contract's domain/typehash functions: it explicitly encodes the standard domain and each intent field. A targeted `forge test --match-test 'test_EIP712' -vv` passes all three signature tests after this test-only improvement.

The existing CI historical check is `FOUNDRY_PROFILE=pre_mip8 forge test --gas-limit 100000000 -vv`. It passes all 45 tests and 51,200 stateful actions (zero reverts), measured in 43.247 seconds. Its first 30M harness run passed units and stateful invariants but exhausted gas on two fuzz harnesses that combine many placements and reference calculations. The historical check uses a 100M aggregate harness allowance; the default MonadTen economic test allowance remains 30M. No live transaction limit is changed.

The existing workspace gates passed with pnpm 9.15.9 and Node 24.19.0: `pnpm gen`, `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test` (nine existing TypeScript tests; web has no test files), and `pnpm --filter web build`. Svelte reports zero errors and zero warnings. The S2 scope adds no UI behavior.

Exact contract commands, return codes, timing, test names, and raw output are retained in `contracts/bench/out/s2/acceptance.json`, `stress.json`, and their adjacent logs. The artifact exporter pauses harness gas metering for offline file generation; economic tests retain the configured 30M gas limit. Exporter gas is not clearing gas and is not used as a benchmark.

## Eight invariant mappings

| Requirement | Evidence |
|---|---|
| 1. Solvency | `invariant_SolventAgainstIndependentOutstandingLiabilities`: real token holdings cover all free balances, pending escrows, and independent cleared-order claim entitlements after arbitrary claim/withdraw order. See resolution below. |
| 2. Conservation and bounded dust | `invariant_ConservationPerBatchAndBoundedDust` and the differential fuzz test: seller base in ≥ buyer base out; buyer quote in ≥ seller quote out; each difference ≤ active order count. |
| 3. Uniform price | `testFuzz_ReferenceModelUniformLimitsRefundsAndConservation`: every order's actual preview and credited claim match independent rational math at the batch's single clearing price. |
| 4. Permutation invariance | `test_SameBlockOrderNeverMatters`: identical multiset in two fresh markets, shuffled within one fixed block; identical price, volume, cutoffs, fractions, clearing block, and per-order previews, matched by original order identity. 10,000-run extra check passes. |
| 5. Limits respected | Differential test checks filled buyer/seller ticks against the clearing tick, exact independent settlement, and buyer payment ≤ escrow. |
| 6. Refund completeness | Differential test and `test_noTradeRefundBothSidesAndReferenceUnchanged`: every zero-fill order receives its complete original escrow. |
| 7. Reference equality | Differential test compares all economic result fields against the naive `RefAuction` on 1–60 random orders at all 256 possible ticks; prime-sized lot math exercises rounding. 10,000-run extra check passes. |
| 8. No priority/entropy inputs | `bash contracts/script/check-forbidden.sh` and `python3 scripts/check-contracts.py`: source gate and disassembled production runtime check. Covers priority, coinbase, randomness, and block hash instructions; skips PUSH operands and CBOR metadata. |

## Storage and build sizes

`forge inspect BatchAuction storageLayout --json` is enforced by `scripts/check-contracts.py`: bids slot 0; asks slot 256; metadata slot 512; reference and two side-total counters slot 513; orders slot 514. Shared `AuctionTypes` declares no storage. BatchMeta is 32 bytes; Order and Result are 64 bytes each. Full inspected layout is in `contracts/bench/out/storage-layout.json`.

Actual `forge build --sizes` output:

```text
╭--------------+------------------+-------------------+--------------------+---------------------╮
| Contract     | Runtime Size (B) | Initcode Size (B) | Runtime Margin (B) | Initcode Margin (B) |
+================================================================================================+
| BatchAuction | 18,409           | 19,271            | 112,663            | 242,873             |
|--------------+------------------+-------------------+--------------------+---------------------|
| DemoToken    | 4,460            | 5,757             | 126,612            | 256,387             |
|--------------+------------------+-------------------+--------------------+---------------------|
| Faucet       | 2,483            | 3,645             | 128,589            | 258,499             |
|--------------+------------------+-------------------+--------------------+---------------------|
| GuardProbe   | 575              | 603               | 130,497            | 261,541             |
|--------------+------------------+-------------------+--------------------+---------------------|
| HookToken    | 3,195            | 4,573             | 127,877            | 257,571             |
|--------------+------------------+-------------------+--------------------+---------------------|
| PageBench    | 1,533            | 1,561             | 129,539            | 260,583             |
|--------------+------------------+-------------------+--------------------+---------------------|
| ReenterProbe | 864              | 996               | 130,208            | 261,148             |
╰--------------+------------------+-------------------+--------------------+---------------------╯
```

No clearing-gas bounds or MonadNine/MonadTen auction-clearing ratio are claimed here. `clearGas` is implemented and checked against the event; measured entrypoint gas limits belong to S3.

## Specification resolutions

1. **Solvency after partial claims.** The literal sum of original escrow for *all* unclaimed cleared orders double-counts assets already delivered to counterparties. Example: a seller claims quote while the buyer remains unclaimed; that quote is still counted in the buyer's original escrow under the literal formula. Use original escrow for pending orders, and exact remaining owner entitlements for cleared orders. The handler checks the corrected obligation in each token independently, including arbitrary withdrawals. This preserves the required settlement table and token conservation.
2. **Economic results versus telemetry.** Permutations compare all economic fields plus `clearedAt`; `clearGas` is intentionally excluded because warming and storage writes affect telemetry. Order IDs also differ under permutations, so fills are compared by original multiset identity.
3. **Actions and side encoding.** BUY/PLACE = 0; SELL/CANCEL = 1. Bad actions and sides revert. Nonces increase only for a successful signed action; deadline equality is valid; expired means current timestamp > deadline. EIP-712 binds chain ID and market address, with no inherited persistent domain storage. OZ `tryRecover` normalizes malformed and invalid signatures to `BadSig`.
4. **Cancellation and duplicate claims.** Cancellation refunds immediately, decreases active `orderCount`, and marks the order terminal via `claimed`. Pending IDs are skipped by `claim`; terminal/duplicate IDs revert with `AlreadyClaimed`, invalid IDs with `BadOrder`. Arrays of claims are atomic. Because `_roll` executes first, cancelling an expired batch returns `NotOpenBatch`; a reverted cancellation also reverts its attempted roll.
5. **Preview semantics.** Positive trade deltas are receipts by the owner; negative deltas are trade payments. Refund is separate. Pending, cancelled, and already claimed orders return zero remaining entitlement. A zero-volume cleared batch is identified by `clearedAt`, not volume.
6. **Overflow and constructor bounds.** Side-total counters cap each side at uint64 lots so accepted books can always clear into the packed result. Counters are reset when a new batch opens and decrease on cancellation. Tick aggregation uses checked addition. Constructor bounds cover maximum grid price, lot/base multiplication, and the `r × price` intermediate; order escrow is checked against uint128.
7. **Faucet zero-time edge.** A separate has-dripped marker allows the initial drip even at timestamp 0 while enforcing its cooldown. The constructor verifies market assets, token decimals, and immutable minters.
8. **No-trade and gas semantics.** No-trade results have zero economic fields and retain the reference; their event price is 0. `clearGas` measures `_clear` (ladder read, uncross, result storage, reference/meta update), excluding its own telemetry store and event emission.
9. **Shared structs.** Structs move to a storage-free `AuctionTypes` base so contract and libraries use one ABI type without circular imports. Solidity's actual packing remains unchanged; the checker validates sizes and precise array slots.

## Test summary

| Test name | Runs | Status |
|---|---:|---|
| `test_onlyImmutableFaucetCanMintAndDecimalsAreIndependent()` | 1 | PASS |
| `test_transientGuardBlocksReentrancyAndUnlocks()` | 1 | PASS |
| `test_feeOnTransferCannotCreateUnbackedCredit()` | 1 | PASS |
| `test_tokenCallbacksCannotEnterAnyStateChange()` | 1 | PASS |
| `test_dailyDripCreditsMarketAndCooldownIsPerRecipient()` | 1 | PASS |
| `test_badRange()` | 1 | PASS |
| `test_buyPressurePicksHighest()` | 1 | PASS |
| `test_fullRange()` | 1 | PASS |
| `test_maximumVolumeBeforeSurplus()` | 1 | PASS |
| `test_minimumSurplusBeforePressure()` | 1 | PASS |
| `test_mixedPressureUsesReference()` | 1 | PASS |
| `test_noCrossAndOneSided()` | 1 | PASS |
| `test_sellPressurePicksLowest()` | 1 | PASS |
| `test_singleTickPrimeCutoff()` | 1 | PASS |
| `test_volumeOverflow()` | 1 | PASS |
| `test_zeroSurplusUsesReference()` | 1 | PASS |
| `test_EIP712DomainBoundAndFailedPlaceDoesNotConsumeNonce()` | 1 | PASS |
| `test_EIP712PlaceCancelAndRelayedEvent()` | 1 | PASS |
| `test_EIP712WrongSignerMalformedReplayExpiredAndAction()` | 1 | PASS |
| `test_cancelOwnerAndSealedBatch()` | 1 | PASS |
| `test_cancelRefundsAndKeepsTaggedRange()` | 1 | PASS |
| `test_claimPendingThenPermissionlessAndTwice()` | 1 | PASS |
| `test_clearBeforeNewBatchAndLazyReset()` | 1 | PASS |
| `test_clearGasEventMatchesStoredResult()` | 1 | PASS |
| `test_depositAndWithdrawRollSealedBatch()` | 1 | PASS |
| `test_depositForAndWithdrawOnlyFreeBalance()` | 1 | PASS |
| `test_emptyClearIsNoopAndIdsHaveNoGaps()` | 1 | PASS |
| `test_noTradeRefundBothSidesAndReferenceUnchanged()` | 1 | PASS |
| `test_placeManyAtomicAndValidation()` | 1 | PASS |
| `test_sideTotalOverflowRejectedBeforeClearing()` | 1 | PASS |
| `test_contiguous512()` | 1 | PASS |
| `test_fourPages32()` | 1 | PASS |
| `test_onePage32()` | 1 | PASS |
| `test_scattered512()` | 1 | PASS |
| `test_writeOnePage64()` | 1 | PASS |
| `test_writeSeparatePages64()` | 1 | PASS |
| `test_Export50SeededBooks()` | 1 | PASS |
| `testFuzz_primeRoundingMatchesRational(uint64,uint64,uint64,uint64)` | 1000 | PASS |
| `test_fullAndOutsideCutoff()` | 1 | PASS |
| `test_roundOnceForOneLot()` | 1 | PASS |
| `test_wideNumeratorDoesNotOverflow()` | 1 | PASS |
| `test_zeroVolumeFullRefund()` | 1 | PASS |
| `testFuzz_ReferenceModelUniformLimitsRefundsAndConservation(uint256)` | 1000 | PASS |
| `test_SameBlockOrderNeverMatters(uint256,uint256)` | 1000 | PASS |
| `invariant_ConservationPerBatchAndBoundedDust` | 256 × 200 | PASS |
| `invariant_InternalBalancesEqualGhostLedgerAndWalletWithdrawals` | 256 × 200 | PASS |
| `invariant_SolventAgainstIndependentOutstandingLiabilities` | 256 × 200 | PASS |

## Deferred and risks

- S1 live emitted-gas parity still needs funded testnet validation. S3 deployment scripts, measured entrypoint bounds, and auction-clearing comparisons remain future work; addresses remain unset.
- UI trading, Mera onboarding, bots, Envio, and hosting are outside the supplied S2 scope. No transactions or pushes were performed. At the user's subsequent request, S2 is saved in focused local commits: `af9fdfd` for implementation, `cdf287f` for correctness tests and gates, followed by the verification evidence and documentation commit.
- Local fuzz/invariant results are evidence for the implemented cases, not an exhaustive formal verification. Deployment and review remain required before launch. The token accounting is intended for the specified non-rebasing demo tokens; fee-on-transfer deposits are rejected.
- The existing Foundry cache is outside writable roots; it emits non-fatal signature-cache warnings. Build also retains advisory lint warnings (including checked casts and loop initialization), with no compiler or test failures.

Primary dependency reference: [OpenZeppelin utils documentation](https://docs.openzeppelin.com/contracts/5.x/api/utils). Verification uses the pinned local dependency source and measured local output rather than unverified numbers in the build pack.
