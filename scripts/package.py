#!/usr/bin/env python3
"""Build a source ZIP using explicit inclusion rules; never include secrets or profiles."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
out = root / 'dist' / 'Backstory-MVP-0.1.0.zip'
out.parent.mkdir(exist_ok=True)
files = [root / p for p in ['README.md', 'package.json', '.gitignore']]
for directory in ['.github', 'extension', 'tests', 'scripts', 'docs', 'optional-server']:
    files.extend(p for p in (root / directory).rglob('*') if p.is_file())
files = sorted(p for p in files if '__pycache__' not in p.parts and (not p.name.startswith('.env') or p.name == '.env.example'))
with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for path in files:
        archive.write(path, Path('backstory') / path.relative_to(root))
with zipfile.ZipFile(out) as archive:
    assert archive.testzip() is None
    manifest = json.loads(archive.read('backstory/extension/manifest.json'))
    assert manifest['name'] == 'Backstory'
    assert not any('/artifacts/' in n or '/node_modules/' in n or n.endswith('/.env') for n in archive.namelist())
print(f'{out}\n{out.stat().st_size} bytes\nSHA-256 {hashlib.sha256(out.read_bytes()).hexdigest()}\n{len(files)} files; ZIP integrity verified')
