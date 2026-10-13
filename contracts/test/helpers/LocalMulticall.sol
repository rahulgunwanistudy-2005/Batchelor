// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev Loopback Anvil fixture only: the live chains already deploy Multicall3.
contract LocalMulticall {
    struct Call3 {
        address target;
        bool allowFailure;
        bytes callData;
    }

    struct Result {
        bool success;
        bytes returnData;
    }

    function aggregate3(Call3[] calldata calls) external payable returns (Result[] memory results) {
        results = new Result[](calls.length);
        for (uint256 i; i < calls.length; ++i) {
            (bool success, bytes memory data) = calls[i].target.call(calls[i].callData);
            require(success || calls[i].allowFailure, "Call failed");
            results[i] = Result(success, data);
        }
    }
}
