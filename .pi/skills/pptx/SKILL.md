---
name: pptx
description: "Use this skill when a PowerPoint deck or PowerPoint OOXML file is a primary input or deliverable. Trigger for creating, editing, repairing, auditing, previewing, merging, splitting, extracting from, or converting .pptx, .pptm, .potx, .potm, .ppsx, and .ppsm files; for preserving and updating existing slide templates; and when the user asks for a deck, slides, or a presentation and a PowerPoint file is the likely intended output. This skill also applies when a PowerPoint file is the source and the extracted content will be used elsewhere."
license: Proprietary. LICENSE.txt has complete terms
---

# Purpose

This skill is for high-control PowerPoint work. It should help create or modify decks that preserve existing design systems, keep slide structure intact, maintain speaker notes and references, and pass package, text, and visual QA before delivery.

Primary target formats:

- `.pptx`
- `.pptm`
- `.potx`
- `.potm`
- `.ppsx`
- `.ppsm`

Use PDF, PNG, or Markdown only as intermediate QA artifacts or explicitly requested outputs. If the user needs a live PowerPoint deck with editable slides, notes, masters, layouts, charts, tables, comments, hidden slides, or native presentation behavior, deliver a PowerPoint package.

# Quick reference

| Task | Guide |
|------|-------|
| Read/analyze content | `python -m markitdown presentation.pptx` plus `python scripts/preview.py presentation.pptx --output-dir preview/` |
| Visual overview | `python scripts/thumbnail.py presentation.pptx` |
| Inspect deck structure | `python scripts/inspect.py presentation.pptx > inspect.json` |
| Edit or create from template | Read [editing.md](editing.md) |
| Create from scratch | Read [pptxgenjs.md](pptxgenjs.md) |
| Raw XML | `python scripts/office/unpack.py presentation.pptx unpacked/` |

# File-type policy

## PowerPoint OOXML packages

For `.pptx`, `.pptm`, `.potx`, `.potm`, `.ppsx`, and `.ppsm`, preserve the package and edit with the least destructive workflow possible.

## Macro-enabled decks and templates

If the package contains `ppt/vbaProject.bin`, preserve the macro-enabled extension and do not convert it to `.pptx` or `.potx` unless the user explicitly asks to remove macros.

## Legacy `.ppt`

Treat `.ppt` as a legacy binary source. Convert it to `.pptx` before editing. Do not promise exact round-tripping.

## Password-protected or encrypted presentations

If the deck is encrypted and the user has provided the password, decrypt it first with `scripts/decrypt.py`. Do not try to bypass protection.

# Core operating principles

## Preservation beats reinvention

If the user provides an existing deck, preserve:

- slide order, section structure, hidden slide states, and slide IDs
- slide masters, layouts, theme parts, and template branding
- notes slides, comments, and comment authors
- charts, tables, images, videos, audio, OLE objects, and embedded workbooks
- hyperlinks, action settings, tags, and external relationships
- transitions, animations, and media timing where present
- macro projects and macro-enabled file types when present

Do not rebuild a user-provided template with PptxGenJS or python-pptx from scratch when fidelity matters.

## Pick the least destructive tool

- **Read/analyze only**: MarkItDown for text extraction plus `preview.py` or `thumbnail.py` for visual review.
- **New deck from scratch**: PptxGenJS.
- **Existing template with preservation-sensitive design**: unpack → targeted XML edits → clean → validate → repack.
- **Simple quick edits on a plain deck**: python-pptx is acceptable when you are only changing a small amount of text or basic shapes and do not need to preserve tricky template behavior.
- **Template-library automation at scale**: consider `pptx-automizer` as an optional advanced workflow, not the default.

## Visual QA is mandatory

Decks are not finished when XML packs successfully. They are finished when the rendered slides look right.

## Desktop PowerPoint compatibility is mandatory when available

Schema validation, ZIP integrity, text extraction, and LibreOffice rendering are necessary but not sufficient. When Microsoft PowerPoint is installed on the machine, run a clean-open smoke test in desktop PowerPoint before delivery and confirm it opens without a repair prompt. If that test cannot be run, say so explicitly in the final response.

