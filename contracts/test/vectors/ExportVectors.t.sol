// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {AuctionTestBase} from "../AuctionTestBase.sol";
import {RefAuction} from "../ref/RefAuction.sol";
import {Settle} from "../../src/lib/Settle.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Uncross} from "../../src/lib/Uncross.sol";

contract ExportVectorsTest is AuctionTestBase {
    function test_Export50SeededBooks() public {
        // Offline artifact generation is not a transaction. Individual economic tests retain the 30M cap.
        vm.pauseGasMetering();
        string memory output = string.concat(
            '{"schemaVersion":1,"quantityEncoding":"decimal-string","parameters":{"lot":"',
            vm.toString(market.LOT()),
            '","minPrice":"',
            vm.toString(market.MIN_PRICE()),
            '","tickSize":"',
            vm.toString(market.TICK_SIZE()),
            '"},"vectors":['
        );
        for (uint256 seed; seed < 50; ++seed) {
            output = string.concat(output, seed == 0 ? "" : ",", this.vectorJson(seed));
        }
        vm.writeJson(string.concat(output, "]}"), "../packages/core/test/vectors.json");
        vm.resumeGasMetering();
    }

    // Separate call memory keeps the exporter below Foundry's memory ceiling.
    function vectorJson(uint256 seed) external view returns (string memory) {
        RefAuction.Quote[] memory quotes = book(seed);
        uint16 ref = uint16((seed * 73) % 256);
        uint64[] memory bids = new uint64[](256);
        uint64[] memory asks = new uint64[](256);
        string memory ordersJson = "[";
        for (uint256 j; j < quotes.length; ++j) {
            RefAuction.Quote memory o = quotes[j];
            if (o.side == 0) bids[o.tick] += o.lots;
            else asks[o.tick] += o.lots;
            ordersJson = string.concat(
                ordersJson,
                j == 0 ? "" : ",",
                '{"side":',
                vm.toString(o.side),
                ',"tick":',
                vm.toString(o.tick),
                ',"lots":"',
                vm.toString(o.lots),
                '"}'
            );
        }
        Result memory r = Uncross.uncross(bids, asks, 0, 255, ref);
        assertResult(r, RefAuction.uncross(quotes, ref));
        return string.concat(
            '{"seed":',
            vm.toString(seed),
            ',"refTick":',
            vm.toString(ref),
            ',"orders":',
            ordersJson,
            '],"result":',
            resultJson(r),
            ",\"fills\":",
            fillsJson(quotes, r),
            "}"
        );
    }

    function fillsJson(RefAuction.Quote[] memory quotes, Result memory r) private view returns (string memory) {
        string memory output = "[";
        for (uint256 j; j < quotes.length; ++j) {
            output = string.concat(output, j == 0 ? "" : ",", fillJson(quotes[j], r));
        }
        return string.concat(output, "]");
    }

    function fillJson(RefAuction.Quote memory q, Result memory r) private view returns (string memory) {
        Order memory o;
        o.side = q.side;
        o.tick = q.tick;
        o.lots = q.lots;
        uint256 b = uint256(q.lots) * market.LOT();
        o.escrow = uint128(q.side == 0 ? Math.mulDiv(b, market.price(q.tick), 1e18, Math.Rounding.Ceil) : b);
        (uint256 bi, uint256 bo, uint256 qi, uint256 qo, uint256 refund) =
            Settle.fill(o, r, market.price(r.clearTick), market.LOT());
        string memory left = string.concat(
            '{"baseIn":"', vm.toString(bi), '","baseOut":"', vm.toString(bo), '","quoteIn":"', vm.toString(qi)
        );
        return string.concat(left, '","quoteOut":"', vm.toString(qo), '","refund":"', vm.toString(refund), '"}');
    }

    function resultJson(Result memory r) private pure returns (string memory) {
        return string.concat(
            '{"clearTick":',
            vm.toString(r.clearTick),
            ',"buyCutoff":',
            vm.toString(r.buyCutoff),
            ',"sellCutoff":',
            vm.toString(r.sellCutoff),
            ',"volumeLots":"',
            vm.toString(r.volumeLots),
            '","rB":"',
            vm.toString(r.rB),
            '","mB":"',
            vm.toString(r.mB),
            '","rS":"',
            vm.toString(r.rS),
            '","mS":"',
            vm.toString(r.mS),
            '"}'
        );
    }
}
