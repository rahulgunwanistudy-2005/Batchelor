// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Interface for a daily demo-token drip into a trader's internal balance.
/// @dev S1 shell. Minting, the daily cap, and depositFor integration land in S2.
contract Faucet {
    address public immutable BASE;
    address public immutable QUOTE;
    address public immutable MARKET;
    mapping(address => uint256) public lastDrip;

    error NotImplemented();
    error InvalidParameters();
    event Dripped(address indexed trader, uint256 baseAmount, uint256 quoteAmount);

    constructor(address base_, address quote_, address market_) {
        if (base_ == address(0) || quote_ == address(0) || base_ == quote_ || market_ == address(0)) {
            revert InvalidParameters();
        }
        BASE = base_;
        QUOTE = quote_;
        MARKET = market_;
    }

    /// @notice Drip once per address per day; currently disabled (S2).
    function drip(address) external pure {
        revert NotImplemented();
    }
}