For diagram-heavy decks, avoid fragile preset line shapes with arrowhead XML when a native connector, block arrow, or L-shaped arrow assembly will communicate the flow. PowerPoint may tolerate more geometry than it preserves cleanly across generators, so prefer simple editable shapes over complex line-arrow constructs.

For connector-heavy slides, add a visual trace pass after rendering: follow every arrow from source to target and confirm it lands on the intended object, does not appear to originate from a neighboring group, and does not cross unrelated cards in a way that implies a false dependency. Remove non-essential cross-lane arrows before adding more routing complexity. If generated arrows inherit theme shadows or other effects that make them look like stray lines, strip inherited shape styles or simplify the connector treatment and render again.

## Speaker notes carry source attribution

For externally sourced visuals and non-trivial claims, put a `[Sources]` block in the speaker notes for the slide.

Recommended format:

```text
[Sources]
- Organization / publication, title or page, date, URL
- Asset source, license or attribution if applicable
```

## MarkItDown is useful but incomplete

MarkItDown is good for text extraction and placeholder hunting, but it is not enough for image-heavy slides, visual layout validation, or OCR of text embedded inside images.

# Tool selection

## Use PptxGenJS for new decks

This is the default path for:

- decks built from scratch
- chart-heavy or table-heavy decks
- decks that need slide sections, slide masters, or speaker notes generated programmatically
- visual storytelling where layout is designed in code

If OpenAI container helpers are available, use the helper utilities in `/home/oai/skills/slides/pptxgenjs_helpers` for:

- text fitting (`autoFontSize`, `calcTextBox`)
- image crop/contain placement (`imageSizingCrop`, `imageSizingContain`)
- safe shadows (`safeOuterShadow`)
- slide diagnostics (`warnIfSlideHasOverlaps`, `warnIfSlideElementsOutOfBounds`)

If those helpers are not available in the runtime environment, use plain PptxGenJS or provide equivalent local helper functions. Do not leave the example import path hardcoded in production code unless that path actually exists.

Read [pptxgenjs.md](pptxgenjs.md) before using this path.

## Use unpack/edit/pack for existing templates

Use unpack/edit/pack when the user provides a branded or carefully designed deck and preservation matters.

Typical triggers:

- update a title or a few text blocks in an existing deck
- swap images without disturbing layout
- duplicate or reorder existing template slides
- preserve hidden slides, notes, masters, and template styling

Read [editing.md](editing.md) before using this path.

## Use python-pptx only for simple low-risk edits

python-pptx is stable and useful, but it is not the best tool for every template-preservation task.

Use it for:

- small text swaps in a plain deck
- creating a quick internal deck when design fidelity is modest
- reading slide text, titles, tables, or shape content when a lightweight API is enough

Do not assume python-pptx will preserve every PowerPoint-authored nuance such as elaborate template geometry, SmartArt fidelity, complex animations, or specialized placeholders.

## Optional advanced path: pptx-automizer

`pptx-automizer` is a strong optional path when you have a library of PowerPoint templates and need repeatable merge-and-modify workflows over existing decks. It is especially relevant for template-driven automation and can add PptxGenJS-built content into template-based decks.

It is not the default path in this skill because it adds a Node dependency and is still best treated as an advanced route.

# Standard workflows

## Read or audit an existing deck

1. Generate a quick thumbnail sheet with `thumbnail.py`.
2. Run `inspect.py` to inventory slides, notes, media, links, hidden slides, and placeholders.
3. If text extraction helps, run MarkItDown.
4. Render slide previews with `preview.py` when the visual design matters.
5. If the deck will be modified, keep the original untouched and work on a copy.

## Edit an existing template-sensitive deck

1. Analyze the deck with `thumbnail.py` and `inspect.py`.
2. Unpack with `scripts/office/unpack.py`.
3. Make all slide-structure changes first: duplicate, insert, delete, reorder, hide, or unhide.
4. Only then edit slide XML, notes XML, and relationships.
5. Run `clean.py` to remove orphans.
6. Validate and repack with `scripts/office/validate.py` and `scripts/office/pack.py`.
7. Render previews and inspect the output visually.
8. Run `qc.py` before delivery.

## Create a new deck from scratch

