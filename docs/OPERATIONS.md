# Public demo operations

Choose the permanent production hostname before anyone creates a Mera passkey. Set `PUBLIC_RP_ID` explicitly; preview-domain passkeys cannot be assumed to work on production. Keep web/indexer/bot chain IDs and market addresses consistent, and keep the private relayer/bot RPC credentials in hosting secrets. Never put keys into PUBLIC variables. Node 24, one bot instance, and a dedicated relayer key are required.

## Release sequence

1. Run local quality, Slither, history/working-file secret gates and the local chain rehearsals. Review [security limitations](SECURITY.md).
2. Configure/fund distinct keys and review the exact deployment calls, limits and costs. Mainnet sends need Rahul's explicit authorization under the supplied bible §16.5; toggling an environment flag is not itself human approval.
3. Execute/verify the deployment; generate addresses only from successful broadcast receipts. Configure HyperIndex Cloud from the deployment start block, then set its real GraphQL endpoint.
4. Host the single bot HTTP service and web. Keep `/wake` and `/unleash` authenticated; do not expose `BOTS_TOKEN` to the browser. Set all public actor addresses. Follow [bot guide](../services/bots/README.md) and [indexer guide](../indexer/README.md).
5. Run hosted rehearsal/source verification, a fresh-device no-MON passkey/drip/order/receipt flow three times under 60 seconds, the recording/funding checks and public receipt-preview checks. Save the actual URLs, batch and transaction hashes in [submission](../10_SUBMISSION.md).

## Health and recovery

`GET /health` returns 200 only with a recent head, six sufficiently funded keys and no recent operational error; otherwise 503. Public health includes safe last-error details, actual balances, funding-warning key names, claim backlog and counters. The web proxy returns a restricted status subset. Poll the authenticated hosting dashboard/health periodically; the application sends no third-party alerts or analytics.

After four seconds without an increasing socket head, the watchdog polls HTTP and rebuilds the socket/head/log subscriptions at most every ten seconds. Nonces and inflight commitments stay in the existing writer while reconnecting. HTTP log catch-up is authoritative for claim recovery. Socket/error text never enters health/logs directly. Bot log events `funding_low` and `funding_recovered` report threshold transitions at 15 MON. Actual sends preserve more than 12 MON plus inflight gas commitments. A stale head, wrong chain, pending old-instance transaction or missing deployment history prevents safe activation.

For a stopped service, inspect safe health/logs and RPC availability, replenish balances if required, then restart the one process. Startup waits for previous-instance pending transactions and reconstructs history from `START_BLOCK`. Do not run two instances on the same keys. Pete's UTC daily quota and Mo's awake window are memory-only and reset on process restart. Fly's immediate replacement/health checks do not establish a successful hosted deployment in this repository.

The relayer's `RELAYER_LOW_BALANCE` error says “Gasless orders are paused.” Replenish its dedicated MON balance and retry once pending transactions settle. Per-address and per-IP limits/deadlines remain enforced. Memory-only quotas reset between serverless instances; the chain's intent nonce prevents repeated economic execution. An uncertain submission must be inspected by its hash before retrying; do not create a new conflicting send blindly.

## Funding before recording

`CHAIN=mainnet pnpm funding:plan` is read-only. It checks chain ID and samples the current base fee; it never generates keys, sends transfers or starts Pete. It computes three full bursts for every Pete key, ten minutes of six-order Mo quotes, and keeps 15 MON per key above that budget. The ten-minute calculation assumes 300 ms blocks (2,000 quotes); faster observed heads or rising fees require a larger budget. Costs reserve the full EIP-1559 fee cap using the shared self-clear gas limits. Relayer/keeper spending is additional and must be watched during rehearsal.

Without configured keys, the plan reports `key_missing` and recording readiness false. No balance is invented. Recheck immediately before every recording. Mo wakes for 90 seconds at a time by default; sustained ten-minute operation requires authorized visits/orders or deliberate authenticated wake requests. Pete runs only on an explicit unleash.

## Two-week operation

Before calling this public-ready, run a real hosted soak and retain health/indexer-lag evidence. Keep funding/RPC capacity available for the expected visits, monitor error/nonce/claim backlog, validate restart recovery without duplicate instances, and verify the permanent passkey RP ID on physical devices. The current local tests do not establish two-week hosted reliability. Mainnet publishing/video/upload/platform completion are still external gates in the S8 report.
