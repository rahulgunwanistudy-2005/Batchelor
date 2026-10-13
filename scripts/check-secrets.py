#!/usr/bin/env python3
"""Scan full Git history and every non-ignored project file without printing secrets."""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
scanner = shutil.which('gitleaks')
if not scanner:
    raise SystemExit('Install Gitleaks to run the secret gate.')
config = ROOT / '.gitleaks.toml'
def git(*args):
    return subprocess.run(['git', *args], cwd=ROOT, capture_output=True, check=True).stdout
if git('rev-parse', '--is-shallow-repository').strip() == b'true':
    raise SystemExit('Fetch full history before scanning secrets.')
version = subprocess.run([scanner, 'version'], capture_output=True, text=True, check=True).stdout.strip()
inventory = [p.decode() for p in git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split(b'\0') if p]
results = {}
with tempfile.TemporaryDirectory(prefix='batchelor-secrets-') as scratch:
    root = Path(scratch)
    snapshot = root / 'files'
    snapshot.mkdir()
    count = 0
    for relative in inventory:
        source = ROOT / relative
        if not source.is_file():
            continue  # Git submodule entries are directories, not project source files.
        if source.is_symlink():
            raise SystemExit('Review project symlinks before secret scanning.')
        target = snapshot / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        count += 1
    for scope, command in [('history', ['git', str(ROOT)]), ('workingFiles', ['dir', str(snapshot)])]:
        report = root / f'{scope}.json'
        run = subprocess.run([scanner, *command, '--config', str(config), '--redact', '--no-banner',
                              '--report-format', 'json', '--report-path', str(report)], cwd=ROOT,
                             capture_output=True, text=True)
        if run.returncode not in (0, 1) or not report.exists():
            raise SystemExit(f'Gitleaks {scope} did not complete; no clean scan claimed.')
        findings = json.loads(report.read_text())
        results[scope] = {'findings': len(findings), 'passed': run.returncode == 0 and not findings}
        if findings:
            # File and rule only: keep secret excerpts out of console and versioned evidence.
            print(json.dumps([{'file': x['File'], 'line': x['StartLine'], 'rule': x['RuleID']} for x in findings]))
    result = {'passed': all(x['passed'] for x in results.values()), 'tool': 'gitleaks', 'version': version,
              'projectFilesScanned': count, 'history': 'all reachable commits', 'scopes': results,
              'excluded': 'Ignored private environment, installed tools, dependencies/build artifacts and vendored submodules.'}
    (ROOT / 'docs/verification/s8-secrets.json').write_text(json.dumps(result, indent=2) + '\n')
    if not result['passed']:
        raise SystemExit('Secret gate failed. Remove real credentials; justify only precise false positives.')
    print('Gitleaks: complete reachable history and project working files clean.')
