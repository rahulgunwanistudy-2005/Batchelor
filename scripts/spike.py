#!/usr/bin/env python3
"""Run identical bytecode under pinned Monad hardforks; save measured evidence."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / "contracts"
OUT = CONTRACTS / "bench" / "out"
LOCAL_FORGE = ROOT / ".tools" / "foundry" / "bin" / "forge"
FORGE = str(LOCAL_FORGE) if LOCAL_FORGE.exists() else "forge"
SCENARIOS = ["contiguous512", "scattered512", "onePage32", "fourPages32", "writeOnePage64", "writeSeparatePages64"]


def run(args, env=None):
    result = subprocess.run([FORGE, *args], cwd=CONTRACTS, env=env,
                            text=True, capture_output=True)
    if result.returncode:
        raise SystemExit(result.stdout + result.stderr)
    return result.stdout


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    evidence = {"measuredAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "forgeVersion": run(["--version"]).strip(), "profiles": {}}
    hashes = []
    for profile, hardfork in [("default", "MonadTen"), ("pre_mip8", "MonadNine")]:
        env = dict(os.environ, FOUNDRY_PROFILE=profile)
        config = json.loads(run(["config", "--json"], env))
        # Do not silently run Ethereum or the wrong fork if configuration changes.
        assert "monad" in str(config.get("network", "")).lower(), config.get("network")
        assert hardfork.lower() in str(config.get("hardfork", "")).lower(), config.get("hardfork")
        raw = run(["test", "--match-contract", "PageBenchTest|TransientGuardTest", "-vv"], env)
        print(raw, end="")
        measurements = {}
        for name in SCENARIOS:
            matches = re.findall(rf"^\s*{name}:?\s+(\d+)\s*$", raw, re.MULTILINE)
            assert len(matches) == 1, f"Missing or duplicate measurement: {name}"
            measurements[name] = int(matches[0])
        artifact = json.loads((CONTRACTS / "out" / "PageBench.sol" / "PageBench.json").read_text())
        digest = hashlib.sha256(bytes.fromhex(artifact["deployedBytecode"]["object"].removeprefix("0x"))).hexdigest()
        hashes.append(digest)
        evidence["profiles"][profile] = {"network": config["network"], "hardfork": config["hardfork"],
                                         "runtimeBytecodeSha256": digest, "gas": measurements,
                                         "transientGuardPassed": "[PASS] test_transientGuardBlocksReentrancyAndUnlocks" in raw}
        (OUT / f"{profile}.json").write_text(json.dumps(evidence["profiles"][profile], indent=2) + "\n")
    assert len(set(hashes)) == 1, "Profiles compiled different bytecode"
    ten = evidence["profiles"]["default"]["gas"]["contiguous512"]
    nine = evidence["profiles"]["pre_mip8"]["gas"]["contiguous512"]
    evidence["ratio"] = nine / ten
    evidence["localGatePassed"] = nine >= 10 * ten
    evidence["liveTestnet"] = {"status": "pending", "reason": "Requires a funded throwaway testnet key and emitted transaction measurements."}
    (OUT / "spike.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print(f"Full-book read: MonadNine {nine:,} / MonadTen {ten:,} = {nine / ten:.2f}x")
    if not evidence["localGatePassed"]:
        raise SystemExit("STOP: local 10x gate failed; do not scaffold.")
    assert all(p["transientGuardPassed"] for p in evidence["profiles"].values())


if __name__ == "__main__":
    main()
