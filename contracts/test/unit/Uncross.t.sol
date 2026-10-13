// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {Test} from "forge-std/Test.sol";
import {AuctionTypes} from "../../src/lib/AuctionTypes.sol";
import {Uncross} from "../../src/lib/Uncross.sol";

contract UncrossTest is Test, AuctionTypes {
    function run(uint64[] memory b, uint64[] memory a, uint16 lo, uint16 ref) internal pure returns (Result memory) {
        return Uncross.uncross(b, a, lo, uint16(lo + b.length - 1), ref);
    }

    function test_buyPressurePicksHighest() public pure {
        // tick | bids | asks: 10 | 0 | 5; 11 | 0 | 0; 12 | 9 | 0.
        uint64[] memory b = new uint64[](3);
        uint64[] memory a = new uint64[](3);
        b[2] = 9;
        a[0] = 5;
        Result memory r = run(b, a, 10, 10);
        assertEq(r.clearTick, 12);
        assertEq(r.volumeLots, 5);
        assertEq(r.rB, 5);
        assertEq(r.mB, 9);
    }

    function test_sellPressurePicksLowest() public pure {
        // tick | bids | asks: 10 | 0 | 9; 11 | 0 | 0; 12 | 5 | 0.
        uint64[] memory b = new uint64[](3);
        uint64[] memory a = new uint64[](3);
        b[2] = 5;
        a[0] = 9;
        Result memory r = run(b, a, 10, 12);
        assertEq(r.clearTick, 10);
        assertEq(r.rS, 5);
        assertEq(r.mS, 9);
    }

    function test_zeroSurplusUsesReference() public pure {
        // tick | bids | asks: 10 | 0 | 5; 11 | 0 | 0; 12 | 5 | 0.
        uint64[] memory b = new uint64[](3);
        uint64[] memory a = new uint64[](3);
        b[2] = 5;
        a[0] = 5;
        assertEq(run(b, a, 10, 11).clearTick, 11);
        assertEq(run(b, a, 10, 0).clearTick, 10);
        assertEq(run(b, a, 10, 255).clearTick, 12);
    }

    function test_mixedPressureUsesReference() public pure {
        // tick | bids | asks: 10 | 0 | 5; 11 | 5 | 5; 12 | 5 | 0.
        // D/S at 10 = 10/5, 11 = 10/10 (max vol=10), 12 = 5/10.
        // Instead a two-tick book: 10 | 5 | 5; 11 | 5 | 5 has equal V=5 and sur=+/-5.
        uint64[] memory b = new uint64[](2);
        uint64[] memory a = new uint64[](2);
        b[0] = 5;
        b[1] = 5;
        a[0] = 5;
        a[1] = 5;
        assertEq(run(b, a, 10, 10).clearTick, 10);
        assertEq(run(b, a, 10, 11).clearTick, 11);
    }

    function test_minimumSurplusBeforePressure() public pure {
        // tick | bids | asks: 10 | 4 | 5; 11 | 0 | 3; 12 | 9 | 0.
        // Same V=8 at 11 and 12, surplus=1; buy pressure selects 12.
        uint64[] memory b = new uint64[](3);
        uint64[] memory a = new uint64[](3);
        b[0] = 4;
        b[2] = 9;
        a[0] = 5;
        a[1] = 3;
        Result memory r = run(b, a, 10, 10);
        assertEq(r.clearTick, 12);
        assertEq(r.volumeLots, 8);
    }

    function test_maximumVolumeBeforeSurplus() public pure {
        // tick | bids | asks: 10 | 3 | 4; 11 | 5 | 8.
        // V=4, |sur|=4 at 10; V=5, |sur|=7 at 11. Volume wins.
        uint64[] memory b = new uint64[](2);
        uint64[] memory a = new uint64[](2);
        b[0] = 3;
        b[1] = 5;
        a[0] = 4;
        a[1] = 8;
        Result memory r = run(b, a, 10, 10);
        assertEq(r.clearTick, 11);
        assertEq(r.volumeLots, 5);
    }

    function test_noCrossAndOneSided() public pure {
        // tick | bids | asks: 10 | 5 | 0; 11 | 0 | 5.
        uint64[] memory b = new uint64[](2);
        uint64[] memory a = new uint64[](2);
        b[0] = 5;
        a[1] = 5;
        assertEq(run(b, a, 10, 10).volumeLots, 0);
        a[1] = 0;
        assertEq(run(b, a, 10, 10).volumeLots, 0);
        b[0] = 0;
        a[1] = 5;
        assertEq(run(b, a, 10, 10).volumeLots, 0);
    }

    function test_singleTickPrimeCutoff() public pure {
        // tick | bids | asks: 255 | 17 | 7.
        uint64[] memory b = new uint64[](1);
        uint64[] memory a = new uint64[](1);
        b[0] = 17;
        a[0] = 7;
        Result memory r = run(b, a, 255, 100);
        assertEq(r.clearTick, 255);
        assertEq(r.buyCutoff, 255);
        assertEq(r.sellCutoff, 255);
        assertEq(r.rB, 7);
        assertEq(r.mB, 17);
        assertEq(r.rS, 7);
        assertEq(r.mS, 7);
    }

    function test_fullRange() public pure {
        // Every tick 0..255: one bid and one ask. Max volume is 128 at 127 and 128.
        uint64[] memory b = new uint64[](256);
        uint64[] memory a = new uint64[](256);
        for (uint256 i; i < 256; ++i) {
            b[i] = 1;
            a[i] = 1;
        }
        Result memory r = run(b, a, 0, 100);
        assertEq(r.clearTick, 127);
        assertEq(r.volumeLots, 128);
        assertEq(r.buyCutoff, 128);
        assertEq(r.sellCutoff, 127);
    }

    function evaluate(uint64[] memory b, uint64[] memory a, uint16 lo, uint16 hi, uint16 ref)
        external
        pure
        returns (Result memory)
    {
        return Uncross.uncross(b, a, lo, hi, ref);
    }

    function test_badRange() public {
        uint64[] memory b = new uint64[](1);
        uint64[] memory a = new uint64[](2);
        vm.expectRevert(Uncross.BadRange.selector);
        this.evaluate(b, a, 1, 0, 0);
        vm.expectRevert(Uncross.BadRange.selector);
        this.evaluate(b, a, 0, 0, 0);
    }

    function test_volumeOverflow() public {
        uint64[] memory b = new uint64[](2);
        uint64[] memory a = new uint64[](2);
        b[0] = type(uint64).max;
        b[1] = type(uint64).max;
        a[0] = type(uint64).max;
        a[1] = type(uint64).max;
        // Balanced book volume at each tick is max uint64; three ticks allow >max.
        b = new uint64[](3);
        a = new uint64[](3);
        for (uint256 i; i < 3; ++i) {
            b[i] = type(uint64).max;
            a[i] = type(uint64).max;
        }
        vm.expectRevert(Uncross.Overflow.selector);
        this.evaluate(b, a, 0, 2, 1);
    }
}
