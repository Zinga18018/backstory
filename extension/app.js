import { assessCard, generateQuestions, exportJSON, exportMarkdown, FIELDS } from './core/domain.js';
import { createRepository } from './core/storage.js';

const repository = createRepository(chrome.storage.local);
const workspace = document.querySelector('#workspace');
const status = document.querySelector('#app-status');
const state = { cards: [], captures: [], selected: null, editing: false, dirty: false, busy: false, captureId: null };
const notes = {
  problem: ['Problem', 'What was broken, slow, confusing, or missing? Who did it affect?'],
  approach: ['Approach', 'What did you choose, why, and what alternatives did you consider?'],
  failure: ['What didn’t work', 'What failed or surprised you? What did you change? If nothing failed, say so honestly and note what remains untested.'],
  contribution: ['Your contribution', 'What did you personally design, implement, debug, or test? Distinguish your work from the team’s.'],
  evidence: ['Evidence and outcome', 'Point to a PR, test result, benchmark, or observable behavior. What supports the claim? If you have no measurement yet, say that.'],
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(text, className, action) {
  const node = element('button', className, text);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}
function announce(message, error = false) {
  status.textContent = message;
  status.classList.toggle('error', error);
}
function report(error) { announce(error.message || 'Something went wrong. Your current notes have not been discarded.', true); }
function readableDate(value) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}
function canLeave() {
  if (state.busy) return false;
  return !state.dirty || window.confirm('Discard your unsaved notes? Your last saved card or original capture will stay unchanged.');
}
function clearRoute() { history.replaceState(null, '', location.pathname); }
function focusWorkspace() { workspace.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); }

function renderList() {
  const query = document.querySelector('#search').value.trim().toLocaleLowerCase();
  const filter = document.querySelector('#filter').value;
  const matches = state.cards.filter(card => {
    const complete = assessCard(card).complete;
    const searchText = [card.title, card.url, card.snippet, ...FIELDS.map(field => card[field])].join(' ').toLocaleLowerCase();
    return searchText.includes(query) && (filter === 'all' || (filter === 'complete' ? complete : !complete));
  });
  const list = document.querySelector('#card-list');
  list.replaceChildren();
  for (const card of matches) {
    const complete = assessCard(card).complete;
    const item = button('', 'list-card', () => { if (canLeave()) showCard(card); });
    item.setAttribute('aria-current', String(state.selected?.id === card.id));
    item.append(element('span', 'list-title', card.title));
    item.append(element('span', 'list-meta', `${complete ? 'All fields filled' : 'Missing details'} · ${readableDate(card.updatedAt)}`));
    list.append(item);
  }
  if (!matches.length) list.append(element('p', 'list-empty', state.cards.length ? 'No cards match this search.' : 'No saved cards.'));
  document.querySelector('#total-count').textContent = state.cards.length;
  document.querySelector('#collection-summary').textContent = state.cards.length
    ? `${state.cards.length} saved ${state.cards.length === 1 ? 'card' : 'cards'}`
    : 'Evidence cards';
  document.querySelector('#export-json').disabled = !state.cards.length;
  document.querySelector('#export-markdown').disabled = !state.cards.length;
  document.querySelector('#captures-section').hidden = !state.captures.length;
  const captures = document.querySelector('#capture-list');
  captures.replaceChildren(...state.captures.map(capture => button(capture.title || 'Untitled GitHub capture', 'capture-button', () => {
    if (canLeave()) showEditor(capture, { captureId: capture.id });
  })));
}

async function refreshCollection() {
  const [cards, captures] = await Promise.all([repository.listCards(), repository.listCaptures()]);
  state.cards = cards;
  state.captures = captures;
  renderList();
}

function showEmpty() {
  state.selected = null;
  state.editing = false;
  state.dirty = false;
  state.captureId = null;
  clearRoute();
  workspace.replaceChildren(document.querySelector('#empty-template').content.cloneNode(true));
  workspace.querySelector('[data-action=new]').addEventListener('click', () => showEditor());
  renderList();
}

