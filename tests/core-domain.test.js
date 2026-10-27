import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITS, FIELDS, BackstoryError, createCard, updateCard, validateCard,
  normalizeGitHubUrl, assessCard, generateQuestions, exportJSON, exportMarkdown,
  GITHUB_RESERVED_ROOTS,
} from '../extension/core/domain.js';

const NOW = '2026-10-27T10:00:00.000Z';
const input = (changes = {}) => ({ title: 'Fix the queue retry', url: 'https://github.com/example/queue/blob/main/retry.js#L4-L8', ...changes });
const card = (changes = {}) => createCard(input(changes), { id: 'card-one', now: NOW });

test('new cards have stable metadata, normalized prose, and exact selected code', () => {
  const result = card({ title: '  Queue retry  ', problem: '  Duplicate retries  ', snippet: '  if (done) return;\n' });
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.revision, 1);
  assert.equal(result.title, 'Queue retry');
  assert.equal(result.problem, 'Duplicate retries');
  assert.equal(result.snippet, '  if (done) return;\n');
  assert.equal(result.createdAt, NOW);
  assert.equal(result.updatedAt, NOW);
  assert.equal(result.evidence, '');
  assert.equal(validateCard(result), result);
});

test('only HTTPS github.com repository references are accepted; query tokens are removed', () => {
  assert.equal(normalizeGitHubUrl(' https://github.com/owner/repo/blob/main/file?token=secret#L2 '), 'https://github.com/owner/repo/blob/main/file#L2');
  assert.equal(normalizeGitHubUrl(''), '');
  for (const url of ['javascript:alert(1)', 'http://github.com/a/b', 'https://github.com.evil.test/a/b',
    'https://gist.github.com/a/b', 'https://github.com/', 'https://github.com/owner',
    'https://user:secret@github.com/a/b', 'https://github.com:8443/a/b',
    'https://github.com/a/b\n#L1', 'https://github.com\\@evil.test/a/b', 'not a url', null]) {
    assert.throws(() => normalizeGitHubUrl(url), BackstoryError, String(url));
  }
  assert.throws(() => normalizeGitHubUrl('', { required: true }), /GitHub/);
  assert.throws(() => normalizeGitHubUrl('https://github.com/a/' + 'é'.repeat(700)), /2,048/);
});

test('source links exclude GitHub account/product routes without claiming repository verification', () => {
  for (const root of [...GITHUB_RESERVED_ROOTS, 'SETTINGS', '%73ettings']) {
    assert.throws(() => normalizeGitHubUrl(`https://github.com/${root}/tokens`), /owner and repository/);
  }
  assert.throws(() => normalizeGitHubUrl('https://github.com/%ZZ/repo'), /valid GitHub/);
  assert.equal(normalizeGitHubUrl('https://github.com/actions/checkout'), 'https://github.com/actions/checkout');
  assert.equal(normalizeGitHubUrl('https://github.com/example/repo/settings'), 'https://github.com/example/repo/settings');
});

test('required title, wrong types, invalid IDs and length limits are rejected', () => {
  for (const title of ['', '   ', 4, null, {}, []]) assert.throws(() => card({ title }), BackstoryError);
  for (const field of Object.keys(LIMITS).filter(field => field !== 'url')) {
    assert.throws(() => card({ [field]: 'x'.repeat(LIMITS[field] + 1) }), /characters or fewer/);
    assert.throws(() => card({ [field]: {} }), /plain text/);
    assert.throws(() => card({ [field]: null }), /plain text/);
  }
  assert.throws(() => createCard(input(), { id: '../other' }), /identifier/);
  assert.throws(() => createCard(null), /object/);
  assert.throws(() => createCard(input(), { now: 'bad date' }), /date/);
  assert.equal(card({ evidence: 'x'.repeat(LIMITS.evidence) }).evidence.length, LIMITS.evidence);
});

test('Unicode limits match HTML maxlength and preserve complete supplementary characters', () => {
  const title = '🧵'.repeat(LIMITS.title / 2);
  const snippet = '🚀'.repeat(LIMITS.snippet / 2);
  const source = card({ title, snippet });
  assert.equal(source.title, title);
  assert.equal(source.snippet, snippet);
  assert.throws(() => card({ title: title + 'a' }), /characters or fewer/);
  assert.throws(() => card({ snippet: snippet + 'a' }), /characters or fewer/);
  assert.equal(JSON.parse(exportJSON([source])).cards[0].snippet, snippet);
  assert.ok(exportMarkdown([source]).includes(snippet));
});

