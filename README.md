# Batchelor

**Every block, one price. No favorites.**

A frequent batch auction for Monad. Orders in one block are intended to clear together at a uniform price. The project is at **S1: measured storage spike and development scaffold**. Trading, deposits, settlement, faucet drips, passkey onboarding, and live indexing are not implemented yet.

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
FOUNDRY_PROFILE=pre_mip8 forge test
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

The S1 health service binds to localhost. It reports which wallets are configured and explicitly marks bots as not started. It does not broadcast transactions or claim the RPC is healthy without checking it.

## Live spike

`pnpm sample:testnet` saves 200 consecutive testnet headers and interval statistics. Header timestamps have whole-second resolution; their median cannot establish subsecond cadence.

For emitted-gas parity, set `CHAIN=testnet`, `RPC_HTTP`, and a funded throwaway `TESTNET_PK` (or `TESTNET_PRIVATE_KEY`) in `.env`, then run `pnpm spike:live`. The script rejects every chain ID except 10143, deploys and seeds PageBench, and checks six measurements against local MonadTen within 5%. It saves addresses and transaction hashes to `contracts/bench/out/live-testnet.json`. Seeding 1,024 nonzero slots requires substantially more gas than a read; the script checks funding and caps every transaction at the protocol limit. Never use a production or mainnet key.

## Layout

```text
contracts/         Contract shells, demo token, benchmark probes and tests
packages/core/     Generated ABIs, unset deployments, bigint formatting
services/bots/     Chain clients, serialized nonces, local health service
apps/web/          SvelteKit pages: trade, receipt, orders, proof
indexer/           S5 placeholder
scripts/           ABI generation, storage/layout gates, testnet checks
docs/              Sources and S1 verification report
tasks/             Build plan and lessons
```

See [`docs/S1_REPORT.md`](docs/S1_REPORT.md) for results, corrections, and pending gates. Auction correctness and clearing-gas bounds are later-session work. This scaffold must not be deployed as a functioning exchange.

MIT licensed.
