// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {Test} from "forge-std/Test.sol";
import {BatchAuction} from "../../src/BatchAuction.sol";
import {DemoToken} from "../../src/DemoToken.sol";
import {AuctionTypes} from "../../src/lib/AuctionTypes.sol";
import {RefAuction} from "../ref/RefAuction.sol";

contract AuctionHandler is Test, AuctionTypes {
    BatchAuction public market;
    DemoToken public base;
    DemoToken public quote;
    address[4] public actors;
    mapping(address => uint256) public depositedBase;
    mapping(address => uint256) public depositedQuote;
    mapping(address => uint256) public withdrawnBase;
    mapping(address => uint256) public withdrawnQuote;

    struct Totals {
        uint256 bi;
        uint256 bo;
        uint256 qi;
        uint256 qo;
        uint256 count;
    }
    mapping(uint64 => Totals) private batchTotals;
    Order[] private ghostOrders;
    mapping(uint256 => bool) private terminal;
    uint64 public lastRecorded;

    constructor(BatchAuction m, DemoToken b, DemoToken q) {
        market = m;
        base = b;
        quote = q;
        for (uint256 j; j < 4; ++j) {
            actors[j] = address(uint160(0x100 + j));
            vm.startPrank(actors[j]);
            b.approve(address(m), type(uint256).max);
            q.approve(address(m), type(uint256).max);
            vm.stopPrank();
        }
    }

    function deposit(uint256 actorSeed, uint256 amountSeed, bool isBase) external {
        address who = actors[actorSeed % 4];
        uint256 amount = amountSeed % 1e22 + 1;
        DemoToken token = isBase ? base : quote;
        token.mint(who, amount);
        vm.prank(who);
        market.deposit(address(token), amount);
        if (isBase) depositedBase[who] += amount;
        else depositedQuote[who] += amount;
        _recordCleared();
    }

    function place(uint256 actorSeed, uint8 sideSeed, uint16 tickSeed, uint64 lotsSeed) external {
        address who = actors[actorSeed % 4];
        uint8 side = sideSeed % 2;
        uint16 tick = tickSeed % 256;
        uint64 lots = lotsSeed % 97 + 1;
        uint256 b = uint256(lots) * market.LOT();
        uint256 escrow = side == 0 ? (b * market.price(tick) + 1e18 - 1) / 1e18 : b;
        (uint256 freeB, uint256 freeQ) = market.balances(who);
        if ((side == 0 ? freeQ : freeB) < escrow) return;
        vm.prank(who);
        uint256 id = market.place(side, tick, lots);
        require(id == ghostOrders.length, "ghost id");
        ghostOrders.push(Order(who, side, tick, false, lots, market.openBatch().id, uint128(escrow)));
        _recordCleared();
    }

    function cancel(uint256 idSeed) external {
        if (ghostOrders.length == 0) return;
        uint256 id = idSeed % ghostOrders.length;
        Order memory o = ghostOrders[id];
        BatchMeta memory m = market.openBatch();
        if (
            terminal[id] || !m.hasOpen || o.batchId != m.id
                || block.number >= uint256(m.startBlock) + market.BATCH_BLOCKS()
        ) return;
        vm.prank(o.owner);
        market.cancel(id);
        terminal[id] = true;
    }

    function roll(uint8 blocksSeed) external {
        vm.roll(block.number + uint256(blocksSeed % 4) + 1);
    }

    function clear() external {
        market.clear();
        _recordCleared();
    }

    function claim(uint256 idSeed) external {
        if (ghostOrders.length == 0) return;
        uint256 id = idSeed % ghostOrders.length;
        if (terminal[id]) return;
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        market.claim(ids);
        _recordCleared();
        if (market.result(ghostOrders[id].batchId).clearedAt > 0) {
            terminal[id] = true;
            settled[id] = true;
        }
    }

    function withdraw(uint256 actorSeed, uint256 amountSeed, bool isBase) external {
        address who = actors[actorSeed % 4];
        (uint256 b, uint256 q) = market.balances(who);
        uint256 free = isBase ? b : q;
        uint256 amount = free == 0 ? 0 : amountSeed % (free + 1);
        vm.prank(who);
        market.withdraw(isBase ? address(base) : address(quote), amount);
        if (isBase) withdrawnBase[who] += amount;
        else withdrawnQuote[who] += amount;
        _recordCleared();
    }

    function _recordCleared() private {
        uint64 latest = market.openBatch().id;
        while (lastRecorded < latest) {
            uint64 id = lastRecorded + 1;
            Result memory r = market.result(id);
            if (r.clearedAt == 0) break;
            Totals memory t;
            for (uint256 j; j < ghostOrders.length; ++j) {
                Order memory o = ghostOrders[j];
                if (o.batchId != id || terminal[j]) continue;
                (uint256 bi, uint256 bo, uint256 qi, uint256 qo,) =
                    RefAuction.fill(o, r, market.price(r.clearTick), market.LOT());
                t.bi += bi;
                t.bo += bo;
                t.qi += qi;
                t.qo += qo;
                ++t.count;
            }
            batchTotals[id] = t;
            lastRecorded = id;
        }
    }

    function liabilities() external view returns (uint256 lb, uint256 lq) {
        for (uint256 j; j < 4; ++j) {
            (uint256 b, uint256 q) = market.balances(actors[j]);
            lb += b;
            lq += q;
        }
        for (uint256 j; j < ghostOrders.length; ++j) {
            if (terminal[j]) continue;
            Order memory o = ghostOrders[j];
            Result memory r = market.result(o.batchId);
            if (r.clearedAt == 0) {
                if (o.side == 0) lq += o.escrow;
                else lb += o.escrow;
            } else {
                (, uint256 bo,, uint256 qo, uint256 refund) =
                    RefAuction.fill(o, r, market.price(r.clearTick), market.LOT());
                lb += bo + (o.side == 1 ? refund : 0);
                lq += qo + (o.side == 0 ? refund : 0);
            }
        }
    }

    function assertConservation() external view {
        for (uint64 id = 1; id <= lastRecorded; ++id) {
            Totals memory t = batchTotals[id];
            assertGe(t.bi, t.bo);
            assertGe(t.qi, t.qo);
            assertLe(t.bi - t.bo, t.count);
            assertLe(t.qi - t.qo, t.count);
        }
    }

    function assertAccounting() external view {
        for (uint256 j; j < 4; ++j) {
            address who = actors[j];
            int256 expectedB = int256(depositedBase[who]) - int256(withdrawnBase[who]);
            int256 expectedQ = int256(depositedQuote[who]) - int256(withdrawnQuote[who]);
            for (uint256 k; k < ghostOrders.length; ++k) {
                Order memory o = ghostOrders[k];
                if (o.owner != who) continue;
                // Claimed orders affect net assets; open orders are escrowed from free balance.
                (,,, bool claimed,,,) = market.orders(k);
                if (!terminal[k]) {
                    if (o.side == 0) expectedQ -= int256(uint256(o.escrow));
                    else expectedB -= int256(uint256(o.escrow));
                } else if (claimed && market.result(o.batchId).clearedAt > 0) {
                    // Cancelled orders have claimed=true too, but were excluded from the ghost clear totals.
                    // A separate flag below distinguishes actual claims from cancellations.
                    if (!settled[k]) continue;
                    (uint256 bi, uint256 bo, uint256 qi, uint256 qo,) = RefAuction.fill(
                        o, market.result(o.batchId), market.price(market.result(o.batchId).clearTick), market.LOT()
                    );
                    expectedB += int256(bo) - int256(bi);
                    expectedQ += int256(qo) - int256(qi);
                }
            }
            (uint256 actualB, uint256 actualQ) = market.balances(who);
            assertGe(expectedB, 0);
            assertEq(actualB, uint256(expectedB));
            assertGe(expectedQ, 0);
            assertEq(actualQ, uint256(expectedQ));
            assertEq(base.balanceOf(who), withdrawnBase[who]);
            assertEq(quote.balanceOf(who), withdrawnQuote[who]);
        }
    }
    mapping(uint256 => bool) private settled;
}

