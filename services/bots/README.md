# Controlled demo bots

One Node 24 process runs the keeper, seeded market maker Mo, four-key Pete and Hono control API. Start a **single instance**; each key must be dedicated to that instance. Concurrent replicas or external use of a bot key defeat local nonce ownership. Startup refuses keys with unresolved pending transactions from a prior instance. Daily caps are in memory, use UTC days, and reset on restart as specified in S4.

## Configure and deploy

Build contracts first, then `pnpm gen` and `pnpm --filter @batchelor/bots build`. Use distinct ignored environment files for each chain. Configure `RPC_HTTP`, `RPC_WS`, `MARKET_ADDRESS`, `FAUCET_ADDRESS`, `START_BLOCK`, all six bot keys and a random bearer `BOTS_TOKEN` of at least 24 characters. Both transports must return the intended chain ID. `START_BLOCK` is the deployment block; generated addresses provide it when they match the selected market. History catch-up must finish before controls become available.

The pack's Node 22 pin was corrected to Node 24 in S1. Immutable demo-token minters require predicting the faucet's fourth CREATE address; no mutable mint role is added.

```sh
# Read-only simulation, using DEPLOYER_PK or the existing testnet key alias:
CHAIN=testnet pnpm deploy:plan
# Explicit testnet broadcast, once the reviewed plan is funded:
CHAIN=testnet DEPLOY_PLAN_HASH=<printed-reviewed-hash> pnpm deploy:plan --execute
pnpm gen
```

The deploy tool prints each constructor, predicted address, nonce, exact simulated gas limit, EIP1559 fee caps, maximum MON cost and plan hash. Exact calldata is saved locally under `deployments/plans/<chain>.json`. Execution requires the reviewed hash in `DEPLOY_PLAN_HASH`; it loads that saved plan without overwriting it and checks fresh simulation, source hash, chain, nonce, fees and balance. It signs those exact four CREATEs with Viem, without re-estimating their gas or increasing their fee caps. Sends are sequential with four confirmations; do not use that key elsewhere during deployment.

Before submitting each signed transaction, the wrapper persists its hash and nonce in ignored `deployments/plans/<chain>.execution.json`. Any existing checkpoint blocks a new run. On interruption, inspect every recorded hash's receipt and the latest/pending nonce, preserve the original plan and checkpoint, and arrange explicit manual recovery of only the unresolved original CREATEs. Do not use `forge script --resume`: these reviewed sends are not Forge broadcasts. Do not re-plan a new sequence over a partial deployment; its constructor addresses would no longer match. Successful receipts are exported as sanitized `deployments/<chain>.json`, allowing CI to regenerate addresses without ignored payloads.

Mainnet dry runs work without activating bots. Mainnet broadcast additionally requires `MAINNET_DEPLOY_APPROVED=true` and the exact `DEPLOY_PLAN_HASH`; these record Rahul's explicit approval of the printed calls and maximum gas budget. Mainnet bots additionally require `MAINNET_SENDS_ENABLED=true` after their funding and burst plan is approved. These flags are operator controls, never implicit authorization. No mainnet deployment, funding or activation was performed in S4 implementation.

## Verify sources

