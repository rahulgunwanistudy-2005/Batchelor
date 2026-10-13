// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {DemoToken} from "./DemoToken.sol";
import {BatchAuction} from "./BatchAuction.sol";

/// @notice Permissionless daily demo-token drip into a trader's market balance.
contract Faucet is ReentrancyGuardTransient {
    using SafeERC20 for IERC20;
    address public immutable BASE;
    address public immutable QUOTE;
    address public immutable MARKET;
    mapping(address => uint256) public lastDrip;
    mapping(address => bool) private hasDripped;
    uint256 public constant BASE_DRIP = 100e18;
    uint256 public constant QUOTE_DRIP = 100e6;

    error InvalidParameters();
    error Cooldown(uint256 nextDrip);
    event Dripped(address indexed trader, uint256 baseAmount, uint256 quoteAmount);

    constructor(address base_, address quote_, address market_) {
        if (
            base_ == address(0) || quote_ == address(0) || base_ == quote_ || market_ == address(0)
                || BatchAuction(market_).BASE() != base_ || BatchAuction(market_).QUOTE() != quote_
                || DemoToken(base_).decimals() != 18 || DemoToken(quote_).decimals() != 6
                || DemoToken(base_).minter() != address(this) || DemoToken(quote_).minter() != address(this)
        ) {
            revert InvalidParameters();
        }
        BASE = base_;
        QUOTE = quote_;
        MARKET = market_;
    }

    function drip(address to) external nonReentrant {
        if (to == address(0)) revert InvalidParameters();
        if (hasDripped[to] && block.timestamp < lastDrip[to] + 1 days) revert Cooldown(lastDrip[to] + 1 days);
        hasDripped[to] = true;
        lastDrip[to] = block.timestamp;
        DemoToken(BASE).mint(address(this), BASE_DRIP);
        DemoToken(QUOTE).mint(address(this), QUOTE_DRIP);
        IERC20(BASE).forceApprove(MARKET, BASE_DRIP);
        IERC20(QUOTE).forceApprove(MARKET, QUOTE_DRIP);
        BatchAuction(MARKET).depositFor(to, BASE, BASE_DRIP);
        BatchAuction(MARKET).depositFor(to, QUOTE, QUOTE_DRIP);
        emit Dripped(to, BASE_DRIP, QUOTE_DRIP);
    }
}
