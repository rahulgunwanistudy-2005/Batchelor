// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {AuctionTestBase} from "../AuctionTestBase.sol";
import {BatchAuction} from "../../src/BatchAuction.sol";
import {Vm} from "forge-std/Vm.sol";

contract BatchAuctionTest is AuctionTestBase {
    function test_depositForAndWithdrawOnlyFreeBalance() public {
        base.mint(address(this), 123);
        base.approve(address(market), 123);
        market.depositFor(alice, address(base), 123);
        (uint256 b,) = market.balances(alice);
        assertEq(b, 1e30 + 123);
        place(alice, 1, 100, 10);
        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(BatchAuction.Insufficient.selector, address(base)));
        market.withdraw(address(base), 1e30 + 123);
        market.withdraw(address(base), 123);
        vm.stopPrank();
        assertEq(base.balanceOf(alice), 123);
        vm.expectRevert(BatchAuction.UnsupportedToken.selector);
        market.deposit(address(123), 1);
    }

    function test_cancelRefundsAndKeepsTaggedRange() public {
        uint256 id = place(alice, 0, 100, 17);
        vm.prank(alice);
        market.cancel(id);
        (, uint256 q) = market.balances(alice);
        assertEq(q, 1e30);
        (uint64[] memory b,) = market.ladder(100, 100);
        assertEq(b[0], 0);
        assertEq(market.openBatch().orderCount, 0);
        assertTrue(readOrder(market, id).claimed);
        vm.prank(alice);
        vm.expectRevert(BatchAuction.AlreadyClaimed.selector);
        market.cancel(id);
        close();
        claimOneExpectClaimed(id);
    }

    function claimOneExpectClaimed(uint256 id) private {
        vm.expectRevert(BatchAuction.AlreadyClaimed.selector);
        claimOne(id);
    }

    function test_cancelOwnerAndSealedBatch() public {
        uint256 id = place(alice, 0, 100, 17);
        vm.prank(bob);
        vm.expectRevert(BatchAuction.NotOwner.selector);
        market.cancel(id);
        vm.roll(block.number + 1);
        vm.prank(alice);
        vm.expectRevert(BatchAuction.NotOpenBatch.selector);
        market.cancel(id);
        // Failed cancellation rolls back its clear too; explicit crank finishes it.
        assertTrue(market.openBatch().hasOpen);
        market.clear();
        assertFalse(market.openBatch().hasOpen);
    }

    function test_claimPendingThenPermissionlessAndTwice() public {
        uint256 buy = place(alice, 0, 120, 7);
        uint256 sell = place(bob, 1, 80, 7);
        claimOne(buy);
        assertFalse(readOrder(market, buy).claimed);
        vm.roll(block.number + 1);
        (uint256 beforeBase,) = market.balances(alice);
        claimOne(buy);
        (uint256 afterBase,) = market.balances(alice);
        assertEq(afterBase - beforeBase, 7 * LOT);
        claimOne(sell);
        assertTrue(readOrder(market, sell).claimed);
        claimOneExpectClaimed(buy);
        (int256 bd, int256 qd, uint256 rem) = market.previewFill(buy);
        assertEq(bd, 0);
        assertEq(qd, 0);
        assertEq(rem, 0);
    }

    function test_clearBeforeNewBatchAndLazyReset() public {
        place(alice, 0, 120, 7);
        place(bob, 1, 80, 7);
        vm.roll(block.number + 1);
        uint256 id = place(alice, 0, 120, 3);
        assertEq(readOrder(market, id).batchId, 2);
        assertEq(market.result(1).volumeLots, 7);
        (uint64[] memory b, uint64[] memory a) = market.ladder(80, 120);
        assertEq(b[40], 3);
        assertEq(a[0], 0);
        assertEq(uint64(uint256(vm.load(address(market), bytes32(uint256(120)))) >> 192), 2);
        close();
        assertEq(market.result(2).volumeLots, 0);
        assertEq(market.refTick(), 100);
        (b, a) = market.ladder(80, 120);
        assertEq(b[40], 0);
    }

    function test_depositAndWithdrawRollSealedBatch() public {
        place(alice, 0, 100, 1);
        vm.roll(block.number + 1);
        vm.prank(alice);
        market.deposit(address(base), 0);
        assertFalse(market.openBatch().hasOpen);
        place(alice, 1, 100, 1);
        vm.roll(block.number + 1);
        vm.prank(alice);
        market.withdraw(address(base), 0);
        assertFalse(market.openBatch().hasOpen);
    }

    function test_placeManyAtomicAndValidation() public {
        uint8[] memory s = new uint8[](2);
        uint16[] memory t = new uint16[](2);
        uint64[] memory q = new uint64[](2);
        s[1] = 1;
        t[0] = 120;
        t[1] = 80;
        q[0] = 7;
        q[1] = 7;
        vm.prank(alice);
        assertEq(market.placeMany(s, t, q), 0);
        assertEq(market.openBatch().orderCount, 2);
        q[1] = 0;
        vm.prank(alice);
        vm.expectRevert(BatchAuction.ZeroLots.selector);
        market.placeMany(s, t, q);
        assertEq(market.orderCount(), 2);
        vm.prank(alice);
        vm.expectRevert(BatchAuction.BadLengths.selector);
        market.placeMany(s, new uint16[](0), q);
        vm.prank(alice);
        vm.expectRevert(BatchAuction.BadSide.selector);
        market.place(2, 1, 1);
        vm.prank(alice);
        vm.expectRevert(BatchAuction.BadTick.selector);
        market.place(0, 256, 1);
        vm.expectRevert(BatchAuction.BadTick.selector);
        market.ladder(2, 1);
        vm.expectRevert(BatchAuction.BadTick.selector);
        market.price(256);
    }

    function test_noTradeRefundBothSidesAndReferenceUnchanged() public {
        uint256 b = place(alice, 0, 20, 17);
        uint256 s = place(bob, 1, 30, 19);
        close();
        (int256 bd, int256 qd, uint256 refund) = market.previewFill(b);
        assertEq(bd, 0);
        assertEq(qd, 0);
        assertEq(refund, readOrder(market, b).escrow);
        claimOne(b);
        claimOne(s);
        (, uint256 q) = market.balances(alice);
        (uint256 baseB,) = market.balances(bob);
        assertEq(q, 1e30);
        assertEq(baseB, 1e30);
        assertEq(market.refTick(), 100);
    }

    function test_emptyClearIsNoopAndIdsHaveNoGaps() public {
        market.clear();
        assertEq(market.openBatch().id, 0);
        place(alice, 0, 100, 1);
        market.clear();
        assertTrue(market.openBatch().hasOpen);
        close();
        vm.roll(block.number + 20);
        market.clear();
        place(bob, 1, 100, 1);
        assertEq(market.openBatch().id, 2);
    }

    function intent() private view returns (Intent memory) {
        return Intent(alice, 0, 0, 120, 17, 0, 0, uint64(block.timestamp + 60));
    }

    function test_EIP712PlaceCancelAndRelayedEvent() public {
        Intent memory i = intent();
        bytes memory sig = sign(market, i, ALICE_KEY);
        vm.recordLogs();
        uint256 id = market.placeFor(i, sig);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(
            logs[logs.length - 1].topics[0], keccak256("OrderPlaced(uint256,address,uint64,uint8,uint16,uint64,bool)")
        );
        (,,, bool relayed) = abi.decode(logs[logs.length - 1].data, (uint8, uint16, uint64, bool));
        assertTrue(relayed);
        assertEq(readOrder(market, id).owner, alice);
        assertEq(market.nonces(alice), 1);
        i.action = 1;
        i.orderId = id;
        i.nonce = 1;
        market.cancelFor(i, sign(market, i, ALICE_KEY));
        assertEq(market.nonces(alice), 2);
        assertTrue(readOrder(market, id).claimed);
    }

    function test_EIP712WrongSignerMalformedReplayExpiredAndAction() public {
        Intent memory i = intent();
        bytes memory sig = sign(market, i, 42);
        vm.expectRevert(BatchAuction.BadSig.selector);
        market.placeFor(i, sig);
        vm.expectRevert(BatchAuction.BadSig.selector);
        market.placeFor(i, hex"abcd");
        sig = sign(market, i, ALICE_KEY);
        market.placeFor(i, sig);
        vm.expectRevert(BatchAuction.BadNonce.selector);
        market.placeFor(i, sig);
        i.nonce = 1;
        i.deadline = uint64(block.timestamp - 1);
        sig = sign(market, i, ALICE_KEY);
        vm.expectRevert(BatchAuction.Expired.selector);
        market.placeFor(i, sig);
        i.deadline = uint64(block.timestamp + 60);
        i.action = 1;
        sig = sign(market, i, ALICE_KEY);
        vm.expectRevert(BatchAuction.BadAction.selector);
        market.placeFor(i, sig);
    }

    function test_EIP712DomainBoundAndFailedPlaceDoesNotConsumeNonce() public {
        Intent memory i = intent();
        bytes memory sig = sign(market, i, ALICE_KEY);
        BatchAuction other = newMarket();
        vm.expectRevert(BatchAuction.BadSig.selector);
        other.placeFor(i, sig);
        vm.chainId(block.chainid + 1);
        vm.expectRevert(BatchAuction.BadSig.selector);
        market.placeFor(i, sig);
        i.lots = 0;
        sig = sign(market, i, ALICE_KEY);
        vm.expectRevert(BatchAuction.ZeroLots.selector);
        market.placeFor(i, sig);
        assertEq(market.nonces(alice), 0);
    }

    function test_sideTotalOverflowRejectedBeforeClearing() public {
        place(alice, 0, 100, type(uint64).max);
        vm.prank(alice);
        vm.expectRevert(BatchAuction.Overflow.selector);
        market.place(0, 101, 1);
        assertEq(market.orderCount(), 1);
    }

    struct ClearEvent {
        uint16 tick;
        uint256 p;
        uint64 v;
        uint16 bc;
        uint16 sc;
        uint64 rb;
        uint64 mb;
        uint64 rs;
        uint64 ms;
        uint32 n;
        uint32 gasUsed;
    }

    function test_clearGasEventMatchesStoredResult() public {
        place(alice, 0, 120, 17);
        place(bob, 1, 80, 7);
        vm.roll(block.number + 1);
        vm.recordLogs();
        market.clear();
        Vm.Log[] memory logs = vm.getRecordedLogs();
        ClearEvent memory e = abi.decode(logs[0].data, (ClearEvent));
        Result memory r = market.result(1);
        assertEq(e.tick, r.clearTick);
        assertEq(e.p, market.price(e.tick));
        assertEq(e.v, r.volumeLots);
        assertEq(e.bc, r.buyCutoff);
        assertEq(e.sc, r.sellCutoff);
        assertEq(e.rb, r.rB);
        assertEq(e.mb, r.mB);
        assertEq(e.rs, r.rS);
        assertEq(e.ms, r.mS);
        assertEq(e.n, 2);
        assertEq(e.gasUsed, r.clearGas);
        assertGt(e.gasUsed, 0);
    }
}
