// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {Test} from "forge-std/Test.sol";
import {BatchAuction} from "../src/BatchAuction.sol";
import {DemoToken} from "../src/DemoToken.sol";
import {AuctionTypes} from "../src/lib/AuctionTypes.sol";
import {RefAuction} from "./ref/RefAuction.sol";

abstract contract AuctionTestBase is Test, AuctionTypes {
    struct Fill {
        uint256 bi;
        uint256 bo;
        uint256 qi;
        uint256 qo;
        uint256 refund;
    }

    function referenceFill(Order memory o, Result memory r, uint256 p, uint256 lot)
        internal
        pure
        returns (Fill memory f)
    {
        (f.bi, f.bo, f.qi, f.qo, f.refund) = RefAuction.fill(o, r, p, lot);
    }
    DemoToken internal base;
    DemoToken internal quote;
    BatchAuction internal market;
    address internal alice;
    address internal bob;
    uint256 internal constant ALICE_KEY = 0xA11CE;
    uint256 internal constant LOT = 1e15 + 7;

    function setUp() public virtual {
        alice = vm.addr(ALICE_KEY);
        bob = makeAddr("bob");
        base = new DemoToken("Rose", "ROSE", 18, address(this));
        quote = new DemoToken("Demo USD", "dUSD", 6, address(this));
        market = newMarket();
        fund(market, alice);
        fund(market, bob);
    }

    function newMarket() internal returns (BatchAuction) {
        return new BatchAuction(address(base), address(quote), 500_003, 5_003, LOT, 1, 100);
    }

    function fund(BatchAuction m, address who) internal {
        base.mint(who, 1e30);
        quote.mint(who, 1e30);
        vm.startPrank(who);
        base.approve(address(m), type(uint256).max);
        quote.approve(address(m), type(uint256).max);
        m.deposit(address(base), 1e30);
        m.deposit(address(quote), 1e30);
        vm.stopPrank();
    }

    function place(address who, uint8 side, uint16 tick, uint64 lots) internal returns (uint256) {
        vm.prank(who);
        return market.place(side, tick, lots);
    }

    function readOrder(BatchAuction m, uint256 id) internal view returns (Order memory o) {
        (o.owner, o.side, o.tick, o.claimed, o.lots, o.batchId, o.escrow) = m.orders(id);
    }

    function close() internal returns (Result memory r) {
        uint64 id = market.openBatch().id;
        vm.roll(block.number + 1);
        market.clear();
        return market.result(id);
    }

    function claimOne(uint256 id) internal {
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        market.claim(ids);
    }

    function assertResult(Result memory a, Result memory b) internal pure {
        assertEq(a.clearTick, b.clearTick, "clear tick");
        assertEq(a.volumeLots, b.volumeLots, "volume");
        assertEq(a.buyCutoff, b.buyCutoff, "buy cutoff");
        assertEq(a.sellCutoff, b.sellCutoff, "sell cutoff");
        assertEq(a.rB, b.rB, "buy numerator");
        assertEq(a.mB, b.mB, "buy denominator");
        assertEq(a.rS, b.rS, "sell numerator");
        assertEq(a.mS, b.mS, "sell denominator");
    }

    function book(uint256 seed) internal pure returns (RefAuction.Quote[] memory quotes) {
        uint256 n = seed % 60 + 1;
        quotes = new RefAuction.Quote[](n);
        for (uint256 j; j < n; ++j) {
            seed = uint256(keccak256(abi.encode(seed, j)));
            quotes[j] = RefAuction.Quote(uint8(seed % 2), uint16((seed >> 8) % 256), uint64((seed >> 24) % 997 + 1));
        }
    }

    function sign(BatchAuction m, Intent memory i, uint256 key) internal view returns (bytes memory) {
        // Encode the standard domain and every field independently of the contract's hash helpers.
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Batchelor"),
                keccak256("1"),
                block.chainid,
                address(m)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Intent(address trader,uint8 action,uint8 side,uint16 tick,uint64 lots,uint256 orderId,uint64 nonce,uint64 deadline)"
                ),
                i.trader,
                i.action,
                i.side,
                i.tick,
                i.lots,
                i.orderId,
                i.nonce,
                i.deadline
            )
        );
        bytes32 hash = keccak256(abi.encodePacked(hex"1901", domain, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, hash);
        return abi.encodePacked(r, s, v);
    }
}
