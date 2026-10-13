# Batchelor

**Every block, one price. No favorites.**

A frequent batch auction for Monad. Orders in one block clear together at a uniform price. The project is at **S5: indexed receipts and history implemented**. Deposits, direct and signed orders, cancellation, self-clearing, claims, withdrawals, and daily demo-token drips are implemented and tested locally. Keeper settlement, on-demand liquidity, a capped four-key priority bot and authenticated controls are implemented. Envio v3 handlers and typed GraphQL queries now drive batch receipts, history and live gas statistics when connected. Passkey onboarding remains later-session work; live bot deployment and hosted indexing await configured deployments, credentials and funding.

The local storage gate passed on identical bytecode under MonadNine and MonadTen. Run `pnpm spike` to reproduce it; measured evidence lives in [`contracts/bench/out/spike.json`](contracts/bench/out/spike.json). This measures storage reads and writes, **not auction clearing gas**. The live transaction comparison remains pending a funded throwaway testnet key.

## Development

Use Node **24.19.0**, pnpm **9.15.9**, official Foundry **v1.8.0**, and Solidity **0.8.28**. Mera 0.2.0 requires Node >=24; this corrects the build pack's Node 22 pin. Official Foundry supports MonadTen; the legacy Monad fork does not.

```sh
git clone --recurse-submodules https://github.com/rahulgunwanistudy-2005/Batchelor.git
cd Batchelor
pnpm install --frozen-lockfile
cd contracts
forge build
cd ..
pnpm gen
pnpm --filter web dev
```

Copy `.env.example` to an ignored `.env` only when configuring local services. No real key is required to build or test. All deployments are unset; the pages display honest empty states.

## Verification

```sh
cd contracts
forge fmt --check
forge build --sizes
forge test
FOUNDRY_PROFILE=pre_mip8 forge test --gas-limit 100000000
cd ..
pnpm spike
pnpm check:contracts
pnpm gen
pnpm exec tsc -p tsconfig.scripts.json
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm -r build
```

`lint` uses strict TypeScript/Svelte diagnostics, including unused locals and parameters. The contract check validates ladder slots, packed struct sizes, and absence of priority-related opcodes in production runtime instructions. Solidity sources are checked too. CI runs both hardforks and rejects a storage ratio below 10x.

```sh
pnpm --filter @batchelor/bots build
pnpm --filter @batchelor/bots start
# GET http://127.0.0.1:3001/health
```

The S4 service binds to `0.0.0.0` for hosting and refuses incomplete configuration. It checks both RPC chain IDs and market parameters before subscribing. Both `/wake` and `/unleash` require a bearer token; `/health` reports actual balances, subscription freshness, recent errors and settlement statistics. Mainnet sends require a separate approved activation.

## Live spike

`pnpm sample:testnet` saves 200 consecutive testnet headers and interval statistics. Header timestamps have whole-second resolution; their median cannot establish subsecond cadence.

For emitted-gas parity, set `CHAIN=testnet`, `RPC_HTTP`, and a funded throwaway `TESTNET_PK` (or `TESTNET_PRIVATE_KEY`) in `.env`, then run `pnpm spike:live`. The script rejects every chain ID except 10143, deploys and seeds PageBench, and checks six measurements against local MonadTen within 5%. It saves addresses and transaction hashes to `contracts/bench/out/live-testnet.json`. Seeding 1,024 nonzero slots requires substantially more gas than a read; the script checks funding and caps every transaction at the protocol limit. Never use a production or mainnet key.

## Layout

```text
contracts/         Auction, settlement libraries, demo faucet, reference model and proofs
packages/core/     Generated ABIs, deployments, bigint formatting and exact settlement
services/bots/     Keeper, Mo, Pete, authenticated conductor, rehearsal and soak tooling
apps/web/          SvelteKit pages: trade, receipt, orders, proof
indexer/           Envio handlers, audits and standalone Cloud package
scripts/           ABI generation, storage/layout gates, testnet checks
docs/              Sources and S1/S2/S3/S4 verification reports
tasks/             Build plan and lessons
```

