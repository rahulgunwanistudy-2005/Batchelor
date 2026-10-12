// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AuctionTypes} from "./AuctionTypes.sol";

/// @notice Linear call auction: maximum volume, minimum surplus, pressure, reference.
library Uncross {
    error BadRange();
    error Overflow();

    struct Candidates {
        uint256 volume;
        uint256 surplus;
        uint16 low;
        uint16 high;
        uint16 closest;
        bool positive;
        bool negative;
        bool zero;
    }

    /// @dev Arrays contain every eligible order, indexed by tick minus lo.
    function uncross(uint64[] memory bids, uint64[] memory asks, uint16 lo, uint16 hi, uint16 refTick)
        internal
        pure
        returns (AuctionTypes.Result memory r)
    {
        if (lo > hi || hi >= 256 || refTick >= 256 || bids.length != uint256(hi) - lo + 1 || asks.length != bids.length)
        {
            revert BadRange();
        }
        uint256 n = bids.length;
        uint256[] memory demand = new uint256[](n + 1);
        for (uint256 j = n; j > 0; --j) {
            demand[j - 1] = demand[j] + bids[j - 1];
        }
        Candidates memory c;
        uint256 supply;
        for (uint256 j; j < n; ++j) {
            supply += asks[j];
            uint256 d = demand[j];
            uint256 v = d < supply ? d : supply;
            uint256 s = d > supply ? d - supply : supply - d;
            uint16 tick = uint16(uint256(lo) + j);
            if (v > c.volume || (v == c.volume && s < c.surplus)) {
                c = Candidates(v, s, tick, tick, tick, d > supply, d < supply, d == supply);
            } else if (v == c.volume && s == c.surplus) {
                c.high = tick;
                c.positive = c.positive || d > supply;
                c.negative = c.negative || d < supply;
                c.zero = c.zero || d == supply;
                if (_distance(tick, refTick) < _distance(c.closest, refTick)) c.closest = tick;
            }
        }
        if (c.volume == 0) return r;
        if (c.volume > type(uint64).max) revert Overflow();
        r.volumeLots = uint64(c.volume);
        r.clearTick =
            c.positive && !c.negative && !c.zero ? c.high : c.negative && !c.positive && !c.zero ? c.low : c.closest;
        for (uint256 j = n; j > 0; --j) {
            if (demand[j - 1] >= c.volume) {
                r.buyCutoff = uint16(uint256(lo) + j - 1);
                r.rB = uint64(c.volume - demand[j]);
                r.mB = bids[j - 1];
                break;
            }
        }
        supply = 0;
        for (uint256 j; j < n; ++j) {
            if (supply + asks[j] >= c.volume) {
                r.sellCutoff = uint16(uint256(lo) + j);
                r.rS = uint64(c.volume - supply);
                r.mS = asks[j];
                break;
            }
            supply += asks[j];
        }
    }

    function _distance(uint16 a, uint16 b) private pure returns (uint16) {
        return a > b ? a - b : b - a;
    }
}
