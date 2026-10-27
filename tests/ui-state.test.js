import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createRepository } from '../extension/core/storage.js';

// Exercise the actual controller functions with storage and UI boundaries
// isolated. These are orchestration regressions, not a substitute for browser QA.
const source = await readFile(new URL('../extension/app.js', import.meta.url), 'utf8');
function functionSource(start, next) {
  const from = source.indexOf(start);
  const to = source.indexOf(next, from);
  assert.ok(from >= 0 && to > from, `Controller function not found: ${start}`);
  return source.slice(from, to);
}

function harness() {
  const data = {};
  const area = {
    async get(key) { return structuredClone(key === null ? data : { [key]: data[key] }); },
    async set(value) { Object.assign(data, structuredClone(value)); },
    async remove(key) { delete data[key]; },
  };
  const repository = createRepository(area);
  const state = { cards: [], captures: [], selected: null, editing: true, dirty: true, busy: false, captureId: null };
  const fields = { disabled: false };
  const buttons = [{ disabled: false }, { disabled: false }];
  const form = {
    values: { title: 'A real decision', url: 'https://github.com/example/repo' },
    isConnected: true,
    querySelector: () => fields,
    querySelectorAll: () => buttons,
  };
  const messages = [];
  const errors = [];
  const context = vm.createContext({
    state, repository,
    window: { confirm: () => true },
    FormData: class {
      constructor(value) { this.value = value; }
      *[Symbol.iterator]() { yield* Object.entries(this.value.values); }
    },
    refreshCollection: async () => { state.cards = await repository.listCards(); },
    showCard(card) {
      state.selected = card;
      state.editing = false;
      state.dirty = false;
      state.captureId = null;
      form.isConnected = false;
    },
    showEmpty() {
      state.selected = null;
      state.editing = false;
      state.dirty = false;
      state.captureId = null;
      form.isConnected = false;
    },
    announce: message => messages.push(message),
    report: error => errors.push(error),
  });
  vm.runInContext(functionSource('async function saveEditor(', 'async function deleteCard(') +
    functionSource('async function deleteCard(', 'async function download(') +
    functionSource('function showEditor(', 'async function saveEditor('), context);
  const event = { preventDefault() {}, currentTarget: form };
  return { context, repository, state, form, fields, buttons, messages, errors, event };
}

test('committed save remains successful when a later collection read fails', async () => {
  const h = harness();
  h.context.refreshCollection = async () => { throw new Error('Unrelated damaged record'); };
  await h.context.saveEditor(h.event);
  assert.equal(h.errors.length, 0);
  assert.equal(h.state.selected.revision, 1);
  assert.equal(h.state.cards.length, 1);
  assert.equal(h.state.dirty, false);
  assert.equal(h.state.busy, false);
  assert.equal(h.form.isConnected, false);
  assert.match(h.messages.at(-1), /saved.*could not refresh/i);

  // Reopening the editor retains the committed identity/revision, so the next
  // save updates it rather than duplicating a new card or conflicting with itself.
  h.state.editing = h.state.dirty = h.form.isConnected = true;
  h.form.values.title = 'A refined decision';
  await h.context.saveEditor(h.event);
  const cards = await h.repository.listCards();
  assert.equal(cards.length, 1);
  assert.equal(cards[0].revision, 2);
  assert.equal(cards[0].title, 'A refined decision');
  assert.equal(h.errors.length, 0);
});

test('failed writes preserve unsaved notes and re-enable the form', async () => {
  const h = harness();
  h.context.repository = { saveCard: async () => { throw new Error('Quota exceeded'); } };
  await h.context.saveEditor(h.event);
  assert.equal(h.state.selected, null);
  assert.equal(h.state.dirty, true);
  assert.equal(h.state.busy, false);
  assert.equal(h.form.isConnected, true);
  assert.equal(h.fields.disabled, false);
  assert.ok(h.buttons.every(button => !button.disabled));
  assert.equal(h.form.values.title, 'A real decision');
  assert.equal(h.errors.length, 1);
  assert.deepEqual(await h.repository.listCards(), []);
});

test('capture cleanup failure cannot turn a committed card into an unsaved form', async () => {
  const h = harness();
  h.state.captureId = 'capture-one';
  h.context.repository = {
    saveCard: (...args) => h.repository.saveCard(...args),
    deleteCapture: async () => { throw new Error('Storage temporarily unavailable'); },
  };
  await h.context.saveEditor(h.event);
  assert.equal((await h.repository.listCards()).length, 1);
  assert.equal(h.state.selected.revision, 1);
  assert.equal(h.state.dirty, false);
  assert.equal(h.errors.length, 0);
  assert.match(h.messages.at(-1), /original capture could not be removed/);
});

test('delete blocks editor navigation while pending and adopts removal before refresh', async () => {
  const h = harness();
  const card = await h.repository.saveCard(h.form.values);
  h.state.cards = [card];
  h.state.selected = card;
  h.state.editing = false;
  h.state.dirty = false;
  let finishDelete;
  const pendingDelete = new Promise(resolve => { finishDelete = resolve; });
  h.context.repository = {
    deleteCard: async (...args) => { await pendingDelete; return h.repository.deleteCard(...args); },
  };
  h.context.refreshCollection = async () => { throw new Error('Read failed after delete'); };
  const deletion = h.context.deleteCard(card);
  assert.equal(h.state.busy, true);
  // With the guard removed, actual showEditor mutates state and attempts DOM
  // work here. No DOM mock is supplied because navigation must not happen.
  h.context.showEditor(card);
  assert.equal(h.state.editing, false);
  assert.equal(h.state.selected, card);
  finishDelete();
  await deletion;
  assert.equal(h.state.selected, null);
  assert.equal(h.state.cards.length, 0);
  assert.equal(h.state.busy, false);
  assert.equal(h.errors.length, 0);
  assert.match(h.messages.at(-1), /deleted.*could not refresh/);
  assert.deepEqual(await h.repository.listCards(), []);
});

test('discarded capture stays removed when the subsequent collection refresh fails', async () => {
  const h = harness();
  const capture = await h.repository.saveCapture({ title: 'Captured context', url: 'https://github.com/example/repo' });
  h.state.captures = [capture];
  h.state.captureId = capture.id;
  h.context.captureId = capture.id;
  h.context.refreshCollection = async () => { throw new Error('Read failed after discard'); };
  const start = source.indexOf('async () => {', source.indexOf("button('Discard capture'"));
  const end = source.indexOf('\n    }));', start);
  assert.ok(start >= 0 && end > start, 'Discard controller callback not found');
  vm.runInContext('globalThis.discardCapture = ' + source.slice(start, end) + '\n};', h.context);
  await h.context.discardCapture();
  assert.equal(h.state.captures.length, 0);
  assert.equal(h.state.captureId, null);
  assert.equal(h.state.dirty, false);
  assert.equal(h.state.busy, false);
  assert.equal(h.errors.length, 0);
  assert.match(h.messages.at(-1), /Capture deleted.*could not refresh/);
  assert.deepEqual(await h.repository.listCaptures(), []);
});
