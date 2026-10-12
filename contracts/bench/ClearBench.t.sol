// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";
import {BatchAuction} from "../src/BatchAuction.sol";
import {DemoToken} from "../src/DemoToken.sol";
import {Faucet} from "../src/Faucet.sol";
import {AuctionTypes} from "../src/lib/AuctionTypes.sol";
import {BatchAuctionScattered} from "./generated/BatchAuctionScattered.sol";

/// @dev Production calls are isolated transactions. Setup/harness gas is never reported.
contract ClearBenchTest is Test {
    BatchAuction private market;
    DemoToken private base;
    DemoToken private quote;
    address private trader;
    uint256 private constant KEY = 0xA11CE;

    function setUp() public {
        trader = vm.addr(KEY);
        base = new DemoToken("Rose", "ROSE", 18, address(this));
        quote = new DemoToken("Demo USD", "dUSD", 6, address(this));
        market = new BatchAuction(address(base), address(quote), 500_000, 5_000, 1e15, 1, 100);
        fund(address(market), trader);
    }

    function fund(address target, address owner) private {
        base.mint(owner, 1e30);
        quote.mint(owner, 1e30);
        vm.startPrank(owner);
        base.approve(target, type(uint256).max);
        quote.approve(target, type(uint256).max);
        BatchAuction(target).deposit(address(base), 1e30);
        BatchAuction(target).deposit(address(quote), 1e30);
        vm.stopPrank();
    }

    /// @dev Dense centered range; fixed seed, positive quantity at every active tick.
    function seed(address target, uint16 ticks, uint256 count) private {
        vm.pauseGasMetering();
        uint16 lo = (256 - ticks) / 2;
        for (uint256 j; j < count; ++j) {
            uint8 side = uint8(j % 2);
            uint16 tick = lo + uint16((j / 2) % ticks);
            uint64 lots = uint64(uint256(keccak256(abi.encode(uint256(42), j))) % 9 + 1);
            vm.prank(trader);
            BatchAuction(target).place(side, tick, lots);
        }
        vm.resumeGasMetering();
    }

    function report(string memory name, uint256 ticks, uint256 count, uint256 used) private pure {
        console2.log(
            string.concat(
                "BENCH_JSON {\"name\":\"",
                name,
                "\",\"activeTicks\":",
                vm.toString(ticks),
                ",\"orders\":",
                vm.toString(count),
                ",\"gas\":",
                vm.toString(used),
                "}"
            )
        );
    }

    function clearBook(uint16 ticks, uint256 count) private {
        seed(address(market), ticks, count);
        vm.roll(block.number + 1);
        market.clear();
        AuctionTypes.Result memory r = market.result(1);
        assertGt(r.volumeLots, 0);
        report(string.concat("clear", vm.toString(ticks)), ticks, count, r.clearGas);
    }

    function test_clear8() public {
        clearBook(8, 16);
    }

    function test_clear32() public {
        clearBook(32, 64);
    }

    function test_clear128() public {
        clearBook(128, 256);
    }

    function test_clear256() public {
        clearBook(256, 512);
    }

    // Identical ladder/volume across order counts: distribute 500 lots per side.
    // Ten orders cannot populate 32 distinct ticks per side. Here "32" is the scan
    // width: all books have bids at 143 and asks at 112, crossing the same 32 ticks.
    function orderCountBook(uint256 count) private {
        vm.pauseGasMetering();
        for (uint256 j; j < count; ++j) {
            vm.prank(trader);
            market.place(uint8(j % 2), j % 2 == 0 ? 143 : 112, uint64(1000 / count));
        }
        vm.resumeGasMetering();
        vm.roll(block.number + 1);
        market.clear();
        AuctionTypes.Result memory r = market.result(1);
        assertEq(r.volumeLots, 500);
        report(string.concat("orders", vm.toString(count)), 1, count, r.clearGas);
    }

    function test_orders10() public {
        orderCountBook(10);
    }

    function test_orders100() public {
        orderCountBook(100);
    }

    function test_orders1000() public {
        orderCountBook(1000);
    }

    function ablation(uint16 ticks) private {
        BatchAuctionScattered scattered =
            new BatchAuctionScattered(address(base), address(quote), 500_000, 5_000, 1e15, 1, 100);
        fund(address(scattered), trader);
        seed(address(market), ticks, uint256(ticks) * 2);
        seed(address(scattered), ticks, uint256(ticks) * 2);
        vm.roll(block.number + 1);
        market.clear();
        scattered.clear();
        AuctionTypes.Result memory a = market.result(1);
        AuctionTypes.Result memory b = scattered.result(1);
        assertEq(a.clearTick, b.clearTick);
        assertEq(a.volumeLots, b.volumeLots);
        assertEq(a.buyCutoff, b.buyCutoff);
        assertEq(a.sellCutoff, b.sellCutoff);
        assertEq(a.rB, b.rB);
        assertEq(a.mB, b.mB);
        assertEq(a.rS, b.rS);
        assertEq(a.mS, b.mS);
        report(string.concat("mapping", vm.toString(ticks)), ticks, uint256(ticks) * 2, b.clearGas);
    }

    function test_mapping8() public {
        ablation(8);
    }

    function test_mapping32() public {
        ablation(32);
    }

    function test_mapping128() public {
        ablation(128);
    }

    function test_mapping256() public {
        ablation(256);
    }

    // lastCallGas reports callee execution before refunds, excluding intrinsic
    // gas. Add exact calldata intrinsic cost; callers send these buffered bounds.
    function measure(address target, bytes memory data, address caller) private returns (uint256 used) {
        vm.prank(caller);
        (bool ok, bytes memory reason) = target.call(data);
        used = vm.lastCallGas().gasTotalUsed;
        if (!ok) {
            assembly ("memory-safe") { revert(add(reason, 32), mload(reason)) }
        }
        used += 21_000;
        for (uint256 j; j < data.length; ++j) {
            used += data[j] == 0 ? 4 : 16;
        }
    }

    function full() private {
        seed(address(market), 256, 512);
        vm.roll(block.number + 1);
    }

    function test_place() public {
        report("place", 0, 0, measure(address(market), abi.encodeCall(market.place, (0, 255, 1)), trader));
    }

    function test_placeSelfClear() public {
        full();
        report("placeSelfClear", 256, 512, measure(address(market), abi.encodeCall(market.place, (0, 255, 1)), trader));
    }

    function test_placeManySelfClear() public {
        full();
        uint8[] memory sides = new uint8[](6);
        uint16[] memory ticks = new uint16[](6);
        uint64[] memory lots = new uint64[](6);
        for (uint256 j; j < 6; ++j) {
            sides[j] = uint8(j % 2);
            ticks[j] = uint16(250 + j);
            lots[j] = 1;
        }
        report(
            "placeManySelfClear",
            256,
            512,
            measure(address(market), abi.encodeCall(market.placeMany, (sides, ticks, lots)), trader)
        );
    }

    function test_placeForSelfClear() public {
        full();
        AuctionTypes.Intent memory i = AuctionTypes.Intent(trader, 0, 0, 255, 1, 0, 0, uint64(block.timestamp + 60));
        bytes32 hash = keccak256(
            abi.encodePacked(hex"1901", market.DOMAIN_SEPARATOR(), keccak256(abi.encode(market.INTENT_TYPEHASH(), i)))
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, hash);
        report(
            "placeForSelfClear",
            256,
            512,
            measure(address(market), abi.encodeCall(market.placeFor, (i, abi.encodePacked(r, s, v))), address(this))
        );
    }

    function test_cancel() public {
        vm.prank(trader);
        market.place(0, 255, 1);
        report("cancel", 0, 1, measure(address(market), abi.encodeCall(market.cancel, (0)), trader));
    }

    function test_clear() public {
        full();
        report("clear", 256, 512, measure(address(market), abi.encodeCall(market.clear, ()), trader));
    }

    function claims(uint256 count) private {
        uint256[] memory ids = new uint256[](count);
        // Separate owners and zero receiving balances maximize cold balance writes.
        for (uint256 j; j < count; ++j) {
            address owner = address(uint160(1000 + j));
            base.mint(owner, 1e15);
            vm.startPrank(owner);
            base.approve(address(market), 1e15);
            market.deposit(address(base), 1e15);
            ids[j] = market.place(1, 0, 1);
            vm.stopPrank();
        }
        vm.prank(trader);
        market.place(0, 255, uint64(count));
        // Claims can also self-clear: use full-range prior book for conservative bounds.
        seed(address(market), 256, 512);
        vm.roll(block.number + 1);
        report(
            string.concat("claim", vm.toString(count)),
            256,
            513 + count,
            measure(address(market), abi.encodeCall(market.claim, (ids)), trader)
        );
    }

    function test_claim1() public {
        claims(1);
    }

    function test_claim50() public {
        claims(50);
    }

    function test_drip() public {
        uint64 nonce = vm.getNonce(address(this));
        address predicted = vm.computeCreateAddress(address(this), nonce + 3);
        DemoToken b = new DemoToken("Rose", "ROSE", 18, predicted);
        DemoToken q = new DemoToken("Demo USD", "dUSD", 6, predicted);
        BatchAuction m = new BatchAuction(address(b), address(q), 500_000, 5_000, 1e15, 1, 100);
        Faucet f = new Faucet(address(b), address(q), address(m));
        f.drip(trader);
        // Fill the full ladder using faucet tokens, then drip for a new recipient.
        seed(address(m), 256, 512);
        vm.roll(block.number + 1);
        report("drip", 256, 512, measure(address(f), abi.encodeCall(f.drip, (address(777))), trader));
    }

    function plateau() private {
        vm.prank(trader);
        market.place(0, 255, 2);
        vm.prank(trader);
        market.place(1, 0, 1);
        vm.roll(block.number + 1);
    }

    function test_clearPlateau() public {
        plateau();
        report("clear:plateau", 2, 2, measure(address(market), abi.encodeCall(market.clear, ()), trader));
        report("clearPlateau", 2, 2, market.result(1).clearGas);
    }

    function test_placePlateau() public {
        plateau();
        report(
            "placeSelfClear:plateau", 2, 2, measure(address(market), abi.encodeCall(market.place, (0, 100, 1)), trader)
        );
    }

    function test_placeManyPlateau() public {
        plateau();
        uint8[] memory sides = new uint8[](6);
        uint16[] memory ticks = new uint16[](6);
        uint64[] memory lots = new uint64[](6);
        for (uint256 j; j < 6; ++j) {
            sides[j] = uint8(j % 2);
            ticks[j] = uint16(100 + j);
            lots[j] = 1;
        }
        report(
            "placeManySelfClear:plateau",
            2,
            2,
            measure(address(market), abi.encodeCall(market.placeMany, (sides, ticks, lots)), trader)
        );
    }

    function test_placeForPlateau() public {
        plateau();
        AuctionTypes.Intent memory i = AuctionTypes.Intent(trader, 0, 0, 100, 1, 0, 0, uint64(block.timestamp + 60));
        bytes32 hash = keccak256(
            abi.encodePacked(hex"1901", market.DOMAIN_SEPARATOR(), keccak256(abi.encode(market.INTENT_TYPEHASH(), i)))
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, hash);
        report(
            "placeForSelfClear:plateau",
            2,
            2,
            measure(address(market), abi.encodeCall(market.placeFor, (i, abi.encodePacked(r, s, v))), address(this))
        );
    }

    function test_cancelFor() public {
        vm.prank(trader);
        market.place(0, 255, 1);
        AuctionTypes.Intent memory i = AuctionTypes.Intent(trader, 1, 0, 0, 0, 0, 0, uint64(block.timestamp + 60));
        bytes32 hash = keccak256(
            abi.encodePacked(hex"1901", market.DOMAIN_SEPARATOR(), keccak256(abi.encode(market.INTENT_TYPEHASH(), i)))
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, hash);
        report(
            "cancel:relayed",
            1,
            1,
            measure(address(market), abi.encodeCall(market.cancelFor, (i, abi.encodePacked(r, s, v))), address(this))
        );
    }

    function partialClaims(uint256 count) private {
        uint256[] memory ids = new uint256[](count);
        vm.pauseGasMetering();
        for (uint256 j; j < count; ++j) {
            address owner = address(uint160(1000 + j));
            base.mint(owner, 100e15);
            vm.startPrank(owner);
            base.approve(address(market), 100e15);
            market.deposit(address(base), 100e15);
            ids[j] = market.place(1, 0, 100);
            vm.stopPrank();
        }
        vm.prank(trader);
        market.place(0, 255, 1);
        vm.resumeGasMetering();
        vm.roll(block.number + 1);
        report(
            string.concat("claim", vm.toString(count), ":partial"),
            2,
            count + 1,
            measure(address(market), abi.encodeCall(market.claim, (ids)), trader)
        );
        for (uint256 j; j < count; ++j) {
            (uint256 b, uint256 q) = market.balances(address(uint160(1000 + j)));
            assertGt(b, 0);
            assertGt(q, 0);
        }
    }

    function test_claim1Partial() public {
        partialClaims(1);
    }

    function test_claim50Partial() public {
        partialClaims(50);
    }

    function test_claim50ScatteredHistory() public {
        uint256[] memory ids = new uint256[](50);
        vm.pauseGasMetering();
        for (uint256 j; j < 50; ++j) {
            address owner = address(uint160(1000 + j));
            base.mint(owner, 100e15);
            vm.startPrank(owner);
            base.approve(address(market), 100e15);
            market.deposit(address(base), 100e15);
            ids[j] = market.place(1, 0, 100);
            vm.stopPrank();
            vm.prank(trader);
            market.place(0, 255, 1);
            if (j == 49) break; // Last full-range batch self-clears in claim.
            vm.roll(block.number + 1);
            market.clear();
            // Space both order and result records onto distinct cold pages.
            for (uint256 gap; gap < 63; ++gap) {
                vm.prank(trader);
                market.place(0, 100, 1);
                vm.prank(trader);
                market.place(1, 100, 1);
                vm.roll(block.number + 1);
                market.clear();
            }
        }
        vm.resumeGasMetering();
        vm.roll(block.number + 1);
        report("claim50:scatteredHistory", 2, 50, measure(address(market), abi.encodeCall(market.claim, (ids)), trader));
        for (uint256 j; j < 50; ++j) {
            (uint256 b, uint256 q) = market.balances(address(uint160(1000 + j)));
            assertEq(b, 99e15);
            assertEq(q, 500);
        }
    }

    function test_deploymentTooling() public {
        uint64 nonce = vm.getNonce(address(this));
        address predicted = vm.computeCreateAddress(address(this), nonce + 3);
        uint256 beforeGas = gasleft();
        DemoToken b = new DemoToken("Rose", "ROSE", 18, predicted);
        uint256 used = beforeGas - gasleft();
        report("tooling:deployBase", 0, 0, used + 21_000);
        beforeGas = gasleft();
        DemoToken q = new DemoToken("Demo USD", "dUSD", 6, predicted);
        used = beforeGas - gasleft();
        report("tooling:deployQuote", 0, 0, used + 21_000);
        beforeGas = gasleft();
        BatchAuction m = new BatchAuction(address(b), address(q), 500_000, 5_000, 1e15, 1, 100);
        used = beforeGas - gasleft();
        report("tooling:deployMarket", 0, 0, used + 21_000);
        beforeGas = gasleft();
        Faucet f = new Faucet(address(b), address(q), address(m));
        used = beforeGas - gasleft();
        report("tooling:deployFaucet", 0, 0, used + 21_000);
        assertEq(address(f), predicted);
        f.drip(trader);
        uint8[] memory sides = new uint8[](256);
        uint16[] memory ticks = new uint16[](256);
        uint64[] memory lots = new uint64[](256);
        for (uint256 j; j < 256; ++j) {
            sides[j] = uint8(j % 2);
            ticks[j] = 64 + uint16(j / 2);
            lots[j] = uint64(uint256(keccak256(abi.encode(uint256(42), j))) % 9 + 1);
        }
        report(
            "tooling:seed128", 128, 256, measure(address(m), abi.encodeCall(m.placeMany, (sides, ticks, lots)), trader)
        );
        vm.roll(block.number + 1);
        measure(address(m), abi.encodeCall(m.place, (0, 100, 1)), trader);
        report("live128", 128, 256, m.result(1).clearGas);
    }
}
