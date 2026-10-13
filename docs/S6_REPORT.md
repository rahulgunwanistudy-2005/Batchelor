# S6 — Passkey accounts and live gasless trading

Implemented on 13 October 2026. The supplied project bible and S6 document define the product requirements; the user's request separately authorizes systematic local commits. Earlier toolchain corrections remain in force. No public deployment, push or mainnet transaction was performed.

## Built

- Bigint uncrossing mirrors `Uncross.sol`; all 50 Foundry books match every clearing/cutoff field. Existing exact settlement covers their 1,275 individual fills. Shared EIP-712 intent fields/domain round-trip with viem recovery.
- Mera 0.2.0 creates or discovers a passkey, derives the standard `m/44'/60'/0'/0/0` account, and stores only credential metadata. Signing keys stay in memory; idle expiry and sign-out end the Mera session. Recovery phrase export requires fresh passkey verification and checks the selected account. PRF, cancelled-operation and HTTPS errors have actionable guidance.
- `/api/relay`, `/api/drip`, and `/api/wake` validate bounded JSON bodies, return typed errors, and apply per-IP/address limits. Relay verifies domain/signature/deadline/current nonce, simulates before signing, uses shared gas and checks the chain, dedicated-key pending nonce, and reserve plus maximum fee commitment. Ambiguous sends block that instance until their receipt resolves. Bot credentials and internal health diagnostics stay on the server.
- One shared WS head subscription drives block-pinned multicall snapshots of the batch, full ladder, reference and market parameters. Current-head clearing logs and a latest-result catch-up populate the tape. Socket failures/stalls switch to one-second HTTP reads; snapshots survive failures, and the RPC socket closes when its final subscriber leaves. The progress indicator uses the median of recent observed head arrivals; the 300ms startup interval is an estimate, not a precise S1 measurement.
- Trade includes the SVG staircases, clearing transition, accessible ladder table, batch tape, tick/amount ticket, exact escrow, faucet, receipt/settlement status, bot health and capped Pete control. Reduced-motion preferences stop transitions. Account history includes onchain balances, signed cancellation while unsealed, latest 20 indexed orders and direct withdrawal to the passkey account with MON funding guidance.
- Withdrawal now has a reproducible benchmark including full-range self-clear and an empty recipient token balance: worst measured 522,575 gas; shared buffered limit 562,000. Both hardforks reproduce all 37 measurements exactly. Production contract bytecode did not change.

## Verification

- `pnpm gen`: current contract ABIs regenerated.
- `pnpm --filter @batchelor/core test`: 111 tests pass, including 50 uncrossing vectors and exact per-order settlement.
- `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test`, `pnpm --filter web build`: pass. Web has 28 tests covering signature/expiry/replay, bounded HTTP errors, session expiry, deterministic passkey derivation with mocked ceremonies, shared subscriptions, reconnect fallback and stale-snapshot preservation. The existing optional live indexer test remains skipped without its external endpoint.
- `forge fmt --check`, `forge build --sizes`, `forge test`: pass; 79 tests, including 1,000-run fuzz cases and 256 × 200 invariant actions with zero handler reverts. Layout and forbidden-input gates pass; gas policy and theme contrast checks pass.
- `pnpm bench`: 37 measurements reproduce twice under MonadTen and MonadNine; unchanged full-range clearing is 342,713 versus 4,436,713 gas (12.946×).
- `pnpm web:test-local` (after building contracts with `forge build` in `contracts/`): the actual Svelte HTTP endpoints on ephemeral MonadTen Anvil deposit 100 ROSE + 100 dUSD, relay a real signed order that fills, and reject bad signatures, expired deadlines and reused nonces. Twenty consecutive maker-only snapshots match their onchain clearing tick and volume. Evidence: `docs/verification/s6-local.json`.
- Browser inspection: live chart, table, price/amount/side controls and account page reviewed; 375/768/1280px layouts have no horizontal overflow. Screenshots in `docs/screens/s6-*`. Lighthouse 13.5.0 accessibility audit of `/` scores 100 both with an unconfigured market and with the real local ladder connected; raw evidence is retained in `docs/verification/s6-lighthouse.json` and `s6-lighthouse-live.json`. Its initial 95-score finding was fixed by adding explicit group roles.

## Configuration and external acceptance gates

Set public and private web environment values in `apps/web/.env` for development or the hosting environment for production; root `.env` is for project tooling. `PUBLIC_CHAIN` and `PUBLIC_MARKET_ADDRESS` must match server `CHAIN` and `MARKET_ADDRESS`. Set `PUBLIC_RPC_HTTP`, optional `PUBLIC_RPC_WS`, `PUBLIC_ENVIO_GRAPHQL_URL`, explicit `PUBLIC_RP_ID`, and server `RPC_HTTP`, `RELAYER_PK`, `FAUCET_ADDRESS`, `BOTS_URL`, `BOTS_TOKEN`. Mainnet sends also require `MAINNET_SENDS_ENABLED=true` after separately authorized activation.

The permanent production hostname is not yet supplied. Production never infers `rpId` from the current location and refuses sign-in without an explicit matching configuration. Local development permits `localhost`. Select the permanent domain before onboarding anyone; preserve it for returning passkeys.

Fresh-profile iOS Safari or Android Chrome onboarding in under 60 seconds and `docs/screens/onboarding.mp4` require a real PRF-capable passkey provider, configured production domain and funded services. Mocked ceremony tests are not hardware proof. Actual desktop Chrome local-profile PRF failure is also a manual provider gate. Hosted Mo-only soak, production bots/indexer hosting, relayer funding and mainnet operation remain external gates from S4/S5. No fake endpoint, price, batch or phone recording was produced.

## Risks and limits

In-memory quotas, queues and uncertain-send state apply per server instance and reset on cold starts. A dedicated relayer key plus chain pending-nonce checks avoids routine overlap; cross-instance simultaneous submissions can still race and one may fail. This is a recoverable service limitation, not distributed exactly-once delivery. Onchain intent nonces prevent duplicate successful execution. The daily faucet and Pete cap are enforced onchain/by the bot service respectively.

Current-head logs do not replay every skipped historical head; latest-result catch-up provides current context, and Envio supplies complete history. Claims are normally credited by the keeper; the ticket reconstructs exact immutable settlement if a keeper claim made `previewFill` terminal. The UI labels unavailable indexing/bot status honestly. Browser PRF support, real hosting, funded keys and RPC quality determine production onboarding latency.
