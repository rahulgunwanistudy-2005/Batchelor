"""Regression coverage for retaining live proof after a local benchmark rerun."""
import json
from pathlib import Path
import tempfile
import unittest
from spike import SCENARIOS, live_summary


class LiveSummaryTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'live.json'
        self.profile = {'runtimeBytecodeSha256': 'a' * 64, 'gas': {name: 1000 for name in SCENARIOS}}
        self.live = {'status': 'passed', 'chainId': 10143, 'address': '0x' + '1' * 40,
                     'receiptsVerified': True, 'bytecodeMatchesLocal': True,
                     'runtimeBytecodeSha256': 'a' * 64, 'gas': self.profile['gas'].copy(),
                     'transactions': [{'status': 'success'} for _ in range(8)],
                     'measuredAt': '2026-10-13T11:39:38.007Z', 'verifiedAt': '2026-10-13T11:40:00Z'}

    def write(self):
        self.path.write_text(json.dumps(self.live))

    def test_absent_evidence_remains_pending(self):
        self.assertEqual(live_summary(self.path, self.profile)['status'], 'pending')

    def test_matching_evidence_is_preserved(self):
        self.write()
        result = live_summary(self.path, self.profile)
        self.assertEqual(result['status'], 'passed')
        self.assertEqual(result['maxDeviationPercent'], 0)

    def test_changed_bytecode_invalidates_live_proof(self):
        self.live['runtimeBytecodeSha256'] = 'b' * 64
        self.write()
        self.assertEqual(live_summary(self.path, self.profile)['status'], 'stale')

    def test_excess_deviation_invalidates_live_proof(self):
        self.live['gas']['contiguous512'] = 1051
        self.write()
        self.assertEqual(live_summary(self.path, self.profile)['status'], 'stale')

    def test_unverified_or_reverted_receipts_are_not_certified(self):
        for field in ('receiptsVerified', 'bytecodeMatchesLocal'):
            with self.subTest(field=field):
                self.live[field] = False
                self.write()
                self.assertEqual(live_summary(self.path, self.profile)['status'], 'stale')
                self.live[field] = True
        self.live['transactions'][0]['status'] = 'reverted'
        self.write()
        self.assertEqual(live_summary(self.path, self.profile)['status'], 'stale')

    def test_malformed_evidence_is_not_certified(self):
        self.path.write_text('{broken')
        self.assertEqual(live_summary(self.path, self.profile)['status'], 'stale')


if __name__ == '__main__':
    unittest.main()
