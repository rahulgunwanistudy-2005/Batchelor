// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {AuctionTypes} from "./AuctionTypes.sol";

/// @notice Exact rational settlement; each asset is rounded only once.
library Settle {
    function fill(AuctionTypes.Order memory o, AuctionTypes.Result memory result, uint256 price, uint256 lot)
        internal
        pure
        returns (uint256 baseIn, uint256 baseOut, uint256 quoteIn, uint256 quoteOut, uint256 refund)
    {
        uint256 r;
        uint256 m = 1;
        if (result.volumeLots > 0) {
            if (o.side == 0) {
                if (o.tick > result.buyCutoff) {
                    r = 1;
                } else if (o.tick == result.buyCutoff) {
                    r = result.rB;
                    m = result.mB;
                }
            } else {
                if (o.tick < result.sellCutoff) {
                    r = 1;
                } else if (o.tick == result.sellCutoff) {
                    r = result.rS;
                    m = result.mS;
                }
            }
        }
        if (r == 0) return (0, 0, 0, 0, o.escrow);
        uint256 b = uint256(o.lots) * lot;
        // Constructor bounds ensure r*price fits uint256; mulDiv handles the wide numerator.
        if (o.side == 0) {
            baseOut = Math.mulDiv(b, r, m, Math.Rounding.Floor);
            quoteIn = Math.mulDiv(b, r * price, m * 1e18, Math.Rounding.Ceil);
            refund = uint256(o.escrow) - quoteIn;
        } else {
            baseIn = Math.mulDiv(b, r, m, Math.Rounding.Ceil);
            quoteOut = Math.mulDiv(b, r * price, m * 1e18, Math.Rounding.Floor);
            refund = b - baseIn;
        }
    }
}
