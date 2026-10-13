#!/usr/bin/env python3
"""Prepare measured demo/submission data and auditable current-branch history; no publication."""
import datetime
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
bench = json.loads((ROOT / 'packages/core/src/bench.json').read_text())
gas = json.loads((ROOT / 'packages/core/src/gas.json').read_text())
rows = [x for x in bench['scenarios'] if x['name'] in ['clear32', 'clear128', 'clear256']]
assert len(rows) == 3
table = ['| Active ticks per side / total ladder slots | MonadNine gas | MonadTen gas | Ratio |',
         '|---|---:|---:|---:|']
for x in rows:
    table.append(f'| {x["activeTicks"]} / {x["activeTicks"] * 2} | {x["monadNine"]:,} | {x["monadTen"]:,} | {x["ratio"]:.3f}× |')
table += ['', f'Fixed seed {bench["seed"]}; same production bytecode; measured `_clear` only. '
          'No mainnet live median or recording data is implied. Source: `packages/core/src/bench.json`.']
for name in ['09_DEMO_SCRIPT.md', '10_SUBMISSION.md']:
    path = ROOT / name
    text = path.read_text()
    text, count = re.subn(r'<!-- BEGIN GENERATED BENCH -->.*?<!-- END GENERATED BENCH -->',
                         '<!-- BEGIN GENERATED BENCH -->\n' + '\n'.join(table) + '\n<!-- END GENERATED BENCH -->',
                         text, flags=re.S)
    assert count == 1, name
    path.write_text(text)
raw = subprocess.run(['git', 'log', 'HEAD', '--reverse', '--format=%H%x09%aI%x09%cI%x09%s'],
                     cwd=ROOT, text=True, capture_output=True, check=True).stdout
commits = [dict(zip(['hash', 'authoredAt', 'committedAt', 'subject'], line.split('\t', 3))) for line in raw.splitlines()]
start = datetime.datetime.fromisoformat('2026-09-01T00:00:00+00:00')
in_window = all(datetime.datetime.fromisoformat(c[field]) >= start for c in commits for field in ['authoredAt', 'committedAt'])
history = {'scope': 'HEAD ancestry at preparation time; subsequent S8 commits appear on next run',
           'buildWindowStartUTC': start.isoformat(), 'allAuthoredAndCommittedSinceStart': in_window,
           'commitCount': len(commits), 'initialRepository': 'Recorded as empty before S1 in tasks/lessons.md; third-party submodules/dependencies disclosed separately.',
           'commits': commits}
(ROOT / 'docs/verification/s8-commits.json').write_text(json.dumps(history, indent=2) + '\n')
evidence = {'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'benchGeneratedAt': bench['generatedAt'], 'benchmarks': rows, 'gasPolicy': gas,
            'productionDeployment': 'unset in packages/core/src/addresses.ts',
            'publication': 'not performed', 'video': 'not recorded or uploaded', 'submission': 'prepared draft only',
            'pending': ['Permanent production domain/RP ID', 'Funded mainnet contracts, relayer and six bot keys',
                        'Hosted web, bot service and Envio endpoint', 'Public source verification and hosted soak',
                        'Three fresh-device mainnet flows under 60 seconds', 'Actual recording receipt/hashes, GIF and <=3 minute public video',
                        'Private-dashboard registration/rules/bounties and complete submission', 'Rahul independent review sign-off'],
            'commitWindowPassed': in_window, 'dayOfMarginGate': 'Not achievable on supplied 13 October deadline day; not claimed passed.'}
(ROOT / 'docs/verification/s8-release.json').write_text(json.dumps(evidence, indent=2) + '\n')
if not in_window:
    raise SystemExit('Commit-window check failed.')
print(f'Prepared measured benchmark tables and {len(commits)} in-window commits; public release remains pending.')
