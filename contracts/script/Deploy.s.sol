// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {DemoToken} from "../src/DemoToken.sol";
import {BatchAuction} from "../src/BatchAuction.sol";
import {Faucet} from "../src/Faucet.sol";

/// @notice Four consecutive CREATEs; no role-grant transaction can shift the faucet nonce.
contract Deploy is Script {
    function run() external returns (DemoToken base, DemoToken quote, BatchAuction market, Faucet faucet) {
        require(block.chainid == 10143 || block.chainid == 143, "Monad chains only");
        if (block.chainid == 143) {
            require(vm.envOr("MAINNET_DEPLOY_APPROVED", false), "Approve calls and budget first");
        }
        uint256 key = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(key);
        address predictedFaucet = vm.computeCreateAddress(deployer, uint256(vm.getNonce(deployer)) + 3);
        vm.startBroadcast(key);
        base = new DemoToken("Rose", "ROSE", 18, predictedFaucet);
        quote = new DemoToken("Demo USD", "dUSD", 6, predictedFaucet);
        market = new BatchAuction(address(base), address(quote), 500_000, 5_000, 1e15, 1, 100);
        faucet = new Faucet(address(base), address(quote), address(market));
        vm.stopBroadcast();
        require(address(faucet) == predictedFaucet, "CREATE sequence changed");
    }
}
