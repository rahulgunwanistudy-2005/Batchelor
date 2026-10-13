// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {Test} from "forge-std/Test.sol";
import {DemoToken} from "../../src/DemoToken.sol";
import {BatchAuction} from "../../src/BatchAuction.sol";
import {Faucet} from "../../src/Faucet.sol";

contract FaucetTest is Test {
    function test_dailyDripCreditsMarketAndCooldownIsPerRecipient() public {
        uint64 nonce = vm.getNonce(address(this));
        address predicted = vm.computeCreateAddress(address(this), nonce + 3);
        DemoToken b = new DemoToken("Rose", "ROSE", 18, predicted);
        DemoToken q = new DemoToken("Demo USD", "dUSD", 6, predicted);
        BatchAuction m = new BatchAuction(address(b), address(q), 500_000, 5_000, 1e15, 1, 100);
        Faucet f = new Faucet(address(b), address(q), address(m));
        assertEq(address(f), predicted);
        address who = makeAddr("who");
        vm.warp(0);
        f.drip(who);
        (uint256 bi, uint256 qi) = m.balances(who);
        assertEq(bi, 100e18);
        assertEq(qi, 100e6);
        assertEq(b.balanceOf(who), 0);
        assertEq(b.balanceOf(address(f)), 0);
        assertEq(q.allowance(address(f), address(m)), 0);
        vm.expectRevert(abi.encodeWithSelector(Faucet.Cooldown.selector, 1 days));
        f.drip(who);
        f.drip(makeAddr("other"));
        vm.warp(1 days - 1);
        vm.expectRevert(abi.encodeWithSelector(Faucet.Cooldown.selector, 1 days));
        f.drip(who);
        vm.warp(1 days);
        f.drip(who);
        (bi, qi) = m.balances(who);
        assertEq(bi, 200e18);
        assertEq(qi, 200e6);
        vm.expectRevert(Faucet.InvalidParameters.selector);
        f.drip(address(0));
    }
}
