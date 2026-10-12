// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev Shared ABI structs only. No persistent storage or inherited constructor.
abstract contract AuctionTypes {
    struct BatchMeta {
        uint64 id;
        uint64 startBlock;
        uint16 bidMin;
        uint16 bidMax;
        uint16 askMin;
        uint16 askMax;
        uint32 orderCount;
        bool hasOpen;
    }

    struct Order {
        address owner;
        uint8 side;
        uint16 tick;
        bool claimed;
        uint64 lots;
        uint64 batchId;
        uint128 escrow;
    }

    struct Result {
        uint16 clearTick;
        uint16 buyCutoff;
        uint16 sellCutoff;
        uint64 volumeLots;
        uint64 clearedAt;
        uint32 clearGas;
        uint64 rB;
        uint64 mB;
        uint64 rS;
        uint64 mS;
    }

    struct Intent {
        address trader;
        uint8 action;
        uint8 side;
        uint16 tick;
        uint64 lots;
        uint256 orderId;
        uint64 nonce;
        uint64 deadline;
    }
}
