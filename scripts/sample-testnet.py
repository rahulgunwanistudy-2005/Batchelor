#!/usr/bin/env python3
"""Sample 200 contiguous testnet headers, retaining timestamp precision limits."""
from concurrent.futures import ThreadPoolExecutor
import datetime
import json
import os
from pathlib import Path
import statistics
import subprocess
import sys
from urllib.parse import quote, unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / ".tools/foundry/bin/cast"
CAST = str(LOCAL) if LOCAL.exists() else "cast"

def resolve_rpc(source=None):
    """Preserve explicit HTTP transports; otherwise require a Dwellir key."""
    source = os.environ if source is None else source
    supplied = source.get("RPC_HTTP", "").strip()
    key = source.get("DWELLIR_API_KEY", "").strip()
    if not supplied:
        if not key:
            raise ValueError("Configure RPC_HTTP or DWELLIR_API_KEY for Monad testnet.")
        supplied = "https://api-monad-testnet-full.n.dwellir.com/" + quote(key, safe="")
    parsed = urlsplit(supplied)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ValueError("RPC_HTTP must be a valid HTTP(S) endpoint.")
    if parsed.username or parsed.password:
        raise ValueError("Embedded user credentials are not supported.")
    if parsed.hostname.endswith(".dwellir.com"):
        if parsed.hostname != "api-monad-testnet-full.n.dwellir.com":
            raise ValueError("Dwellir endpoint must select Monad testnet.")
        if parsed.scheme != "https" or parsed.query or parsed.fragment:
            raise ValueError("Use the canonical secure Dwellir endpoint.")
        credential = unquote(parsed.path).strip("/")
        if credential in ("", "<key>", "DWELLIR_API_KEY", "YOUR_API_KEY", "${DWELLIR_API_KEY}"):
            if not key:
                raise ValueError("A Dwellir RPC template requires DWELLIR_API_KEY.")
            supplied = "https://api-monad-testnet-full.n.dwellir.com/" + quote(key, safe="")
    return supplied


def public_rpc(rpc):
    """Evidence identifies the endpoint host without its credentials."""
    parsed = urlsplit(rpc)
    hostname = parsed.hostname
    if not hostname:
        raise ValueError("Invalid RPC endpoint.")
    hostname = f"[{hostname}]" if ":" in hostname else hostname
    port = f":{parsed.port}" if parsed.port else ""
    suffix = "/[redacted]" if parsed.path not in ("", "/") or parsed.query or parsed.fragment else ""
    return f"{parsed.scheme}://{hostname}{port}{suffix}"


def cast_request(args, rpc):
    try:
        return subprocess.run([CAST, *args, "--rpc-url", rpc],
                              text=True, capture_output=True, check=True).stdout
    except (OSError, subprocess.SubprocessError):
        # CalledProcessError includes the full command, which can carry API keys.
        raise RuntimeError("RPC sampling failed. Check endpoint access and local Foundry.") from None


def block(number, rpc):
    parsed = json.loads(cast_request(["block", str(number), "--json"], rpc))
    b = parsed.get("data", parsed)
    return {"number": int(b["number"], 16), "timestamp": int(b["timestamp"], 16),
            "hash": b["hash"], "parentHash": b["parentHash"]}


def main():
    rpc = resolve_rpc()
    chain = cast_request(["chain-id"], rpc).strip()
    assert chain == "10143", "Refusing to sample a different chain"
    end = block("latest", rpc)["number"] - 2
    with ThreadPoolExecutor(max_workers=4) as executor:
        blocks = list(executor.map(lambda number: block(number, rpc), range(end - 199, end + 1)))
    for a, b in zip(blocks, blocks[1:]):
        assert b["number"] == a["number"] + 1 and b["parentHash"] == a["hash"]
    intervals = [b["timestamp"] - a["timestamp"] for a, b in zip(blocks, blocks[1:])]
    result = {"sampledAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "chainId": 10143, "rpc": public_rpc(rpc), "blockCount": len(blocks), "intervalCount": len(intervals),
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
    try:
        main()
    except Exception:
        # Never print provider error bodies, URLs or subprocess argument lists.
        print("Testnet sampling failed. Check RPC configuration, connectivity, chain ID and local Foundry.", file=sys.stderr)
        sys.exit(1)
