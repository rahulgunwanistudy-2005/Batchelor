# Auction design

Batchelor is one immutable market with 256 ticks per side, single-batch limit orders, internal token balances and a uniform batch clearing price. The demo uses 18-decimal ROSE, 6-decimal dUSD, tick 0 = 0.500000 dUSD, tick size = 0.005000 dUSD and lot = 0.001 ROSE. Both tokens are worthless demo assets. There is no oracle, offchain matching, admin, fee or proxy.

## Lifecycle and storage

Deposit → place → cancel while open, or seal → clear → claim → withdraw. At most one batch is open. A batch seals at `startBlock + BATCH_BLOCKS`; the demo window is one block. Every state-changing entrypoint first rolls a sealed batch, before writing any new orders. `clear` is permissionless and harmless when no sealed batch exists. A keeper provides clearing transactions during idle periods and claims for owners, but the auction does not depend on a privileged keeper.

The bid/ask arrays occupy slots 0–255 and 256–511: four MIP-8 pages. A tick stores `(batchId << 192) | lots`; old tags count as zero. A new batch overwrites an old nonzero slot instead of clearing the whole ladder. Metadata occupies slot 512, reference tick and side totals share 513, and orders begin at 514. Orders/results each occupy two slots. See the generated storage layout gate and [Monad proof](WHY_MONAD.md).

## Price selection

The implemented call-auction rule follows [Xetra T7 Market Model R10.1](https://www.eurexchange.com/resource/blob/3044352/a96e9c96638e877d08aa81d74c4a5f16/data/T7_Release_10.1_-_Market_Model%20_Xetra.pdf): maximum volume, minimum surplus, market pressure, reference price. Within the crossing range `[askMin, bidMax]`, define demand `D(i) = Σ bids[j ≥ i]`, supply `S(i) = Σ asks[j ≤ i]`, volume `min(D,S)` and signed surplus `D−S`.

1. Keep ticks with maximal executable volume. If zero, no trade.
2. Keep those with smallest absolute surplus.
3. If all remaining surplus signs are positive, choose the highest tick. If all are negative, choose the lowest.
4. Otherwise choose nearest to the previous traded clearing tick (initially 100); equal-distance ties choose lower.

The descending demand pass and ascending supply/candidate pass take O(ticks), bounded to 256 ticks. Optimized memory-safe assembly mirrors the independent reference implementation. Nontrading batches do not update the reference tick.

## Allocation and escrow

Buys consume volume from the highest tick downward; sells from lowest upward. Ticks better than the cutoff fill fully; the cutoff divides remaining volume `r` over all lots `m` at that tick; worse ticks fill zero. Therefore `buyCutoff ≥ clearTick ≥ sellCutoff`, and at most one side is partially rationed. At the same tick there is no time or fee priority.

BUY escrow is `ceil(q × LOT × limitPrice / 1e18)` dUSD units; SELL escrow is `q × LOT` ROSE units. Placement debits internal balances. Cancellation subtracts ladder lots and returns escrow once, only while unsealed. Relayed EIP-712 intents bind trader, action, side, tick, lots, order ID, nonce and deadline to chain ID and this contract. Contract deadlines are enforced; the web service also limits signatures to 60 seconds ahead.

## Exact settlement

Let `b = q × LOT`, `p = clearingPrice` and `(r,m)` equal `(1,1)` for full fill, the cutoff pair for a cutoff order, or `(0,1)` for no fill. Quotes use the exact rational numerator and round once; they are not calculated from already-rounded base amounts.

| Side | Base | Quote | Refund |
|---|---|---|---|
| BUY | receives `floor(b×r/m)` | pays `ceil(b×r×p/(m×1e18))` | quote escrow − payment |
| SELL | delivers `ceil(b×r/m)` | receives `floor(b×r×p/(m×1e18))` | base escrow − delivery |

OpenZeppelin `Math.mulDiv` uses explicit Floor/Ceil. Rounding favors contract solvency; dust remains locked in the contract. Claims mark orders terminal and credit owners' internal balances. Anyone can claim, and withdrawals transfer only the owner's credited balance. No-fill orders refund fully. Zero previews mean pending or terminal orders; immutable results/order fields or indexed Claimed events recover historical fills.

## Evidence and receipts

The eight gates are solvency, conservation/bounded dust, uniform price, permutation invariance, limits, full refunds, independent reference equality and absence of priority inputs. [Security review](SECURITY.md) explains exact interpretations and test coverage. The headline equality is economic: order IDs and measured gas need not be invariant. A clearing price is uniform even when smallest-unit rounding slightly changes an order's effective average.

Envio indexes real events, transaction index/hash and effective priority fee. Receipts compare the onchain auction with a deterministic price/time continuous-book replay of those orders. The replay is explicitly simulated, excludes cancelled orders whose cancellation timing is unavailable, and rounds only displayed rational averages. It does not claim what a real alternative market would have done.

## Next: resting orders (prose only)

A future market could retain GTC orders across batches using per-tick fill accumulators, per-order accumulator checkpoints and explicit cancellation/withdrawal rules. It would need new liability, rounding, reference/permutation and gas proofs, plus clear rules for surviving orders versus new orders. This is not implemented in v1. Multiple markets, fees, token launches, or a possible graduation to a continuous book such as Kuru remain business/roadmap ideas, not deployed features.
