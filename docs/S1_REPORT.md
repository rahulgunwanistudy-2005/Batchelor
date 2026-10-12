# S1 verification report

## Built

- PageBench: in-call gas deltas for contiguous/mapping reads and existing-slot writes. Seeding and measurement are separate isolated transactions.
- Actual transient reentrancy attempt and same-transaction unlock check under both Monad hardforks.
- Page-aligned BatchAuction shell with packed structs, intents, events, errors and API. Execution entrypoints revert `NotImplemented`; the shell cannot accept deposits.
- ERC20Permit demo token with immutable faucet-only minting and constructor-selected decimals; Faucet interface shell.
- pnpm workspace, strict TypeScript, generated ABIs, unset deployments and exact bigint market-unit formatting.
- Viem clients, serialized per-key nonce reservations and reconciliation, and a localhost Hono health endpoint.
- SvelteKit trade, receipt, orders and proof placeholders, self-hosted fonts, light/dark tokens, reduced-motion support, keyboard focus and honest empty states.
- Pinned dependencies, MIT license, environment example, secret/build exclusions and CI gates.

## Storage spike

Measured by `python3 scripts/spike.py` with official Foundry v1.8.0 and Solidity 0.8.28. Profiles compile identical runtime bytecode. Values include Solidity loop, bounds-check and checksum work; transaction overhead and event emission are outside the delta.

| Scenario | MonadNine gas | MonadTen gas |
|---|---:|---:|
| 512 contiguous reads | 4,226,086 | 162,086 |
| 512 mapping reads | 4,245,030 | 4,245,030 |
| 32 reads, one page | 264,166 | 16,166 |
| 32 reads, four pages | 273,158 | 49,158 |
| 64 existing-slot writes, one page | 713,574 | 26,774 |
| 64 existing-slot writes, separate pages | 715,942 | 709,542 |

Full-book ratio: **26.07x**, passing the >=10x gate. These are storage-probe measurements, not auction clearing benchmarks.

Mera 0.2.0's installed declaration returns `LocalAccount<"mera">` from `toViemAccount` and explicitly includes EIP-712 `signTypedData`. This verifies the adapter interface, not browser PRF behavior.

## Verified

| Command or check | Result |
|---|---|
| `forge config --json` in both profiles | `network=monad`; `monad:MonadTen` / `monad:MonadNine` |
| `forge fmt --check` in contracts/ | Passed |
| `forge build --sizes` in contracts/ | Passed; contract sizes below Monad limits |
| `forge test` | 8 tests passed |
| `FOUNDRY_PROFILE=pre_mip8 forge test` | 8 tests passed |
| `pnpm spike` | 7 probe tests per profile passed; identical bytecode; ratio gate passed |
| `pnpm check:contracts` | Required slots, struct sizes and priority-input gates passed |
| `pnpm gen` | Three ABIs generated from compiled artifacts |
| `pnpm exec tsc -p tsconfig.scripts.json` | Passed |
| `pnpm -r typecheck` | Passed; Svelte reports zero errors and warnings |
| `pnpm -r lint` | Passed; strict compiler diagnostics including unused symbols |
| `pnpm -r test` | 9 TypeScript tests passed; placeholder web package has no unit tests |
| `pnpm -r build` | Core, bot and production SvelteKit/Vercel build passed on Node 24 |
| Local HTTP checks | `/`, `/me`, `/proof`, `/b/1` return 200; health reports scaffold, no running bots and RPC not checked |
| Browser review | 375, 768 and 1280 px layouts reviewed; no horizontal overflow; screenshots in docs/screens/ |
| `python3 scripts/check-contrast.py` | All text palette colors pass normal-text WCAG AA on both backgrounds in both themes |
| `CHAIN=testnet pnpm spike:live` | Stopped at funding preflight; no transaction sent |

`pnpm sample:testnet` saved 200 consecutive linked testnet headers and 199 intervals: median 0s; mean 0.301508s. Header timestamps have whole-second resolution; the quantized median cannot measure subsecond cadence. Raw data: `contracts/bench/out/testnet-blocks.json`.

## Corrections to the pack

- Official upstream Foundry supports MonadTen/MIP-8; the legacy Category Labs fork only supports MonadNine.
- Mera requires Node >=24; workspace and Vercel runtime use Node 24 rather than 22.
- OZ EIP712 declares persistent fallback strings and must not be inherited above the ladder arrays. S2 needs a storage-free fixed-domain helper.
- Solidity packs `Order.lots` into the first slot, despite the bible's annotation. The declared struct still uses two slots; inspected evidence records exact offsets.
- Foundry's Solar linter must run from contracts/ in this release; `--root contracts` from the repository root fails relative import resolution.
- All broadcast output is ignored. Mainnet evidence must be exported explicitly in sanitized form.

## Deferred and risks

**Live emitted-gas parity remains pending.** The authorized project `.env` provides `TESTNET_PRIVATE_KEY`. Its account failed the funding preflight. The script required 3.06 testnet MON at the checked gas price before seeding the full nonzero book. No transaction was sent and no key was printed or committed. This is a conservative transaction-cap budget, not an exact fee quote. The supplied ~0.05 MON estimate is insufficient for this seeding transaction.

After funding the throwaway account, run `CHAIN=testnet pnpm spike:live`. The script requires chain ID 10143 and saves six emitted measurements and actual transaction hashes only after parity passes within 5%.

Local S1 implementation and quality gates pass. **S1 is not fully accepted until live parity passes.** Do not begin S2 under the pack's session-order rule. Auction uncrossing, settlement, invariants, gas bounds, live bots, relaying, Mera browser onboarding, Envio and deployments are later sessions.

The source list retains the supplied verification labels. Toolchain, MIP-8 gas rules, network metadata and the Mera adapter were rechecked during S1; unrelated hackathon and bounty claims were not independently reverified.
