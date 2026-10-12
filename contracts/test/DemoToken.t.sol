// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {DemoToken} from "../src/DemoToken.sol";

contract DemoTokenTest is Test {
    function test_onlyImmutableFaucetCanMintAndDecimalsAreIndependent() public {
        address faucet = makeAddr("faucet");
        address trader = makeAddr("trader");
        DemoToken base = new DemoToken("ROSE", "ROSE", 18, faucet);
        DemoToken quote = new DemoToken("Demo USD", "dUSD", 6, faucet);
        vm.expectRevert(DemoToken.NotMinter.selector);
        base.mint(trader, 1e18);
        vm.prank(faucet);
        base.mint(trader, 1e18);
        vm.prank(faucet);
        quote.mint(trader, 1e6);
        assertEq(base.decimals(), 18);
        assertEq(quote.decimals(), 6);
        assertEq(base.balanceOf(trader), 1e18);
        assertEq(quote.balanceOf(trader), 1e6);
    }
}
