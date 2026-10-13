# Live storage validation — 13 October 2026

- [x] Verify testnet funding and absence of pending transactions without exposing keys.
- [x] Reproduce the local baseline and verify identical bytecode across both hardforks.
- [x] Deploy, seed and execute six measurement calls on testnet only.
- [x] Verify all eight receipts, calldata, nonces, increasing block order, bytecode, checksums and gas parity.
- [x] Reconcile actual declared-limit fees with historical wallet balances.
- [x] Preserve verified live evidence during future local benchmark runs; test invalidation paths.
- [x] Save focused evidence/tooling in a local commit and a dedicated publication branch from origin/main; preserve the divergent application histories.

All S1 live acceptance gates pass; no mainnet transaction was sent. See docs/S1_REPORT.md and contracts/bench/out/live-testnet.json.
