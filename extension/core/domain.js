/** Pure evidence-card rules. Nothing in this module reads the browser or network. */
// Limits use UTF-16 code units, matching HTML input/textarea maxlength.
// A supplementary character (for example, most emoji) uses two code units.
export const LIMITS = Object.freeze({
  title: 160,
  url: 2048,
  snippet: 20000,
  problem: 8000,
  approach: 8000,
  failure: 8000,
  contribution: 8000,
  evidence: 8000,
});

export const FIELDS = Object.freeze(['problem', 'approach', 'failure', 'contribution', 'evidence']);

// GitHub's account/product routes are not owner/repository references. This is
// a conservative local guard, not an online check that a repository exists.
export const GITHUB_RESERVED_ROOTS = Object.freeze([
  'about', 'account', 'apps', 'business', 'codespaces', 'collections', 'contact',
  'copilot', 'customer-stories', 'discussions', 'enterprise', 'enterprises',
  'events', 'explore', 'features', 'issues', 'join', 'login', 'logout',
  'marketplace', 'new', 'notifications', 'orgs', 'organizations', 'pricing',
  'pulls', 'readme', 'search', 'security', 'sessions', 'settings', 'signup',
  'site', 'sponsors', 'topics', 'trending', 'users',
]);

const CONTENT_FIELDS = ['title', 'url', 'snippet', ...FIELDS];
const LABELS = {
  title: 'Title', url: 'Source URL', snippet: 'Selected code', problem: 'Problem',
  approach: 'Approach', failure: 'Failed attempt or learning',
  contribution: 'Personal contribution', evidence: 'Evidence and outcome',
};

export class BackstoryError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'BackstoryError';
    this.code = code;
  }
}

function record(value, label = 'Card') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BackstoryError('VALIDATION', `${label} must be an object.`);
  }
}

function textField(input, field, { required = false, preserve = false } = {}) {
  const value = input[field] === undefined ? '' : input[field];
  if (typeof value !== 'string') {
    throw new BackstoryError('VALIDATION', `${LABELS[field]} must be plain text.`);
  }
  const text = preserve ? value : value.trim();
  if (required && !text) throw new BackstoryError('VALIDATION', `${LABELS[field]} is required.`);
  if (text.length > LIMITS[field]) {
    throw new BackstoryError('VALIDATION', `${LABELS[field]} must be ${LIMITS[field].toLocaleString('en-US')} characters or fewer.`);
  }
  return text;
}

/** A source link is a reference, not proof that the repository or claim exists. */
export function normalizeGitHubUrl(value, { required = false } = {}) {
  if (typeof value !== 'string') throw new BackstoryError('VALIDATION', 'Source URL must be plain text.');
  const raw = value.trim();
  if (!raw && !required) return '';
  if (!raw || raw.length > LIMITS.url || /[\u0000-\u0020\u007f\\]/u.test(raw)) {
    throw new BackstoryError('VALIDATION', 'Use a GitHub repository URL, up to 2,048 characters long.');
  }
  let url;
  try { url = new URL(raw); } catch {
    throw new BackstoryError('VALIDATION', 'Use an HTTPS GitHub repository URL.');
  }
  const parts = url.pathname.split('/').filter(Boolean);
  let owner;
  try { owner = decodeURIComponent(parts[0] || '').toLowerCase(); }
  catch { throw new BackstoryError('VALIDATION', 'Use a valid GitHub repository URL.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port ||
      url.username || url.password || parts.length < 2 || GITHUB_RESERVED_ROOTS.includes(owner)) {
    throw new BackstoryError('VALIDATION', 'Use an HTTPS URL on github.com with an owner and repository.');
  }
  // Query parameters are not needed for an evidence reference and may contain tokens.
  url.search = '';
  if (url.href.length > LIMITS.url) throw new BackstoryError('VALIDATION', 'Source URL must be 2,048 characters or fewer.');
  return url.href;
}

export function validateId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/u.test(value)) {
    throw new BackstoryError('VALIDATION', 'This item has an invalid identifier.');
  }
  return value;
}

function timestamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new BackstoryError('VALIDATION', 'The date is invalid.');
  return date.toISOString();
}

function content(input) {
  record(input);
  return {
    title: textField(input, 'title', { required: true }),
    url: normalizeGitHubUrl(textField(input, 'url')),
    snippet: textField(input, 'snippet', { preserve: true }),
    ...Object.fromEntries(FIELDS.map(field => [field, textField(input, field)])),
  };
}

export function createCard(input, { id = crypto.randomUUID(), now } = {}) {
  const date = timestamp(now);
  return {
    schemaVersion: 1,
    id: validateId(id),
    ...content(input),
    createdAt: date,
    updatedAt: date,
    revision: 1,
  };
}

/** Reject damaged or future-version records; never silently repair or overwrite them. */
export function validateCard(value) {
  record(value);
  if (value.schemaVersion !== 1) throw new BackstoryError('INVALID_DATA', 'This card uses an unsupported data version.');
  try {
    validateId(value.id);
    for (const field of CONTENT_FIELDS) {
      if (typeof value[field] !== 'string') throw new Error('Missing text field');
    }
    const normalized = content(value);
    for (const field of CONTENT_FIELDS) {
      if (normalized[field] !== value[field]) throw new Error('Unnormalized text field');
    }
    if (!Number.isSafeInteger(value.revision) || value.revision < 1 ||
        typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string' ||
        timestamp(value.createdAt) !== value.createdAt || timestamp(value.updatedAt) !== value.updatedAt ||
        value.updatedAt < value.createdAt) throw new Error('Invalid record metadata');
  } catch (error) {
    throw new BackstoryError('INVALID_DATA', 'A saved card is damaged. It has not been changed; use Chrome extension storage tools to recover the record.', { cause: error });
  }
  return value;
}

