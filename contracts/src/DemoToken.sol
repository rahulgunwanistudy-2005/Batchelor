// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @notice Worthless demo ERC20 with permit; only its immutable faucet may mint.
/// @dev Deployment must precompute the Faucet address before creating its tokens.
contract DemoToken is ERC20, ERC20Permit {
    uint8 private immutable tokenDecimals;
    address public immutable minter;

    error NotMinter();
    error InvalidMinter();

    constructor(string memory name_, string memory symbol_, uint8 decimals_, address faucet_)
        ERC20(name_, symbol_)
        ERC20Permit(name_)
    {
        if (faucet_ == address(0)) revert InvalidMinter();
        tokenDecimals = decimals_;
        minter = faucet_;
    }

    function decimals() public view override returns (uint8) {
        return tokenDecimals;
    }

    /// @notice Mint demo tokens; the Faucet is the sole authorized caller.
    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) revert NotMinter();
        _mint(to, amount);
    }
}
