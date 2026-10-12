# S1 — Storage spike and scaffold

Scope: implement the supplied S1 session, then stop at its acceptance gates. Later sessions depend on this evidence.

The user's request authorizes logical commits and pushes, overriding the build pack's Git restriction. Do not add attribution footers or new attribution sections. No mainnet transaction is authorized.

- [x] Read the complete project bible, source list, README, and S1 instructions; inspect the empty repository.
- [x] Obtain and pin Monad-compatible Foundry; resolve MonadTen and MonadNine profiles.
- [x] Implement isolated page-read/write measurements and transient reentrancy tests.
- [x] Run the same benchmark bytecode under both profiles; report the full-book ratio before scaffolding.
- [x] Check Mera typed-data signing from installed declarations.
- [ ] Validate testnet measurements and sample block intervals where credentials/RPC access allow.
- [ ] If the >=10x local gate passes, build the S1 contracts, workspace, bot health service, and web placeholders.
- [ ] Generate ABIs, verify storage layout, run contract and TypeScript quality gates, and self-review.
- [ ] Record measured evidence, deferred gates, and reproducible instructions; commit and push logical milestones.