export function updateCard(existing, input, { now } = {}) {
  validateCard(existing);
  record(input);
  if (existing.revision === Number.MAX_SAFE_INTEGER) {
    throw new BackstoryError('INVALID_DATA', 'This card has reached its revision limit. Export it before making a new card.');
  }
  // Patches are allowed, but identity and timestamps can never be patched by form input.
  const merged = Object.fromEntries(CONTENT_FIELDS.map(field => [field,
    Object.hasOwn(input, field) ? input[field] : existing[field],
  ]));
  return {
    schemaVersion: 1,
    id: existing.id,
    ...content(merged),
    createdAt: existing.createdAt,
    // Clock adjustments must not make an edited card appear older than its original.
    updatedAt: [timestamp(now), existing.updatedAt].sort().at(-1),
    revision: existing.revision + 1,
  };
}

export function assessCard(card) {
  validateCard(card);
  const prompts = {
    url: 'Add a GitHub source link that helps you revisit the work.',
    problem: 'Describe the problem, who it affected, and the constraints.',
    approach: 'Explain your approach and the alternative you considered.',
    failure: 'Record an attempt that failed or a limitation you learned from.',
    contribution: 'Separate what you personally did from the team’s work.',
    evidence: 'Add an observable result, test, PR, or other support for your claim.',
  };
  const missing = ['url', ...FIELDS].filter(field => !card[field].trim())
    .map(field => ({ field, label: LABELS[field], message: prompts[field] }));
  return { missing, complete: missing.length === 0 };
}

/** Templates intentionally produce questions, not invented accomplishments or fact checks. */
export function generateQuestions(card) {
  validateCard(card);
  const topic = `“${card.title}”`;
  return [
    { id: 'problem', focus: 'problem', question: `For ${topic}, what problem were you solving, and what constraints mattered most?` },
    { id: 'approach', focus: 'approach', question: `Walk me through your approach to ${topic}. What alternative did you reject, and why?` },
    { id: 'failure', focus: 'failure', question: card.failure
      ? `What did your failed attempt or learning in ${topic} change about your next decision?`
      : `What did not work in ${topic}, or what limitation would you investigate next?` },
    { id: 'contribution', focus: 'contribution', question: `What did you personally design, implement, or debug in ${topic}, and what did others contribute?` },
    { id: 'evidence', focus: 'evidence', question: card.evidence
      ? `Which evidence supports the outcome you describe for ${topic}? What does it not establish?`
      : `What test, PR, measurement, or other evidence could support your account of ${topic}?` },
    { id: 'code', focus: card.snippet.trim() ? 'snippet' : 'approach', question: card.snippet.trim()
      ? `Explain the captured code for ${topic}. Which edge case or trade-off should an interviewer notice?`
      : `Which implementation detail from ${topic} would you explain on a whiteboard, and why?` },
    { id: 'reflection', focus: 'approach', question: `If you revisited ${topic} today, what would you keep and what would you change?` },
  ];
}

function exportCards(cards) {
  if (!Array.isArray(cards)) throw new BackstoryError('VALIDATION', 'Choose a list of cards to export.');
  return cards.map(card => {
    validateCard(card);
    return Object.fromEntries(['schemaVersion', 'id', ...CONTENT_FIELDS, 'createdAt', 'updatedAt', 'revision']
      .map(field => [field, card[field]]));
  });
}

export function exportJSON(cards, { now } = {}) {
  return JSON.stringify({ schemaVersion: 1, exportedAt: timestamp(now), cards: exportCards(cards) }, null, 2) + '\n';
}

function markdownText(value) {
  // Treat all user content as prose, including HTML, links, headings and list syntax.
  return value.replace(/[&<>]/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]))
    .replace(/([\\`*_{}\[\]()#+.!|~-])/gu, '\\$1');
}

function codeFence(value) {
  const longestRun = Math.max(0, ...Array.from(value.matchAll(/`+/gu), match => match[0].length));
  const fence = '`'.repeat(Math.max(3, longestRun + 1));
  return `${fence}text\n${value}${value.endsWith('\n') ? '' : '\n'}${fence}`;
}

export function exportMarkdown(cards) {
  const clean = exportCards(cards);
  const sections = clean.map(card => [
    `## ${markdownText(card.title)}`,
    `Source: ${card.url ? `<${card.url.replace(/[<>]/gu, encodeURIComponent)}>` : 'Not recorded'}`,
    `Created: ${card.createdAt}  \nUpdated: ${card.updatedAt}`,
    ...FIELDS.map(field => `### ${LABELS[field]}\n\n${card[field] ? markdownText(card[field]) : '_Not recorded._'}`),
    ...(card.snippet ? [`### Selected code\n\n${codeFence(card.snippet)}`] : []),
    '### Practice questions\n\n' + generateQuestions(card).map(item => `- ${markdownText(item.question)}`).join('\n'),
  ].join('\n\n'));
  return ['# Backstory evidence cards',
    'Personal notes and source references. Completeness is not factual verification. Review before sharing; exports may contain private code.',
    ...sections].join('\n\n') + '\n';
}
