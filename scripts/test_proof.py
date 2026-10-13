"""Fresh hosting builds consume only current, successful recorded evidence."""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class HostingProofTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        for directory in ['contracts/src', 'contracts/test', 'contracts/bench']:
            shutil.copytree(ROOT / directory, self.root / directory,
                            ignore=shutil.ignore_patterns('out'))
        for relative in ['contracts/foundry.toml', 'scripts/generate-proof.py',
                         'docs/verification/contract-proof.json',
                         'docs/verification/monad-facts.json', 'docs/WHY_MONAD.md']:
            target = self.root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / relative, target)
        (self.root / 'apps/web/src/lib').mkdir(parents=True)

    def generate(self):
        return subprocess.run(['python3', str(self.root / 'scripts/generate-proof.py')],
                              text=True, capture_output=True)

    def test_fresh_host_without_foundry_output_uses_verified_record(self):
        self.assertFalse((self.root / 'contracts/out/test-summary.json').exists())
        result = self.generate()
        self.assertEqual(result.returncode, 0, result.stderr)
        proof = json.loads((self.root / 'apps/web/src/lib/proof.generated.json').read_text())
        self.assertGreaterEqual(proof['testCount'], 81)
        self.assertEqual(len(proof['invariants']), 8)

    def test_changed_benchmark_cannot_reuse_recorded_proof(self):
        source = self.root / 'contracts/bench/ClearBench.t.sol'
        source.write_text(source.read_text() + '\n// Changed benchmark\n')
        result = self.generate()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Contract evidence is stale', result.stderr)

    def test_failed_test_cannot_publish_proof(self):
        path = self.root / 'docs/verification/contract-proof.json'
        summary = json.loads(path.read_text())
        summary['tests'][0]['status'] = 'failed'
        path.write_text(json.dumps(summary))
        result = self.generate()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Proof evidence did not pass', result.stderr)


if __name__ == '__main__':
    unittest.main()
