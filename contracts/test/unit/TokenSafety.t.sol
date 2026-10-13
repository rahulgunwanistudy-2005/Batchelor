// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {BatchAuction} from "../../src/BatchAuction.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

contract HookToken is ERC20 {
    BatchAuction public market;
    bool public chargeFee;
    bool public hook;
    bytes4 public blocked;

    constructor() ERC20("Hook", "HOOK") {
        _mint(msg.sender, 1e30);
    }

    function configure(BatchAuction m, bool fee, bool callback) external {
        market = m;
        chargeFee = fee;
        hook = callback;
    }

    function _update(address from, address to, uint256 amount) internal override {
        if (hook && from != address(0)) {
            (bool ok, bytes memory reason) = address(market).call(abi.encodeCall(market.clear, ()));
            require(!ok, "reentrancy was allowed");
            blocked = bytes4(reason);
        }
        if (chargeFee && from != address(0) && amount > 0) {
            super._update(from, address(0), 1);
            --amount;
        }
        super._update(from, to, amount);
    }
}

contract TokenSafetyTest is Test {
    function test_feeOnTransferCannotCreateUnbackedCredit() public {
        HookToken b = new HookToken();
        HookToken q = new HookToken();
        BatchAuction m = new BatchAuction(address(b), address(q), 500_000, 5_000, 1e15, 1, 100);
        b.approve(address(m), 100);
        b.configure(m, true, false);
        vm.expectRevert(BatchAuction.TransferAmountMismatch.selector);
        m.deposit(address(b), 100);
        (uint256 free,) = m.balances(address(this));
        assertEq(free, 0);
        assertEq(b.balanceOf(address(m)), 0);
    }

    function test_tokenCallbacksCannotEnterAnyStateChange() public {
        HookToken b = new HookToken();
        HookToken q = new HookToken();
        BatchAuction m = new BatchAuction(address(b), address(q), 500_000, 5_000, 1e15, 1, 100);
        b.approve(address(m), 100);
        b.configure(m, false, true);
        m.deposit(address(b), 100);
        assertEq(b.blocked(), ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector);
        m.withdraw(address(b), 100);
        (uint256 free,) = m.balances(address(this));
        assertEq(free, 0);
        assertEq(b.balanceOf(address(m)), 0);
    }
}
