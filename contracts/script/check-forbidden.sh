#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
pattern='tx[[:space:]]*\.[[:space:]]*gasprice|block[[:space:]]*\.[[:space:]]*coinbase|prevrandao|blockhash'
status=0
if command -v rg >/dev/null 2>&1; then
  rg -n "$pattern" src || status=$?
else
  grep -REn "$pattern" src || status=$?
fi
# 0 means a match; 1 means no matches; every other status is a failed search.
if [ "$status" -ne 1 ]; then exit 1; fi
printf '%s\n' 'Forbidden priority and entropy inputs absent from src/.'
