import test from 'node:test';
import assert from 'node:assert/strict';
import { createCard } from '../extension/core/domain.js';
import { createRepository } from '../extension/core/storage.js';

const sample = changes => ({ title: 'Queue retry', url: 'https://github.com/owner/repo#L1', ...changes });
function fakeStorage(initial = {}) {
  const data = structuredClone(initial);
  return {
    data, accessCalls: [], failSet: null,
    async get(key) { return structuredClone(key === null ? data : { [key]: data[key] }); },
    async set(values) { if (this.failSet) throw this.failSet; Object.assign(data, structuredClone(values)); },
    async remove(key) { delete data[key]; },
    async setAccessLevel(options) { this.accessCalls.push(options); },
  };
}
const expectCode = code => error => error.code === code;

test('CRUD stores individual records locally and requires the latest revision', async () => {
  const area = fakeStorage({ unrelated: { keep: true } });
  const repo = createRepository(area);
  assert.deepEqual(await repo.listCards(), []);
  const created = await repo.saveCard(sample());
  assert.equal(created.revision, 1);
  assert.deepEqual(await repo.getCard(created.id), created);
  assert.equal(Object.keys(area.data).filter(key => key.startsWith('backstory:card:')).length, 1);
  const changed = await repo.saveCard({ title: 'A better title' }, { id: created.id, expectedRevision: 1 });
  assert.equal(changed.revision, 2);
  await assert.rejects(repo.saveCard(sample(), { id: created.id, expectedRevision: 1 }), expectCode('CONFLICT'));
  await assert.rejects(repo.saveCard(sample(), { id: created.id }), expectCode('CONFLICT'));
  await assert.rejects(repo.deleteCard(created.id, { expectedRevision: 1 }), expectCode('CONFLICT'));
  assert.equal(await repo.deleteCard(created.id, { expectedRevision: 2 }), true);
  assert.equal(await repo.getCard(created.id), null);
  assert.equal(await repo.deleteCard(created.id, { expectedRevision: 2 }), false);
  assert.deepEqual(area.data.unrelated, { keep: true });
  assert.deepEqual(area.accessCalls, [{ accessLevel: 'TRUSTED_CONTEXTS' }]);
});

test('updates cannot resurrect a deleted record or treat a revision as a new card', async () => {
  const repo = createRepository(fakeStorage());
  await assert.rejects(repo.saveCard(sample(), { id: 'missing', expectedRevision: 1 }), expectCode('NOT_FOUND'));
  await assert.rejects(repo.saveCard(sample(), { expectedRevision: 1 }), expectCode('VALIDATION'));
  await assert.rejects(repo.getCard('../key'), expectCode('VALIDATION'));
});

test('separate repositories share the fallback test queue; simultaneous stale edits cannot overwrite', async () => {
  const area = fakeStorage();
  const first = createRepository(area);
  const second = createRepository(area);
  const card = await first.saveCard(sample());
  const attempts = await Promise.allSettled([
    first.saveCard({ title: 'First' }, { id: card.id, expectedRevision: 1 }),
    second.saveCard({ title: 'Second' }, { id: card.id, expectedRevision: 1 }),
  ]);
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(attempts.find(result => result.status === 'rejected').reason.code, 'CONFLICT');
  assert.equal((await first.getCard(card.id)).revision, 2);
  // A failed operation must not poison subsequent queued work.
  assert.equal((await first.saveCard(sample({ title: 'Another' }))).revision, 1);
});

test('browser lock manager is used for every operation with a shared exclusive lock name', async () => {
  const calls = [];
  const locks = { async request(name, options, action) { calls.push({ name, options }); return action(); } };
  const repo = createRepository(fakeStorage(), { locks });
  await repo.listCards();
  await repo.listCaptures();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].name, calls[1].name);
  assert.deepEqual(calls[0].options, { mode: 'exclusive' });
});

test('lock acquisition failures are actionable storage errors', async () => {
  const locks = { async request() { throw new Error('Lock manager unavailable'); } };
  const repo = createRepository(fakeStorage(), { locks });
  await assert.rejects(repo.listCards(), expectCode('STORAGE'));
});

test('list sorting is newest-first with a stable identifier tie-breaker', async () => {
  const make = (id, now) => createCard(sample(), { id, now });
  const area = fakeStorage({
    'backstory:card:z': make('z', '2026-01-01T00:00:00.000Z'),
    'backstory:card:b': make('b', '2026-10-01T00:00:00.000Z'),
    'backstory:card:a': make('a', '2026-10-01T00:00:00.000Z'),
  });
  assert.deepEqual((await createRepository(area).listCards()).map(card => card.id), ['a', 'b', 'z']);
});

