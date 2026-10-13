# Hosted build settings

These settings deploy the S1–S8 Svelte app. The separate Next.js frontend on GitHub `main` is not this release; select the branch containing `apps/web` and the completed release commits explicitly.

## Vercel web project

GitHub release branch: `codex/host-render-vercel`. Import that branch, then set it as the project's Production Branch. Keep Root Directory `apps/web`; `apps/web/vercel.json` supplies the SvelteKit build/install commands. Do not import the repository root as Next.js for this release.

| Setting | Value |
| --- | --- |
| Root Directory | `apps/web` |
| Framework Preset | SvelteKit |
| Include source files outside Root Directory | Enabled |
| Node.js Version | 24.x |
| Build Command | `pnpm build` |
| Install Command | `pnpm install --frozen-lockfile` |
| Output Directory | Framework default |
| Build environment | `ENABLE_EXPERIMENTAL_COREPACK=1` |

Parent sources are required for the shared core package, proof generator and recorded contract evidence. Corepack uses the repository's pinned pnpm 9.15.9. Confirm `python3 --version` in the initial build; the proof generator uses only Python's standard library. If the selected build image lacks `python3`, use `dnf install -y python3 && pnpm install --frozen-lockfile` as the Install Command. Vercel documents both its build image and installing additional packages.

A fresh hosting clone does not contain ignored Foundry output. The build validates the versioned `docs/verification/contract-proof.json`, including hashes of production, test and benchmark Solidity sources, before producing the Proof page. After a Solidity or Foundry configuration change, run `pnpm proof:tests`, then rebuild and commit the updated evidence. A stale or unsuccessful record fails the build; the host does not run or fabricate contract tests.

Configure the deployment's real environment values from `.env.example`: matching public/server chain and market, faucet, RPC, funded relayer, authenticated bot URL/token, actual Envio GraphQL endpoint and a permanent `PUBLIC_RP_ID`. Public values are visible to visitors. Redeploy after changing hosting environment settings. A successful web build alone does not establish live trading, funded services or physical-device passkey support. Relayer coordination and quotas are per process; Vercel can run several instances. Use the documented controlled-demo scope and monitor funding. Durable shared coordination is required before claiming robust multi-instance production operation.

Local verification: production Vercel output built successfully from a temporary source snapshot with no `contracts/out/test-summary.json`. Dependencies were copied from the installed workspace; this verifies the fresh-source proof path and application build, rather than a hosted deployment or a fresh network dependency download. Regression tests reject a changed benchmark and a failed recorded contract test.

### Testnet environment for Vercel

Set `CHAIN` and `PUBLIC_CHAIN` to `testnet`, `MARKET_ADDRESS` and `PUBLIC_MARKET_ADDRESS` to `0x2B74dA5CD3fae739D952cbA6D93DCfba5832Ff45`, and `FAUCET_ADDRESS` to `0xAd20E8A597D1FEE68f74057eDDBf4CAEa408c98E`. Keep `MAINNET_SENDS_ENABLED=false`. Use the configured testnet RPC provider for `RPC_HTTP`, `PUBLIC_RPC_HTTP` and `PUBLIC_RPC_WS`; browser values must contain no private provider key.

After project creation, set `PUBLIC_RP_ID` to the permanent production hostname without `https://`. Add the dedicated testnet `RELAYER_PK`, the Render service's actual HTTPS `BOTS_URL`, and the same private `BOTS_TOKEN` on both services. Add `PUBLIC_ENVIO_GRAPHQL_URL` only after obtaining the real indexed GraphQL endpoint. Set public Mo/Pete actor addresses from their dedicated wallets if actor labels are desired. Redeploy before creating passkeys. Missing funding/indexing must remain visibly unavailable.

## Render bot service

Import the repository's `render.yaml` from `codex/host-render-vercel` as a Blueprint. It defines exactly one Free Docker web service, no paid workers, databases, disks or scheduled jobs. Its Docker context is the repository root; its Dockerfile is `services/bots/Dockerfile`. The service binds Render's `PORT` on `0.0.0.0` and uses `/livez` for process liveness. `/health` remains the trading-readiness endpoint and can return 503 for missing funding, stale heads or pending claims. Binding starts before historical recovery; wake/unleash return 503 until recovery completes.

Enter private `RPC_HTTP`, `RPC_WS`, `BOTS_TOKEN` and the six distinct dedicated testnet bot keys when Render prompts for `sync: false` values. Existing ignored `.env.testnet.local` contains the generated keys, but they are unfunded: publishing a process does not enable trading. Never reuse the deployment key as a service key. No mainnet sends are enabled. The testnet market and its original deployment block are fixed in the Blueprint so recovery includes all existing events. Check the RPC supports historical log windows; the unredeemed Dwellir Free account is not assumed to support them.

