# Account access without signing in inside Codex

Keep account passwords in your own browser. Do not paste wallet keys, API keys, login cookies or CLI tokens into chat. The user declined in-app sign-in and approved Dwellir's normal device authorization instead.

## Dwellir plan and remaining quota

Official Dwellir CLI v0.4.0 is installed at `.tools/dwellir/dwellir` from its official GitHub release, with the archive SHA-256 checked against the published checksums. The directory and all profiles/reports below are ignored by Git. The first device request failed; the retry reached a short-code approval page. The retry was approved successfully. An approval code is temporary and must be taken from the currently running login, never from a copied old document.

In your own Terminal, from the repository root:

```sh
export DWELLIR_CONFIG_DIR="$PWD/.tools/dwellir-config"
.tools/dwellir/dwellir auth login --device-code --profile batchelor --human
```

Open the displayed Dwellir link in your own browser, review its requested access and approve the exact matching code yourself. Codex does not enter your password or approve access on your behalf. Once that authorization completes, these read-only commands give provider account data:

```sh
.tools/dwellir/dwellir account subscription --profile batchelor --json
.tools/dwellir/dwellir usage summary --profile batchelor --json
.tools/dwellir/dwellir usage limits --profile batchelor --json
```

The RPC API key and CLI authorization token are separate credentials. Do not substitute one for the other. The CLI exposes account/subscription/usage workflows; the public endpoint catalog attempt required authorization, so discovery used the public documentation catalog. An active plan/quota report can establish current provider entitlement. A three-month advertised hackathon voucher alone cannot establish redemption, expiry or remaining requests. If device authorization remains unavailable, export plan/usage data from your own logged-in browser with keys/account identifiers redacted. Confirmation emails establish historical activation but not live remaining quota.

Reference: [official Dwellir CLI](https://github.com/dwellir-public/cli).

## Hosting and submission

- **Web:** a Vercel connection can be authorized separately with reviewed permissions, or you can deploy from your own Vercel account using the exact [hosting settings](DEPLOYMENT.md). No working Vercel connection has been confirmed; separate own-browser CLI authorization has been offered. Only a verified free plan or existing credits may be used.
- **Indexer:** connect the repository through your own Envio Cloud account and select `indexer/cloud`, `config.yaml` and the reviewed deployment branch. The configuration already contains the actual testnet deployment, not a fabricated market.
- **Bots:** use an existing always-running HTTP service account with one instance. The deployment Docker image has built successfully. Hosting or a paid plan still needs an account and a reviewed spending choice.
- **Hackathon:** Rahul supplied the complete rules from his own browser. [Requirements](HACKATHON_RULES.md) no longer depend on Codex dashboard access. Copy [submission text](SUBMISSION.md) into the project form, select the track/bounties and submit through your own registered account after the live demo and video pass. Creating/submitting the project accepts legal representations; those participant confirmations are not performed by these scripts.

No connected email account was available for an independent voucher-confirmation search. No passwords, dashboard cookies or broad GitHub token were extracted or repurposed to authenticate another service.

## Verified account result

The authorized CLI reports **Free**, 5,000,000 monthly responses, 100,000 daily responses, 10 responses/s, burst20 and one API key. The returned billing summary reported zero requests/responses before the endpoint smoke tests. Usage-history lookback is24hours on this tier. The advertised three-month Developer voucher is **not active on this account**; voucher redemption instructions are pending. No paid plan or overages were enabled. Current plan/usage reports are stored only in ignored `.tools` files; no CLI token or RPC key is published.

Rahul requires **no real-money spending**: testnetMON, verified free services and existing credits only. Mainnet broadcasts, paid upgrades, card-required trials and paid overages are not authorized.
