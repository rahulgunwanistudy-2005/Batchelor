# S8 — Hardening and release readiness

13 October 2026. Supplied inputs: `00_PROJECT_BIBLE.md`, `12_SOURCES.md`, `S8_harden_ship.md`; recording/submission companion documents were read to prepare the required assets. Documents supply requirements, not fresh authority to spend mainnet MON or publish. The user's direct request authorizes systematic local commits and supersedes the bible's older Git prohibition.

## Built

- Gasless relay reserve errors now return typed `RELAYER_LOW_BALANCE` with “Gasless orders are paused”; the ticket displays it and the measured 633,000 gas reservation. Existing address/IP/body/deadline/signature/nonce guards are retained and exercised through real endpoints. Fetch/response failures use plain recovery copy.
- Bot watchdog recovers silent/stopped subscriptions with serialized HTTP heads and subscription rebuilding every ten seconds after four seconds of stalling. Nonce/inflight/claim state survives. Application-owned recovery disables transport auto-reconnect paths that can log raw credential-bearing exceptions. Health records last safe error, connection counters and 15 MON funding warnings.
- Web production CSP restricts script/font/image sources to self; script nonces/hashes come from SvelteKit. Connections allow only self and validated configured public RPC/GraphQL origins, with no wildcard/userinfo/plaintext production endpoints. Inline styles support existing chart bindings. Zod's optional JIT is disabled before Mera schemas load to avoid eval probes. Route/client/render/fallback error boundaries use plain copy; no analytics added.
- Slither 0.11.5 ran all 101 detectors. All 23 findings have exact IDs, descriptions and individual justifications; changed IDs/severities/source hashes/tool version fail the gate. Source/storage/opcode gates remain in CI. Gitleaks scans full reachable history and non-ignored project files with narrowly shaped source-hash exceptions; no credentials are ignored wholesale.
- CI now uses inspected Node 24 action runtimes, pinned scanner configuration, full checkout history, reviewed Slither gate and the existing quality checks. Secret-scanner PR comments and secret artifact uploads are disabled. A remote run has not been triggered or claimed green.
- README, mechanism/rounding/invariant design, security review, AI component disclosure, operations, shot checklist and submission draft are prepared. Benchmark tables and current-branch build-window history are generated from repository evidence. Human review sign-off, hosted assets and actual recording values are honestly pending. Dependency license descriptions reflect installed notices, including Mera's dual license and Envio's separate terms.
- Read-only recording budget now covers three four-key Pete bursts and ten minutes of six-order Mo quotes, with explicit fee/cadence assumptions. At mainnet block 113009785 the sampled base fee was 100 MON-gwei; all seven recording/relayer keys are missing. Budget evidence reports readiness false and zero transfers.

## Verified

| Check | Result |
|---|---|
| `forge fmt --check`, `forge build --sizes` | Pass; auction 17,331-byte runtime; demo tokens 4,460; faucet 2,483. Existing lint notes do not fail these gates. |
| `pnpm proof:tests` / source/layout/opcode checks | 81 passed test functions/invariant predicates under MonadTen; fuzz ≥1,000, invariants 256 × depth 200. |
| `FOUNDRY_PROFILE=pre_mip8 forge test --gas-limit 100000000` | 79 Forge result entries, all passed; grouped invariant predicates explain the difference from 81. |
| Workspace typecheck/lint/test and script types/tooling | Pass: core 118, web 37, bots 30, default indexer 7 tests; tooling 5. Two live/fixture indexer tests are skipped by the default run; the receipt fixture separately executes actual handlers. |
| Workspace production builds | Pass; Svelte diagnostics zero errors/warnings. Vercel reports optional ws native acceleration modules absent; JS fallback remains available. |
| ABI, explicit gas, Cloud sources, contrast | Generated ABI unchanged; 71 client files pass gas policy; Cloud sources match canonical code; both theme palettes meet AA. |
| `python3 scripts/check-security.py` | Pass: 23 individually justified findings, zero unreviewed. No contract change needed; production source hashes/bytecode and benchmark limits remain unchanged. |
| `python3 scripts/check-secrets.py` | Full reachable history and every non-ignored project working file clean. Private env/tools/dependencies/vendored submodules are excluded as disclosed. |
| `S8_VERIFY=1 pnpm web:test-local` | Actual drip, signed fill, signature/expiry/replay rejection, low funding pause, address/IP quotas/no rejected sends and 20 consecutive indicative/onchain matches. |
| `pnpm receipts:test-local` | Three real local batches through actual Envio handlers, 18 preview comparisons, uniform prices, nonzero hypothetical replay, SSR and PNG checks. |
| `node scripts/test-bots-recovery.mjs` with local ws module | Six-second socket outage: HTTP catches up, two restart attempts restore WS; 11 fallback heads, zero reverts, max clear lag 2 blocks. Health correctly stays degraded while its five-minute error window retains the injected outage. |
| `node scripts/test-security-browser.mjs` with existing Puppeteer/Chrome/axe | Production build: 30 cases across Trade/orders/receipt/proof/404, light/dark at 375/768/1280, zero A/AA violations/outer overflow/unexpected policy errors. Hydrated share copies the actual receipt link. Inline script and third-party connection attempts are blocked. RPC is intentionally unconfigured in this browser audit; live endpoint functionality is verified separately. |

