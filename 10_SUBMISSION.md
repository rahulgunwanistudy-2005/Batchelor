# Metropolis submission — Batchelor

**Status: prepared draft, not submitted.** Production URL, mainnet deployment, recorded batch, phone/video evidence and dashboard completion are pending. No mainnet addresses or recording hashes may be filled from local fixtures.

Submit through hackathon.monad.xyz. Required: working product, public project profile, demo (≤ 3:00), short write-up, code link. Track: **Onchain Finance & Trading**. Bounties to select (only if their dashboard text still matches bible §3): Best Mera-Powered UX on Monad; Best Use of Envio.

Fields to fill before submitting: `[[url]]`, `[[repo]]`, `[[video]]`, contract addresses, the recorded batch id and its tx hashes, the bench numbers.

---

**Name:** Batchelor
**One-liner (keep short; the platform's one-line field rejected a long sentence for another team):** Every block, one price. No favorites.
**Track:** Onchain Finance & Trading

## The problem
On Monad, the default client orders a block's transactions by priority fee. On a continuous order book that turns priority into a purchasable advantage: the bot that pays most fills first and moves the price against everyone behind it in the same block. People trading in a token's first hours, the moment price discovery matters most, pay for it.

## What Batchelor does
Batchelor is a fully onchain frequent batch auction. Orders that land in the same block are collected into one batch and cleared together at a single uniform price, using the same call-auction rules exchanges use for their opening and closing auctions (maximum volume, then minimum surplus, then market pressure, then reference price, from the Xetra market model). Arrival order and priority fees buy nothing.

- A person opens the link, creates an account with one passkey prompt (Mera), gets demo tokens, and places a gasless order. No seed phrase, no extension, no gas.
- Every batch has a public receipt: each order in block order with the priority fee it paid, all settling on one price line, plus a replay showing what the same orders would have paid on a continuous book.
- A Proof page shows the gas measurements, the invariants and the contracts.

## Why it only makes sense on Monad now
- **MIP-8 (mainnet since 2 Sep 2026)** prices storage by 128-slot page. Batchelor's entire book is two 256-tick arrays declared at slot 0, exactly four pages. Clearing a full book costs [[nine]] gas under MonadNine and [[ten]] under MonadTen, measured in Monad Foundry on the same bytecode ([[ratio]]×).
- **Gas is billed on the declared limit.** Because clearing is cheap, the first transaction of each block clears the previous batch itself. Every order can afford to budget for that: [[placeSelfClear]] gas. Under the old rules the same bound would have been millions of gas per order.
- **~300 ms blocks** mean a batch every block: about three price discoveries a second, fully onchain, no keeper, solver or offchain engine.
- **Local mempools** limit broad propagation but do not prove privacy from RPC operators or validators. The tested guarantee is permutation invariance of accepted orders within a batch; limits and cutoffs determine quantity, and priority may still affect inclusion.

## How we built it
- Solidity 0.8.28 on Monad Foundry: one `BatchAuction` contract (single market, immutable, no admin), demo ERC-20s with permit, a faucet. Ladder slots carry a batch tag, so a new batch overwrites stale ticks instead of zeroing them (no state-growth charge).
- Tests: unit, fuzz (≥ 1,000 runs), handler-based invariants (solvency, conservation), a differential check against a naive reference auction, and `test_SameBlockOrderNeverMatters`, which places the same random orders in two different orders within a block and asserts identical fills. Rounding always favors the contract; the rounding table is in `docs/DESIGN.md`.
- Gasless path: EIP-712 intents signed by the user's Mera key, submitted by a relayer; explicit gas limits from our own benchmarks (+7.5%, following Category Labs' guidance), never estimates.
- Envio HyperIndex indexes every order with its transaction index and priority fee; that data drives the receipts.
- SvelteKit app with hand-drawn SVG charts; Node bots (keeper, a market maker that wakes when someone visits, and Pete, the priority-fee bot from the demo).

## Results
<!-- BEGIN GENERATED BENCH -->
| Active ticks per side / total ladder slots | MonadNine gas | MonadTen gas | Ratio |
|---|---:|---:|---:|
| 32 / 64 | 626,636 | 116,636 | 5.373× |
| 128 / 256 | 2,259,565 | 213,565 | 10.580× |
| 256 / 512 | 4,436,713 | 342,713 | 12.946× |

Fixed seed 42; same production bytecode; measured `_clear` only. No mainnet live median or recording data is implied. Source: `packages/core/src/bench.json`.
<!-- END GENERATED BENCH -->
Live: median `clearGas` over the last [[N]] mainnet batches: [[median]] ([[share]]% of a block).
Recorded demo batch [[batch]]: [[n]] orders, one price [[price]]; Pete's priority fee [[mult]]× base fee; tx hashes [[hashes]].

## Business
Batch auctions are how exchanges run their opens and closes. Onchain, the first customer is a launchpad or token team running an opening auction and long-tail markets, with a fee on matched volume. Markets that become liquid graduate to a continuous CLOB such as Kuru.

## Limitations (stated plainly)
Orders live for one batch; resting orders across batches are the next milestone (design in `docs/DESIGN.md`). Demo tokens on mainnet, no real assets. Liquidity in the public demo comes from our market-maker bot, which wakes when someone visits. Rounding dust stays in the contract.

## Contracts (Monad mainnet, chain 143)
BatchAuction `[[addr]]` · ROSE `[[addr]]` · dUSD `[[addr]]` · Faucet `[[addr]]`

## Disclosure (Rules §4.1.4)
- **AI tools:** OpenAI Codex was used to draft code, tests, UI, tooling and docs under Rahul's direction. Rahul supplied the mechanism/storage specifications; his independent line-by-line sign-off and benchmark review remain a release gate. The product uses no AI at runtime. Full breakdown in `docs/AI_DISCLOSURE.md`.
- **Pre-existing code:** none; third-party dependencies and their actual notices are listed in the README and docs/AI_DISCLOSURE.md. Envio is not represented as MIT.
- **Data:** demo tokens with no value; bots are labelled in every view.
- **License:** MIT.

## Pre-submit checklist
- [ ] Registered on the platform (participants reported registration closing Oct 6; if you are not registered, raise it with the organizers on the Monad Developer Discord immediately)
- [ ] Repo public, MIT, README with AI disclosure, commit history spans the build
- [ ] Video public, ≤ 3:00, shows mainnet transactions
- [ ] Contract addresses and recorded tx hashes in the profile
- [ ] `docs/WHY_MONAD.md` linked
- [ ] Track and bounties selected; submission shows complete, not draft

## Current release evidence

Benchmarks and commit-window data are generated by `python3 scripts/prepare-release.py`. See `docs/verification/s8-release.json`, `docs/verification/s8-commits.json` and `docs/S8_REPORT.md`. Live median, production receipt URL, mainnet hashes and public video remain unfilled until recorded. Registration/rules/bounty text must be confirmed in the private dashboard; the supplied participant transcription does not establish dashboard compliance.
