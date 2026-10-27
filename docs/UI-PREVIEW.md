# Browser preview and screenshot

![Browser-rendered Backstory preview with a clearly labeled synthetic example.](images/backstory-browser-preview.jpg)

This is an **actual browser screenshot**, not an illustration or an AI-generated image. It shows the revised HTML/CSS/controller rendered in cloud Chrome, with a separate in-memory test adapter standing in for Chrome extension APIs. It is **not a screenshot of an installed extension** and does not establish extension-runtime correctness.

## Source and capture

- Page: [Backstory browser preview](https://yogeshkuchimanchi.com/demos/backstory/).
- Capture date: 2026-10-27 UTC.
- Screenshot: `docs/images/backstory-browser-preview.jpg`, original JPEG, 1180 × 1151 pixels. No image editing, layout reconstruction, or generated artwork was used.
- SHA-256: `f14ca6a826dd95eb9c70455f6da8ddc37ec5c1cd99250d6303ac9819c3d9a653`.
- Preview source at capture: portfolio commit [`a9c6edd9e9e9b97457a5dfb11af31270e806dfc2`](https://github.com/Zinga18018/portfolio-website/commit/a9c6edd9e9e9b97457a5dfb11af31270e806dfc2). All 15 committed preview-file Git blob hashes were checked against the staged source.
- Extension UI source: Backstory commit [`29e845453c9c5fb9051c8260ef22edbece0c3965`](https://github.com/Zinga18018/backstory/commit/29e845453c9c5fb9051c8260ef22edbece0c3965). The app controller, styles, and domain/storage modules in the preview are unchanged copies of that UI. The preview HTML adds a visible disclosure and loads the separate adapter.

The example was entered through the actual form. It is deliberately labeled synthetic and makes no claim about a real project, contribution, test result, or repository. No user cards, private code, credentials, or personal information were loaded.

## What was checked in the browser

- Empty state and form labels; actual system-font rendering.
- Create, edit, and deliberate save of one synthetic card.
- Missing-source-link hint and seven deterministic practice questions.
- HTML-like code displayed as text, with no script element inserted into the card.
- Search across notes, no-match state, and missing/all-fields filters.
- Dismissing an unsaved-change confirmation retained draft text; confirming cancellation restored the saved version.
- Privacy dialog opening and Escape dismissal.
- Actual JSON and Markdown downloads. Their bytes were read back: the JSON contained the saved revision, not the cancelled text; the Markdown contained the expected synthetic code and practice questions.
- Delete cancellation retained the card; confirmed deletion returned to the empty state and disabled exports.
- No horizontal overflow at the tested 1180px viewport. The screenshot was visually inspected for legibility, alignment, and clipping.

The browser tool timed out while dispatching clicks that opened native confirmation dialogs. The existing dialogs were inspected and handled rather than clicking a second time blindly. Browser automation-extension metadata errors were present in the captured console; no errors attributed to the preview’s own source URLs were observed in that log sample.

## What this does not test

The preview uses **temporary page memory**, not `chrome.storage.local`. Refreshing clears its data. It does not test installed-extension persistence, a real `activeTab` grant, live GitHub selection capture, browser-profile quotas, cross-tab extension storage, or installation. The installed extension has no preview adapter; `scripts/preview/chrome-adapter.js` is development tooling outside `extension/`.

The standalone unpacked-Chromium test remained blocked by the build environment. The supported local HTTP preview also timed out, so the separately approved static portfolio route was used. No browser extension was installed into the user’s browser. Gemini remains disabled; no API requests or credential setup occurred.

## Reproduce the preview

From a source checkout, run:

```sh
python3 scripts/build-ui-preview.py --output /absolute/path/to/a/new/preview-folder
# For the portfolio’s nested static route:
python3 scripts/build-ui-preview.py --output /absolute/path/to/another/new/folder --base-path /demos/backstory/
```

The output directory must be outside the repository and must not already exist. The Python script copies the real UI, removes the installable manifest, and adds the explicit preview label and in-memory adapter. Serve its `dist/` folder with an authorized HTTP preview and use the actual form before taking a browser screenshot. The script does not draw or generate a screenshot. `--base-path` keeps assets rooted correctly on nested clean-URL hosts; the preview-only adapter maps app/popup links to those public routes while preserving capture fragments. Real extension URLs remain unchanged.

## Visual references

The redesign uses system typography, standard-sized controls, plain surfaces, and functional labels. Official interfaces were inspected as references for compact extension UI, without copying branding or assets:

- [Raindrop extension](https://extension.raindrop.io/) and its [official Chrome Web Store listing](https://chromewebstore.google.com/detail/raindropio/ldgfbffkinooeloadekpmfoklnobpien).
- [SingleFile’s official Chrome Web Store listing and interface screenshot](https://chromewebstore.google.com/detail/singlefile/mpiodijhokgodhhofbcjdecpffjipkle).
