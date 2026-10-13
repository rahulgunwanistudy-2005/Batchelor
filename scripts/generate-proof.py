#!/usr/bin/env python3
"""Build proof data from current Forge evidence and generated WHY_MONAD prose."""
import hashlib
import json
from pathlib import Path
import re
ROOT = Path(__file__).resolve().parents[1]
summary_path=ROOT/'contracts/out/test-summary.json'
if not summary_path.exists():
    raise SystemExit('Missing contract evidence. Run pnpm proof:tests before building the web app.')
summary=json.loads(summary_path.read_text())
current={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()
         for directory in ['contracts/src','contracts/test'] for p in sorted((ROOT/directory).rglob('*.sol'))}
current['contracts/foundry.toml']=hashlib.sha256((ROOT/'contracts/foundry.toml').read_bytes()).hexdigest()
if current != summary['sourceHashes']:
    raise SystemExit('Contract evidence is stale. Run pnpm proof:tests.')
if not summary['tests'] or any(t['status']!='passed' for t in summary['tests']) or summary['noPriorityInputs']['status']!='passed':
    raise SystemExit('Proof evidence did not pass.')
fuzz='testFuzz_ReferenceModelUniformLimitsRefundsAndConservation(uint256)'
invariants=[('Solvency','invariant_SolventAgainstIndependentOutstandingLiabilities()'),
 ('Conservation per batch','invariant_ConservationPerBatchAndBoundedDust()'),
 ('Uniform price',fuzz),('Permutation invariance','test_SameBlockOrderNeverMatters(uint256,uint256)'),
 ('Limit respected',fuzz),('Refund completeness',fuzz),('Reference model equality',fuzz)]
rows=[]
for label,name in invariants:
    matches=[t for t in summary['tests'] if t['name']==name]
    if len(matches)!=1:raise SystemExit(f'Missing or ambiguous evidence: {name}')
    t=matches[0]
    if t['runs'] < (256 if name.startswith('invariant_') else 1000):raise SystemExit(f'Insufficient runs: {name}')
    rows.append({'label':label,**t})
rows.append({'label':'No priority inputs','name':summary['noPriorityInputs']['command'],**summary['noPriorityInputs']})
prose=(ROOT/'docs/WHY_MONAD.md').read_text().split('## Proof page summary\n\n')[1].split('\n\nNo mainnet')[0].strip().split('\n\n')
if len(prose)!=4:raise SystemExit('Expected four sourced proof summary paragraphs')
paragraphs=[]
for text in prose:
    links=[{'label':m[0],'url':m[1]} for m in re.findall(r'\[([^\]]+)\]\((https://[^)]+)\)',text)]
    paragraphs.append({'text':(text.split('. [',1)[0]+'.').replace('`','').replace('**',''),'links':links})
facts=json.loads((ROOT/'docs/verification/monad-facts.json').read_text())
output={'generatedAt':summary['generatedAt'],'command':summary['command'],'profile':summary['profile'],
        'testCount':len(summary['tests']),'invariants':rows,'whyMonad':paragraphs,'network':facts}
(ROOT/'apps/web/src/lib/proof.generated.json').write_text(json.dumps(output,indent=2)+'\n')
print(f'Generated proof: {len(rows)} evidence gates, {len(paragraphs)} sourced paragraphs.')
