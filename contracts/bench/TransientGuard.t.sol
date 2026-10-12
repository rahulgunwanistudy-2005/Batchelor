// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

interface ICallback {
    function callback() external;
}

contract GuardProbe is ReentrancyGuardTransient {
    uint256 public entries;

    function enter(bool callback) external nonReentrant {
        ++entries;
        if (callback) ICallback(msg.sender).callback();
    }
}

contract ReenterProbe is ICallback {
    GuardProbe private immutable target;
    bool public blocked;

    constructor(GuardProbe target_) {
        target = target_;
    }

    function attack() external {
        target.enter(true);
    }

    function callback() external {
        try target.enter(false) {
            revert("reentrancy accepted");
        } catch (bytes memory reason) {
            blocked = bytes4(reason) == ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector;
        }
    }
}

contract TransientGuardTest is Test {
    function test_transientGuardBlocksReentrancyAndUnlocks() public {
        GuardProbe target = new GuardProbe();
        ReenterProbe attacker = new ReenterProbe(target);
        attacker.attack();
        assertTrue(attacker.blocked());
        assertEq(target.entries(), 1);
        // Reuse within the same transaction verifies the lock is released.
        target.enter(false);
        assertEq(target.entries(), 2);
    }
}
