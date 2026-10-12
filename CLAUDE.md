# Batchelor — Project Bible (save as `CLAUDE.md` in repo root)

> **Every block, one price. No favorites.**

This file is the single source of truth. Every session prompt assumes the agent has read all of it. If a session needs a fact that is not here, the agent stops and asks; it never invents chain behavior, gas numbers, or sponsor APIs.

---

## 1. Mission

Batchelor is a fully onchain **frequent batch auction** exchange on Monad. Every order that lands in the same block is cleared together at **one uniform price**. Arriving first, paying a bigger priority fee, or sitting earlier in the block buys nothing.

On a continuous order book, the fastest bidder or the highest priority fee fills first and moves the price against everyone behind them. Monad orders a block's transactions by priority fee by default ([gas docs](https://docs.monad.xyz/developer-essentials/gas-pricing)), so on Monad that advantage can be bought outright. Batchelor removes it by construction: the contract never reads `tx.gasprice`, transaction index or `block.coinbase`, and a fuzz test proves that shuffling the order of a block's transactions changes no fill.

Clearing every block on chain used to be too expensive. Before MIP-8 (live on mainnet since 2 Sep 2026), every cold storage read cost 8,100 gas. Scanning a 512-tick book cost about 4.1M gas, and because Monad bills the declared gas limit, every order would have had to budget for it. With MIP-8 the book lives on 4 storage pages, so a full scan costs about 4 cold page loads plus warm reads. Clearing becomes cheap enough that **the first transaction of each new block clears the previous batch itself**, with no keeper, solver or offchain matching engine.

**One sentence (use everywhere):** Batchelor is a fully onchain batch auction where everyone in a block gets the same price, and Monad's new page-based storage makes it cheap enough to clear every block.

**Demo moment:** a bot sends 4 buy orders every block, each paying 10× the base fee as priority. A person taps Face ID once and sends one gasless order that lands in the same block. Both get the identical clearing price. A replay of the same orders on a continuous book shows what the bot's priority would have bought there.

**Proof number:** gas to clear a full 512-tick book under MonadNine (before MIP-8) vs MonadTen (after), measured in Monad Foundry on the same bytecode, plus the live `clearGas` of every batch emitted onchain.

---

## 2. Why this wins (keep every decision aligned with this)