1. Choose the slide size and visual system.
2. Build reusable slide masters or layout functions in PptxGenJS.
3. Generate slide content with real images, charts, tables, and notes.
4. Add `[Sources]` blocks to speaker notes for sourced slides.
5. Render the deck and fix all overlaps, crop problems, and out-of-bounds issues.
6. Run `qc.py` before delivery.

# Design ideas

**Do not create boring slides.** Plain bullets on a white background usually underperform. Consider ideas from this list for each slide.

## Before starting

- **Pick a bold, content-informed color palette**: the palette should feel designed for this topic. If swapping your colors into a completely different presentation would still work, the choices are too generic.
- **Dominance over equality**: one color should dominate about 60-70% of the visual weight, with one or two supporting tones and one sharper accent. Do not give all colors equal weight.
- **Dark/light contrast**: dark backgrounds can work well for title and conclusion slides while lighter backgrounds support detailed content. Or commit to dark throughout for a premium feel.
- **Commit to a visual motif**: pick one distinctive element and repeat it — rounded image frames, icons in colored circles, thick single-side borders, angled color fields, or oversized statistic callouts.

## Color palettes

Choose colors that match the topic rather than defaulting to generic blue.

| Theme | Primary | Secondary | Accent |
|-------|---------|-----------|--------|
| **Midnight Executive** | `1E2761` (navy) | `CADCFC` (ice blue) | `FFFFFF` (white) |
| **Forest & Moss** | `2C5F2D` (forest) | `97BC62` (moss) | `F5F5F5` (cream) |
| **Coral Energy** | `F96167` (coral) | `F9E795` (gold) | `2F3C7E` (navy) |
| **Warm Terracotta** | `B85042` (terracotta) | `E7E8D1` (sand) | `A7BEAE` (sage) |
| **Ocean Gradient** | `065A82` (deep blue) | `1C7293` (teal) | `21295C` (midnight) |
| **Charcoal Minimal** | `36454F` (charcoal) | `F2F2F2` (off-white) | `212121` (black) |
| **Teal Trust** | `028090` (teal) | `00A896` (seafoam) | `02C39A` (mint) |
| **Berry & Cream** | `6D2E46` (berry) | `A26769` (dusty rose) | `ECE2D0` (cream) |
| **Sage Calm** | `84B59F` (sage) | `69A297` (eucalyptus) | `50808E` (slate) |
| **Cherry Bold** | `990011` (cherry) | `FCF6F5` (off-white) | `2F3C7E` (navy) |

## For each slide

**Every slide should have a visual element** — image, chart, icon, diagram, table, shape system, or statistic treatment. Text-only slides are usually forgettable.

**Layout options:**
- Two-column layout with text on one side and a visual on the other
- Icon + text rows with icons in colored circles
- 2x2 or 2x3 card grids
- Half-bleed image with content block overlay
- Comparison columns for before/after or option A/option B
- Timeline or process flow with numbered steps
- Large statistic callouts with small labels and supporting commentary

**Visual polish:**
- Icons in small colored circles next to section headers
- Italic accent text for key stats or taglines
- Shape-backed callouts for pull quotes or KPI highlights
- Consistent corner radius or border treatment across the whole deck

## Typography

Choose an interesting font pairing rather than defaulting to Arial.

| Header Font | Body Font |
|-------------|-----------|
| Georgia | Calibri |
| Arial Black | Arial |
| Calibri | Calibri Light |
| Cambria | Calibri |
| Trebuchet MS | Calibri |
| Impact | Arial |
| Palatino | Garamond |
| Consolas | Calibri |

| Element | Size |
|---------|------|
| Slide title | 36-44pt bold |
| Section header | 20-24pt bold |
| Body text | 14-16pt |
| Captions | 10-12pt muted |
| Large stats | 60-72pt |

## Spacing

- 0.5" minimum outer margins
- 0.3-0.5" between peer content blocks
- consistent gutters across columns and cards
- leave breathing room rather than filling every inch

## Avoid

