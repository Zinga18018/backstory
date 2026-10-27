#!/usr/bin/env python3
"""Copy the actual UI to an isolated, explicitly labeled browser preview.

This does not create an image or reproduce the UI with drawing commands.
Use a real browser screenshot after reviewing the resulting pages.
"""
import argparse
import json
from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, required=True, help='New preview checkout outside the extension directory')
args = parser.parse_args()
output = args.output.resolve()
if output == root or root in output.parents:
    raise SystemExit('Preview output must be outside the source repository.')
if output.exists():
    raise SystemExit('Choose a new output directory; this script will not overwrite a checkout.')

dist = output / 'dist'
shutil.copytree(root / 'extension', dist)
# The preview is not installable: no manifest or accidental real extension runtime.
(dist / 'manifest.json').unlink()
shutil.copyfile(root / 'scripts/preview/chrome-adapter.js', dist / 'preview-adapter.js')
label = '<aside class="preview-notice">Browser preview · temporary test storage · not an installed extension</aside>'
preview_css = '''
.preview-notice { grid-column: 1 / -1; padding: 7px 16px; border-bottom: 1px solid #dadce0; background: #fff8e1; color: #5d4700; font: 11px/1.4 system-ui, sans-serif; }
.workspace-body { grid-template-rows: auto 1fr; }
.sidebar { height: calc(100vh - 30px); top: 30px; }
.popup-body .preview-notice { margin: -16px -16px 14px; }
@media (max-width: 720px) { .sidebar { height: auto; top: 0; } }
'''
(dist / 'preview.css').write_text(preview_css)
for name in ['app.html', 'popup.html']:
    path = dist / name
    html = path.read_text()
    html = html.replace('<link rel="stylesheet" href="styles.css">', '<link rel="stylesheet" href="styles.css">\n  <link rel="stylesheet" href="preview.css">\n  <script src="preview-adapter.js"></script>')
    html = html.replace('<body class="workspace-body">', '<body class="workspace-body">\n  ' + label)
    html = html.replace('<body class="popup-body">', '<body class="popup-body">\n  ' + label)
    path.write_text(html)
shutil.copyfile(dist / 'app.html', dist / 'index.html')
(output / '.openai').mkdir()
(output / '.openai/hosting.json').write_text(json.dumps({'static': {'directory': 'dist'}}, indent=2) + '\n')
print(output)
print('This is a rendering preview with in-memory test storage, not extension-runtime QA.')
