import { BackstoryError, LIMITS, createCard, updateCard, validateCard, validateId, normalizeGitHubUrl } from './domain.js';

const CARD_PREFIX = 'backstory:card:';
const CAPTURE_PREFIX = 'backstory:capture:';
const LOCK_NAME = 'backstory:storage:v1';
const localQueues = new WeakMap();

function isMissing(value) { return value === undefined; }

function storageFailure(error) {
  if (error instanceof BackstoryError) return error;
  if (/quota|QUOTA_BYTES|exceeded/i.test(error?.message ?? '')) {
    return new BackstoryError('QUOTA', 'Local storage is full. Export your cards, then remove unneeded items and try again.', { cause: error });
  }
  return new BackstoryError('STORAGE', 'Backstory could not access local storage. Your unsaved changes are still on this page; try again.', { cause: error });
}

function validateCapture(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1) {
    throw new BackstoryError('INVALID_DATA', 'A saved capture has an unsupported or damaged data format.');
  }
  try {
    validateId(value.id);
    if (typeof value.title !== 'string' || value.title.length > LIMITS.title ||
        typeof value.snippet !== 'string' || value.snippet.length > LIMITS.snippet ||
        typeof value.truncated !== 'boolean' ||
        typeof value.capturedAt !== 'string' || new Date(value.capturedAt).toISOString() !== value.capturedAt ||
        normalizeGitHubUrl(value.url, { required: true }) !== value.url) throw new Error('Invalid capture');
  } catch (error) {
    throw new BackstoryError('INVALID_DATA', 'A saved capture is damaged. It has not been changed.', { cause: error });
  }
  return value;
}

function assertRevision(card, expectedRevision) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || card.revision !== expectedRevision) {
    throw new BackstoryError('CONFLICT', 'This card changed in another window. Reopen it before saving or deleting; keep a copy of your unsaved notes.');
  }
}

function sortNewest(items, dateField) {
  return items.sort((a, b) => b[dateField].localeCompare(a[dateField]) || a.id.localeCompare(b.id));
}

/**
 * The storage adapter is Chrome's promise-based storage.local API.
 * Web Locks serialize read/modify/write across extension pages. The fallback
 * queue exists for non-browser tests only; supported Chrome pages expose locks.
 */