- repeating the same layout on every slide
- centering body text; left-align paragraphs and lists
- weak size contrast between titles and body copy
- defaulting to blue when the topic suggests a stronger palette
- mixing spacing values randomly
- styling only one slide and leaving the rest plain
- text-only slides without any visual structure
- forgetting text box padding when aligning text to shapes or icons
- low-contrast icons or text against the background
- text boxes so narrow that lines wrap awkwardly
- **accent lines under titles** — these are a common AI hallmark; prefer whitespace, scale contrast, or stronger background treatment instead

# Included scripts

## `scripts/inspect.py`

Inventories the deck and outputs structured JSON.

It reports:

- slide order and hidden slide states
- slide size and package type
- slide masters, layouts, themes, notes, comments, media, charts, hyperlinks, and embedded packages
- placeholder or template-leftover text hits
- notes coverage and `[Sources]` block coverage
- transitions and animations/timing presence
- macro presence
- optional comparison against a baseline deck

Examples:

```bash
python scripts/inspect.py board_deck.pptx > inspect_before.json
python scripts/inspect.py updated_board_deck.pptx --compare-to board_deck.pptx > inspect_after.json
```

## `scripts/preview.py`

Renders a PowerPoint package to PDF plus per-slide PNG images for visual QA.

```bash
python scripts/preview.py output.pptx --output-dir preview/
python scripts/preview.py output.pptx --output-dir preview/ --dpi 180 --montage
```

## `scripts/thumbnail.py`

Creates a labeled contact sheet of slide thumbnails for fast template analysis. Hidden slides appear with a placeholder tile.

```bash
python scripts/thumbnail.py template.pptx
python scripts/thumbnail.py template.pptm thumbs --cols 4
```

## `scripts/add_slide.py`

Creates a new slide in an unpacked deck by duplicating an existing slide or by creating one from a layout, and inserts it into `presentation.xml` automatically.

```bash
python scripts/add_slide.py unpacked/ slide2.xml --position after:slide2.xml
python scripts/add_slide.py unpacked/ slideLayout3.xml --position end
python scripts/add_slide.py unpacked/ slide4.xml --copy-notes --json
```

Important behavior:

- notes are dropped by default on duplicated slides unless `--copy-notes` is used
- slide comments are stripped by default on duplicated slides to avoid cross-slide comment sharing
- charts, media, and embeddings referenced by the duplicated slide remain shared unless you detach or replace them later

## `scripts/clean.py`

Removes unreferenced files from an unpacked deck after structural edits.

```bash
python scripts/clean.py unpacked/
```

## `scripts/office/unpack.py`

Unpacks a PowerPoint package for XML editing.

```bash
python scripts/office/unpack.py input.pptx unpacked/
python scripts/office/unpack.py template.pptm unpacked/
```

## `scripts/office/validate.py`

Validates an unpacked or packed PowerPoint package.

Checks include:

- XML well-formedness
- namespace integrity
- relationship targets
- slide/layout/master IDs
- notes-slide uniqueness
- content-type coverage
- XSD validation

```bash
python scripts/office/validate.py output.pptx
python scripts/office/validate.py output.pptm --original template.pptm
```

## `scripts/office/pack.py`

Re-packs an unpacked deck after validation.

```bash
python scripts/office/pack.py unpacked/ output.pptx --original template.pptx
python scripts/office/pack.py unpacked/ output.pptm --original template.pptm
```

## `scripts/qc.py`

Runs the full QA chain and writes `qc_report.json`.

It combines:

- `inspect.py`
- `office/validate.py`
- `preview.py`
- optional placeholder scan via MarkItDown if installed
- optional `slides_test.py` from the shared slides skill if available

```bash
python scripts/qc.py output.pptx --output-dir qc/
python scripts/qc.py output.pptx --baseline template.pptx --require-sources-notes --output-dir qc/
```

Report schema:

```json
{
  "status": "success | issues_found | error",
  "critical_issues": [],
  "warnings": [],
  "artifacts": {
    "inspect": ".../inspect.json",
    "validate_log": ".../validate.txt",
    "preview_report": ".../preview/preview_report.json",
    "qc_report": ".../qc_report.json"
  }
}
```

## `scripts/decrypt.py`

If the deck is encrypted and the user has the password, decrypt it first.

```bash
python scripts/decrypt.py protected.pptx decrypted.pptx --password "secret"
```

# Code examples

## Simple quick edit with python-pptx

