#!/usr/bin/env python3
"""Export verified Forge JSON results, fail closed, and hash production sources."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
ROOT = Path(__file__).resolve().parents[1]
forge = ROOT / '.tools/foundry/bin/forge'
command = [str(forge) if forge.exists() else 'forge', 'test', '--json']
summary_path=ROOT/'contracts/out/test-summary.json'
summary_path.unlink(missing_ok=True)
environment={**os.environ, 'FOUNDRY_PROFILE':'default'}
config=json.loads(subprocess.run([command[0],'config','--json'],cwd=ROOT/'contracts',env=environment,text=True,capture_output=True,check=True).stdout)
if config['network']!='monad' or config['hardfork']!='monad:MonadTen' or config['fuzz']['runs']<1000 or config['invariant']['runs']<256 or config['invariant']['depth']<200:
    raise SystemExit('Proof export requires MonadTen, >=1,000 fuzz runs and >=256 invariant runs at depth >=200.')
run = subprocess.run(command, cwd=ROOT / 'contracts', text=True, capture_output=True, env=environment)
if run.returncode:
    raise SystemExit(run.stderr + run.stdout[-4000:])
raw = json.loads(run.stdout)
tests = []
for suite, result in raw.items():
    for name, test in result['test_results'].items():
        if test['status'] != 'Success':
            raise SystemExit(f'Unsuccessful test: {suite}:{name}')
        kind = test['kind']
        detail = next(iter(kind.values())) if isinstance(kind, dict) else {}
        predicates=test.get('invariant_predicate_results') or []
        if predicates and (len(predicates)!=test['invariant_count'] or any(p['status']!='Success' for p in predicates)):
            raise SystemExit(f'Unsuccessful invariant predicates: {suite}')
        names=[p['name']+'()' for p in predicates] if predicates else [name]
        for predicate_name in names:
            tests.append({'suite': suite, 'name': predicate_name, 'status': 'passed', 'runs': detail.get('runs', 1),
                          'calls': detail.get('calls'), 'reverts': detail.get('reverts')})
if not tests:
    raise SystemExit('No test results')
subprocess.run(['python3', str(ROOT / 'scripts/check-contracts.py')], check=True, cwd=ROOT)
hashes = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
          for directory in ['contracts/src', 'contracts/test'] for p in sorted((ROOT / directory).rglob('*.sol'))}
hashes['contracts/foundry.toml']=hashlib.sha256((ROOT/'contracts/foundry.toml').read_bytes()).hexdigest()
output = {'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'command': 'forge test --json', 'profile': 'MonadTen', 'tests': tests,
          'sourceHashes': hashes, 'settings': {'fuzzRuns': config['fuzz']['runs'], 'invariantRuns': config['invariant']['runs'], 'invariantDepth': config['invariant']['depth']}, 'noPriorityInputs': {'status': 'passed', 'command': 'python3 scripts/check-contracts.py', 'runs': 1}}
summary_path.write_text(json.dumps(output, indent=2)+'\n')
print(f'Exported {len(tests)} passed tests and source/runtime priority-input gate.')
