import { readFile, readdir, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const extension = join(root, 'extension');
const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'scripting', 'storage'].sort());
for (const key of ['host_permissions', 'content_scripts', 'background', 'externally_connectable', 'web_accessible_resources']) assert.equal(manifest[key], undefined, `${key} must stay absent`);
assert.match(manifest.content_security_policy.extension_pages, /connect-src 'none'/);
for (const file of [manifest.action.default_popup, manifest.options_page, ...Object.values(manifest.icons)]) await access(join(extension, file));
async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    result.push(...(entry.isDirectory() ? await files(path) : [path]));
  }
  return result;
}
for (const file of await files(extension)) {
  if (file.endsWith('.js')) {
    execFileSync(process.execPath, ['--check', file]);
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon)\s*\(/, `No network transport in ${file}`);
    assert.doesNotMatch(source, /\b(?:eval|Function)\s*\(/, `No dynamic code execution in ${file}`);
  }
  if (file.endsWith('.html')) {
    const html = await readFile(file, 'utf8');
    assert.doesNotMatch(html, /\son\w+\s*=/i, `No inline event handlers in ${file}`);
    assert.doesNotMatch(html, /<(?:script|link)[^>]+(?:src|href)=["']https?:/i, `No remote assets in ${file}`);
    for (const match of html.matchAll(/(?:src|href)="([^"#]+\.(?:css|js))"/g)) await access(join(extension, match[1]));
  }
}
console.log('PASS: MV3 permissions, local asset references, JavaScript syntax, CSP, and no-network runtime checks.');
