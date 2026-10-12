#!/usr/bin/env python3
"""Sample 200 contiguous testnet headers, retaining timestamp precision limits."""
from concurrent.futures import ThreadPoolExecutor
import datetime
import json
from pathlib import Path
import statistics
import subprocess

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / ".tools/foundry/bin/cast"
CAST = str(LOCAL) if LOCAL.exists() else "cast"
RPC = "https://testnet-rpc.monad.xyz"


def block(number):
    raw = subprocess.run([CAST, "block", str(number), "--rpc-url", RPC, "--json"],
                         text=True, capture_output=True, check=True)
    parsed = json.loads(raw.stdout)
    b = parsed.get("data", parsed)
    return {"number": int(b["number"], 16), "timestamp": int(b["timestamp"], 16),
            "hash": b["hash"], "parentHash": b["parentHash"]}


def main():
    chain = subprocess.run([CAST, "chain-id", "--rpc-url", RPC],
                           text=True, capture_output=True, check=True).stdout.strip()
    assert chain == "10143", "Refusing to sample a different chain"
    end = block("latest")["number"] - 2
    with ThreadPoolExecutor(max_workers=4) as executor:
        blocks = list(executor.map(block, range(end - 199, end + 1)))
    for a, b in zip(blocks, blocks[1:]):
        assert b["number"] == a["number"] + 1 and b["parentHash"] == a["hash"]
    intervals = [b["timestamp"] - a["timestamp"] for a, b in zip(blocks, blocks[1:])]
    result = {"sampledAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "chainId": 10143, "rpc": RPC, "blockCount": len(blocks), "intervalCount": len(intervals),
              "medianHeaderIntervalSeconds": statistics.median(intervals),
              "meanHeaderIntervalSeconds": statistics.mean(intervals),
              "timestampResolutionSeconds": 1,
              "limitation": "RPC header timestamps are whole seconds. The quantized median cannot measure subsecond block cadence.",
              "blocks": blocks}
    out = ROOT / "contracts/bench/out/testnet-blocks.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({k: v for k, v in result.items() if k != "blocks"}, indent=2))


if __name__ == "__main__":
    main()