Official Sourcify instructions support [`forge verify-contract`](https://docs.sourcify.dev/docs/verify-via-foundry/) and [metadata plus all original sources](https://docs.sourcify.dev/docs/how-to-verify/). Run from `contracts/`, substituting the confirmed chain and addresses:

```sh
forge verify-contract "$BASE_ADDRESS" src/DemoToken.sol:DemoToken --chain "$CHAIN_ID" --verifier sourcify --watch
forge verify-contract "$QUOTE_ADDRESS" src/DemoToken.sol:DemoToken --chain "$CHAIN_ID" --verifier sourcify --watch
forge verify-contract "$MARKET_ADDRESS" src/BatchAuction.sol:BatchAuction --chain "$CHAIN_ID" --verifier sourcify --watch
forge verify-contract "$FAUCET_ADDRESS" src/Faucet.sol:Faucet --chain "$CHAIN_ID" --verifier sourcify --watch
```

If your verifier requires constructor arguments, supply the ABI-encoded constructor arguments from the validated broadcast. Do not flatten sources or change optimizer/compiler settings. `pnpm verify:bundle` exports compiler metadata and hash-checked original sources for all three contract types; supply the ROSE and dUSD creation hashes separately. Upload via the Sourcify UI if the CLI service lacks chain support. The four recorded Monad testnet contracts now have Sourcify exact creation and runtime matches: [verification evidence](../../docs/verification/testnet-deployment.json) contains each successful command, address and lookup URL. This status applies only to those exact testnet addresses; mainnet, custom deployments and the separate diagnostic benchmark remain unconfirmed.

## Funding and seed tokens

`pnpm funding:plan` queries the live base fee and recomputes costs from `gas.json`. The suggested balance targets are 40 MON for relayer, 20 keeper, 80 Mo and 50 per Pete key; the plan raises a Pete target when its capped burst plus reserve would exceed it. It never creates keys or transfers MON. **Bots never send MON value**, and every write reserves its maximum gas cost while preserving more than 12 MON, including existing inflight reservations. A sender stops safely on insufficient funds. Dedicated-key balance budgets refresh every ten seconds; mined receipts deduct their maximum reserved cost in between, so the cache conservatively underestimates available funds. Health balances remain actual RPC measurements.

At the sampled 100 MON-gwei base fee and the current 586,000-gas self-clearing order limit, 20 blocks × 4 Pete orders × 11× base fee costs **51.568 MON**, with **56.256 MON** reserved at the maximum fee cap. These values come from `scripts/funding-plan.ts`, not the pack's approximate 25 MON. Recompute before authorizing a burst. The default-priority six-order Mo burst costs another 1.90688 MON at that snapshot; keeper claim-50 costs 0.502273 MON per transaction. A wake lasting 90 seconds can spend beyond a single burst; approve and monitor that budget too.

```sh
pnpm --filter @batchelor/bots seed    # Testnet only; daily faucet drip for each bot
pnpm --filter @batchelor/bots start
```

Seeding uses the existing permissionless daily faucet and deposits 100 ROSE plus 100 dUSD into each key's internal balance. No owner-only mint bypass is introduced. The testnet seed command skips funded internal balances and checks faucet cooldown via simulation. Mainnet seeding is a separately approved set of `Faucet.drip(botAddress)` calls, each using `transactionGas('drip')`; the CLI intentionally refuses mainnet by default.

## Controls and health

- `POST /wake`: bearer token required; wakes Mo for `MO_AWAKE_SECONDS`.
- `POST /unleash`: bearer token required; returns `{ remainingToday, startBlock }`; rejects overlapping bursts, exhausted caps, stale heads or balances below the reserve.
- `GET /health`: public; actual MON balances, awake/unleashed state, last head, last clear, errors over five minutes and counters. Returns 503 while degraded.

Mo walks one tick per quoted head inside [60, 200]. Normal quotes have three bids and three asks, 5–20 lots each. During a burst asks total at least 45 lots, exceeding Pete's 20 lots plus 20 lots of headroom. Pete submits one five-lot BUY per distinct key per observed burst head at `mid+6`, with priority 10× the observed head base fee. The actual inclusion fee can differ if the base fee moves; rehearsal checks the mined receipts, never substitutes submission estimates.

The keeper waits one block after sealing before cranking; trading calls usually self-clear sooner. It recovers chain history in windows of at most 100 blocks, retains unclaimed IDs across windows, tracks terminal status through complete event replay and claims at most 50 IDs per transaction. WS heads drive trading; a separate maintenance loop and WS clear-event subscription drive receipt/log catch-up and settlement. A slow provider can cause missed heads; `skippedHeads`, maximum clear lag and oldest pending batch age expose this. No stale-head trading backlog is replayed.

Ambiguous sends retain their exact signed bytes and gas reservation. The next send first rebroadcasts those bytes and retries its new intent on a later head. Definite nonce-low/high rejections reconcile to the provider's pending count. A receipt determines inclusion and success; repeated unresolved errors require operator attention. Recent errors are deliberately stricter than the zero-unrecovered-nonce acceptance threshold.

## Rehearsal and soak

For testnet rehearsal, set `PETE_BURST_BLOCKS=10` on the service and configure a distinct funded throwaway `ASHA_PK`. The script drips Asha if needed, chooses a random head inside the burst and verifies same-block batching, Asha after at least one Pete transaction, positive fills, uniform paid price and actual priority ≥ the required base-fee multiple.

```sh
pnpm --filter @batchelor/bots rehearse
pnpm --filter @batchelor/bots soak    # Five-minute testnet wake/health checks
```

Outputs default to local `rehearsal-testnet.json` and `soak-testnet.json`. Preserve passing real-chain evidence in `docs/WHY_MONAD.md` only after running it. `previewFill` is zero after claim by design; rehearsal prints the actual preview and reconstructs original settlement from `Claimed` events when needed. Failure saves no passing rehearsal evidence. Same-block/later-index inclusion is an assertion and may require retrying. The built rehearsal refuses mainnet; a live mainnet campaign requires its reviewed exact calls and budget before execution.

For reproducible local integration, start temporary Anvil with `--network monad --hardfork monad:MonadTen --chain-id 10143 --block-time 1 --port 18545 --silent`, then run `pnpm bots:test-local`. It uses publicly known dev accounts, refuses non-loopback RPCs, explicitly initializes a 100 MON-gwei local fee fixture, deploys/seeds locally and runs a five-minute soak. Local simulated evidence is labelled accordingly and is not live Monad acceptance. Anvil's idle base fee can decay below the real-chain minimum; without initializing it, Pete's 10× local base fee may be lower than the normal 1-gwei priority.

## Hosting

Build from the repository root with `docker build -f services/bots/Dockerfile -t batchelor-bots .`. Secrets, local toolchains, broadcasts and source evidence are excluded from context. The image runs as a non-root user, exposes port 3001 and checks `/health`.

Use Fly as one always-running machine, with **one instance only**. Run `fly deploy --config services/bots/fly.toml --app <your-app>` from the repository root; configure keys, bearer token, RPCs and contract addresses as platform secrets. Use `fly scale count 1 --app <your-app>` and use the configured immediate deployment strategy to stop the old machine before starting the replacement. The config follows [Fly's HTTP service and checks documentation](https://fly.io/docs/reference/configuration/). Keep mainnet flags false until the reviewed approval. Docker/Fly binaries are unavailable in the implementation environment; packaging was reviewed but not built or published here. Render would need a Web Service for this HTTP control surface; a background worker alone has no public HTTP endpoint.