Official rubric (Rules §5.2, per [Merchant Rails README](https://github.com/precious-akpan/monad-metropolis-merchant-rails) transcription): five criteria, 20% each. The Grand Champion is picked across tracks; its lens is inferred from the stated aim "teams that become startups" and an investor-heavy panel.

| Criterion (20% each) | Target score and how | Non-negotiable consequence for the build |
|---|---|---|
| Product Quality & Completeness | 5: live on Monad mainnet, judges can trade gaslessly with a passkey in under 60 s, every batch has a shareable receipt | Gasless relayer, demo-token faucet, wake-on-visit market maker, no dead ends, no mock data on screen |
| Technical Excellence | 5: correct uncrossing (Xetra rules), solvency-safe rounding, invariant + differential + permutation fuzzing, measured gas | Deterministic core with a naive reference model; tests are the product's second deliverable |
| Monad Integration | 5: built on MIP-8 page layout, ~300 ms blocks, gas-limit billing, no global mempool; each one is load-bearing and explained | `/proof` page and `docs/WHY_MONAD.md` with MonadNine vs MonadTen numbers and live `clearGas` |
| Track Fit & Problem Relevance | 5: Track 1 (Onchain Finance & Trading), fixes priority-fee advantage in onchain markets | Talk about market structure, not "anti-HFT"; complement Kuru, don't attack it |
| Innovation & Impact | 4→5: not one of the track's example bullets; a mechanism made newly affordable by a two-month-old protocol change | Lead with the permutation-invariance proof and the gas ratio |
| Grand Champion lens (inferred) | One sentence, one unforgettable demo moment, one number, a company story | "Unleash Pete" button any judge can press; launch-auction business story (§4) |

Judges who matter most for this entry (verified list on the [Metropolis page](https://monad.xyz/developers/hackathons/metropolis)): Keone Hon (about eight years building HFT systems at Jump; frame batch vs continuous as market design, not a moral fight), PBJ (Perpl co-founder), Haythem Sellami and Swaraj (protocol engineers; they will read the storage layout), Denham (Envio), the investor partners (Paradigm, Galaxy, Electric, Dragonfly, Pantera and others; they ask "who pays").

---

## 3. Rules that bind (from Rules v3.0 as transcribed by participants; confirm on your dashboard)

| Rule | What we do | Where it is enforced |
|---|---|---|
| Open source, OSI license, public GitHub (Rules §7.2) | MIT, public repo from day one | S1 |
| Substantial majority built in the window; commit history covers it | Rahul commits after every session; never squash | Standing rule |
| Demo video ≤ 3:00, public, shows the product operating with real Monad transactions | `09_DEMO_SCRIPT.md`, mainnet tx hashes on screen | S8 |
| AI coding tools must be disclosed in the README (§4.1.4) | Specific disclosure section, by component | S8 |
| Contract addresses or tx hashes; document why Monad's capabilities are used (§9.2) | `docs/WHY_MONAD.md` + `/proof` | S3, S7 |
| One project, one track | Track 1: Onchain Finance & Trading | Submission |
| Non-confidential review (§5.3) | No secrets in repo; relayer and bot keys only in env | S1 `.gitignore`, S8 secret scan |
| Deadline 13 Oct 2026, 11:59 PM ET | Submit with margin | `10_SUBMISSION.md` |

Bounties we target (requirement text per the same transcription): **Best Mera-Powered UX** ($2,500: "Mera is the entire account layer — no seed phrase, no extension, no custody backend") and **Best Use of Envio** ($1,000: HyperIndex "to power real on-chain data driving a core feature"). Bounties are scored 40% on adherence to their own requirements, so we meet them literally.

---

## 4. Scope

### In scope (v1)
- One Solidity contract `BatchAuction` (one market per deployment, immutable params) + `DemoToken` (ERC20Permit) ×2 + `Faucet`.
- Order lifecycle: deposit → place (direct or relayed EIP-712 intent) → cancel while batch open → self-clearing on the next block → claim (anyone may claim for an owner) → withdraw.
- Gasless path for people: Mera passkey account, faucet drip, signed intents submitted by a relayer.
- Bots: keeper (crank + auto-claim), market maker (requotes every batch while awake), **Pete** (adversarial priority-fee bot, demo only), conductor (wake-on-visit, "Unleash Pete").
- Envio HyperIndex indexer for batches, orders, fills, tx index and priority fee.
- Web app: Trade, Batch receipt (shareable), My orders, Proof.
- Deployments: Monad **mainnet** (production + recording) with worthless demo tokens; Monad testnet for development.

### Out of scope (do not build)
- Resting GTC orders across batches (v2; per-tick fill accumulators, specified in `docs/DESIGN.md` §Next only as prose).
- Multiple markets per contract, factory, governance, upgradeability, fees, token launch, real-asset markets.
- Kuru integration (roadmap line only).
- Any price oracle. Any offchain matching. Any use of `tx.gasprice`, tx index, `block.coinbase`, `block.prevrandao` in the contract.
- LLMs anywhere in the product.

### Business story (for write-up and Q&A, not code)
Batch auctions are what exchanges use when fairness matters most: the open and the close (see the Xetra market model). Onchain, the moment that most needs one is a token's first hours. Batchelor's first customer is a **launchpad or new token team** running opening auctions and long-tail markets, earning a matched-volume fee. Liquid markets graduate to a continuous CLOB such as Kuru. Revenue: fee in bps on matched volume (0 in v1).

---

## 5. Users

- **Asha (person):** has never installed a wallet. Opens the link on her phone, taps Face ID, gets demo tokens, places one buy. Wants to know she wasn't played.
- **Pete (adversary, a bot):** for a 20-block burst, sends 4 buy orders per block (one per key) with priority fee set to 10× the base fee. On a continuous book he would fill first. On Batchelor he gets the same price as Asha.
- **Mo (market maker bot):** quotes 3 bid and 3 ask levels around a random-walk mid, one transaction per batch, only while awake.
- **Judge (person with no MON):** same path as Asha, plus an "Unleash Pete" button with a daily cap.

---

## 6. Mechanism specification (the core IP; implement exactly)

### 6.1 Parameters (immutable per deployment)
| Name | Type | Demo value | Meaning |
|---|---|---|---|
| `BASE` | ERC20 (18 dec) | ROSE (demo) | asset being priced |
| `QUOTE` | ERC20 (6 dec) | dUSD (demo) | asset prices are quoted in |
| `N_TICKS` | constant 256 | 256 | ticks per side, indices 0..255 |
| `MIN_PRICE` | uint256 | 0.500000 dUSD | price of tick 0, in QUOTE units per 1e18 BASE |
| `TICK_SIZE` | uint256 | 0.005000 dUSD | linear grid: `price(i) = MIN_PRICE + i * TICK_SIZE` |
| `LOT` | uint256 | 1e15 (0.001 ROSE) | order quantity unit; all quantities are integer lots |
| `BATCH_BLOCKS` | uint32 | 1 | batch window in blocks |
| `REF_TICK0` | uint16 | 100 | initial reference tick for tie-breaking |

### 6.2 Batch lifecycle
- At most **one open batch** exists. It has `id` (uint64, starts at 1, increments only when a batch with orders opens), `startBlock`, and per-side active range `bidMin/bidMax/askMin/askMax`.
- The batch is **sealed** once `block.number >= startBlock + BATCH_BLOCKS`. Orders can only be placed into or cancelled from an unsealed batch.
- `_roll()` runs at the top of every state-changing external function (`place*`, `cancel*`, `clear`, `claim*`): if an open batch is sealed, clear it now. **Invariant: no transaction ever writes a new batch's orders before the previous batch is cleared.** This is what lets the ladder reuse storage (§7.1).
- `clear()` is permissionless and a no-op if there is nothing sealed. The keeper calls it when a block passes with no other activity.

### 6.3 Orders
- Single-batch limit orders: side (BUY/SELL), limit tick `t`, quantity `q` lots. Unfilled remainder is refunded at claim. No time priority exists anywhere.
- Escrow at placement, from the trader's internal balance: BUY escrows `ceil(q*LOT*price(t)/1e18)` QUOTE; SELL escrows `q*LOT` BASE.
- `cancel` (owner or signed intent) only while the order's batch is unsealed: subtract from the ladder, refund escrow to the internal balance.

### 6.4 Uncrossing (Xetra-style call auction rules)
Source: Xetra T7 Market Model §7.1, §8.1.1 and §11.1.1 ([PDF](https://www.eurexchange.com/resource/blob/3044352/a96e9c96638e877d08aa81d74c4a5f16/data/T7_Release_10.1_-_Market_Model%20_Xetra.pdf)): maximum executable volume, then lowest surplus, then market pressure, then reference price.

Let `B[i]` = bid lots at tick i, `A[i]` = ask lots at tick i for the sealed batch. Only ticks in `[lo, hi] = [askMin, bidMax]` can trade; if `askMin > bidMax` or either side is empty, there is no trade (`V = 0`).
1. `D(i) = Σ_{j ≥ i} B[j]` (demand at price i), `S(i) = Σ_{j ≤ i} A[j]` (supply), `vol(i) = min(D(i), S(i))`, `sur(i) = D(i) − S(i)` (signed).
2. Candidates = ticks in `[lo, hi]` with maximal `vol`. If max vol is 0, no trade.
3. Among them keep minimal `|sur|`.
4. If every remaining candidate has `sur > 0` (buy pressure): pick the **highest**. If every one has `sur < 0`: pick the **lowest**.
5. Otherwise pick the candidate **closest to the reference tick** (`refTick` = last clearing tick, initially `REF_TICK0`); exact ties go to the lower tick.
6. `clearTick = i*`, `V = vol(i*)`, `p* = price(i*)`, then `refTick = i*`.

Implementation: one descending pass over `[lo, hi]` to fill a memory array `D`, one ascending pass computing `S` and evaluating 2–5 with running state (`bestVol, bestAbsSur, lowCand, highCand, anyPos, anyNeg, anyZero, closestToRef`). O(hi − lo + 1), at most 256 ticks.

### 6.5 Rationing with price priority (cutoffs)
- Buys fill from the highest tick down until `V` lots are allocated. `buyCutoff` = the tick where cumulative bids first reach `V`. Buys above the cutoff fill fully; at the cutoff tick fill pro-rata with `rB = V − D(buyCutoff+1)` of `mB = B[buyCutoff]`; below it, nothing.
- Sells symmetric from the lowest tick up: `sellCutoff`, `rS = V − S(sellCutoff−1)`, `mS = A[sellCutoff]`.
- Facts the tests must assert: `buyCutoff ≥ clearTick ≥ sellCutoff`; at most one side has `r < m` (the side in surplus); every filled buy has limit ≥ `clearTick`, every filled sell limit ≤ `clearTick`.

### 6.6 Settlement math (solvency-safe rounding; use OZ `Math.mulDiv` with explicit `Rounding`)
For an order of `q` lots at tick `t`, let `(r, m)` = `(1,1)` if fully filled, the cutoff pair if at the cutoff tick, `(0,1)` if unfilled. `b = q*LOT`, `p = p*`.

| Side | Base | Quote | Refund |
|---|---|---|---|
| BUY | receives `floor(b*r/m)` | pays `ceil(b*r*p / (m*1e18))` | escrow − pay |
| SELL | delivers `ceil(b*r/m)` | receives `floor(b*r*p / (m*1e18))` | `b` − delivered |

Rounding always favors the contract, so Σ base out ≤ V·LOT ≤ Σ base in and Σ quote in ≥ V·LOT·p/1e18 ≥ Σ quote out. Dust stays in the contract. Claims credit internal balances; `withdraw` moves tokens out.

### 6.7 Invariants (each one is a test; none are optional)
1. **Solvency:** for each token, `balanceOf(contract) ≥ Σ internal balances + Σ escrow of unclaimed orders`.
2. **Conservation per batch:** Σ buyer base received ≤ Σ seller base delivered; Σ buyer quote paid ≥ Σ seller quote received; differences ≤ number of orders in the batch (wei).
3. **Uniform price:** every filled order in a batch settles at `p*`.
4. **Permutation invariance (the headline property):** placing the same multiset of orders in any order within a block yields identical `clearTick`, cutoffs and per-order fills.
5. **Limit respected:** no buy pays above its limit, no sell receives below its limit.
6. **Refund completeness:** an order with no fill gets its full escrow back.
7. **Reference model equality:** results equal the naive `RefAuction` (test-only, O(orders × ticks), no storage tricks) on random books.
8. **No priority inputs:** the contract bytecode/source contains no `tx.gasprice`, `block.coinbase`, `block.prevrandao` (grep gate in CI).

---

## 7. Contract specification

### 7.1 Storage layout (page-aligned by design; MIP-8 page = slot >> 7, 128 slots per page)
```
slot 0   .. 255  uint256[256] bidTicks   // pages 0,1  : (uint64 batchTag << 192) | lots
slot 256 .. 511  uint256[256] askTicks   // pages 2,3  : same packing
slot 512         BatchMeta    meta       // id u64 | startBlock u64 | bidMin u16 | bidMax u16 | askMin u16 | askMax u16 | orderCount u32 | hasOpen u8
slot 513         uint16 refTick, other scalars
slot 514+        Order[] orders          // contiguous from keccak(514); 2 slots/order
                 Result[] results        // contiguous; 2 slots/batch, index = batchId
                 mapping balances, nonces
```
- Declare `bidTicks` and `askTicks` as the **first** state variables. **No inherited storage**: no OZ `ReentrancyGuard` (uses slot 0); use `ReentrancyGuardTransient` if the S1 spike confirms TSTORE works on Monad, else a hand-written lock placed after the arrays. `EIP712` and `Nonces`-style helpers must not shift slots 0–511 (OZ 5.4.0 `EIP712` has fallback string storage; do not inherit it in BatchAuction. Use a storage-free fixed-domain helper and verify with `forge inspect`).
- **Lazy reset via batch tags:** a tick slot counts for batch `k` only if its tag equals `k`. Writing a new batch's order to a tick overwrites a stale tag (nonzero→nonzero write, no state growth). Nothing is ever zeroed after clearing. This is why §6.2's clear-before-write invariant is mandatory.
- Gate (S2): `forge inspect BatchAuction storageLayout` shows `bidTicks` at slot 0 and `askTicks` at slot 256.

### 7.2 Packed structs
```solidity
struct Order {            // 2 slots
  address owner; uint8 side; uint16 tick; bool claimed;   // slot a (160+8+16+8)
  uint64 lots; uint64 batchId; uint128 escrow;            // lots packs into a; batchId and escrow in b
}
struct Result {           // 2 slots
  uint16 clearTick; uint16 buyCutoff; uint16 sellCutoff; uint64 volumeLots; uint64 clearedAt; uint32 clearGas; // a
  uint64 rB; uint64 mB; uint64 rS; uint64 mS;                                                                 // b
}
```
Lots are `uint64`; per-tick aggregates use checked addition (overflow reverts).

### 7.3 External API
```solidity
// funds
function deposit(address token, uint256 amount) external;
function withdraw(address token, uint256 amount) external;
function depositFor(address to, address token, uint256 amount) external;      // used by Faucet
// trading (msg.sender is trader)
function place(uint8 side, uint16 tick, uint64 lots) external returns (uint256 orderId);
function placeMany(uint8[] calldata side, uint16[] calldata tick, uint64[] calldata lots) external returns (uint256 firstId);
function cancel(uint256 orderId) external;
// relayed (EIP-712, domain "Batchelor", version "1")
// Intent(address trader,uint8 action,uint8 side,uint16 tick,uint64 lots,uint256 orderId,uint64 nonce,uint64 deadline)
function placeFor(Intent calldata i, bytes calldata sig) external returns (uint256 orderId);
function cancelFor(Intent calldata i, bytes calldata sig) external;
// settlement
function clear() external;                                   // permissionless crank
function claim(uint256[] calldata orderIds) external;        // anyone; credits each owner
// views
function openBatch() external view returns (BatchMeta memory);
function ladder(uint16 from, uint16 to) external view returns (uint64[] memory bids, uint64[] memory asks); // open batch only
function result(uint64 batchId) external view returns (Result memory);
function previewFill(uint256 orderId) external view returns (int256 baseDelta, int256 quoteDelta, uint256 refund);
function balances(address who) external view returns (uint256 base, uint256 quote);
function nonces(address who) external view returns (uint64);
function price(uint16 tick) external view returns (uint256);
```
Events: `Deposited`, `Withdrawn`, `OrderPlaced(orderId, trader, batchId, side, tick, lots, relayed)`, `OrderCancelled(orderId)`, `BatchCleared(batchId, clearTick, price, volumeLots, buyCutoff, sellCutoff, rB, mB, rS, mS, orderCount, clearGas)`, `Claimed(orderId, owner, baseIn, baseOut, quoteIn, quoteOut)`.
`clearGas` = `gasleft()` before minus after the internal `_clear()`, emitted so every batch's clearing cost is public.

Errors (custom, typed): `BatchSealed`, `NotOpenBatch`, `BadTick`, `ZeroLots`, `Insufficient(token)`, `NotOwner`, `BadSig`, `BadNonce`, `Expired`, `AlreadyClaimed`, `Overflow`.

### 7.4 Gas policy (Monad bills the gas limit; [gas docs](https://docs.monad.xyz/developer-essentials/gas-pricing))
- S3 measures worst-case gas for each entrypoint **including a full-range self-clear** and writes `packages/core/src/gas.json`. Every client (web, relayer, bots) sends an explicit `gas` = worst case × 1.075 (Category Labs' 7.5% buffer from the [wallet guide](https://docs.monad.xyz/developer-essentials/wallet-developers)), never `eth_estimateGas`.
- UI shows "Network fee: charged on X gas" in plain words on the order ticket.

---

## 8. Monad facts this build relies on (verified 12 Oct 2026; sources in `12_SOURCES.md`)

| Fact | Value | Consequence |
|---|---|---|
| MIP-8 page | 128 slots; `page = slot >> 7` | Ladder on slots 0–511 = 4 pages |
| MIP-8 SLOAD | cold page 8,100; warm page 100 | Full scan ≈ 4×8,100 + 508×100 reads |
| MIP-8 SSTORE | +8,000 if page unread, +2,800 first write per page per tx, +17,000 on net state growth | Tag trick avoids state growth on reused ticks |
| MIP-8 activation | testnet 12 Aug 2026; mainnet 2 Sep 2026 14:30 UTC (MonadTen) | Mainnet and testnet both page-priced |
| Monad Foundry | `network = "monad"`; pin `hardfork = "monad:MonadNine"`; default is MonadTen | Same tests, two rule sets |
| Block time | ~300 ms mainnet (Sep 2026 mean ~302 ms); 150M block gas; 30M tx cap | "Every block" ≈ 3.3 batches/s |
| Ordering | default Priority Gas Auction by total gas price | The advantage Pete buys elsewhere |
| Gas billing | declared gas limit, no refunds; min base fee 100 MON-gwei; 200k-gas tx ≈ 0.02 MON | Explicit gas limits from S3 |
| Mempool | no global mempool; `sendRawTransaction` = accepted by node, not included | Track local nonces; poll receipts |
| Reserve balance | 10 MON budget for inflight gas per EOA; value spend below it reverts (undelegated accounts excepted once per k=3 blocks) | Bots keep > 10 MON; bots never send MON value |
| eth_getLogs | 100-block cap on QuickNode/Foundation RPC | UI never scans logs; Envio only |
| Chains | mainnet 143 `rpc.monad.xyz`; testnet 10143 `testnet-rpc.monad.xyz` (QuickNode, 50 rps) | Separate env per chain |
| Testnet MON | ~1 MON/24 h per faucet | Bots run on mainnet; testnet for dev only |
| Mera | `createPasskeyWithPrfOutput`, `getPasskeyPrfOutput`, `createSecp256k1SigningSession`, `toViemAccount`; PRF required; desktop Chrome needs Google Password Manager; passkey bound to `rpId` | Pick final domain before any real user signs up |
| Envio | Monad testnet first-class in HyperIndex/HyperSync/HyperRPC; v3 config uses `chains:`; `field_selection` exposes `transactionIndex`, `effectiveGasPrice`, `maxPriorityFeePerGas`, block `baseFeePerGas` | Receipts show tx position and priority fee |

---

## 9. Architecture

```
                     ┌──────────────────────── Monad (mainnet 143) ────────────────────────┐
                     │  BatchAuction  (ladder on pages 0–3, self-clearing, EIP-712 intents) │
                     │  DemoToken ROSE · DemoToken dUSD · Faucet                            │
                     └───────▲──────────────▲─────────────────▲─────────────────┬──────────┘
          signed intents     │  place/clear │ placeMany/claim │ priority-fee     │ events
                             │              │                 │ spam (demo)      ▼
┌───────────────┐   ┌────────┴───────┐  ┌───┴──────────────────┴──┐       ┌────────────────┐
│ Web (SvelteKit│──►│ /api/relay     │  │ services/bots (Node)    │       │ Envio HyperIndex│
│ static + Mera │   │ /api/drip      │  │ keeper · mo · pete ·    │       │ Batch, Order,   │
│ passkey)      │   │ /api/wake →────┼─►│ conductor (HTTP /wake,  │       │ Trader (GraphQL)│
│ live ladder via│  │ (Vercel fns)   │  │ /unleash)               │       └───────┬────────┘
│ WS newHeads   │◄──┴────────────────┘  └─────────────────────────┘               │
│ history via   │◄────────────────────────────────────────────────────────────────┘
│ GraphQL       │   packages/core: ABI, addresses, gas.json, uncross.ts, replay.ts
└───────────────┘
```
Decisions (do not relitigate):
- **One contract, one market, immutable params.** No proxy, no admin, no fee switch.
- **Self-clearing** is part of correctness (§6.2), not an optimization. Keeper is convenience only.
- **Internal balances**: orders draw from deposited balances; claims credit them. Fewer token transfers, simpler gasless flow.
- **Demo tokens on mainnet**: real chain, real gas, worthless assets. Nothing of value is at risk. Labelled everywhere.
- **TypeScript off chain, once.** `packages/core/uncross.ts` mirrors §6.4–6.6 for the indicative price and receipts; it is tested against golden vectors exported by Foundry. The counterfactual continuous-book replay lives in `replay.ts`.
- **No database of our own.** Chain is state; Envio is the read model; the relayer and bots are stateless apart from in-memory rate limits and nonce caches.
- **Wake-on-visit liquidity**: Mo quotes every batch for 90 s after any human activity, then sleeps, to keep mainnet spend bounded.

---

## 10. Stack (pinned; no additions without asking)
- **Contracts:** official Foundry v1.8.0 with Monad support (`foundryup`; `network = "monad"`), Solidity 0.8.28, `evm_version = "cancun"`, OpenZeppelin Contracts 5.x (ERC20, ERC20Permit, EIP712, ECDSA, Math, SafeERC20, ReentrancyGuardTransient), forge-std.
- **TypeScript (everything off chain):** Node 24 (Mera 0.2.0 requires >=24), pnpm 9 workspaces, TypeScript 5 strict, viem 2.x (≥ 2.40 for `monad` / `monadTestnet` chain exports), zod, vitest.
- **Web:** SvelteKit 2 + Svelte 5 (runes), `@sveltejs/adapter-vercel` (static pages + 3 server routes), Tailwind CSS 4, `@category-labs/mera` ≥ 0.2, `@scure/bip32`, `@scure/bip39`. Charts are hand-written SVG, no chart library.
- **Bots:** Node 24 + viem (WebSocket transport), `hono` for the tiny HTTP surface.
- **Indexer:** Envio HyperIndex (CLI `envio`, v3 config), Envio Cloud dev tier.
- **Deploy:** Vercel (web + relayer), Render background worker or Fly machine (bots), Envio Cloud (indexer).
- **Fonts:** Bricolage Grotesque (display), IBM Plex Sans (text, tabular numerals), self-hosted via `@fontsource`.

Env (`.env.example`): `CHAIN=mainnet|testnet`, `RPC_HTTP`, `RPC_WS`, `MARKET_ADDRESS`, `FAUCET_ADDRESS`, `RELAYER_PK`, `KEEPER_PK`, `MO_PK`, `BOTS_URL`, `BOTS_TOKEN`, `ENVIO_GRAPHQL_URL`, `PETE_PK_1..4`, `PETE_PRIORITY_MULT=10`, `PETE_BURST_BLOCKS=20`, `PETE_DAILY_CAP=10`, `MO_AWAKE_SECONDS=90`, `RELAY_PER_ADDR_PER_MIN=6`.

---

## 11. Repo layout
```
batchelor/
├── CLAUDE.md                       # this bible
├── README.md  LICENSE(MIT)  .env.example  .gitignore  pnpm-workspace.yaml
├── docs/ DESIGN.md  WHY_MONAD.md  SOURCES.md  AI_DISCLOSURE.md  screens/
├── tasks/ todo.md  lessons.md
├── contracts/                      # Foundry
│   ├── foundry.toml                # [profile.default] network="monad"; [profile.pre_mip8] hardfork="monad:MonadNine"
│   ├── src/ BatchAuction.sol  DemoToken.sol  Faucet.sol  lib/Uncross.sol  lib/Settle.sol
│   ├── test/ unit/  fuzz/  invariant/  ref/RefAuction.sol  vectors/ExportVectors.t.sol
│   ├── bench/ PageBench.t.sol  ClearBench.t.sol
│   └── script/ Deploy.s.sol  Seed.s.sol
├── packages/core/src/ abi.ts  addresses.ts  gas.json  bench.json  uncross.ts  replay.ts  format.ts  intents.ts
├── services/bots/src/ index.ts  keeper.ts  mo.ts  pete.ts  conductor.ts  nonce.ts  chain.ts
├── indexer/ config.yaml  schema.graphql  src/EventHandlers.ts
└── apps/web/src/
    ├── lib/ wallet/ (mera.ts, session.ts)  chain/ (client.ts, live.ts)  api/ (graphql.ts)  copy/en.ts  ui/
    ├── lib/viz/ UncrossChart.svelte  BatchTape.svelte  BlockLanes.svelte  GasBars.svelte
    └── routes/ +page.svelte  b/[id]/  me/  proof/  api/relay/+server.ts  api/drip/+server.ts  api/wake/+server.ts
```

---

## 12. Off-chain services

**Relayer (`/api/relay`)**: body `{intent, sig}` validated with zod → recover signer with viem `verifyTypedData` → `simulateContract` → send `placeFor`/`cancelFor` with the S3 gas bound → return `{hash}` immediately; client polls the receipt. Limits: `RELAY_PER_ADDR_PER_MIN`, relayer balance floor (refuse below 12 MON so reserve rules never bite), deadline ≤ 60 s ahead. Before relaying a `place`, it calls `/api/wake` (fire-and-forget).

**Drip (`/api/drip`)**: calls `Faucet.drip(user)`, which mints 100 ROSE + 100 dUSD into the user's internal balance via `depositFor`. Onchain cap: once per address per 24 h.

**Keeper**: on every new head, if the open batch is sealed and still uncleared after 1 block, call `clear()`. After each `BatchCleared`, call `claim` on that batch's unclaimed orders in chunks so balances are always current.

**Mo**: while awake, each batch sends one `placeMany` with 3 bids and 3 asks around a mid that random-walks ±0.2% per batch inside ticks [60, 200]. Sleeps after `MO_AWAKE_SECONDS` without human activity.

**Pete**: when unleashed, for `PETE_BURST_BLOCKS` consecutive blocks sends one transaction per key per block (4 keys) placing a BUY at a high limit, `maxPriorityFeePerGas = PETE_PRIORITY_MULT × baseFee`. Daily cap. Never runs unless explicitly unleashed.

**Conductor**: HTTP `POST /wake`, `POST /unleash` (bearer `BOTS_TOKEN`), `GET /health` (balances, awake state, last block seen). The web app shows bot status honestly ("Liquidity bot is asleep. It wakes when you place an order").

**Nonces**: every key keeps its own local nonce, reconciles with `eth_getTransactionCount(pending)` on error and never reuses a nonce; Pete uses 4 keys so each sends at most one transaction per block.

---

## 13. Indexer (Envio)
Entities:
- `Batch { id, market, startBlock, clearedBlock, clearTick, price, volumeLots, buyCutoff, sellCutoff, rB, mB, rS, mS, orderCount, clearGas, baseFeePerGas, clearedAtTimestamp }`
- `Order { id, batch, trader, side, tick, lots, relayed, blockNumber, txIndex, txHash, effectiveGasPrice, priorityFeePerGas, cancelled, claimed, baseIn, baseOut, quoteIn, quoteOut }`
- `Trader { id, orders, volumeLots }`
Field selection on `OrderPlaced`: `transactionIndex, hash, effectiveGasPrice, maxPriorityFeePerGas`; block `baseFeePerGas`. Priority fee per gas = `effectiveGasPrice − baseFeePerGas`.

---

## 14. UX and design system

### 14.1 Concept
The picture of a batch auction is two staircases crossing: cumulative demand stepping down from the left, cumulative supply stepping up, and one horizontal line where they meet. That crossing is redrawn every ~300 ms from live chain data. It is the hero, not decoration. Everything else stays quiet.

The name is a pun, so the brand gets one wink and no more: the sell side is rose-coloured and the base token is ROSE. No TV-show references, logos or phrases.

### 14.2 Tokens
| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#F3F5F8` | `#121826` | page background (cool, not cream) |
| `--ink` | `#16203A` | `#E6EAF2` | text, axes |
| `--bid` | `#0E7C6B` | `#3CC4AE` | demand staircase, buy |
| `--ask` | `#C23B67` | `#F07CA0` | supply staircase, sell, ROSE |
| `--clear` | `#4B33C8` | `#9C8CFF` | the clearing price line and number, the only saturated accent |
| `--muted` | `#5D6782` | `#9AA3BA` | secondary text, gridlines at 20% |
Type: **Bricolage Grotesque** for the price number, headings and the wordmark (use its width axis: the live price is set wide and heavy). **IBM Plex Sans** with `font-variant-numeric: tabular-nums` for everything else. Scale: 14 / 16 / 20 / 28 / 44 / 88 px. Sentence case everywhere; no all-caps labels; no eyebrow labels above headings; no "→" on buttons.

### 14.3 Screens
1. **Trade `/`** (desktop: chart left 7/12, ticket right 5/12; mobile: chart on top, ticket sheet below).
   - `UncrossChart`: live open-batch ladder from `ladder()` + indicative clearing price from `uncross.ts`; on each `BatchCleared` the line snaps to the cleared price and the staircases reset. Batch number and a thin 300 ms progress bar under it.
   - `BatchTape` under the chart: the last 60 batches as thin columns (height = volume, dot = price), click opens the receipt.
   - Ticket: Buy/Sell segmented control, price stepper in ticks (shows dUSD), amount in ROSE, "You'll pay at most X dUSD" line, gas line, primary button "Place buy order". After sending: "In batch #N. Clearing next block." then the fill in place.
   - Bot status line + "Unleash Pete" secondary button (with daily remaining count).
2. **Batch receipt `/b/[id]`** (shareable, the demo's money screen).
   - Headline sentence built from data: "34 orders, one price: 1.0350 dUSD." Sub: "Pete paid 10× the base fee as priority on 30 of them. It bought him nothing."
   - `BlockLanes`: one row per order in transaction-index order; left a bar for priority fee per gas; right the fill at the single price line. Asha's row highlighted.
   - Counterfactual card: "Replayed on a continuous order book in the same order: Pete would have paid A, you would have paid B." With the label "Simulated replay of this batch's real orders."
   - Facts table: clear tick, volume, cutoffs, clearGas, block, tx hashes linking to the explorer.
3. **My orders `/me`**: balances, open order, recent fills, withdraw.
4. **Proof `/proof`**: `GasBars` (MonadNine vs MonadTen clear cost for 32/128/512 active ticks; live median `clearGas` from the last 500 batches), invariant list with test counts and fuzz runs, contract addresses, "Why Monad" in 4 short paragraphs.

### 14.4 Copy rules
- Say "same price", "batch", "clearing price". Never "MEV-proof", "unfair", "front-running solved"; say exactly what is proven.
- Errors say what happened and what to do: "Passkey couldn't create a key on this browser. Save the passkey to Google Password Manager or iCloud Keychain, then try again."
- Every demo-token amount shows the token name; the footer states "Demo tokens on Monad mainnet. No real value."

### 14.5 Quality floor
WCAG AA contrast in both themes; keyboard focus visible; `prefers-reduced-motion` stops the staircase animation and shows the static latest batch; responsive at 375 / 768 / 1280; chart has a text alternative (table of top 10 ticks per side + price).

---

## 15. Quality gates (every session)
- Contracts: `forge fmt --check`, `forge build --sizes`, `forge test` (fuzz runs ≥ 1,000 for unit fuzz, invariant `runs = 256, depth = 200`), `forge inspect BatchAuction storageLayout` matches §7.1, grep gate §6.7(8).
- TS: `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test`, `pnpm --filter web build`.
- ABI/addresses regenerated into `packages/core` after any contract change (`pnpm gen`).
- `tasks/todo.md` updated; anything learned the hard way appended to `tasks/lessons.md`.

## 16. Agent operating rules
1. Read this file and `tasks/lessons.md` first. Write the session plan to `tasks/todo.md` before code.
2. Follow the engineering-workflow gates: plan → scaffold → vertical slice → self-review → quality gates → document.
3. The user explicitly authorizes logical commits and pushes in this session. Do not rewrite history or add attribution trailers.
4. Never add a dependency outside §10 without asking.
5. Never send a mainnet transaction without printing the exact call, gas limit, and expected cost first and getting Rahul's yes. Testnet and local anvil are free to use.
6. Never commit keys. `.env*` except `.env.example` is gitignored; S8 runs a secret scan.
7. Never claim a number that is not produced by a script in this repo. Placeholders stay as `[[bench:…]]` until filled from `bench.json`.
8. If a Monad behavior surprises you, write a 10-line reproduction, record it in `tasks/lessons.md`, and ask before working around it.
9. End every session with: built, verified (commands + summarized output), deferred, risks.
