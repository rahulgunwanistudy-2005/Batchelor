#!/usr/bin/env python3
"""Validate the actual CSS palette for normal text in both themes."""
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
css = (ROOT / 'apps/web/src/app.css').read_text()
sections = [css.split('@media')[0], css.split('@media (prefers-color-scheme: dark)')[1].split('* {')[0]]


def luminance(color):
    channels = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return sum(weight * (value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4)
               for weight, value in zip((.2126, .7152, .0722), channels))


result = {}
for theme, section in zip(('light', 'dark'), sections):
    colors = dict(re.findall(r'--(\w+):\s*(#[0-9a-fA-F]{6})', section))
    scores = {}
    for foreground in ('ink', 'muted', 'bid', 'ask', 'clear'):
        for background in ('paper', 'surface'):
            low, high = sorted((luminance(colors[foreground]), luminance(colors[background])))
            ratio = (high + .05) / (low + .05)
            assert ratio >= 4.5, (theme, foreground, background, ratio)
            scores[f'{foreground} on {background}'] = round(ratio, 3)
    result[theme] = scores
out = ROOT / 'docs/screens/contrast.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(result, indent=2) + '\n')
print('All text colors pass WCAG AA on both theme backgrounds.')
