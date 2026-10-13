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
    /// Range validation bounds every index; at most 256 uint64 quantities are
    /// summed, so intermediate totals fit uint256. Final volume is checked uint64.
    /// Assembly avoids redundant bounds checks and candidate allocations in the
    /// hottest loops. Only Solidity-allocated memory is read or written.
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
        Candidates memory c;
        assembly ("memory-safe") {
            function at(p, j) -> v { v := mload(add(add(p, 32), mul(j, 32))) }
            function distance(a, b) -> v {
                switch gt(a, b)
                case 1 { v := sub(a, b) }
                default { v := sub(b, a) }
            }
            for { let j := n } gt(j, 0) {} {
                let prev := sub(j, 1)
                mstore(add(add(demand, 32), mul(prev, 32)), add(at(demand, j), at(bids, prev)))
                j := prev
            }
            let supply := 0
            for { let j := 0 } lt(j, n) { j := add(j, 1) } {
                supply := add(supply, at(asks, j))
                let d := at(demand, j)
                let volume := supply
                if lt(d, supply) { volume := d }
                let surplus := sub(supply, d)
                if gt(d, supply) { surplus := sub(d, supply) }
                let tick := add(lo, j)
                switch or(gt(volume, mload(c)), and(eq(volume, mload(c)), lt(surplus, mload(add(c, 32)))))
                case 1 {
                    mstore(c, volume)
                    mstore(add(c, 32), surplus)
                    mstore(add(c, 64), tick)
                    mstore(add(c, 96), tick)
                    mstore(add(c, 128), tick)
                    mstore(add(c, 160), gt(d, supply))
                    mstore(add(c, 192), lt(d, supply))
                    mstore(add(c, 224), eq(d, supply))
                }
                default {
                    if and(eq(volume, mload(c)), eq(surplus, mload(add(c, 32)))) {
                        mstore(add(c, 96), tick)
                        mstore(add(c, 160), or(mload(add(c, 160)), gt(d, supply)))
                        mstore(add(c, 192), or(mload(add(c, 192)), lt(d, supply)))
                        mstore(add(c, 224), or(mload(add(c, 224)), eq(d, supply)))
                        // Ascending traversal gives exact-distance ties to the lower tick.
                        if lt(distance(tick, refTick), distance(mload(add(c, 128)), refTick)) {
                            mstore(add(c, 128), tick)
                        }
                    }
                }
            }
            let volume := mload(c)
            if volume {
                mstore(add(r, 96), volume)
                let tick := mload(add(c, 128))
                if and(mload(add(c, 160)), iszero(or(mload(add(c, 192)), mload(add(c, 224))))) {
                    tick := mload(add(c, 96))
                }
                if and(mload(add(c, 192)), iszero(or(mload(add(c, 160)), mload(add(c, 224))))) {
                    tick := mload(add(c, 64))
                }
                mstore(r, tick)
                for { let j := n } gt(j, 0) { j := sub(j, 1) } {
                    if iszero(lt(at(demand, sub(j, 1)), volume)) {
                        mstore(add(r, 32), add(lo, sub(j, 1)))
                        mstore(add(r, 192), sub(volume, at(demand, j)))
                        mstore(add(r, 224), at(bids, sub(j, 1)))
                        break
                    }
                }
                supply := 0
                for { let j := 0 } lt(j, n) { j := add(j, 1) } {
                    let amount := at(asks, j)
                    if iszero(lt(add(supply, amount), volume)) {
                        mstore(add(r, 64), add(lo, j))
                        mstore(add(r, 256), sub(volume, supply))
                        mstore(add(r, 288), amount)
                        break
                    }
                    supply := add(supply, amount)
                }
            }
        }
        if (c.volume > type(uint64).max) revert Overflow();
    }
}
