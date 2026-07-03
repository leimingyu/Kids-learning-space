#!/usr/bin/env python3
"""
Smoke test for tools/kls_server.py file logic (no network, no browser).
Run:  python3 tools/test_kls_server.py
Imports the server module (which only defines things at import time) and points
its SAVES_DIR at a temp folder to exercise history counting + pruning.
"""
import os
import sys
import tempfile
import importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('kls_server', os.path.join(HERE, 'kls_server.py'))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

tmp = tempfile.mkdtemp(prefix='kls-test-')
mod.SAVES_DIR = tmp

# Seed 32 valid history files (distinct timestamps) ...
for i in range(32):
    with open(os.path.join(tmp, 'kls-save-20260101-%06d.json' % i), 'w') as fh:
        fh.write('{}')
# ... plus non-matching files that must be ignored by count/prune.
with open(os.path.join(tmp, 'kls-backup-latest.json'), 'w') as fh:
    fh.write('{}')
with open(os.path.join(tmp, 'notes.txt'), 'w') as fh:
    fh.write('x')

assert mod._history_count() == 32, mod._history_count()

remaining = mod._prune_history()
assert remaining == 30, remaining

names = sorted(f for f in os.listdir(tmp) if f.startswith('kls-save-'))
assert len(names) == 30, len(names)
assert names[0] == 'kls-save-20260101-000002.json', names[0]  # the 2 oldest removed

# Non-history files untouched.
assert os.path.exists(os.path.join(tmp, 'kls-backup-latest.json'))
assert os.path.exists(os.path.join(tmp, 'notes.txt'))

# Under the cap → nothing pruned.
tmp2 = tempfile.mkdtemp(prefix='kls-test-')
mod.SAVES_DIR = tmp2
with open(os.path.join(tmp2, 'kls-save-20260101-000000.json'), 'w') as fh:
    fh.write('{}')
assert mod._prune_history() == 1

print('test_kls_server: OK')