```python
from pptx import Presentation
from pptx.enum.text import PP_ALIGN

prs = Presentation("input.pptx")
slide = prs.slides[0]
slide.shapes.title.text = "Q2 Product Review"
body = slide.placeholders[1]
text_frame = body.text_frame
text_frame.clear()

p = text_frame.paragraphs[0]
p.text = "Key outcomes"
p.font.bold = True
p.alignment = PP_ALIGN.LEFT

for line in [
    "Retention improved 4 pts quarter over quarter",
    "Cycle time fell from 12 days to 8 days",
]:
    para = text_frame.add_paragraph()
    para.text = line
    para.level = 0

prs.save("output.pptx")
```

## Existing-template edit path

```bash
cp template.pptx working.pptx
python scripts/office/unpack.py working.pptx unpacked/
python scripts/add_slide.py unpacked/ slide2.xml --position after:slide2.xml --copy-notes
# edit XML in unpacked/ppt/slides/slideN.xml and unpacked/ppt/notesSlides/notesSlideN.xml
python scripts/clean.py unpacked/
python scripts/office/validate.py unpacked/ --original working.pptx
python scripts/office/pack.py unpacked/ output.pptx --original working.pptx
python scripts/qc.py output.pptx --baseline working.pptx --output-dir qc/
```

## New-deck path with PptxGenJS

See [pptxgenjs.md](pptxgenjs.md) for a fuller example.

```javascript
const pptxgen = require("pptxgenjs");

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "OpenAI";

const slide = pptx.addSlide();
slide.addText("Market Update", { x: 0.6, y: 0.4, w: 6.5, h: 0.6, fontSize: 30, bold: true, margin: 0, color: "111827" });
slide.addShape(pptx.ShapeType.rect, { x: 0.6, y: 1.25, w: 5.8, h: 2.0, fill: { color: "F3F4F6" }, line: { color: "F3F4F6" } });
slide.addText(
  "Revenue grew 18% year over year, led by enterprise upsell and usage expansion.",
  { x: 0.85, y: 1.55, w: 5.3, h: 1.3, fontSize: 20, color: "374151", margin: 0 }
);
slide.addText("18%", { x: 7.5, y: 1.0, w: 2.0, h: 0.8, fontSize: 34, bold: true, color: "1F3A5F", margin: 0 });
slide.addText("YoY revenue growth", { x: 7.5, y: 1.8, w: 2.8, h: 0.3, fontSize: 14, color: "4B5563", margin: 0 });
slide.addNotes(`[Sources]\n- Company earnings release, April 18, 2026, https://example.com`);

pptx.writeFile({ fileName: "output.pptx" });
```

# Anti-patterns to avoid

- using PptxGenJS to “edit” an existing branded template that needs preservation
- using python-pptx as the default for a complex template deck
- manually copying `slideN.xml` files without updating `presentation.xml`, `.rels`, and `[Content_Types].xml`
- relying on MarkItDown alone for visual QA
- shipping a deck without rendered previews
- leaving placeholder text such as `Lorem ipsum`, `Click to add`, `XXXX`, or `Content Placeholder`
- forgetting `[Sources]` blocks on sourced slides
- shrinking text to unreadable sizes instead of rewriting or relayouting content

# Minimum QA gate before delivery

Do not deliver until all applicable checks pass:

- the package validates successfully
- no critical placeholder or leftover-template text remains
- slide order and hidden states are correct
- important speaker notes and `[Sources]` blocks are present
- rendered previews look correct at slide level
- no severe overlap or out-of-bounds issues remain
- structural comparison against the original deck shows no unexplained losses of notes, media, layouts, masters, or macro content

# Dependencies

- `pip install "markitdown[pptx]"` for text extraction
- `pip install Pillow defusedxml` for preview utilities and safe XML parsing
- `pip install msoffcrypto-tool` for encrypted-deck workflows when needed
- `pip install python-pptx` for low-risk edit paths
- `npm install pptxgenjs` for new-deck generation
- optional: `npm install react-icons react react-dom sharp` for icon workflows
- LibreOffice (`soffice`) for PDF conversion and preview rendering
- Poppler (`pdftoppm`) for PDF to slide-image conversion