Evidence: [contract tests](verification/s8-contracts.json), [static security](verification/s8-security.json), [secrets](verification/s8-secrets.json), [web endpoints](verification/s8-web.json), [receipts](verification/s8-receipts.json), [socket outage](verification/s8-bots.json), [production browser](verification/s8-browser.json), [funding](verification/s8-funding.json), [commit window](verification/s8-commits.json), [release draft](verification/s8-release.json). The error page screenshot is in `docs/screens/s8-error-375.png`.

## Reproduce new checks

Install Slither in an isolated verification environment (`pip install slither-analyzer==0.11.5`) and Gitleaks 8.30.1; neither is a production dependency. Run the two Python security gates and `python3 scripts/prepare-release.py` to regenerate draft evidence/tables. Root `pnpm dev` starts the web app.

The production browser audit uses an existing module path in `PUPPETEER_MODULE`, an existing `axe.js` in `AXE_MODULE`, and Chrome in `CHROME_EXECUTABLE`; build the web and run the receipt fixture first. It serves actual handler-fixture data through temporary local TLS, never a hosted/mainnet data claim. OpenSSL creates an ignored one-day test certificate. The socket audit uses an existing `ws/wrapper.mjs` in `WS_MODULE`, builds bots first and launches its own loopback Anvil/proxy. Both scripts stop their temporary processes. These optional audit libraries are not added to the project dependency graph.

## Deferred release gates

The **S8 code/documentation implementation is complete; the public ship/recording acceptance is not**. Mainnet deployment/verification, permanent production domain/RP ID, hosted Envio/web/bots, dedicated funded keys, real hosted/two-week soak, three fresh physical-device flows under 60 seconds, phone/desktop recording, actual mainnet receipt/hash capture, GIF/video ≤3 minutes, public upload and completed dashboard submission remain external prerequisites. Each shot's blocker appears in `09_DEMO_SCRIPT.md`; unfilled fields remain in `10_SUBMISSION.md`.

Registration/rule/bounty wording requires the private dashboard, not the supplied participant transcription. Rahul's personal line-by-line review must occur before asserting it in submission copy. A day of submission margin is no longer achievable on the supplied deadline day and is not marked passed. No mainnet transaction, transfer, hosting publication, message to another person, push or submission is included in this request.

## Risks

Slither is not a proof or independent audit, especially for assembly. Original-escrow solvency wording is corrected to remaining claim entitlements after clearing. Same-price proofs apply inside a batch and do not promise identical quantities, effective tiny-order rates or inclusion. In-memory relay quotas/Pete caps reset; use dedicated keys and one bot instance. Fee/cadence budgets are assumptions and must be rechecked live. No production reliability or physical-provider compatibility is inferred from local fixtures. See `docs/SECURITY.md` and `docs/OPERATIONS.md`.

## Commit organization

Changes are saved in focused local commits: operations/web hardening; security/CI gates and individual review; recording budgets and executable integration evidence; final release documentation/status. The generated history snapshot can be refreshed after further commits with `scripts/prepare-release.py`. No history squash or push is performed.

Saved implementation milestones: `b5abfa3` operations/web hardening, `3b59405` security/CI review gates, `678752e` executable release verification/budgets. The final documentation commit follows these. The committed history snapshot lists 29 ancestors through these three milestones; its scope explicitly precedes the final documentation commit.
