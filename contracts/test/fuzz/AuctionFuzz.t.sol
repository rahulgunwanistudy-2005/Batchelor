// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {AuctionTestBase} from "../AuctionTestBase.sol";
import {BatchAuction} from "../../src/BatchAuction.sol";
import {RefAuction} from "../ref/RefAuction.sol";

contract AuctionFuzzTest is AuctionTestBase {
    function testFuzz_ReferenceModelUniformLimitsRefundsAndConservation(uint256 seed) public {
        RefAuction.Quote[] memory quotes = book(seed);
        for (uint256 j; j < quotes.length; ++j) {
            place(j % 2 == 0 ? alice : bob, quotes[j].side, quotes[j].tick, quotes[j].lots);
        }
        Result memory r = close();
        assertResult(r, RefAuction.uncross(quotes, 100));
        if (r.volumeLots > 0) {
            assertGe(r.buyCutoff, r.clearTick);
            assertGe(r.clearTick, r.sellCutoff);
            assertFalse(r.rB < r.mB && r.rS < r.mS);
        }
        Fill memory totals;
        for (uint256 j; j < quotes.length; ++j) {
            Fill memory f = checkOrder(j, r);
            totals.bi += f.bi;
            totals.bo += f.bo;
            totals.qi += f.qi;
            totals.qo += f.qo;
        }
        assertGe(totals.bi, totals.bo);
        assertGe(totals.qi, totals.qo);
        assertLe(totals.bi - totals.bo, quotes.length);
        assertLe(totals.qi - totals.qo, quotes.length);
        assertLe(totals.bo, uint256(r.volumeLots) * LOT);
        assertGe(totals.bi, uint256(r.volumeLots) * LOT);
    }

    function checkOrder(uint256 id, Result memory r) private returns (Fill memory f) {
        Order memory o = readOrder(market, id);
        f = referenceFill(o, r, market.price(r.clearTick), LOT);
        (int256 bd, int256 qd, uint256 unused) = market.previewFill(id);
        assertEq(bd, int256(f.bo) - int256(f.bi));
        assertEq(qd, int256(f.qo) - int256(f.qi));
        assertEq(unused, f.refund);
        if (f.bi + f.bo + f.qi + f.qo == 0) assertEq(f.refund, o.escrow);
        if (o.side == 0) {
            assertLe(f.qi, o.escrow);
            if (f.bo > 0) assertGe(o.tick, r.clearTick);
        } else if (f.bi > 0) {
            assertLe(o.tick, r.clearTick);
        }
        (uint256 beforeB, uint256 beforeQ) = market.balances(o.owner);
        claimOne(id);
        (uint256 afterB, uint256 afterQ) = market.balances(o.owner);
        assertEq(afterB - beforeB, f.bo + (o.side == 1 ? f.refund : 0));
        assertEq(afterQ - beforeQ, f.qo + (o.side == 0 ? f.refund : 0));
    }

    function test_SameBlockOrderNeverMatters(uint256 seed, uint256 shuffleSeed) public {
        RefAuction.Quote[] memory quotes = book(seed);
        BatchAuction other = newMarket();
        fund(other, alice);
        fund(other, bob);
        uint256[] memory permutation = new uint256[](quotes.length);
        uint256[] memory ids = new uint256[](quotes.length);
        for (uint256 j; j < quotes.length; ++j) {
            permutation[j] = j;
            place(j % 2 == 0 ? alice : bob, quotes[j].side, quotes[j].tick, quotes[j].lots);
        }
        for (uint256 j = quotes.length; j > 1; --j) {
            shuffleSeed = uint256(keccak256(abi.encode(shuffleSeed, j)));
            uint256 k = shuffleSeed % j;
            (permutation[j - 1], permutation[k]) = (permutation[k], permutation[j - 1]);
        }
        for (uint256 j; j < quotes.length; ++j) {
            uint256 k = permutation[j];
            vm.prank(k % 2 == 0 ? alice : bob);
            ids[k] = other.place(quotes[k].side, quotes[k].tick, quotes[k].lots);
        }
        assertEq(market.openBatch().startBlock, other.openBatch().startBlock);
        vm.roll(block.number + 1);
        market.clear();
        other.clear();
        Result memory a = market.result(1);
        Result memory b = other.result(1);
        assertResult(a, b);
        assertEq(a.clearedAt, b.clearedAt);
        // Gas telemetry depends on storage warming and is deliberately not an economic fill field.
        for (uint256 j; j < quotes.length; ++j) {
            (int256 ab, int256 aq, uint256 ar) = market.previewFill(j);
            (int256 bb, int256 bq, uint256 br) = other.previewFill(ids[j]);
            assertEq(ab, bb);
            assertEq(aq, bq);
            assertEq(ar, br);
        }
    }
}
