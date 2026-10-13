# Batchelor

A professional batch-auction trading terminal for Monad. The initial scaffold intentionally has **no fabricated market data and no simulated trades**.

## Requirements
- Node.js 24+
- pnpm 9

## Run locally
```bash
pnpm install
pnpm dev
```
Open http://localhost:3000.

## Architecture
- The root package scripts run the Next.js app in `src/app/`.
- `src/components/terminal/`: terminal UI
- `src/lib/market-data/`: typed market-data adapter and optional contract reads
- `src/types/`: shared domain types
- `apps/web/`: separate SvelteKit scaffold; it is not started by the root `pnpm dev` command.

The market pages refresh the configured adapter periodically. Without a verified market deployment and indexer, data remains unavailable rather than using invented prices or orders. Wallet connection is display-only and trading, funding, balances, and order history are not enabled.

## Before connecting real data
Confirm:
1. Monad network (testnet or mainnet) and chain ID.
2. Market pair and token addresses/decimals.
3. Source of truth for order book and batch state (contract reads, events, indexer/API).
4. Clearing-price and partial-fill rules.
5. Transaction confirmation/finality behavior and explorer URL.

## Design direction
Trading information density follows professional exchange terminals; charting is reserved for actual sourced OHLCV data. Do not copy Kraken or TradingView branding/assets.
