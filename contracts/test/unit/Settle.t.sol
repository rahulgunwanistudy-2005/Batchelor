// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {Test} from "forge-std/Test.sol";
import {AuctionTypes} from "../../src/lib/AuctionTypes.sol";
import {Settle} from "../../src/lib/Settle.sol";
import {RefAuction} from "../ref/RefAuction.sol";

contract SettleTest is Test, AuctionTypes {
    function test_roundOnceForOneLot() public pure {
        Result memory r;
        r.volumeLots = 1;
        r.buyCutoff = 10;
        r.sellCutoff = 10;
        r.rB = 1;
        r.mB = 3;
        r.rS = 1;
        r.mS = 3;
        Order memory o = Order(address(1), 0, 10, false, 1, 1, 10);
        (, uint256 bo, uint256 qi,, uint256 refund) = Settle.fill(o, r, 1e18 + 1, 7);
        assertEq(bo, 2);
        assertEq(qi, 3);
        assertEq(refund, 7);
        o.side = 1;
        o.escrow = 7;
        (uint256 bi,,, uint256 qo, uint256 rem) = Settle.fill(o, r, 1e18 + 1, 7);
        assertEq(bi, 3);
        assertEq(qo, 2);
        assertEq(rem, 4);
    }

    function test_zeroVolumeFullRefund() public pure {
        Result memory r;
        Order memory o = Order(address(1), 0, 10, false, 17, 1, 91);
        (uint256 bi, uint256 bo, uint256 qi, uint256 qo, uint256 refund) = Settle.fill(o, r, 1e6, 1e15);
        assertEq(bi + bo + qi + qo, 0);
        assertEq(refund, 91);
    }

    function test_fullAndOutsideCutoff() public pure {
        Result memory r;
        r.volumeLots = 1;
        r.buyCutoff = 10;
        r.sellCutoff = 10;
        r.rB = 1;
        r.mB = 1;
        r.rS = 1;
        r.mS = 1;
        Order memory o = Order(address(1), 0, 11, false, 1, 1, 10);
        (, uint256 bo, uint256 qi,,) = Settle.fill(o, r, 1e18, 7);
        assertEq(bo, 7);
        assertEq(qi, 7);
        o.tick = 9;
        (,,,, uint256 refund) = Settle.fill(o, r, 1e18, 7);
        assertEq(refund, 10);
        o.side = 1;
        o.tick = 11;
        (,,,, refund) = Settle.fill(o, r, 1e18, 7);
        assertEq(refund, 10);
    }

    function testFuzz_primeRoundingMatchesRational(
        uint64 quantity,
        uint64 numerator,
        uint64 denominator,
        uint64 priceSeed
    ) public pure {
        uint64 q = quantity % 997 + 1;
        uint64 m = denominator % 997 + 1;
        uint64 n = numerator % m + 1;
        uint256 p = uint256(priceSeed) % 1e9 + 1;
        uint256 lot = 1e15 + 7;
        Result memory r;
        r.volumeLots = n;
        r.buyCutoff = 10;
        r.sellCutoff = 10;
        r.rB = n;
        r.mB = m;
        r.rS = n;
        r.mS = m;
        for (uint8 side; side < 2; ++side) {
            Order memory o = Order(
                address(1),
                side,
                10,
                false,
                q,
                1,
                uint128(side == 0 ? (uint256(q) * lot * p + 1e18 - 1) / 1e18 : uint256(q) * lot)
            );
            assertEq(keccak256(encodedFill(o, r, p, lot, false)), keccak256(encodedFill(o, r, p, lot, true)));
        }
    }

    function encodedFill(Order memory o, Result memory r, uint256 p, uint256 lot, bool referenceModel)
        private
        pure
        returns (bytes memory)
    {
        uint256 bi;
        uint256 bo;
        uint256 qi;
        uint256 qo;
        uint256 refund;
        if (referenceModel) (bi, bo, qi, qo, refund) = RefAuction.fill(o, r, p, lot);
        else (bi, bo, qi, qo, refund) = Settle.fill(o, r, p, lot);
        return abi.encode(bi, bo, qi, qo, refund);
    }

    function test_wideNumeratorDoesNotOverflow() public pure {
        Result memory r;
        r.volumeLots = type(uint64).max;
        r.buyCutoff = 10;
        r.rB = type(uint64).max;
        r.mB = type(uint64).max;
        Order memory o = Order(address(1), 0, 10, false, type(uint64).max, 1, type(uint128).max);
        uint256 lot = type(uint128).max / type(uint64).max;
        (, uint256 bo, uint256 qi,,) = Settle.fill(o, r, 1e18, lot);
        assertEq(bo, uint256(o.lots) * lot);
        assertEq(qi, bo);
    }
}
