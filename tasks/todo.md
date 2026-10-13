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

Local S1 implementation and quality gates pass. Live emitted-gas parity is pending testnet funding; the provided local key failed the preflight without sending a transaction. Do not begin S2 until that gate passes. See docs/S1_REPORT.md.

GitHub Quality gates passed for scaffold commit `74d01b9`. The user explicitly chose to finish with live validation pending.

## Frontend flow follow-through

- [x] Add live refresh for the configured market-data and batch-result adapters without fabricating data.
- [x] Correct navigation and auction-status copy so labels match implemented behavior.
- [x] Document the active Next.js frontend and ignore generated SvelteKit output.
- [x] Run frontend lint, typecheck, tests, and production build; inspect the trade, account, proof, and receipt routes.

Frontend validation: targeted ESLint and TypeScript checks passed, 47 tests passed, production build passed, and local smoke tests returned 200 for `/`, `/me`, `/proof`, `/b/1`, `/api/market`, and `/api/batches/1` (invalid batch ID returns 400). Full-repository ESLint still fails on the pre-existing generated `indexer/.envio/types.d.ts` empty-object lint error.