test('partial updates preserve identity and increment revisions without trusting input metadata', () => {
  const original = card({ problem: 'A race' });
  const changed = updateCard(original, { problem: 'A retry race', id: 'fake', createdAt: 'fake', revision: 50 }, { now: '2026-10-28T10:00:00.000Z' });
  assert.equal(changed.id, original.id);
  assert.equal(changed.createdAt, original.createdAt);
  assert.equal(changed.revision, 2);
  assert.equal(changed.title, original.title);
  assert.equal(changed.problem, 'A retry race');
  assert.equal(original.problem, 'A race');
  assert.equal(changed.updatedAt, '2026-10-28T10:00:00.000Z');
  assert.equal(updateCard(changed, {}, { now: NOW }).updatedAt, changed.updatedAt);
});

test('damaged and future records fail validation rather than being silently rewritten', () => {
  for (const patch of [{ schemaVersion: 2 }, { revision: 0 }, { revision: 1.5 }, { snippet: null },
    { updatedAt: 'not a date' }, { createdAt: '2026-10-28T10:00:00.000Z' },
    { title: '  unnormalized  ' }, { url: 'https://github.com/a/b?secret=x' }, { id: 'bad:id' }]) {
    assert.throws(() => validateCard({ ...card(), ...patch }), error => error.code === 'INVALID_DATA');
  }
  assert.throws(() => updateCard({ ...card(), revision: Number.MAX_SAFE_INTEGER }, {}), /revision limit/);
});

test('completeness flags missing notes and source, never claims factual verification', () => {
  const empty = card({ url: '' });
  assert.deepEqual(assessCard(empty).missing.map(item => item.field), ['url', ...FIELDS]);
  assert.equal(assessCard(empty).complete, false);
  const full = card(Object.fromEntries(FIELDS.map(field => [field, 'A self-reported note'])));
  assert.deepEqual(assessCard(full), { missing: [], complete: true });
  assert.equal(full.snippet, ''); // Code selection is optional, including for issue/PR references.
});

test('practice questions are deterministic, evidence-aware, and do not invent answers', () => {
  const empty = card();
  const questions = generateQuestions(empty);
  assert.deepEqual(generateQuestions(empty), questions);
  assert.equal(new Set(questions.map(item => item.id)).size, questions.length);
  assert.equal(questions.length, 7);
  assert.ok(questions.every(item => typeof item.focus === 'string' && item.question.endsWith('?')));
  assert.match(questions.find(item => item.id === 'evidence').question, /could support/);
  assert.match(generateQuestions(card({ evidence: 'CI run 42 passed', snippet: 'return 1;' })).find(item => item.id === 'evidence').question, /does it not establish/);
  assert.equal(generateQuestions(card({ snippet: 'return 1;' })).find(item => item.id === 'code').focus, 'snippet');
});

test('JSON export round trips unicode, newlines and code without adding untrusted properties', () => {
  const source = card({ title: 'Queue → retry 🧵', snippet: '\nconst html = "<script>";\n', evidence: '“Measured”\nTwo lines' });
  const output = JSON.parse(exportJSON([{ ...source, secret: 'not exported' }], { now: NOW }));
  assert.equal(output.schemaVersion, 1);
  assert.equal(output.exportedAt, NOW);
  assert.deepEqual(output.cards, [source]);
  assert.deepEqual(JSON.parse(exportJSON([], { now: NOW })).cards, []);
  assert.throws(() => exportJSON('no'), /list/);
});

test('Markdown export escapes user prose and uses a fence longer than any embedded fence', () => {
  const source = card({ title: '# Fake heading [click](javascript:alert(1))',
    problem: '<img src=x onerror=alert(1)>\n# Heading\n[link](https://evil.test)',
    snippet: '```\n<script>alert(1)</script>\n````\n' });
  const output = exportMarkdown([source]);
  assert.ok(!output.includes('<img'));
  assert.ok(output.includes('&lt;img'));
  assert.ok(output.includes('\\# Heading'));
  assert.ok(output.includes('\\[link\\]'));
  assert.ok(output.includes('`````text\n```\n<script>'));
  assert.ok(output.includes('Completeness is not factual verification'));
  assert.ok(output.includes(`<${source.url}>`));
  assert.ok(exportMarkdown([]).startsWith('# Backstory evidence cards'));
});