function showCard(card) {
  state.selected = card;
  state.editing = false;
  state.dirty = false;
  state.captureId = null;
  clearRoute();
  const layout = element('div', 'detail-layout');
  const main = element('article', 'detail-main');
  main.append(element('h1', 'detail-title', card.title));
  main.append(element('p', 'detail-meta', `Saved ${readableDate(card.createdAt)} · Updated ${readableDate(card.updatedAt)}`));
  const actions = element('div', 'detail-actions');
  actions.append(button('Edit', 'button primary small', () => showEditor(card)));
  actions.append(button('Delete', 'button danger small', () => deleteCard(card)));
  main.append(actions);
  if (card.url) {
    const link = element('a', 'source-link', card.url);
    link.href = card.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    main.append(link);
  } else main.append(element('p', 'source-missing', 'No GitHub link.'));
  if (card.snippet) {
    const code = element('details');
    code.append(element('summary', '', 'Code & context'));
    code.append(element('pre', '', card.snippet));
    main.append(code);
  }
  for (const field of FIELDS) {
    const section = element('section', 'story-section');
    section.append(element('h2', '', notes[field][0]));
    section.append(element('p', `story-text${card[field] ? '' : ' missing'}`, card[field] || 'Not added.'));
    main.append(section);
  }
  const side = element('aside', 'detail-side');
  const assessment = assessCard(card);
  const readiness = element('section', 'readiness-panel');
  readiness.append(element('h2', '', assessment.complete ? 'All fields filled' : `Missing details (${assessment.missing.length})`));
  readiness.append(element('p', '', assessment.complete ? 'All notes and the source link are present. Accuracy and ownership are not verified.' : 'These fields are empty. This check does not verify facts.'));
  if (assessment.missing.length) {
    const gaps = element('ul', 'gap-list');
    for (const gap of assessment.missing) {
      const item = element('li');
      item.append(element('strong', '', gap.label), element('span', '', gap.message));
      gaps.append(item);
    }
    readiness.append(gaps);
  }
  const practice = element('section', 'practice-panel');
  practice.append(element('h2', '', 'Practice questions'));
  practice.append(element('p', '', 'Use your notes to explain the decision and its evidence.'));
  const questions = element('ol', 'practice-list');
  generateQuestions(card).forEach(question => {
    const item = element('li');
    item.append(element('span', 'question-label', question.focus), element('span', '', question.question));
    questions.append(item);
  });
  practice.append(questions, element('p', 'practice-note', 'Fixed prompts, not AI. Be clear about uncertainty and team contributions.'));
  side.append(readiness, practice);
  layout.append(main, side);
  workspace.replaceChildren(layout);
  renderList();
  focusWorkspace();
}

function showEditor(card = {}, { captureId = null } = {}) {
  if (state.busy) return;
  state.selected = captureId ? null : card.id ? card : null;
  state.editing = true;
  state.dirty = false;
  state.captureId = captureId;
  workspace.replaceChildren(document.querySelector('#editor-template').content.cloneNode(true));
  workspace.querySelector('#editor-title').textContent = captureId ? 'Finish capture' : card.id ? 'Edit card' : 'New card';
  const form = workspace.querySelector('#card-form');
  const container = form.querySelector('.note-fields');
  FIELDS.forEach(field => {
    const wrapper = element('div', 'field');
    const label = element('label');
    label.htmlFor = field;
    label.textContent = notes[field][0];
    const input = element('textarea');
    input.id = field;
    input.name = field;
    input.rows = 3;
    input.maxLength = 8000;
    input.placeholder = notes[field][1];
    input.setAttribute('aria-describedby', `${field}-hint`);
    const hint = element('p', 'field-hint', 'Optional · 8,000 characters max');
    hint.id = `${field}-hint`;
    wrapper.append(label, input, hint);
    container.append(wrapper);
  });
  for (const field of ['title', 'url', 'snippet', ...FIELDS]) form.elements[field].value = card[field] || '';
  form.addEventListener('input', () => { state.dirty = true; });
  form.addEventListener('submit', saveEditor);
  form.querySelector('#cancel-edit').addEventListener('click', () => {
    if (!canLeave()) return;
    if (state.selected) showCard(state.selected);
    else showEmpty();
    announce(captureId ? 'Your original capture is still in Captures to finish. Unsaved notes were not kept.' : 'No changes saved.');
  });
  if (captureId) {
    form.querySelector('.editor-actions').append(button('Discard capture', 'button danger', async () => {
      if (state.busy || !window.confirm('Delete this unfinished capture and any unsaved notes? This cannot be undone.')) return;
      state.busy = true;
      try {
        await repository.deleteCapture(captureId);
        state.captures = state.captures.filter(item => item.id !== captureId);
        showEmpty();
        let warning = '';
        try { await refreshCollection(); } catch { warning = ' The collection could not refresh; reload to view other saved items.'; }
        announce(`Capture deleted from this device.${warning}`);
      } catch (error) { report(error); }
      finally { state.busy = false; }
    }));
    announce(card.truncated ? 'Capture saved locally. The selection was longer than 20,000 characters and was shortened. Review it before saving.' : 'Capture saved locally. Add your context below, then save the evidence card.');
  } else announce('');
  renderList();
  focusWorkspace();
  form.elements.title.focus({ preventScroll: true });
}

