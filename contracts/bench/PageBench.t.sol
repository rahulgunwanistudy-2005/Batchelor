// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";
import {PageBench} from "../src/PageBench.sol";

contract PageBenchTest is Test {
    PageBench private bench;

    function setUp() public {
        bench = new PageBench();
        bench.seed();
        // isolate=true runs external test calls as separate transactions.
    }

    function test_contiguous512() public {
        (uint256 used, uint256 checksum) = bench.readContiguous512();
        assertEq(checksum, 512 * 513 / 2);
        console2.log("contiguous512", used);
    }

    function test_scattered512() public {
        (uint256 used, uint256 checksum) = bench.readScattered512();
        assertEq(checksum, 512 * 513 / 2);
        console2.log("scattered512", used);
    }

    function test_onePage32() public {
        (uint256 used, uint256 checksum) = bench.readContiguous32OnePage();
        assertEq(checksum, 32 * 33 / 2);
        console2.log("onePage32", used);
    }

    function test_fourPages32() public {
        (uint256 used, uint256 checksum) = bench.readContiguous32FourPages();
        assertEq(checksum, 6288);
        console2.log("fourPages32", used);
    }

    function test_writeOnePage64() public {
        console2.log("writeOnePage64", bench.write64OnePage());
    }

    function test_writeSeparatePages64() public {
        for (uint256 i; i < 64; ++i) {
            uint256 page = uint256(keccak256(abi.encode(i, uint256(512)))) >> 7;
            for (uint256 j; j < i; ++j) {
                assertTrue(page != uint256(keccak256(abi.encode(j, uint256(512)))) >> 7);
            }
        }
        console2.log("writeSeparatePages64", bench.write64SeparatePages());
    }
}
