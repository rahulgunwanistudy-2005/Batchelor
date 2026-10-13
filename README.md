# Batchelor

A professional batch-auction trading terminal for Monad. The initial scaffold intentionally has **no fabricated market data and no simulated trades**.

## Requirements
- Node.js 20.9+
- npm

## Run locally
```bash
npm install
npm run dev
```
Open http://localhost:3000.

## Architecture
- `src/app/`: route and global styling
- `src/components/terminal/`: presentation-only terminal components
- `src/lib/market-data/`: typed data contract and adapter boundary
- `src/types/`: domain types

The initial adapter returns `unavailable`, not invented prices or orders. Replace it when the backend/API, contract addresses, ABI and event/indexing strategy are agreed.

## Before connecting real data
Confirm:
1. Monad network (testnet or mainnet) and chain ID.
2. Market pair and token addresses/decimals.
3. Source of truth for order book and batch state (contract reads, events, indexer/API).
4. Clearing-price and partial-fill rules.
5. Transaction confirmation/finality behavior and explorer URL.

## Design direction
Trading information density follows professional exchange terminals; charting is reserved for actual sourced OHLCV data. Do not copy Kraken or TradingView branding/assets.