test('quota failures are actionable and never replace the saved version', async () => {
  const area = fakeStorage();
  const repo = createRepository(area);
  const card = await repo.saveCard(sample());
  area.failSet = new Error('QUOTA_BYTES quota exceeded');
  await assert.rejects(repo.saveCard({ title: 'Not saved' }, { id: card.id, expectedRevision: 1 }), error =>
    error.code === 'QUOTA' && /Export/.test(error.message));
  assert.deepEqual(await repo.getCard(card.id), card);
  area.failSet = new Error('Unexpected storage failure');
  await assert.rejects(repo.saveCard(sample()), expectCode('STORAGE'));
});

test('invalid and mismatched records are surfaced, preserved, and never overwritten or deleted', async () => {
  const good = createCard(sample(), { id: 'good' });
  const area = fakeStorage({ 'backstory:card:good': { ...good, schemaVersion: 99 },
    'backstory:card:wrong': good });
  const repo = createRepository(area);
  const before = structuredClone(area.data);
  await assert.rejects(repo.listCards(), expectCode('INVALID_DATA'));
  await assert.rejects(repo.getCard('wrong'), expectCode('INVALID_DATA'));
  await assert.rejects(repo.saveCard(sample(), { id: 'good', expectedRevision: 1 }), expectCode('INVALID_DATA'));
  await assert.rejects(repo.deleteCard('good', { expectedRevision: 1 }), expectCode('INVALID_DATA'));
  assert.deepEqual(area.data, before);
});

test('malformed stored field types and null records are never repaired on read', async () => {
  for (const value of [null, [], 'not a card', { schemaVersion: 1 },
    { ...createCard(sample(), { id: 'broken' }), evidence: { unexpected: 'object' } }]) {
    const area = fakeStorage({ 'backstory:card:broken': value });
    const repo = createRepository(area);
    const before = structuredClone(area.data);
    await assert.rejects(repo.getCard('broken'));
    await assert.rejects(repo.listCards());
    await assert.rejects(repo.saveCard(sample(), { id: 'broken', expectedRevision: 1 }));
    await assert.rejects(repo.deleteCard('broken', { expectedRevision: 1 }));
    assert.deepEqual(area.data, before);
  }
});

test('independent writes preserve every new record instead of replacing a shared collection', async () => {
  const area = fakeStorage();
  const first = createRepository(area);
  const second = createRepository(area);
  const cards = await Promise.all(Array.from({ length: 20 }, (_, index) =>
    (index % 2 ? first : second).saveCard(sample({ title: `Card ${index}` }))));
  assert.equal(new Set(cards.map(card => card.id)).size, 20);
  assert.equal((await first.listCards()).length, 20);
});

test('captures preserve selection, remove query tokens, and can be recovered or discarded', async () => {
  const area = fakeStorage();
  const repo = createRepository(area);
  const capture = await repo.saveCapture({ title: 'Repo', url: 'https://github.com/a/b?token=secret#L1', snippet: '  code\n', truncated: true });
  assert.equal(capture.url, 'https://github.com/a/b#L1');
  assert.equal(capture.snippet, '  code\n');
  assert.equal(capture.truncated, true);
  assert.equal(capture.schemaVersion, 1);
  assert.deepEqual(await repo.getCapture(capture.id), capture);
  assert.deepEqual(await repo.listCaptures(), [capture]);
  assert.deepEqual(await repo.listCards(), []);
  assert.equal(await repo.deleteCapture(capture.id), true);
  assert.equal(await repo.deleteCapture(capture.id), false);
  assert.equal(await repo.getCapture(capture.id), null);
});

test('invalid captures cannot be written or quietly removed', async () => {
  const area = fakeStorage();
  const repo = createRepository(area);
  for (const patch of [{ url: '' }, { title: null }, { snippet: 42 }, { truncated: 'yes' }, { snippet: 'x'.repeat(20001) }]) {
    await assert.rejects(repo.saveCapture(sample(patch)), expectCode('VALIDATION'));
  }
  assert.deepEqual(area.data, {});
  area.data['backstory:capture:bad'] = { schemaVersion: 8 };
  await assert.rejects(repo.listCaptures(), expectCode('INVALID_DATA'));
  await assert.rejects(repo.deleteCapture('bad'), expectCode('INVALID_DATA'));
  assert.ok(area.data['backstory:capture:bad']);
});

test('missing or unsupported storage fails clearly', () => {
  assert.throws(() => createRepository(null), /installed extension/);
  assert.throws(() => createRepository({ get() {} }), /installed extension/);
});
