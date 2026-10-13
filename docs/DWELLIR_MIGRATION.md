# Dwellir integration and activation

The integration supports Dwellir's Monad full-node endpoints. **No authenticated Dwellir connection, API-key activation, or hackathon voucher redemption has been verified.** Explicit existing provider URLs remain usable until a key is configured. No blockchain transaction was sent during this migration.

## Endpoint matching

The official [machine-readable catalog](https://www.dwellir.com/public-rpc-endpoints.json), inspected on 13 October 2026, lists these endpoints:

| Network | Chain ID | Node | HTTP host / WSS host |
|---|---:|---|---|
| Monad mainnet | 143 | Full | `api-monad-mainnet-full.n.dwellir.com` |
| Monad testnet | 10143 | Full | `api-monad-testnet-full.n.dwellir.com` |

Use `https://HOST/API_KEY` for HTTP and `wss://HOST/API_KEY` for WebSocket. Authentication is the key in the URL path. `DWELLIR_API_KEY` can generate both URLs; explicit `RPC_HTTP`/`RPC_WS` overrides preserve the existing configuration pattern. The shared resolver rejects mismatched Dwellir networks, insecure Dwellir transports and embedded user credentials. Transaction tools and bot startup check the actual RPC chain ID before sending; authenticated Dwellir chain-ID matching remains a release check.

Live application reads, server relaying, bot operations, deployment planning, funding planning, live testnet tools and the recent-header sampler use the new resolver. Browser clients use only public configuration. Loopback Anvil fixtures, Envio HyperSync and GraphQL endpoints are unchanged.

## Get and configure access

1. Sign in to [Dwellir](https://dashboard.dwellir.com). Inspect Billing/Plan and usage. Redeem the team's hackathon voucher using the dashboard's voucher flow and confirm the resulting active plan, expiry, included quota and any overage settings. The resource-page offer alone does not confirm redemption.
2. Create a private RPC key for the server/bots/tooling. Put `DWELLIR_API_KEY` in ignored root/service environment files or hosting secrets. This is an RPC credential, not a wallet signing key. `RELAYER_PK`, `KEEPER_PK`, `DEPLOYER_PK` and other `*_PK` values are separate secrets.
3. Set `CHAIN=testnet` while rehearsing. Leave `RPC_HTTP` and `RPC_WS` blank to generate Dwellir transports. Keep production secrets separate from testnet settings; a key need not be purchased for each chain, but separate keys improve quota control and revocation.
4. Create a separate quota-limited browser key for `PUBLIC_DWELLIR_API_KEY` in `apps/web/.env` or the web hosting settings. Match `PUBLIC_CHAIN` with server `CHAIN`, and leave `PUBLIC_RPC_HTTP`/`PUBLIC_RPC_WS` blank to generate browser transports. All `PUBLIC_*` values and browser requests are visible to visitors. Never copy the private server key into a public variable. A backend RPC proxy is another deployment option, but is not implemented here.
5. Confirm chain ID, one latest-state read, WebSocket head delivery and one recent log query on each configured environment. Verify dashboard usage increments and verify the final app's CSP allows only the endpoint origins. Wallet funding and send activation are separate deployment steps.

The Dwellir CLI was unavailable during initial discovery; official v0.4.0 is now installed in ignored `.tools/dwellir/dwellir`, with its release checksum verified. Its catalog command required authentication, so the public documentation catalog remains the discovery source. Device authorization was approved by Rahul for his own browser; current plan/quota confirmation is pending. See [account access alternatives](ACCOUNT_ACCESS.md). Optional global installation:

```sh
curl -fsSL https://raw.githubusercontent.com/dwellir-public/cli/main/scripts/install.sh | sh
dwellir endpoints list
```

Keys must stay out of chat, Git, screenshots and persisted evidence. Tool errors omit provider exception bodies; sampling evidence records only an endpoint label without authentication.

## Historical-state exceptions

Both Monad catalog entries have `archive: false`. These existing workflows require historical state and remain on their previous provider, or a separately verified `ARCHIVE_RPC_HTTP` override where implemented:

| Workflow | Required state | Migration / estimated volume |
|---|---|---|
| `scripts/verify-live-spike.ts` | Balance before deployment and after the saved run | Existing public testnet RPC unchanged; 2 historical balance reads per verification, roughly 21 total RPC calls per run |
| Indexer deployment configuration | Code at deployment block and the block before | `ARCHIVE_RPC_HTTP`, existing non-Dwellir `RPC_HTTP`, or previous public RPC; 2 historical code reads per run |
| Indexer live acceptance verification | Orders and fills at the clearing block | Same archive selection; 1–2 historical state reads per noncancelled order plus receipt/header/current-state checks |
| Indexer live parity tests | Historical fills at the fixture's clearing block | Existing public testnet provider unchanged; fixture dependent |

Existing public endpoints are not a guarantee of unlimited historical coverage. Verify the required heights; if unavailable, obtain a real archive provider. Do not substitute Dwellir full nodes for these calls. No fixed monthly cadence is configured, so monthly archive volume cannot be determined from the code. Ask [Dwellir support](mailto:support@dwellir.com) or [the team](https://t.me/dwellir) about Monad mainnet/testnet archive support, quoting the workloads above.

## Compatibility and capacity

The application does not use Hyperliquid, `debug_*`, Parity `trace_*`, or client-specific trace response shapes. It uses standard EVM methods, ABI calls, receipts and subscriptions. No Geth/Erigon/Reth trace-format incompatibility was identified; actual authenticated method availability is still unverified.

The [rate-limit reference](https://www.dwellir.com/docs/getting-started/rate-limits) lists Developer limits of 100 responses/s account-wide and 500 blocks inclusive per log request; Free does not include `eth_getLogs`. Keeper recovery and rehearsal queries scan at most 100 blocks per request. Per-environment keys share account throughput. A log-capable active plan is required for bots/rehearsal, and load testing must confirm head latency and request capacity before the recording. An RPC voucher does not pay MON gas fees.

Authoritative reference: [authentication](https://www.dwellir.com/docs/getting-started/authentication), [archive coverage](https://www.dwellir.com/docs/getting-started/archive-nodes), [documentation index](https://www.dwellir.com/docs.md) and [LLM index](https://www.dwellir.com/docs/llms.txt).