See [`docs/S2_REPORT.md`](docs/S2_REPORT.md) for the eight-invariant mapping, test results, storage layout, size output, and specification resolutions. [`docs/S1_REPORT.md`](docs/S1_REPORT.md) retains the storage spike evidence and pending live validation. See [`docs/WHY_MONAD.md`](docs/WHY_MONAD.md) for S3 clearing costs, page-layout ablation, explicit client gas limits, and live testnet transaction evidence.

To reproduce S2 acceptance gates and the 10,000-run checks:

```sh
python3 scripts/verify-auction.py
python3 scripts/verify-auction.py --stress
```

Machine-readable evidence and exact output are written to `contracts/bench/out/s2/`. `packages/core/test/vectors.json` contains 50 deterministic books, exported by Foundry and cross-checked against the independent reference model. Quantity fields are decimal strings for future TypeScript bigint consumers.

MIT licensed.

## Auction gas proof (S3)

```sh
pnpm bench                 # Runs both hardforks twice and regenerates evidence/limits/report
pnpm check:gas             # Rejects auction transaction clients without shared explicit gas
python3 scripts/verify-auction.py --out contracts/bench/out/s3
python3 scripts/verify-auction.py --stress --out contracts/bench/out/s3
```

Full-range production clearing: **4,436,713 gas under MonadNine vs 342,713 under MonadTen (12.946×)**. The 250K optimization target remains unmet. The runner keeps the pre-optimization measurements and checks identical bytecode, exact repeatability, and order-count independence. `packages/core/src/gas.json` contains transaction limits; `transactionGas` selects self-clearing budgets and rejects oversized order/claim chunks. The `/proof` page displays measured values.

The S3 testnet market was deployed and its 256-order, 128-tick-per-side batch self-cleared in **213,565 gas**, exactly matching the local fixture. Addresses and seven successful transaction hashes are saved in `contracts/bench/out/clear-live-testnet.json`. This is a separate diagnostic deployment; mainnet trading is still unconfigured. No mainnet transaction was sent.

`pnpm bench:live` is testnet-only and requires `TESTNET_PK` or `TESTNET_PRIVATE_KEY`. It preflights the remaining measured gas budget and checkpoints each broadcast. An existing passed checkpoint exits without new transactions. Preserve failed/interrupted evidence before attempting a new run; the script refuses changed bytecode, payloads, keys, or nonces.

## Deployment and bots (S4)

See [`services/bots/README.md`](services/bots/README.md) for configuration, funding, seeding, rehearsal, soak and Docker/Fly instructions. [`docs/S4_REPORT.md`](docs/S4_REPORT.md) distinguishes local evidence from pending live acceptance gates.

```sh
pnpm deploy:plan          # Read-only Foundry simulation; prints measured limits and current MON cost
pnpm funding:plan         # Read-only wallet and per-burst budget; never transfers funds
pnpm verify:bundle        # Export compiler metadata and exact sources locally
pnpm test:tooling          # Deployment receipt/constructor validation tests
```

After a successful explicitly executed deployment, `pnpm gen` validates four successful CREATE receipts and generates addresses. Dry-run addresses never populate the app. Sourcify bundles are exported to `deployments/verification/`; **S4 contracts are not yet publicly deployed, verified or published to Sourcify**. The operations guide includes the verification commands; none is claimed as a successful live verification.

## Indexed receipts

See [indexer/README.md](indexer/README.md) for configuration, Cloud packaging, public web variables and the read-only rehearsal audit. The application shows unavailable-data states until a real endpoint and matching market are configured. S5's implementation, verification evidence and remaining hosted/mainnet gates are recorded in [docs/S5_REPORT.md](docs/S5_REPORT.md).

### S6 trading app

The web app now supports Mera passkey accounts, gasless faucet/orders, a live block-pinned auction chart, bot controls, indexed account history, cancellation and direct withdrawal. See [S6 report](docs/S6_REPORT.md) for setup, measured verification and the remaining physical-phone/production gates. Choose the permanent production hostname and set `PUBLIC_RP_ID` before onboarding users. `pnpm web:test-local` verifies the actual web endpoints and 20 maker-only price comparisons on a temporary local MonadTen chain; it sends no live transaction.
