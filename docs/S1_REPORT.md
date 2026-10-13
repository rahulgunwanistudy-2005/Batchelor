# S1 verification report

The scaffold checks below record the original S1 session. Live storage validation was completed on 13 October 2026, as detailed below.

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
| `CHAIN=testnet pnpm spike:live` | Completed on 13 October: eight successful testnet transactions; all six measurements match local gas exactly |

`pnpm sample:testnet` saved 200 consecutive linked testnet headers and 199 intervals: median 0s; mean 0.301508s. Header timestamps have whole-second resolution; the quantized median cannot measure subsecond cadence. Raw data: `contracts/bench/out/testnet-blocks.json`.

## Corrections to the pack

- Official upstream Foundry supports MonadTen/MIP-8; the legacy Category Labs fork only supports MonadNine.
- Mera requires Node >=24; workspace and Vercel runtime use Node 24 rather than 22.
- OZ EIP712 declares persistent fallback strings and must not be inherited above the ladder arrays. S2 needs a storage-free fixed-domain helper.
- Solidity packs `Order.lots` into the first slot, despite the bible's annotation. The declared struct still uses two slots; inspected evidence records exact offsets.
- Foundry's Solar linter must run from contracts/ in this release; `--root contracts` from the repository root fails relative import resolution.
- All broadcast output is ignored. Mainnet evidence must be exported explicitly in sanitized form.

## Live storage validation — completed 13 October 2026

The configured throwaway wallet had sufficient testnet funding. The probe was deployed and seeded in separate transactions before the six measurement calls. All eight receipts succeeded, expected calldata/nonce sequence and event checksums were verified, and deployed runtime bytecode exactly matches the locally measured artifact.

- Testnet chain ID: `10143`.
- Probe: [`0xfbc274c96b15cfd7728cabb56466dea69e1538d8`](https://testnet.monadvision.com/address/0xfbc274c96b15cfd7728cabb56466dea69e1538d8).
- Runtime SHA-256: `775dd28935a7506ef359981d323d9ea3330c26bde82b15a4920bcf1b26038eea`.
- Recorded wallet balance before: **12.246612 testnet MON**.
- Actual charged fees across all eight transactions: **3.20404338 testnet MON**.
- Recorded wallet balance after: **9.04256862 testnet MON**.

The balance change exactly matches the sum of each declared gas limit multiplied by its receipt effective gas price. All transactions sent zero MON value; keys are absent from the public evidence.

| Scenario | Local MonadTen gas | Live testnet gas | Difference |
|---|---:|---:|---:|
| contiguous512 | 162,086 | 162,086 | 0 |
| scattered512 | 4,245,030 | 4,245,030 | 0 |
| onePage32 | 16,166 | 16,166 | 0 |
| fourPages32 | 49,158 | 49,158 | 0 |
| writeOnePage64 | 26,774 | 26,774 | 0 |
| writeSeparatePages64 | 709,542 | 709,542 | 0 |

The required tolerance is 5%; every observed difference is zero. The local MonadNine/MonadTen full-book ratio remains **26.07x**. These are storage probes, not auction-clearing measurements.

| Transaction | Receipt | Charged testnet MON |
|---|---|---:|
| deploy | [block 70672183](https://testnet.monadvision.com/tx/0xc1d9bda33959e1f096670c005e73f308f5a201adb29414408841566b7d90cd33) | 0.042470046 |
| seed | [block 70672190](https://testnet.monadvision.com/tx/0xbd953ef509ad44bf5f1afa0bc009383b8bc9a74fb31c7fd04ea7b5635583b1d2) | 2.570160708 |
| readContiguous512 | [block 70672196](https://testnet.monadvision.com/tx/0xf54a7cab7b2ce61712e6386878c6232dd43376c4ac2933965e983b0e688b3abe) | 0.020595024 |
| readScattered512 | [block 70672202](https://testnet.monadvision.com/tx/0x297be8a4a669a33ea4ab109f71c1cc2d71f3127fb1ee47f1a4dabeb6d357ba45) | 0.471839352 |
| readContiguous32OnePage | [block 70672208](https://testnet.monadvision.com/tx/0x9d1ae910726a3dfdb382d030fa716b2c1ee42b91fe424ff4be3d89e5eb85b61e) | 0.004348566 |
| readContiguous32FourPages | [block 70672214](https://testnet.monadvision.com/tx/0xbbbe1b3698a2fd796ea84af3b90d9077fc3ad3162d0a738206a2e69054f7d79d) | 0.008023422 |
| write64OnePage | [block 70672220](https://testnet.monadvision.com/tx/0xbb3684dec7e8b62497710792b683ae64bd2fa3532643d2ec5b3cdc88edcdf40b) | 0.005510856 |
| write64SeparatePages | [block 70672226](https://testnet.monadvision.com/tx/0x6e93f479b769d7bf31a5ae0bfee4dd23d7694a14d8a8e3e9fc5524704f33d7d7) | 0.081095406 |

## Reproduction and acceptance

- `python3 scripts/spike.py`: same-bytecode storage gate and transient reentrancy tests pass under both hardforks. Completed live evidence survives reruns; mismatched bytecode, failed receipts or excessive deviation mark it stale.
- `python3 -m unittest discover -s scripts -p test_spike.py`: six regression tests pass for retaining/invalidation of live proof.
- `node node_modules/typescript/bin/tsc -p tsconfig.scripts.json`: changed verification tooling typechecks.
- `node --experimental-strip-types scripts/verify-live-spike.ts`: rechecks actual testnet code, receipt status, calldata, nonce/block order, checksums, gas parity and wallet fee reconciliation without signing or sending anything.

Raw evidence: `contracts/bench/out/live-testnet.json`. The local summary at `contracts/bench/out/spike.json` now records `liveTestnet.status=passed`. **All S1 acceptance gates are complete.** No mainnet transaction was sent.

The source list retains the supplied verification labels. Unrelated hackathon and bounty claims were not independently reverified during this storage check. Initial scaffold CI passed on commit `74d01b9`; subsequent application work is outside this validation's scope.
