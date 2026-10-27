# README visuals

These original, code-drawn SVGs explain Backstory without using user records or pretending to be runtime screenshots.

| Asset | What it represents | What it does not establish |
| --- | --- | --- |
| [Workspace preview](backstory-workspace-preview.svg) | An illustrated, simplified empty workspace informed by `extension/app.html`, `app.js`, and `styles.css`. | Pixel-exact browser rendering, installation, toolbar capture, or end-to-end extension QA. |
| [Local-first flow](backstory-local-flow.svg) | A high-level view of explicit capture, local persistence, deterministic prompts, and user-requested exports. | A connected AI integration, encryption, factual verification, or automatic saving. |

Source baseline: [`e949920e3b61a4d2975326ef8d0399a70a7295cb`](https://github.com/Zinga18018/backstory/tree/e949920e3b61a4d2975326ef8d0399a70a7295cb). The detailed [Mermaid architecture](../ARCHITECTURE.md) is retained unchanged.

## Reproduce

From the repository root, using Python 3.10+ and no third-party packages:

```sh
python scripts/generate_readme_visuals.py
python scripts/generate_readme_visuals.py --check
```

The generator checks the source copy, palette, permissions, and no-network CSP before producing the illustrations. [provenance.json](provenance.json) records input and output SHA-256 hashes. The check verifies exact regeneration, parses both SVGs, and rejects embedded image, script, and foreign-object elements. Copy/style checks are deliberately limited: review the visuals manually after changing the UI or architecture.

The SVGs contain text, accessible titles/descriptions, and opaque backgrounds. They remain crisp when enlarged and do not depend on remote assets, external fonts, browser storage, or network calls. The README also describes the key flow in text for small screens and nonvisual readers.

The first images were rasterized with local Inkscape for visual inspection. This is **asset rendering**, not an extension screenshot or browser QA. Existing runtime limitations in [TESTING.md](../TESTING.md) remain unchanged.
