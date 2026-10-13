#!/usr/bin/env python3
"""Run Slither; reject new findings or stale individual reviews. Never hide detectors."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
review = json.loads((ROOT / 'docs/security/slither-reviewed.json').read_text())
local = ROOT / '.tools/security/bin/slither'
slither = str(local) if local.exists() else shutil.which('slither')
if not slither:
    raise SystemExit('Install slither-analyzer==0.11.5 in a verification environment.')
env = os.environ.copy()
if local.exists():
    env['VIRTUAL_ENV'] = str(ROOT / '.tools/security')
foundry = ROOT / '.tools/foundry/bin'
if foundry.exists():
    env['PATH'] = str(foundry) + os.pathsep + env['PATH']
version = subprocess.run([slither, '--version'], env=env, text=True, capture_output=True, check=True).stdout.strip()
if version != review['version']:
    raise SystemExit(f'Expected Slither {review["version"]}, got {version}. Review tool upgrades explicitly.')
source_hashes = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                 for p in sorted((ROOT / 'contracts/src').rglob('*.sol'))}
if source_hashes != review['sourceHashes']:
    raise SystemExit('Production source changed: rerun Slither and review the security baseline.')
with tempfile.TemporaryDirectory(prefix='batchelor-slither-') as scratch:
    output = Path(scratch) / 'result.json'
    run = subprocess.run([slither, '.', '--filter-paths', '(^|/)(test|script|bench)/',
                          '--exclude-dependencies', '--json', str(output)], cwd=ROOT / 'contracts',
                         env=env, text=True, capture_output=True)
    if not output.exists():
        raise SystemExit('Slither failed to compile/analyze. No security success claimed.')
    result = json.loads(output.read_text())
    if not result['success'] or run.returncode not in (0, 255):
        raise SystemExit('Slither execution failed. No security success claimed.')
    findings = result['results'].get('detectors', [])
    actual = {f['id']: (f['check'], f['impact']) for f in findings}
    expected = {f['id']: (f['check'], f['impact']) for f in review['findings']}
    if actual != expected:
        print(json.dumps({'unreviewed': sorted(actual.keys() - expected.keys()),
                          'missing': sorted(expected.keys() - actual.keys())}, indent=2))
        raise SystemExit('Slither findings differ from the individual reviews. Review before shipping.')
    evidence = {'passed': True, 'tool': 'slither-analyzer', 'version': version,
                'analyzedFindings': len(findings), 'reviewedFindings': len(expected), 'unreviewedFindings': 0,
                'sourceHashes': source_hashes, 'findingIds': sorted(actual)}
    (ROOT / 'docs/verification/s8-security.json').write_text(json.dumps(evidence, indent=2) + '\n')
    print(f'Slither: {len(findings)} individually justified findings; zero unreviewed findings.')
