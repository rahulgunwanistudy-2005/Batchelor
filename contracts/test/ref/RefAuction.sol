// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {AuctionTypes} from "../../src/lib/AuctionTypes.sol";

/// @dev Deliberately quadratic reference; imports no production math or auction libraries.
library RefAuction {
    struct Quote {
        uint8 side;
        uint16 tick;
        uint64 lots;
    }

    function uncross(Quote[] memory book, uint16 refTick) internal pure returns (AuctionTypes.Result memory r) {
        uint256 bestVolume;
        uint256 minSurplus = type(uint256).max;
        uint16[] memory candidates = new uint16[](256);
        int256[] memory signs = new int256[](256);
        uint256 count;
        for (uint16 tick; tick < 256; ++tick) {
            uint256 d;
            uint256 s;
            for (uint256 j; j < book.length; ++j) {
                Quote memory o = book[j];
                if (o.side == 0 && o.tick >= tick) d += o.lots;
                if (o.side == 1 && o.tick <= tick) s += o.lots;
            }
            uint256 v = d < s ? d : s;
            uint256 surplus = d >= s ? d - s : s - d;
            if (v > bestVolume || (v == bestVolume && surplus < minSurplus)) {
                bestVolume = v;
                minSurplus = surplus;
                count = 0;
            }
            if (v == bestVolume && surplus == minSurplus) {
                candidates[count] = tick;
                signs[count++] = int256(d) - int256(s);
            }
        }
        if (bestVolume == 0) return r;
        bool allPositive = true;
        bool allNegative = true;
        for (uint256 j; j < count; ++j) {
            allPositive = allPositive && signs[j] > 0;
            allNegative = allNegative && signs[j] < 0;
        }
        uint16 selected = candidates[0];
        if (allPositive) {
            selected = candidates[count - 1];
        } else if (!allNegative) {
            uint256 distance = type(uint256).max;
            for (uint256 j; j < count; ++j) {
                uint16 t = candidates[j];
                uint256 delta = t > refTick ? t - refTick : refTick - t;
                if (delta < distance) {
                    distance = delta;
                    selected = t;
                }
            }
        }
        r.clearTick = selected;
        r.volumeLots = uint64(bestVolume);
        uint256 allocated;
        for (uint256 t = 256; t > 0; --t) {
            uint256 quantity;
            for (uint256 j; j < book.length; ++j) {
                if (book[j].side == 0 && book[j].tick == t - 1) quantity += book[j].lots;
            }
            if (allocated + quantity >= bestVolume) {
                r.buyCutoff = uint16(t - 1);
                r.rB = uint64(bestVolume - allocated);
                r.mB = uint64(quantity);
                break;
            }
            allocated += quantity;
        }
        allocated = 0;
        for (uint16 t; t < 256; ++t) {
            uint256 quantity;
            for (uint256 j; j < book.length; ++j) {
                if (book[j].side == 1 && book[j].tick == t) quantity += book[j].lots;
            }
            if (allocated + quantity >= bestVolume) {
                r.sellCutoff = t;
                r.rS = uint64(bestVolume - allocated);
                r.mS = uint64(quantity);
                break;
            }
            allocated += quantity;
        }
    }

    /// @dev Bounded inputs permit a direct rational numerator in uint256, without mulDiv.
    function fill(AuctionTypes.Order memory o, AuctionTypes.Result memory result, uint256 price, uint256 lot)
        internal
        pure
        returns (uint256 bi, uint256 bo, uint256 qi, uint256 qo, uint256 refund)
    {
        uint256 numerator;
        uint256 denominator = 1;
        if (result.volumeLots != 0) {
            if (o.side == 0 && o.tick >= result.buyCutoff) {
                numerator = o.tick == result.buyCutoff ? result.rB : 1;
                denominator = o.tick == result.buyCutoff ? result.mB : 1;
            } else if (o.side == 1 && o.tick <= result.sellCutoff) {
                numerator = o.tick == result.sellCutoff ? result.rS : 1;
                denominator = o.tick == result.sellCutoff ? result.mS : 1;
            }
        }
        uint256 bn = uint256(o.lots) * lot * numerator;
        uint256 qn = bn * price;
        if (o.side == 0) {
            bo = bn / denominator;
            qi = (qn + denominator * 1e18 - 1) / (denominator * 1e18);
            refund = o.escrow - qi;
        } else {
            bi = (bn + denominator - 1) / denominator;
            qo = qn / (denominator * 1e18);
            refund = o.escrow - bi;
        }
    }
}
