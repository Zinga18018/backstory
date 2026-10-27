import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { captureActiveTab, isGitHubRepositoryPage, readSelectedContext } from '../extension/capture.js';
import { GITHUB_RESERVED_ROOTS } from '../extension/core/domain.js';

const readContext = () => readSelectedContext(GITHUB_RESERVED_ROOTS);

test('capture rejects non-GitHub and non-repository pages', () => {
  for (const url of ['chrome://extensions', 'https://example.com/a/b', 'http://github.com/a/b', 'https://github.com/a', 'https://github.com.evil.test/a/b', 'https://x@github.com/a/b', 'javascript:alert(1)', 'https://github.com:99/a/b', '', undefined]) {
    assert.equal(isGitHubRepositoryPage(url), false, String(url));
  }
  assert.equal(isGitHubRepositoryPage('https://github.com/a/b/blob/main/code.js#L4'), true);
});

test('reserved account/product routes fail before reading selections, including after serialization', () => {
  for (const root of [...GITHUB_RESERVED_ROOTS, 'SETTINGS', '%73ettings']) {
    const url = `https://github.com/${root}/tokens`;
    assert.equal(isGitHubRepositoryPage(url), false, url);
    assert.throws(() => vm.runInNewContext(`(${readSelectedContext.toString()})(roots)`, {
      URL, location: { href: url }, roots: GITHUB_RESERVED_ROOTS,
      window: { getSelection() { assert.fail('Do not inspect an account page'); } },
    }), /GitHub/);
  }
  const result = vm.runInNewContext(`(${readSelectedContext.toString()})(roots)`, {
    URL, location: { href: 'https://github.com/actions/checkout/blob/main/action.yml#L1' },
    roots: GITHUB_RESERVED_ROOTS, document: { title: 'Checkout' },
    window: { getSelection: () => ({ toString: () => 'selected code' }) },
  });
  assert.equal(result.snippet, 'selected code');
  assert.equal(isGitHubRepositoryPage('https://github.com/example/repo/settings'), true);
});

test('capture selection reads only selected text/title/link and makes truncation explicit', () => {
  globalThis.location = { href: 'https://github.com/a/b/blob/main/a.js?secret=not-kept#L4' };
  globalThis.window = { getSelection: () => ({ toString: () => 'x'.repeat(20001) }) };
  globalThis.document = { title: 'title'.repeat(50), get body() { throw Error('Must not read page body'); } };
  try {
    const result = readContext();
    assert.equal(result.snippet.length, 20000);
    assert.equal(result.title.length, 160);
    assert.equal(result.truncated, true);
    assert.equal(result.url, 'https://github.com/a/b/blob/main/a.js#L4');
    window.getSelection = () => ({ toString: () => 'x'.repeat(19999) + '🧪' });
    document.title = 'x'.repeat(159) + '🧪';
    assert.equal(readContext().snippet, 'x'.repeat(19999));
    assert.equal(readContext().title, 'x'.repeat(159));
    window.getSelection = () => null;
    assert.equal(readContext().snippet, '');
    location.href = 'https://example.com/a/b';
    assert.throws(readContext, /GitHub/);
  } finally { delete globalThis.location; delete globalThis.window; delete globalThis.document; }
});

test('active capture uses a single main-frame script only after checking the active URL', async () => {
  let injections = 0;
  const api = {
    tabs: { query: async query => { assert.deepEqual(query, { active: true, currentWindow: true }); return [{ id: 4, url: 'https://github.com/a/b' }]; } },
    scripting: { executeScript: async request => { injections++; assert.deepEqual(request.target, { tabId: 4 }); assert.equal(request.func, readSelectedContext); assert.deepEqual(request.args, [GITHUB_RESERVED_ROOTS]); return [{ result: { url: 'https://github.com/a/b', snippet: '', title: 'Repo' } }]; } },
  };
  assert.equal((await captureActiveTab(api)).title, 'Repo');
  assert.equal(injections, 1);
  api.tabs.query = async () => [{ id: 4, url: 'https://example.com/a/b' }];
  await assert.rejects(captureActiveTab(api), /repository page/);
  assert.equal(injections, 1);
  api.tabs.query = async () => [];
  await assert.rejects(captureActiveTab(api), /repository page/);
});

test('navigation, no result, and revoked permission are surfaced rather than saving empty context', async () => {
  const api = { tabs: { query: async () => [{ id: 4, url: 'https://github.com/a/b' }] }, scripting: { executeScript: async () => [] } };
  await assert.rejects(captureActiveTab(api), /page changed/);
  api.scripting.executeScript = async () => [{ result: { url: 'https://example.com/a/b' } }];
  await assert.rejects(captureActiveTab(api), /page changed/);
  api.scripting.executeScript = async () => { throw new Error('Permission revoked'); };
  await assert.rejects(captureActiveTab(api), /Permission revoked/);
});