Auto-deployment is explicitly off to avoid repeated builds and restart races. Deploy reviewed updates manually. For the recording campaign, Pete is limited to one burst per process/day; process restarts reset that in-memory cap. Free Render instances sleep after 15 minutes without incoming traffic and may restart; this is a demo host, not an always-on keeper guarantee. Do not add artificial keep-alive traffic. Open the app and wait for `/health` readiness before recording.

To honor the no-real-money constraint, use a workspace without a payment method or verify billing spend controls before starting. Render can charge supplementary bandwidth/build usage when a payment method is attached, even for Free instances. Do not upgrade or add a card. Render/Vercel account access, billing checks and public endpoint acceptance are still pending; these files prepare deployment rather than establish that hosting is live.

References: [Render Blueprint fields](https://render.com/docs/blueprint-spec), [Render Free limits and supplementary usage](https://render.com/docs/free), [Vercel Git deployments](https://vercel.com/docs/git).

## Envio Cloud project

Use Root Directory `indexer/cloud`, config file `config.yaml`, and the explicitly selected release/deployment branch. All handler and settlement imports live inside that directory. The standalone package pins Envio 3.14.0, TypeScript 5.9.3, Node 24 and pnpm 10.32.0; its own lockfile is separate from the root pnpm 9 workspace.

First validate the actual deployment with `pnpm --filter @batchelor/indexer configure`, then prepare the Cloud directory with `node indexer/src/cloud.ts --deployment`. The committed Cloud configuration now targets the verified testnet market at deployment block 70756591. Mainnet requires its own successful deployment and configuration; do not relabel this testnet configuration. Update the standalone lockfile using pnpm 10.32.0 if its dependencies change, and run `pnpm --filter @batchelor/indexer cloud:check` before pushing.

The standalone package installed with pnpm 10.32.0 and passed `envio codegen && tsc --noEmit` in a temporary directory. This does not establish a Cloud account, synced deployment, GraphQL URL or measured hosted lag. Confirm the repository is within Cloud's 100 MB limit in its deployment dashboard; local `.git` sizes include submodule stores and do not establish hosted repository size.

## Review and execute deployment calls

Run `CHAIN=testnet pnpm deploy:plan` (or a configured mainnet dry run) to save the exact four CREATEs, their gas limits and fixed EIP1559 caps. `costMON` is the maximum fee commitment, computed from each declared gas limit multiplied by `maxFeePerGas`; it is not an estimate based on gas actually used. Review the constructor arguments, addresses, signer, chain, nonces, calldata file and printed plan hash.

Only after explicit approval, set `DEPLOY_PLAN_HASH` to that reviewed hash and run the same tool with `--execute`; mainnet additionally needs `MAINNET_DEPLOY_APPROVED=true`. Execution reloads the saved plan unchanged, compares a fresh simulation and source fingerprint, and rejects changed gas limits, calldata, nonces, account, source or fees above the cap. Viem signs the approved calldata with fixed gas and fee fields; Forge is used only for read-only simulation. Four confirmations separate sends. A failed or ambiguous submission stops execution and its pre-recorded hash remains in an ignored checkpoint. An existing checkpoint blocks all subsequent runs pending manual review, including reruns after successful deployment.

These CREATEs carry zero MON value. Monad's default 10 MON reserve limits inflight gas commitments and value spending; it is not a blanket 10 MON minimum for these gas-only deployments. Each planned transaction must fit within the 10 MON gas commitment and the signer must cover all four capped fees. Waiting four confirmations between sends limits overlap across the documented three-block execution delay. This deployment policy does not fund or activate the separate relayer/bot wallets, whose retained balances and campaign budgets are different operational requirements. See [Monad reserve rules](https://docs.monad.xyz/developer-essentials/reserve-balance) and [gas pricing](https://docs.monad.xyz/developer-essentials/gas-pricing).

## Authoritative references

- [Vercel monorepo source access](https://vercel.com/docs/monorepos/monorepo-faq)
- [Vercel build settings and Corepack](https://vercel.com/docs/builds/configure-a-build)
- [Vercel Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Vercel build image and additional packages](https://vercel.com/docs/builds/build-image)
- [Envio Cloud deployment requirements](https://docs.envio.dev/docs/HyperIndex/hosted-service-deployment)

References checked on 13 October 2026. Actual deployment checks remain necessary after account/project configuration.
