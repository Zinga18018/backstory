#!/usr/bin/env python3
"""Generate source-informed SVG illustrations, not browser screenshots.

Uses only Python's standard library. No browser, network, storage records, or
third-party fonts are read. Run with --check to compare committed bytes.
"""
from pathlib import Path
import argparse
import hashlib
import html
import json
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "images"
SOURCES = ["extension/app.html", "extension/app.js", "extension/popup.html",
           "extension/styles.css", "extension/manifest.json",
           "extension/core/domain.js", "docs/ARCHITECTURE.md"]
PAPER, WHITE, INK, MUTED = "#f8f7f2", "#fffefa", "#213a31", "#53635a"
GREEN, LIME, LINE, SAND = "#254f3d", "#deedac", "#dce2d8", "#f0ecdf"


def esc(value):
    return html.escape(str(value), quote=True)


class SVG:
    def __init__(self, width, height, title, description):
        self.parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">',
                      f'<title id="title">{esc(title)}</title><desc id="desc">{esc(description)}</desc>']
        self.rect(0, 0, width, height, PAPER)

    def rect(self, x, y, w, h, fill, radius=0, stroke=None, dash=None):
        border = f' stroke="{stroke}" stroke-width="1.5"' if stroke else ""
        border += f' stroke-dasharray="{dash}"' if dash else ""
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}"{border}/>')

    def text(self, x, y, content, size=18, color=INK, weight="400", serif=False, anchor="start"):
        family = "Georgia, DejaVu Serif, serif" if serif else "Arial, Helvetica, sans-serif"
        self.parts.append(f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" font-weight="{weight}" fill="{color}" text-anchor="{anchor}">{esc(content)}</text>')

    def lines(self, x, y, values, size=18, color=INK, gap=26, **kwargs):
        for i, value in enumerate(values):
            self.text(x, y + i * gap, value, size, color, **kwargs)

    def line(self, x1, y1, x2, y2, color=LINE):
        self.parts.append(f'<path d="M{x1} {y1} L{x2} {y2}" fill="none" stroke="{color}" stroke-width="1.5"/>')

    def button(self, x, y, w, label, primary=True, size=16):
        self.rect(x, y, w, 42, GREEN if primary else WHITE, 7, None if primary else LINE)
        self.text(x+w/2, y+27, label, size, "#ffffff" if primary else INK, "600", anchor="middle")

    def finish(self):
        return "\n".join(self.parts + ["</svg>", ""])


def workspace():
    s = SVG(980, 760, "Backstory workspace — code-drawn UI preview",
            "Illustration, not a browser screenshot. The empty workspace offers a new evidence card, search and filters, local storage information, and Capture, Reflect, Practice guidance. No personal records are shown.")
    s.text(34, 37, "BACKSTORY / UI OVERVIEW", 17, GREEN, "700")
    s.text(946, 37, "ILLUSTRATION · NOT A SCREENSHOT", 15, MUTED, "600", anchor="end")
    s.rect(30, 65, 920, 600, WHITE, 14, LINE)
    s.rect(31, 66, 229, 598, "#f0f1e9", 13)
    s.rect(246, 66, 14, 598, "#f0f1e9")
    s.line(260, 66, 260, 664)
    s.rect(51, 94, 38, 38, GREEN, 10)
    s.text(69, 122, "b.", 30, "#ffffff", serif=True, anchor="middle")
    s.text(100, 121, "Backstory", 23, INK, "700")
    s.lines(51, 158, ["The work is yours.", "Keep the story, too."], 16, MUTED, 23)
    s.button(50, 207, 190, "+ New evidence card", size=15)
    s.text(51, 289, "YOUR COLLECTION", 13, MUTED, "700")
    s.text(51, 320, "Evidence cards", 16)
    s.rect(214, 301, 25, 25, WHITE, 10)
    s.text(226.5, 319, "0", 14, MUTED, anchor="middle")
    s.text(51, 358, "Search your work", 14, MUTED)
    s.rect(50, 370, 190, 40, WHITE, 7, LINE)
    s.text(63, 396, "Project, decision, keyword…", 13, MUTED)
    s.text(51, 443, "Show", 14, MUTED)
    s.rect(99, 422, 141, 36, WHITE, 5, LINE)
    s.text(112, 446, "All cards", 14)
    s.text(225, 446, "⌄", 17, MUTED)
    s.lines(51, 491, ["Your first story", "starts here."], 16, MUTED, 23)
    s.line(51, 565, 238, 565)
    s.text(51, 594, "Stored on this device", 15, GREEN, "600")
    s.lines(51, 621, ["No account. No sync.", "No AI calls."], 14, MUTED, 20)
    s.text(286, 104, "YOUR WORK, IN YOUR WORDS", 12, MUTED, "700")
    s.text(286, 132, "A small collection of decisions worth remembering.", 16, MUTED)
    s.line(260, 158, 949, 158)
    s.rect(567, 190, 68, 68, GREEN, 18)
    s.text(601, 241, "b.", 54, "#ffffff", serif=True, anchor="middle")
    s.text(601, 292, "A RECORD OF THE REAL WORK", 13, MUTED, "700", anchor="middle")
    s.lines(601, 341, ["Good work deserves", "a backstory."], 41, INK, 45, serif=True, anchor="middle")
    s.lines(601, 423, ["The tricky bug. The trade-off. The part you owned.", "Turn the details you’ll forget into stories you can explain."], 17, MUTED, 25, anchor="middle")
    s.button(490, 475, 223, "Write my first card  ↗", size=17)
    for x, number, title, detail in [(289, "01 / CAPTURE", "Keep a starting point", ["A link and selected code."]),
                                      (512, "02 / REFLECT", "Add what only you know", ["The decisions behind it."]),
                                      (748, "03 / PRACTICE", "Tell it with evidence", ["Prompts, not a verdict."])]:
        s.text(x, 560, number, 12, MUTED, "700")
        s.lines(x, 587, title.split(" / "), 15, INK, 21, weight="600")
        s.lines(x, 613, detail, 14, MUTED, 21)
    s.text(34, 703, "A source-informed illustration of the empty workspace. Layout simplified for this overview.", 17, MUTED)
    s.text(34, 733, "No saved cards, private code, or user records. Real-browser extension QA is still separate.", 17, MUTED)
    return s.finish()


def flow():
    s = SVG(980, 635, "Backstory local-first flow",
            "User-initiated GitHub capture reads only URL, title and selected text. Captures and deliberately saved evidence cards remain in chrome.storage.local. Pure rules generate practice questions and missing-field hints. User-requested exports download saved cards as plaintext JSON or Markdown. No network service is connected; the optional Gemini stub is disabled.")
    s.text(34, 40, "BACKSTORY / LOCAL-FIRST FLOW", 17, GREEN, "700")
    s.text(34, 88, "Keep the context. Keep control.", 35, INK, serif=True)
    s.text(34, 123, "Explicit actions, local records, and readable rules — no runtime network calls.", 20, MUTED)
    s.rect(30, 155, 920, 316, WHITE, 14, LINE)
    s.text(54, 187, "CHROME EXTENSION · LOCAL PROFILE", 14, GREEN, "700")
    for x, number, title, body, foot in [
        (54, "01", "Capture", ["Click on a GitHub page.", "Read the URL, title,", "and selected text only."], "No background scraping"),
        (365, "02", "Reflect + save", ["Add your own context.", "Save cards deliberately", "to chrome.storage.local."], "Notes do not autosave"),
        (676, "03", "Practice + export", ["Seven rule-based prompts.", "Missing-field hints.", "Export JSON / Markdown."], "Saved cards only in exports"),
    ]:
        s.rect(x, 210, 249, 231, PAPER, 10, LINE)
        s.text(x+19, 241, number, 16, GREEN, "700")
        s.text(x+19, 279, title, 25, INK, "600")
        s.lines(x+19, 317, body, 17, MUTED, 27)
        s.line(x+19, 390, x+230, 390)
        s.text(x+19, 418, foot, 15, GREEN, "600")
    for x in [315, 626]:
        s.text(x+13, 328, "→", 33, GREEN, anchor="middle")
    s.rect(30, 491, 440, 110, SAND, 12)
    s.text(51, 522, "LOCAL ≠ ENCRYPTED", 14, GREEN, "700")
    s.lines(51, 551, ["Profile storage and exports are not a vault.", "Filled fields are not verified facts."], 16, INK, 25)
    s.rect(488, 491, 462, 110, PAPER, 12, "#8b9b8e", "6 5")
    s.text(509, 522, "OUTSIDE THE RUNTIME", 14, GREEN, "700")
    s.lines(509, 551, ["Optional Gemini stub: disabled, not connected.", "No keys, remote processing, or paid API calls."], 16, INK, 25)
    return s.finish()


def generate():
    sources = {p: (ROOT / p).read_text(encoding="utf-8") for p in SOURCES}
    for phrase in ["Good work deserves", "YOUR WORK, IN YOUR WORDS", "Stored on this device", "No account. No sync. No AI calls."]:
        assert phrase in sources["extension/app.html"], f"Review illustration after UI copy change: {phrase}"
    for color in [PAPER, WHITE, INK, GREEN, LIME, LINE, SAND]:
        assert color in sources["extension/styles.css"], f"Review palette: {color}"
    manifest = json.loads(sources["extension/manifest.json"])
    assert "connect-src 'none'" in manifest["content_security_policy"]["extension_pages"]
    assert set(manifest["permissions"]) == {"activeTab", "scripting", "storage"}
    images = {"backstory-workspace-preview.svg": workspace(), "backstory-local-flow.svg": flow()}
    for data in images.values():
        tree = ET.fromstring(data)
        assert tree.attrib["role"] == "img"
        assert "<script" not in data and "<image" not in data and "foreignObject" not in data
    provenance = {
        "kind": "Code-drawn illustrations; not screenshots or extension-runtime QA",
        "source_commit": "e949920e3b61a4d2975326ef8d0399a70a7295cb",
        "source_commit_note": "Public source baseline reviewed for the first illustrations; hashes describe the local inputs used by this run.",
        "input_sha256": {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in SOURCES},
        "output_sha256": {p: hashlib.sha256(data.encode()).hexdigest() for p, data in images.items()},
        "data": "Empty-state UI only; no personal records or fabricated outcomes",
        "generator": "python scripts/generate_readme_visuals.py",
    }
    images["provenance.json"] = json.dumps(provenance, indent=2) + "\n"
    return images


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if checked-in visual bytes differ")
    args = parser.parse_args()
    images = generate()
    if args.check:
        for name, data in images.items():
            assert (OUT / name).read_bytes() == data.encode(), f"Regenerate {name}"
        print("PASS: two static SVGs and source provenance match deterministic regeneration.")
    else:
        OUT.mkdir(parents=True, exist_ok=True)
        for name, data in images.items():
            (OUT / name).write_bytes(data.encode())
        print("Generated two SVG illustrations and provenance; no browser or user data used.")


if __name__ == "__main__":
    main()
