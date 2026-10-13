#!/usr/bin/env python3
"""Enforce ladder slots, packed struct sizes, and forbidden priority inputs."""
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / '.tools/foundry/bin/forge'
FORGE = str(LOCAL) if LOCAL.exists() else 'forge'
layout = json.loads(subprocess.run([FORGE, 'inspect', 'BatchAuction', 'storageLayout', '--json'],
                                  cwd=ROOT / 'contracts', text=True, capture_output=True, check=True).stdout)
by_label = {entry['label']: entry for entry in layout['storage']}
for label, slot in [('bidTicks', '0'), ('askTicks', '256'), ('meta', '512'), ('refTick', '513'), ('orders', '514')]:
    assert by_label[label]['slot'] == slot and by_label[label]['offset'] == 0, f'Incorrect layout: {label}'
for name, size in [('BatchMeta', '32'), ('Order', '64'), ('Result', '64')]:
    matches = [t for t in layout['types'].values() if t['label'] == f'struct AuctionTypes.{name}']
    assert len(matches) == 1 and matches[0]['numberOfBytes'] == size, f'Incorrect struct size: {name}'
(ROOT / 'contracts/bench/out/storage-layout.json').write_text(json.dumps(layout, indent=2) + '\n')
for source in (ROOT / 'contracts/src').rglob('*.sol'):
    text = source.read_text()
    assert not re.search(r'\b(?:tx\s*\.\s*gasprice|block\s*\.\s*coinbase|prevrandao|blockhash)\b', text), source

# Disassemble runtime code only; skip PUSH data and Solidity's CBOR metadata.
for name in ['BatchAuction', 'DemoToken', 'Faucet']:
    artifact = json.loads((ROOT / f'contracts/out/{name}.sol/{name}.json').read_text())
    code = bytes.fromhex(artifact['deployedBytecode']['object'].removeprefix('0x'))
    metadata_size = int.from_bytes(code[-2:], 'big')
    code = code[:-metadata_size - 2]
    i = 0
    while i < len(code):
        opcode = code[i]
        assert opcode not in (0x3a, 0x40, 0x41, 0x44), f'Forbidden opcode {opcode:#x} in {name}'
        i += 1 + (opcode - 0x5f if 0x60 <= opcode <= 0x7f else 0)
print('Layout verified: bids 0, asks 256, metadata 512, reference 513, orders 514; packed sizes 32/64/64.')
print('Priority inputs absent from production sources and runtime instructions.')
