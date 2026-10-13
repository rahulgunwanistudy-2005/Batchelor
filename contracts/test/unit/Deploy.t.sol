// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../../script/Deploy.s.sol";
import {DemoToken} from "../../src/DemoToken.sol";
import {BatchAuction} from "../../src/BatchAuction.sol";
import {Faucet} from "../../src/Faucet.sol";

contract DeployTest is Test {
    function testDeploymentParamsAndImmutableMinter() public {
        vm.chainId(10143);
        vm.setEnv("DEPLOYER_PK", vm.toString(uint256(12345)));
        Deploy deploy = new Deploy();
        (DemoToken base, DemoToken quote, BatchAuction market, Faucet faucet) = deploy.run();
        assertEq(base.decimals(), 18);
        assertEq(quote.decimals(), 6);
        assertEq(base.minter(), address(faucet));
        assertEq(quote.minter(), address(faucet));
        assertEq(market.BASE(), address(base));
        assertEq(market.QUOTE(), address(quote));
        assertEq(market.MIN_PRICE(), 500_000);
        assertEq(market.TICK_SIZE(), 5_000);
        assertEq(market.LOT(), 1e15);
        assertEq(market.BATCH_BLOCKS(), 1);
        assertEq(market.refTick(), 100);
        faucet.drip(address(42));
        (uint256 b, uint256 q) = market.balances(address(42));
        assertEq(b, 100e18);
        assertEq(q, 100e6);
    }

    function testMainnetNeedsExplicitActivation() public {
        vm.chainId(143);
        vm.setEnv("MAINNET_DEPLOY_APPROVED", "false");
        Deploy deploy = new Deploy();
        vm.expectRevert("Approve calls and budget first");
        deploy.run();
    }

    function testRejectWrongChain() public {
        vm.chainId(1);
        Deploy deploy = new Deploy();
        vm.expectRevert("Monad chains only");
        deploy.run();
    }
}