contract AuctionInvariantTest is Test {
    BatchAuction internal market;
    DemoToken internal base;
    DemoToken internal quote;
    AuctionHandler internal handler;

    function setUp() public {
        // Handler is deployed fourth, and is the immutable minter for these test tokens.
        address minter = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 3);
        base = new DemoToken("Rose", "ROSE", 18, minter);
        quote = new DemoToken("USD", "dUSD", 6, minter);
        market = new BatchAuction(address(base), address(quote), 500_003, 5_003, 1e15 + 7, 1, 100);
        handler = new AuctionHandler(market, base, quote);
        assertEq(address(handler), minter);
        bytes4[] memory selectors = new bytes4[](7);
        selectors[0] = handler.deposit.selector;
        selectors[1] = handler.place.selector;
        selectors[2] = handler.cancel.selector;
        selectors[3] = handler.roll.selector;
        selectors[4] = handler.clear.selector;
        selectors[5] = handler.claim.selector;
        selectors[6] = handler.withdraw.selector;
        targetSelector(FuzzSelector(address(handler), selectors));
        targetContract(address(handler));
    }

    function invariant_SolventAgainstIndependentOutstandingLiabilities() public view {
        (uint256 b, uint256 q) = handler.liabilities();
        assertGe(base.balanceOf(address(market)), b);
        assertGe(quote.balanceOf(address(market)), q);
    }

    function invariant_ConservationPerBatchAndBoundedDust() public view {
        handler.assertConservation();
    }

    function invariant_InternalBalancesEqualGhostLedgerAndWalletWithdrawals() public view {
        handler.assertAccounting();
    }
}