export function createRepository(storageArea, { locks = globalThis.navigator?.locks } = {}) {
  if (!storageArea || !['get', 'set', 'remove'].every(method => typeof storageArea[method] === 'function')) {
    throw new BackstoryError('STORAGE', 'Chrome local storage is not available. Open Backstory as an installed extension.');
  }
  if (!locks?.request && typeof window !== 'undefined') {
    throw new BackstoryError('STORAGE', 'This browser does not support safe local editing. Use a current version of Chrome.');
  }
  let accessRestricted = false;

  async function run(action) {
    async function guarded() {
      try {
        if (!accessRestricted && typeof storageArea.setAccessLevel === 'function') {
          await storageArea.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
          accessRestricted = true;
        }
        return await action();
      } catch (error) { throw storageFailure(error); }
    }
    if (locks?.request) {
      try { return await locks.request(LOCK_NAME, { mode: 'exclusive' }, guarded); }
      catch (error) { throw storageFailure(error); }
    }
    const previous = localQueues.get(storageArea) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(guarded);
    localQueues.set(storageArea, next.catch(() => {}));
    return next;
  }

  async function readCard(id) {
    validateId(id);
    const key = CARD_PREFIX + id;
    const value = (await storageArea.get(key))[key];
    if (isMissing(value)) return null;
    validateCard(value);
    if (value.id !== id) throw new BackstoryError('INVALID_DATA', 'A saved card has a mismatched identifier. It has not been changed.');
    return value;
  }

  async function readCapture(id) {
    validateId(id);
    const key = CAPTURE_PREFIX + id;
    const value = (await storageArea.get(key))[key];
    if (isMissing(value)) return null;
    validateCapture(value);
    if (value.id !== id) throw new BackstoryError('INVALID_DATA', 'A saved capture has a mismatched identifier. It has not been changed.');
    return value;
  }

  return Object.freeze({
    listCards() {
      return run(async () => {
        const all = await storageArea.get(null);
        const cards = Object.entries(all).filter(([key]) => key.startsWith(CARD_PREFIX)).map(([key, value]) => {
          validateCard(value);
          if (key !== CARD_PREFIX + value.id) throw new BackstoryError('INVALID_DATA', 'A saved card has a mismatched identifier. It has not been changed.');
          return value;
        });
        return sortNewest(cards, 'updatedAt');
      });
    },
    getCard(id) { return run(() => readCard(id)); },
    saveCard(input, { id, expectedRevision } = {}) {
      return run(async () => {
        let card;
        if (id !== undefined) {
          const existing = await readCard(id);
          if (!existing) throw new BackstoryError('NOT_FOUND', 'This card was deleted in another window. Save your notes as a new card.');
          assertRevision(existing, expectedRevision);
          card = updateCard(existing, input);
        } else {
          if (expectedRevision !== undefined) throw new BackstoryError('VALIDATION', 'A new card cannot have an expected revision.');
          card = createCard(input);
          if (await readCard(card.id)) throw new BackstoryError('CONFLICT', 'Could not create a unique card. Please try again.');
        }
        await storageArea.set({ [CARD_PREFIX + card.id]: card });
        return card;
      });
    },
    deleteCard(id, { expectedRevision } = {}) {
      return run(async () => {
        const existing = await readCard(id);
        if (!existing) return false;
        assertRevision(existing, expectedRevision);
        await storageArea.remove(CARD_PREFIX + id);
        return true;
      });
    },
    saveCapture(input) {
      return run(async () => {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BackstoryError('VALIDATION', 'Capture must be an object.');
        for (const field of ['title', 'snippet']) {
          const value = input[field];
          if (value !== undefined && (typeof value !== 'string' || value.length > LIMITS[field])) {
            const label = field === 'title' ? 'Capture title' : 'Selected code';
            throw new BackstoryError('VALIDATION', `${label} must be plain text, up to ${LIMITS[field].toLocaleString('en-US')} characters long.`);
          }
        }
        if (input.truncated !== undefined && typeof input.truncated !== 'boolean') {
          throw new BackstoryError('VALIDATION', 'The capture truncation flag must be true or false.');
        }
        const capture = {
          schemaVersion: 1,
          id: crypto.randomUUID(),
          title: input.title === undefined ? '' : input.title,
          url: normalizeGitHubUrl(input.url, { required: true }),
          snippet: input.snippet === undefined ? '' : input.snippet,
          truncated: input.truncated === undefined ? false : input.truncated,
          capturedAt: new Date().toISOString(),
        };
        validateCapture(capture);
        if (await readCapture(capture.id)) throw new BackstoryError('CONFLICT', 'Could not create a unique capture. Please try again.');
        await storageArea.set({ [CAPTURE_PREFIX + capture.id]: capture });
        return capture;
      });
    },
    getCapture(id) { return run(() => readCapture(id)); },
    deleteCapture(id) {
      return run(async () => {
        const existing = await readCapture(id);
        if (!existing) return false;
        await storageArea.remove(CAPTURE_PREFIX + id);
        return true;
      });
    },
    listCaptures() {
      return run(async () => {
        const all = await storageArea.get(null);
        const captures = Object.entries(all).filter(([key]) => key.startsWith(CAPTURE_PREFIX)).map(([key, value]) => {
          validateCapture(value);
          if (key !== CAPTURE_PREFIX + value.id) throw new BackstoryError('INVALID_DATA', 'A saved capture has a mismatched identifier. It has not been changed.');
          return value;
        });
        return sortNewest(captures, 'capturedAt');
      });
    },
  });
}
