// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Isolated MIP-8 measurements. Not an auction or production deployment.
/// @dev Seed in a separate transaction so measured reads start cold.
contract PageBench {
    uint256[512] private contiguous;
    mapping(uint256 => uint256) private scattered;

    event Measured(bytes32 indexed scenario, uint256 gasUsed, uint256 checksum);

    function seed() external {
        for (uint256 i; i < 512; ++i) {
            contiguous[i] = i + 1;
            scattered[i] = i + 1;
        }
    }

    function readContiguous512() external returns (uint256 used, uint256 checksum) {
        uint256 start = gasleft();
        for (uint256 i; i < 512; ++i) {
            checksum += contiguous[i];
        }
        used = start - gasleft();
        emit Measured("contiguous512", used, checksum);
    }

    function readScattered512() external returns (uint256 used, uint256 checksum) {
        uint256 start = gasleft();
        for (uint256 i; i < 512; ++i) {
            checksum += scattered[i];
        }
        used = start - gasleft();
        emit Measured("scattered512", used, checksum);
    }

    function readContiguous32OnePage() external returns (uint256 used, uint256 checksum) {
        uint256 start = gasleft();
        for (uint256 i; i < 32; ++i) {
            checksum += contiguous[i];
        }
        used = start - gasleft();
        emit Measured("onePage32", used, checksum);
    }

    function readContiguous32FourPages() external returns (uint256 used, uint256 checksum) {
        uint256 start = gasleft();
        for (uint256 i; i < 32; ++i) {
            checksum += contiguous[(i / 8) * 128 + i % 8];
        }
        used = start - gasleft();
        emit Measured("fourPages32", used, checksum);
    }

    function write64OnePage() external returns (uint256 used) {
        uint256 start = gasleft();
        for (uint256 i; i < 64; ++i) {
            contiguous[i] = i + 2;
        }
        used = start - gasleft();
        emit Measured("writeOnePage64", used, 0);
    }

    /// @dev Mapping entries occupy distinct pages; layout is checked in the test.
    function write64SeparatePages() external returns (uint256 used) {
        uint256 start = gasleft();
        for (uint256 i; i < 64; ++i) {
            scattered[i] = i + 2;
        }
        used = start - gasleft();
        emit Measured("writeSeparatePages64", used, 0);
    }
}
