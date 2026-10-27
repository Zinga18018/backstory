# Verification and QA

## Automated checks performed in this cloud workspace

- Node’s built-in test runner: pure domain validation, metadata preservation, deterministic questions, missing-field checks, safe JSON/Markdown export, storage CRUD, stable sort, per-record persistence, malformed/future-record rejection, optimistic conflicts, locks, concurrent creates, quotas, capture recovery, Unicode limits, capture API orchestration, and the fail-closed Gemini stub.
- UI-state regression tests exercise the actual app functions with lightweight test doubles; they are **not** a browser rendering test.
- Static check: all runtime JavaScript parses; the manifest requests exactly `activeTab`, `scripting`, `storage`; referenced local assets exist; there are no broad host permissions, content scripts, worker, remote scripts, inline event handlers, dynamic code execution, or network transport in the runtime.
- Packaging: ZIP CRC integrity, manifest identity, and explicit source inclusion with no `.env`, browser profile, dependencies, or QA artifacts.

Run `npm test` and `npm run check` to obtain the current exact case count. Tests use synthetic text, never an existing user secret or private repository.

## GitHub Actions

`.github/workflows/check.yml` runs the Node tests, static checks, and packaging validation on push, pull request, or manual dispatch. It requires no project secrets, no package installation, and only read access to repository contents. It does not run browser QA or publish anything. A workflow file being present is not a passing CI run; verify the status for the actual pushed commit.

## Installed-extension QA: not passed / blocked

The Chromium browser test did **not** execute successfully. The default sandbox blocked Chromium’s socket creation; the separate sandbox-exception launcher failed before the test started due to a runtime filesystem/mount error. Neither failure demonstrates an extension defect, but neither is a pass.

Therefore, unpacked-extension behavior, live `activeTab` grants, actual `chrome.storage.local` persistence, and multi-tab extension locks remain **unverified** in this build environment. A separate, clearly labeled HTTP preview of the same UI was later rendered and tested in cloud Chrome, including actual JSON/Markdown downloads; see [browser-preview scope and screenshot provenance](UI-PREVIEW.md). That preview uses temporary in-memory storage and is not an installed extension. No extension was installed into the user’s browser.

The reproducible script `scripts/browser_qa.py` is supplied for a suitable environment. It uses Python Playwright and a disposable Chromium profile with HTTP(S) blocked. It covers real extension storage/locks, save/reload/edit/cancel, safely rendered snippets, search/filter, downloads, privacy dialog, stale-window conflict, capture recovery/discard, narrow layout, delete/cancel, and popup rejection. Even a passing run of that script does not replace the real toolbar/GitHub gesture check below.

## Manual acceptance checklist

Use a disposable Chrome profile and a public repository you are allowed to capture.

- [ ] Load `extension/` unpacked; no manifest or console errors.
- [ ] Open the popup on a non-GitHub tab; Capture explains the unsupported page. Open workspace still works.
- [ ] On a GitHub file page, select code and invoke the toolbar popup. Capture opens a workspace with the right URL/anchor, title, and only selected text.
- [ ] Capture an empty selection, a >20,000-unit selection, and an emoji at the truncation boundary. No silent truncation or damaged emoji.
- [ ] Navigate the tab or revoke access while capturing; failure is explained and the action can be tried again.
- [ ] Finish a capture, save, reload, and confirm it persists. Close an unfinished capture; find it under Unfinished captures. Discard explicitly.
- [ ] Save a title-only card. Missing details are listed without claiming a fact check. Fill all fields; the UI still explains that presence is not verification.
- [ ] Paste `<script>`/HTML into all text fields. It must display as text, never execute.
- [ ] Cancel a dirty edit, dismiss the confirmation, then confirm it on a second attempt. Verify saved and unsaved versions stay distinct.
- [ ] Rapidly click Save twice. Save/update once; no duplicate cards. Start Delete, then attempt Edit; no editor should open during the operation.
- [ ] Open one card in two windows. Save in the first, then save/delete in the stale second. Conflict preserves both the saved version and unsaved text.
- [ ] Search across title, source, code, and notes; combine with missing/all-details filters. No-match state is readable.
- [ ] Export JSON and Markdown. Open the files locally; verify snippets, Unicode, and practice questions. Confirm unfinished/unsaved material is excluded.
- [ ] Delete, cancel deletion, and then confirm. Reload to confirm removal. Existing export files remain unaffected.
- [ ] Fill storage to a quota in a test profile. Failure should keep the last saved card and preserve current form input.
- [ ] Test keyboard focus, labels, screen-reader announcements, dialog Escape, 650px layout, zoom, and contrast.
- [ ] Observe network traffic while using the extension. No extension-origin API/analytics calls should occur.

## Security review scope

This is a small source review and regression suite, not a penetration test, trademark review, or Chrome Web Store certification. The disabled adapter is intentionally unimplemented. No external API correctness, response quality, billing, or credential integration was tested because none was enabled.
