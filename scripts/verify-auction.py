#!/usr/bin/env python3
"""Reproducible S2 acceptance run. Persists exact commands, timings, and test summaries."""
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
FORGE = ROOT / '.tools/foundry/bin/forge'
FORGE = str(FORGE) if FORGE.exists() else 'forge'
OUT = ROOT / 'contracts/bench/out/s2'


def run(name, args, cwd=ROOT / 'contracts', env=None):
    started = time.perf_counter()
    completed = subprocess.run(args, cwd=cwd, text=True, capture_output=True, env=env)
    elapsed = time.perf_counter() - started
    output = completed.stdout + completed.stderr
    (OUT / f'{name}.log').write_text(output)
    print(f'{name}: {"PASS" if completed.returncode == 0 else "FAIL"} ({elapsed:.2f}s)', flush=True)
    tests = []
    for match in re.finditer(r'^\[(PASS|FAIL[^\]]*)\]\s+([^\n]+)', output, re.MULTILINE):
        line = match.group(2)
        if line.endswith('invariants:'):
            continue
        runs = re.search(r'runs: (\d+)', line)
        tests.append({'name': line.split(' (')[0], 'status': match.group(1),
                      'runs': int(runs.group(1)) if runs else 1})
    invariant = re.search(r'invariants \(runs: (\d+), calls: (\d+), reverts: (\d+)\)', output)
    result = {'command': args, 'workingDirectory': str(cwd), 'exitCode': completed.returncode,
              'elapsedSeconds': round(elapsed, 3), 'tests': tests}
    if invariant:
        for test in tests:
            if test['name'].startswith('invariant_'):
                test['runs'] = int(invariant.group(1))
        result['invariant'] = dict(zip(('runs', 'calls', 'reverts'), map(int, invariant.groups())))
    if completed.returncode:
        print(output[-6000:], flush=True)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--stress', action='store_true', help='10,000 differential and permutation runs')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    evidence = {'measuredAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'checks': {}}
    if args.stress:
        checks = [('stress', [FORGE, 'test', '--match-test',
                   'test_SameBlockOrderNeverMatters|testFuzz_ReferenceModel', '--fuzz-runs', '10000', '-vv'])]
    else:
        checks = [('format', [FORGE, 'fmt', '--check']), ('sizes', [FORGE, 'build', '--sizes']),
                  ('tests', [FORGE, 'test', '-vv']),
                  ('layout', ['python3', str(ROOT / 'scripts/check-contracts.py')]),
                  ('forbidden', ['bash', 'script/check-forbidden.sh'])]
    for name, command in checks:
        evidence['checks'][name] = run(name, command)
    if not args.stress:
        evidence['checks']['historical'] = run('historical', [FORGE, 'test', '--gas-limit', '100000000', '-vv'],
            env=dict(os.environ, FOUNDRY_PROFILE='pre_mip8'))
    evidence['passed'] = all(check['exitCode'] == 0 for check in evidence['checks'].values())
    (OUT / ('stress.json' if args.stress else 'acceptance.json')).write_text(json.dumps(evidence, indent=2) + '\n')
    raise SystemExit(0 if evidence['passed'] else 1)


if __name__ == '__main__':
    main()
