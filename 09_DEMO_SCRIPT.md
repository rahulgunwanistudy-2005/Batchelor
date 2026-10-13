# Batchelor — demo video (hard cap 3:00, Rules §4.1 / §9.4)

**Recording status: blocked by unconfigured production services/funding/domain.** This is a prepared shot list, not an existing recording.

Record on the deployed **mainnet** build. 1080p, desktop browser at 1280 px plus one real-phone segment (screen recording from the phone). Voiceover recorded separately at about 150 words per minute; captions on. Every number on screen comes from the live product or `bench.json`; fill the `[[…]]` slots from the recorded batch and the bench before recording the voiceover.

The rules require the video to show the product operating with real Monad transactions, so the explorer cut-in at 1:45 is mandatory.

| Time | Screen | Voiceover | On-screen text |
|---|---|---|---|
| 0:00–0:12 | Trade screen, staircases crossing live, price ticking every block | "This is a market that clears every block. Everyone whose order lands in the same block gets one price." | "Batchelor — every block, one price" |
| 0:12–0:30 | Split: a block's transaction list sorted by priority fee | "On Monad, transactions in a block are ordered by priority fee. On a continuous order book, whoever pays most fills first and moves the price against everyone behind them." | "Default ordering: priority gas auction (Monad docs)" |
| 0:30–0:45 | Desktop: press "Unleash Pete"; bot status turns active | "Meet Pete. Pete is a bot. For the next 20 blocks he sends four buy orders every block, each paying [[mult]] times the base fee as priority." | "Pete: 4 orders per block, [[mult]]× base fee" |
| 0:45–1:05 | Phone: open link → Face ID → "Get 100 ROSE and 100 dUSD" → place buy | "Asha has never used a wallet. One Face ID creates her account. No seed phrase, no gas. She places one buy order." | "Passkey account (Mera) · gasless" |
| 1:05–1:35 | **Receipt `/b/[[batch]]`**: BlockLanes, Pete's rows at the top with huge priority bars, Asha's row near the bottom, every fill on one price line | "Same block. Pete's orders sit at the top of the block. Asha is order [[ashaIndex]] of [[n]]. And they all clear at exactly [[price]] dUSD. Pete's priority bought him nothing." | Headline from the receipt |
| 1:35–1:45 | Counterfactual card | "Here is the same batch replayed on a continuous book in the order the block included it. Pete would have paid [[peteCont]], and Asha [[ashaCont]], [[ashaDiffPct]] more." | "Simulated replay of this batch's real orders" |
| 1:45–1:55 | MonadVision: Asha's tx and one Pete tx, same block | "Real transactions on Monad mainnet, same block." | tx hashes |
| 1:55–2:25 | `/proof` gas bars | "Clearing every block onchain was too expensive until last month. Monad's MIP-8 prices storage by 4-kilobyte page. Batchelor's whole book sits on four pages. Clearing a full book cost [[nine]] gas under the old rules and [[ten]] today: [[ratio]] times cheaper. That is why the first order of each block can clear the previous batch itself, without offchain matching. A keeper only supplies a clearing transaction during idle periods." | "[[nine]] → [[ten]] gas · [[ratio]]×" |
| 2:25–2:42 | `/proof` invariants list, `test_SameBlockOrderNeverMatters(uint256,uint256)` highlighted | "We prove it: shuffling the order of transactions in a block never changes a single fill. That test runs [[runs]] random books, alongside solvency and a reference-model check." | Test names + run counts |
| 2:42–2:55 | Trade screen, "How it works" panels | "Opening auctions for new tokens, long-tail markets, and anywhere a fair price matters more than being first." | — |
| 2:55–3:00 | Wordmark + URL + repo | "Batchelor. Every block, one price." | URL · GitHub |

## Recording checklist
- Warm everything 5 minutes before: bots `/health` all green, keys above 15 MON, indexer lag < 5 s.
- Do one rehearsal unleash; then the real one. Record the phone segment during the real burst; note the batch id the app shows.
- If Asha's order lands outside Pete's burst, unleash again (cap allows 3 tries).
- Fill the `[[…]]` slots from that batch's receipt and `bench.json`; record the voiceover last.
- Browser: hide bookmarks, zoom 110%, cursor highlight on, light theme for the desktop, the phone in whatever theme it uses.
- Cut each segment separately; final export ≤ 2:58 including title.

## S8 shot readiness

| Shot | Implemented/local evidence | Mainnet recording blocker |
|---|---|---|
| 0:00 trade | Live chart and local endpoint/price regression | Production web, market and awake Mo missing |
| 0:12 ordering | Indexed transaction/fee lanes | Need actual recorded mainnet block; do not fabricate ordering |
| 0:30 Pete | Authenticated capped controls and tested strategies | Four production keys/funds and hosted conductor missing |
| 0:45 phone | Mera/session unit tests and local gasless flow | Permanent RP ID, fresh physical-device passkey, funded relayer/faucet missing |
| 1:05 receipt | Three local real-chain batches, actual Envio handlers | Hosted mainnet endpoint and same-batch Pete/person inclusion missing |
| 1:35 replay | Exact deterministic replay and local nonzero difference | Fill recorded figures from that actual mainnet batch |
| 1:45 explorer | Receipt links implemented | Actual mainnet person/Pete hashes and source verification missing |
| 1:55 proof | Measured same-bytecode gas data and generated test evidence | Deploy the production page; use generated table below |
| 2:25 invariants | Current fuzz/invariant campaign and source hashes | Rahul review sign-off and production page required |
| 2:42–3:00 close | Explanatory panels/wordmark implemented | Final public URL/repo visibility, recording/editing/upload required |

<!-- BEGIN GENERATED BENCH -->
| Active ticks per side / total ladder slots | MonadNine gas | MonadTen gas | Ratio |
|---|---:|---:|---:|
| 32 / 64 | 626,636 | 116,636 | 5.373× |
| 128 / 256 | 2,259,565 | 213,565 | 10.580× |
| 256 / 512 | 4,436,713 | 342,713 | 12.946× |

Fixed seed 42; same production bytecode; measured `_clear` only. No mainnet live median or recording data is implied. Source: `packages/core/src/bench.json`.
<!-- END GENERATED BENCH -->

Prepare a fresh phone account on the final production domain and a clean desktop profile immediately before rehearsal. Those device actions have not been performed by this session. Keep the target export ≤2:58 and verify the actual file duration before public upload. The 13 October deadline no longer permits the pack’s “day of margin”; do not mark that gate achieved.
