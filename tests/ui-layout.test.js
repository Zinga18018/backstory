import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const read = file => readFileSync(join(root, file), 'utf8');
const html = read('extension/app.html');
const css = read('extension/styles.css');

test('utility layout retains the evidence workflow and clear field labels', () => {
  for (const id of ['new-card', 'search', 'filter', 'card-list', 'capture-list', 'export-json', 'export-markdown', 'privacy', 'workspace', 'card-form', 'title', 'url', 'snippet', 'save-card', 'cancel-edit']) {
    assert.equal([...html.matchAll(new RegExp(`id="${id}"`, 'g'))].length, 1, id);
  }
  for (const id of ['search', 'filter', 'title', 'url', 'snippet']) assert.ok(html.includes(`for="${id}"`), id);
  assert.match(html, /Changes are not saved until you click Save/);
  assert.match(html, /They do not verify facts, authorship, results, or links/);
  assert.match(html, /<h1>No evidence cards yet<\/h1>/);
  assert.doesNotMatch(html, /eyebrow|local-badge|empty-steps|notebook-icon/);
});

test('system typography, no motion, and visible keyboard focus are explicit', () => {
  assert.match(css, /font-family:\s*-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif/);
  assert.doesNotMatch(css, /@import|@font-face|Georgia|linear-gradient|box-shadow/);
  assert.doesNotMatch(css, /(?:^|[;{\n])\s*(?:animation|transition|scroll-behavior)\s*:/m);
  assert.match(css, /#workspace:focus-visible\s*\{\s*outline: 2px solid var\(--accent\)/);
  assert.match(css, /\.skip-link:focus\s*\{\s*top: 12px/);
  assert.doesNotMatch(css, /outline\s*:\s*(?:none|0)(?:[;\s}])/);
});

test('popup keeps explicit capture, local storage disclosure, and Gemini off', () => {
  const popup = read('extension/popup.html');
  assert.match(popup, /id="capture"[^>]*>Capture page<\/button>/);
  assert.match(popup, /id="open-workspace"[^>]*>Open cards<\/button>/);
  assert.match(popup, /Capture starts only when you click/);
  assert.match(popup, /Local storage · Gemini off/);
});

test('preview uses actual source unchanged, clearly labels test storage, and is not installable', () => {
  const temp = mkdtempSync(join(tmpdir(), 'backstory-preview-test-'));
  const output = join(temp, 'preview');
  try {
    const result = spawnSync('python3', ['scripts/build-ui-preview.py', '--output', output], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const dist = join(output, 'dist');
    for (const file of ['app.js', 'styles.css', 'core/domain.js', 'core/storage.js']) {
      assert.equal(readFileSync(join(dist, file), 'utf8'), read('extension/' + file), file);
    }
    const preview = readFileSync(join(dist, 'index.html'), 'utf8');
    assert.match(preview, /Browser preview · temporary test storage · not an installed extension/);
    assert.match(preview, /src="preview-adapter.js"/);
    assert.equal(existsSync(join(dist, 'manifest.json')), false);
    assert.doesNotMatch(html, /preview-adapter/);
    assert.doesNotMatch(read('extension/manifest.json'), /preview/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
