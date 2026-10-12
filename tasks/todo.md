# S1 — Storage spike and scaffold

Scope: implement the supplied S1 session, then stop at its acceptance gates. Later sessions depend on this evidence.

The user's request authorizes logical commits and pushes, overriding the build pack's Git restriction. Do not add attribution footers or new attribution sections. No mainnet transaction is authorized.

- [x] Read the complete project bible, source list, README, and S1 instructions; inspect the empty repository.
- [x] Obtain and pin Monad-compatible Foundry; resolve MonadTen and MonadNine profiles.
- [x] Implement isolated page-read/write measurements and transient reentrancy tests.
- [x] Run the same benchmark bytecode under both profiles; report the full-book ratio before scaffolding.
- [x] Check Mera typed-data signing from installed declarations.
- [x] Sample and record 200 consecutive testnet headers.
- [ ] Live emitted-gas parity: deferred by the user pending testnet funding.
- [x] If the >=10x local gate passes, build the S1 contracts, workspace, bot health service, and web placeholders.
- [x] Generate ABIs, verify storage layout, run contract and TypeScript quality gates, and self-review.
- [x] Record measured evidence, deferred gates, and reproducible instructions; commit and push logical milestones.

## Status

Local S1 implementation and quality gates pass. Live emitted-gas parity is pending testnet funding; the provided local key failed the preflight without sending a transaction. The current S2 request supersedes that earlier session boundary; live validation remains recorded as pending. See docs/S1_REPORT.md.

GitHub Quality gates passed for scaffold commit `74d01b9`. The user explicitly chose to finish with live validation pending.

# S2 — Auction core and correctness proofs

The current request authorizes S2 implementation despite the earlier deferred live S1 gate. The attached documents define product requirements; old session authorizations recorded in files are not new Git or deployment authorization. Preserve S1 corrections (Node 24, storage-free EIP-712) and do not deploy.

- [x] Read all three supplied files, existing bible, lessons, scaffold, and gates.
- [x] Implement pure uncrossing and exact settlement libraries, tagged ladder, funds, lifecycle, intents, and faucet.
- [x] Add independent reference model, branch/unit tests, differential and permutation fuzzing, handler invariants.
- [x] Export 50 deterministic golden books for the future TypeScript mirror.
- [x] Run contract format/build/size/layout/forbidden gates, 1,000-run fuzz and 256 × 200 invariants.
- [x] Run differential and permutation tests at 10,000 runs; retain timings and machine-readable evidence.
- [x] Regenerate ABI; run existing TypeScript quality gates; review and document ambiguities and remaining risks.

## S2 outcome

S2 built and verified locally: 45 tests pass under each hardfork; 1,000 default fuzz runs; 256 × 200 invariant actions with zero reverts; differential and same-block permutation each pass 10,000 stress runs. Storage, packed sizes, forbidden source/runtime inputs, ABI generation, TypeScript checks/tests, bot build, web build, and contrast checks pass. 50 golden books exported. Historical correctness uses an explicit 100M aggregate harness allowance; the default profile remains 30M. See `docs/S2_REPORT.md` and `contracts/bench/out/s2/`. Live S1 parity and S3 gas/deployment validation remain pending. No deployment or push was performed. The user subsequently authorized systematic local commits; implementation is saved in `af9fdfd`, tests and gates in `cdf287f`, and verification evidence and documentation in the following commit.

## S2 commit organization

- [x] Save auction, settlement, faucet, ABI, and storage checks in a focused implementation commit (`af9fdfd`).
- [x] Save reference/unit/fuzz/invariant tests, vectors, and CI gates in a focused correctness commit (`cdf287f`).
- [x] Save the acceptance/stress evidence, report, README, and lessons in a focused documentation commit.

Commits are local on `main`; pushing is not part of this request. The earlier live-validation deferral is unchanged.
