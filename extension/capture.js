import { GITHUB_RESERVED_ROOTS, normalizeGitHubUrl } from './core/domain.js';

/** Runs only after the user chooses Capture in the popup. */
export function isGitHubRepositoryPage(value) {
  try {
    normalizeGitHubUrl(value, { required: true });
    return true;
  } catch { return false; }
}

// Chrome serializes this function into the active tab. Keep it self-contained.
// The shared route list is passed as serializable data, not an imported closure.
export function readSelectedContext(reservedRoots) {
  const url = new URL(location.href);
  const parts = url.pathname.split('/').filter(Boolean);
  let owner;
  try { owner = decodeURIComponent(parts[0] || '').toLowerCase(); } catch { owner = ''; }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port ||
      url.username || url.password || parts.length < 2 || !owner ||
      !Array.isArray(reservedRoots) || reservedRoots.includes(owner)) {
    throw new Error('Open a GitHub repository page before capturing.');
  }
  const selection = window.getSelection()?.toString() || '';
  function truncate(text, limit) {
    let end = Math.min(text.length, limit);
    // Do not split a supplementary Unicode character at the capture boundary.
    if (end < text.length && /[\uD800-\uDBFF]/u.test(text[end - 1]) && /[\uDC00-\uDFFF]/u.test(text[end])) end--;
    return text.slice(0, end);
  }
  url.search = ''; // Query strings are unnecessary context and may contain sensitive values.
  return {
    url: url.href,
    title: truncate(document.title, 160),
    snippet: truncate(selection, 20_000),
    truncated: selection.length > 20_000,
  };
}

export async function captureActiveTab(chromeApi) {
  const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !isGitHubRepositoryPage(tab.url)) {
    throw new Error('Open a repository page on github.com, then click Backstory in the toolbar. You can also add a card manually.');
  }
  const results = await chromeApi.scripting.executeScript({
    target: { tabId: tab.id },
    func: readSelectedContext,
    args: [GITHUB_RESERVED_ROOTS],
  });
  const context = results[0]?.result;
  if (!context || !isGitHubRepositoryPage(context.url)) {
    throw new Error('The page changed before capture finished. Reopen Backstory and try again.');
  }
  return context;
}
