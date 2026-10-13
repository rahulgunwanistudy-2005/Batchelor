# Sources (checked 12 Oct 2026)

Copy into the repo as `docs/SOURCES.md`. "Single source" means one origin; recheck on the dashboard or chain before relying on it.

| Claim | Source | Status |
|---|---|---|
| Rubric 5 × 20%, open source mandatory, video ≤ 3:00, AI disclosure, team size, one track, Monad proof §9.2, non-confidential review, bounty texts | [Merchant Rails README (transcribes Rules v3.0)](https://github.com/precious-akpan/monad-metropolis-merchant-rails) | Single source |
| Dates, tracks, prizes, judges, bounty list | [Metropolis page](https://monad.xyz/developers/hackathons/metropolis) | Verified |
| MIP-8: page = slot >> 7, 128 slots; cold 8,100, warm 100; write 2,800 per page per tx; state growth 17,000 | [MIP-8 spec](https://mips.monad.xyz/MIPs/MIP-8) | Verified |
| MIP-8 mainnet activation 2 Sep 2026 14:30 UTC (MonadTen); measured 8,100 / 100 / 8,100 on block 101672712 | [Releases](https://docs.monad.xyz/developer-essentials/changelog/releases), [CryptoSlate](https://cryptoslate.com/monads-mainnet-upgrade-makes-storing-data-together-98-cheaper/) | Verified |
| MIP-8 behavior for arrays, structs, mappings | [Monad blog: MIP-8](https://www.monad.xyz/blog/mip-8) | Verified |
| Foundry `network = "monad"`, `hardfork = "monad:MonadNine"`, default MonadTen | [Monad docs: Foundry](https://docs.monad.xyz/tooling-and-infra/toolkits/foundry.md), [Foundry networks config](https://www.getfoundry.sh/config/networks) | Verified |
| Category Labs Foundry build | [Monad Foundry](https://docs.monad.xyz/tooling-and-infra/toolkits/monad-foundry) | Verified |
| Block time ~300 ms (Sep 2026 mean ~302 ms), 150M block gas, 30M tx cap, chain ids, RPCs, explorers | [Current facts](https://docs.monad.xyz/ai/current-facts.md) | Verified |
| Gas billed on limit; min base fee 100 MON-gwei; 200k-gas tx ≈ 0.02 MON; priority gas auction ordering | [Gas pricing](https://docs.monad.xyz/developer-essentials/gas-pricing) | Verified |
| 7.5% gas-limit buffer; no global mempool; nonce tracking; receipt vs finality | [Wallet developer guide](https://docs.monad.xyz/developer-essentials/wallet-developers), [Category Labs gas-limit analysis](https://www.category.xyz/blogs/setting-your-gas-limit-on-monad) | Verified |
| Reserve balance 10 MON; k = 3 blocks | [Reserve Balance](https://docs.monad.xyz/developer-essentials/reserve-balance) | Verified |
| eth_getLogs 100-block cap | [RPC limits](https://docs.monad.xyz/reference/rpc-limits) | Verified |
| Testnet canonical contracts, faucet, RPC rate limits (page shows a stale revision; current-facts shows MONAD_TEN) | [Testnets](https://docs.monad.xyz/developer-essentials/testnets) | Verified, partly stale |
| Faucet 1 MON / 24 h | [Alchemy faucet](https://www.alchemy.com/faucets/monad-testnet) | Single source |
| Mera API, PRF requirement, Chrome caveat, rpId binding, error codes | [Mera guide](https://docs.monad.xyz/guides/mera.md), [Mera launch](https://monad.xyz/blog/introducing-mera) | Verified |
| Envio Monad testnet support, HyperSync URL, free dev tier | [Envio: Monad testnet](https://envio.dev/chains/monad-testnet) | Verified (mainnet id: confirm in S5) |
| Envio `field_selection` fields, v3 `chains:` | [Envio config reference](https://docs.envio.dev/docs/HyperIndex/config-schema-reference.md) | Verified |
| Call-auction price rules: max volume, lowest surplus, market pressure, reference price | [Xetra T7 Market Model R10.1](https://www.eurexchange.com/resource/blob/3044352/a96e9c96638e877d08aa81d74c4a5f16/data/T7_Release_10.1_-_Market_Model%20_Xetra.pdf) | Verified |
| Batch auctions remove intra-batch ordering advantage; latency rents in DEXes | [arXiv 2302.01177](https://arxiv.org/pdf/2302.01177) | Verified |
| CoW Protocol batch length ≈ 30 s, solver-settled | [Spark glossary](https://www.spark.money/glossary/dex-aggregator) | Secondary source |
| Keone Hon's HFT background | [Phemex profile](https://phemex.com/academy/keone-hon-monad-founder-fastest-evm-chain) | Secondary source |
| MON ≈ $0.027 (FDV $2.7B / 100B supply) for budget estimates | [Token Terminal](https://tokenterminal.com/explorer/projects/monad) | Derived; check the live price |
| Gas estimates in the bible (≈ 83K vs ≈ 4.1M for a full scan) | Arithmetic from the MIP-8 constants | Estimate until S1/S3 measure it |

## S3 rechecks (12 Oct 2026)

- [Official deployment summary](https://docs.monad.xyz/developer-essentials/summary) confirms Foundry >=1.8, 128-slot pages, current cold storage/write costs, 300 ms cadence, local mempools, 30M transaction and 150M block limits.
- [Gas pricing](https://docs.monad.xyz/developer-essentials/gas-pricing) confirms limit billing, the 100 MON-gwei floor, and default priority ordering.
- [Category Labs gas-limit analysis](https://www.category.xyz/blogs/setting-your-gas-limit-on-monad) motivates the 7.5% margin; it does not guarantee a transaction cannot run out of gas.
- The supplied claim that no global mempool prevents every intra-batch reaction is too strong: local validators/RPC operators still see transactions. Documentation now bases the same-price claim on the tested allocation rules.
- MIP-8 spec, blog, and standalone Foundry page were unavailable through the reader in this session; the accessible official deployment summary and the resolved local Foundry configuration supply the relevant implementation evidence.
- All S3 gas figures come from the runner; live confirmation and transaction hashes are in `contracts/bench/out/clear-live-testnet.json`.

## S5 rechecks — 13 Oct 2026

| Claim | Primary source | Result |
|---|---|---|
| Monad mainnet/testnet names and endpoints | [Monad](https://envio.dev/chains/monad), [Monad testnet](https://envio.dev/chains/monad-testnet) | `monad` (143), `monad-testnet` (10143); use numeric IDs in verified v3 configs |
| Current v3 registration, entity filtering and test helper | [Handlers](https://docs.envio.dev/docs/HyperIndex/event-handlers), [Testing](https://docs.envio.dev/docs/HyperIndex/testing) | `indexer.onEvent`, `getWhere`, `createTestIndexer().process({chains: ... simulate})`; pinned CLI 3.14.0 successfully code-generates |
| Paid fee metadata selection | [Config reference](https://docs.envio.dev/docs/HyperIndex/config-schema-reference) | Receipt `effectiveGasPrice`, transaction index/hash/max-priority cap, block base fee selected |
| Cloud deployment directory and dependency constraints | [Cloud troubleshooting](https://docs.envio.dev/docs/HyperIndex/envio-cloud-troubleshooting) | Only selected directory is uploaded; shared code requires a standalone package; exact Envio version pin |
| Cloud dev-tier operations and endpoint retrieval | [Cloud CLI](https://docs.envio.dev/docs/HyperIndex/envio-cloud-cli) | Development tier and actual deployment endpoint are supported; no project/endpoint is invented |
| Testnet handler/settlement compatibility | Repository `indexer/test/chain.test.ts`, [`indexer/evidence/testnet-replay.json`](../indexer/evidence/testnet-replay.json) | Actual S3 receipts replayed through Envio; 256 historical preview comparisons passed; this is not hosted sync evidence |

## S6 implementation verification (13 Oct 2026)

Mera integration was checked against installed `@category-labs/mera` 0.2.0 declarations/source (`passkey`, `types`, `secp256k1`, `viem`) and the official Mera guide retained from S1. It uses the exact RP/user/credential option shapes and standard BIP-44 derivation; provider compatibility remains a physical-browser acceptance gate. The source pack's Node 22 recommendation remains superseded by Mera's Node >=24 requirement.

Uncrossing/settlement and EIP-712 behavior are checked against the repository Solidity implementation and exported golden vectors, rather than assumed from prose. S6 introduces no new protocol claims from the supplied sources table. Local execution, price comparisons and Lighthouse outputs are recorded in `docs/verification/`; localhost addresses are fixture evidence, not public deployments.

## S7 recheck (13 Oct 2026)

- [Official gas pricing](https://docs.monad.xyz/developer-essentials/gas-pricing): confirmed limit billing, priority ordering, minimum base fee and 150M block capacity. These protocol values live in `docs/verification/monad-facts.json`; measured auction costs remain generated benchmark data.
- [Official deployment summary](https://docs.monad.xyz/developer-essentials/summary): confirmed page-priced storage, approximate block interval, local mempools and MonadVision. The MIP-8 spec and current-facts URL were unavailable through the web reader during this recheck; no new claim relies on those failed reads.
- [Mainnet MonadVision](https://monadvision.com) and [testnet MonadVision](https://testnet.monadvision.com): receipt explorer destinations are reachable. This does not confirm source verification for any project contract.

## S8 implementation recheck (13 Oct 2026)

- [SvelteKit CSP configuration](https://svelte.dev/docs/kit/configuration), checked against installed SvelteKit 2.70.3 types and runtime: automatic script nonces/hashes, dynamic policy in a server hook. The current web docs redirect to the newer configuration reference; this repo retains its verified SvelteKit 2 config file.
- [Slither usage](https://github.com/crytic/slither/wiki/Usage): Foundry compilation, JSON results and dependency/path filtering. The actual 0.11.5 run includes 101 detectors and individually records all 23 project findings; source hashes prevent stale review.
- [Gitleaks CLI](https://github.com/gitleaks/gitleaks) and [Action](https://github.com/gitleaks/gitleaks-action): version 8.30.1 history/working-file scans and precise source-hash exceptions. Action v3 uses Node 24; scanner version/config are explicit, and PR comments are disabled.
- Node 24 action runtimes verified in official manifests: [checkout v6](https://raw.githubusercontent.com/actions/checkout/v6/action.yml), [setup-node v6](https://raw.githubusercontent.com/actions/setup-node/v6/action.yml), [setup-python v6](https://raw.githubusercontent.com/actions/setup-python/v6/action.yml), [pnpm action v5](https://raw.githubusercontent.com/pnpm/action-setup/v5/action.yml). This does not establish a successful remote CI run.
- Installed Zod 4.6.6 `v4/core/util.js` and `schemas.js` confirm `z.config({jitless:true})` skips the optional Function/eval probe. Production browser verification confirms no CSP violation after configuring it before Mera schemas load; scripts remain restricted.
- Installed package notices verified: Mera 0.2.0 is MIT OR Apache-2.0. Envio 3.14.0's `licenses/README.md` explicitly distinguishes generator/generated-code terms and says its licensing is not OSI recognized; no MIT label is assumed. These observations are dependency metadata, not a legal opinion or dashboard eligibility decision.
- Read-only mainnet RPC funding check: chain 143, block 113009785, sampled base fee 100,000,000,000 wei. All seven relayer/bot keys are missing, readiness false, transfers sent zero. Budgets are script-derived fee-cap reservations, not promised live costs.
- Private hackathon dashboard, registration, current bounty wording, production contracts/hosting and public video were not accessed or represented as verified. The supplied Rules transcription remains single-source context.
- [upload-artifact v6 manifest](https://raw.githubusercontent.com/actions/upload-artifact/v6/action.yml) uses Node 24. The inspected v5 manifest uses Node 20, so the workflow selects v6. [Foundry action v1](https://raw.githubusercontent.com/foundry-rs/foundry-toolchain/v1/action.yml) also uses Node 24.