async function saveEditor(event) {
  event.preventDefault();
  if (state.busy) return;
  const form = event.currentTarget;
  const input = Object.fromEntries(new FormData(form));
  const existing = state.selected;
  const captureId = state.captureId;
  state.busy = true;
  form.querySelector('#editor-fields').disabled = true;
  form.querySelectorAll('button').forEach(node => { node.disabled = true; });
  try {
    const saved = await repository.saveCard(input, existing ? { id: existing.id, expectedRevision: existing.revision } : {});
    // The write is committed. Adopt its revision before any secondary read can fail.
    state.cards = [saved, ...state.cards.filter(card => card.id !== saved.id)];
    showCard(saved);
    let captureWarning = '';
    if (captureId) {
      try { await repository.deleteCapture(captureId); }
      catch { captureWarning = ' The original capture could not be removed; you can discard it from the sidebar.'; }
    }
    try { await refreshCollection(); }
    catch { captureWarning += ' Your card was saved, but the collection could not refresh. Reload to view other saved items.'; }
    announce(`Saved on this device.${captureWarning}`);
  } catch (error) { report(error); }
  finally {
    state.busy = false;
    if (form.isConnected) {
      form.querySelector('#editor-fields').disabled = false;
      form.querySelectorAll('button').forEach(node => { node.disabled = false; });
    }
  }
}

async function deleteCard(card) {
  if (state.busy || !window.confirm(`Delete “${card.title}” from this device? This cannot be undone. Export first if you need a backup.`)) return;
  state.busy = true;
  try {
    await repository.deleteCard(card.id, { expectedRevision: card.revision });
    state.cards = state.cards.filter(item => item.id !== card.id);
    if (state.cards.length) showCard(state.cards[0]);
    else showEmpty();
    let warning = '';
    try { await refreshCollection(); } catch { warning = ' The collection could not refresh; reload to view other saved items.'; }
    announce(`Card deleted from this device. Existing export files are not changed.${warning}`);
  } catch (error) { report(error); }
  finally { state.busy = false; }
}

async function download(format) {
  try {
    const cards = await repository.listCards();
    if (!cards.length) { announce('There are no saved cards to export yet.'); return; }
    const content = format === 'json' ? exportJSON(cards) : exportMarkdown(cards);
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = element('a');
    link.href = url;
    link.download = `backstory-${new Date().toISOString().slice(0, 10)}.${format === 'json' ? 'json' : 'md'}`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    announce('Export prepared for download. It contains plain-text code and notes; review it before sharing. Unfinished captures and unsaved notes are not included.');
  } catch (error) { report(error); }
}

document.querySelector('#new-card').addEventListener('click', () => { if (canLeave()) showEditor(); });
document.querySelector('#search').addEventListener('input', renderList);
document.querySelector('#filter').addEventListener('change', renderList);
document.querySelector('#export-json').addEventListener('click', () => download('json'));
document.querySelector('#export-markdown').addEventListener('click', () => download('markdown'));
const privacy = document.querySelector('#privacy-dialog');
document.querySelector('#privacy').addEventListener('click', () => privacy.showModal());
document.querySelector('#close-privacy').addEventListener('click', () => privacy.close());
window.addEventListener('beforeunload', event => {
  if (state.dirty || state.busy) { event.preventDefault(); event.returnValue = ''; }
});
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'local') refreshCollection().catch(report);
});

async function start() {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await refreshCollection();
  const captureId = new URLSearchParams(location.hash.slice(1)).get('capture');
  if (captureId) {
    const capture = await repository.getCapture(captureId);
    if (capture) { showEditor(capture, { captureId }); return; }
    announce('That capture is no longer available. Your saved cards are below.', true);
  }
  if (state.cards.length) showCard(state.cards[0]);
  else showEmpty();
}
start().catch(error => {
  workspace.replaceChildren(element('h1', '', 'Could not load cards'), element('p', 'editor-help', 'We could not safely read your local data. Nothing has been reset or overwritten. Try reloading the extension; keep a backup before uninstalling.'));
  report(error);
});
