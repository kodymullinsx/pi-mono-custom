# Editing Presentations

Use this guide when an existing PowerPoint package must be preserved and modified rather than rebuilt from scratch.

## Decision framework

Choose the least destructive path:

- **Quick, low-risk edits on a plain deck**: `python-pptx`
- **Branded or fidelity-sensitive deck**: unpack → XML edits → clean → validate → repack
- **Large-scale template automation across many decks**: optional `pptx-automizer` workflow, not the default

If the deck contains hidden slides, notes, comments, unusual masters, timings, macro parts, or embedded charts/media, prefer the unpack/edit/pack workflow.

## Recommended workflow

1. Analyze the deck first.
   ```bash
   python scripts/thumbnail.py template.pptx
   python scripts/inspect.py template.pptx > inspect.json
   python scripts/preview.py template.pptx --output-dir preview/ --montage
   ```
2. Keep the original untouched.
   ```bash
   cp template.pptx working.pptx
   ```
3. Unpack the working copy.
   ```bash
   python scripts/office/unpack.py working.pptx unpacked/
   ```
4. Complete all structural edits before content edits.
   - duplicate, create, delete, reorder, hide, unhide
   - update notes relationships only after slide structure is settled
5. Edit slide and notes XML.
6. Clean orphaned package parts.
   ```bash
   python scripts/clean.py unpacked/
   ```
7. Validate and repack.
   ```bash
   python scripts/office/validate.py unpacked/ --original working.pptx
   python scripts/office/pack.py unpacked/ output.pptx --original working.pptx
   ```
8. Render visual previews and run QC.
   ```bash
   python scripts/preview.py output.pptx --output-dir preview_final/ --montage
   python scripts/qc.py output.pptx --baseline working.pptx --output-dir qc/
   ```

## Structural operations

### Duplicate or create slides

Use `add_slide.py`. Do not manually copy `slideN.xml` files.

```bash
python scripts/add_slide.py unpacked/ slide2.xml --position after:slide2.xml --copy-notes
python scripts/add_slide.py unpacked/ slideLayout3.xml --position end
```

The script handles:

- adding the new slide part
- updating `presentation.xml.rels`
- inserting the `<p:sldId>` in `presentation.xml`
- adding content-type overrides
- optionally copying notes to a new notes-slide part
- stripping slide comments by default to avoid accidental comment sharing

### Delete or reorder slides

Edit `ppt/presentation.xml` and the `<p:sldIdLst>` order, then run `clean.py`.

Rules:

- never delete slide XML first and hope the package will recover later
- remove or reorder the `<p:sldId>` entries first
- after deletion, run `clean.py` to remove orphaned slide files, rels, notes, comments, and overrides

## XML editing rules

When editing slide XML directly, preserve the PowerPoint-authored structure as much as possible.

### Preserve paragraph and run properties

Keep existing `<a:pPr>`, `<a:rPr>`, list-level tags, alignment tags, and bullet tags unless you intentionally want to change them. Replacing a whole text body with simplified XML often destroys spacing, indentation, bullet styling, and theme formatting.

### Do not insert literal Unicode bullet characters casually

If the template uses PowerPoint bullet styling, preserve its existing paragraph properties rather than inserting `•` as plain text. Literal bullets are often a sign that the slide has been flattened away from the template's design system.

### Keep notes relationships consistent

If a slide has a notes-slide relationship, either preserve it or intentionally replace it with a newly created notes slide. Never leave a duplicated slide pointing at another slide's notes part.

### Preserve slide layout relationships

Do not break the `slideLayout` relationship in `slideN.xml.rels`. It is what keeps placeholders and layout behavior anchored to the template.

### Preserve text runs unless the content model changes

If a title already exists as one paragraph with one or two runs, replace the text within that structure rather than rebuilding the entire text body from scratch.

### Replace placeholder content fully

Check all of these:

- title text
- body text
- image captions
- chart titles and axis labels
- footers
- notes text
- comments or internal review text that should not ship

Use `inspect.py` and optional MarkItDown output to confirm nothing obvious remains.

## Editing slide text safely

For each target slide:

1. Read the slide XML.
2. Find the actual text nodes in `<a:t>`.
3. Preserve surrounding run and paragraph structure.
4. Replace only the text payload where possible.
5. If the replacement is much longer, redesign the slide instead of cramming more text.

## Template adaptation

When source content has fewer items than the template:

- **Remove excess elements entirely**: images, shapes, and text boxes, not just text content
- check for orphaned visuals after clearing text
- run visual QA to catch count mismatches

When replacing text with different length content:

- **shorter replacements** are usually safe
- **longer replacements** may overflow or wrap unexpectedly
- test with visual QA after text changes
- consider truncating, splitting, or redesigning to fit the template's design constraints

**Template slots are not source items.** If a template has four team-member groups but source content only has three, delete the fourth group completely rather than blanking its text.

## Multi-item content

If source has multiple items such as numbered lists or multiple sections, create separate `<a:p>` elements for each. Do not concatenate them into one string.

**Wrong — all items in one paragraph:**

```xml
<a:p>
  <a:r><a:rPr lang="en-US" sz="2799"/><a:t>Step 1: Do the first thing. Step 2: Do the second thing.</a:t></a:r>
</a:p>
```

**Correct — separate paragraphs with bold headers:**

```xml
<a:p>
  <a:pPr algn="l"><a:lnSpc><a:spcPts val="3919"/></a:lnSpc></a:pPr>
  <a:r><a:rPr lang="en-US" sz="2799" b="1"/><a:t>Step 1</a:t></a:r>
</a:p>
<a:p>
  <a:pPr algn="l"><a:lnSpc><a:spcPts val="3919"/></a:lnSpc></a:pPr>
  <a:r><a:rPr lang="en-US" sz="2799"/><a:t>Do the first thing.</a:t></a:r>
</a:p>
<a:p>
  <a:pPr algn="l"><a:lnSpc><a:spcPts val="3919"/></a:lnSpc></a:pPr>
  <a:r><a:rPr lang="en-US" sz="2799" b="1"/><a:t>Step 2</a:t></a:r>
</a:p>
<a:p>
  <a:pPr algn="l"><a:lnSpc><a:spcPts val="3919"/></a:lnSpc></a:pPr>
  <a:r><a:rPr lang="en-US" sz="2799"/><a:t>Do the second thing.</a:t></a:r>
</a:p>
```

Copy `<a:pPr>` from the original paragraph to preserve line spacing. Use `b="1"` on headers when that matches the template's emphasis pattern.

## Template mismatch rule

If the new content does not fit the template slide cleanly, do not force it.

Instead:

- duplicate a more suitable layout slide
- split one crowded slide into two
- remove a non-essential visual group to create room
- move citations into notes instead of the slide body

Do not shrink body text to unreadable sizes just to keep a slide count target.

## Notes and source attribution

Use notes for attribution, working references, and non-visual metadata.

Recommended pattern:

```text
[Sources]
- Organization / document / page / date / URL
- Image or chart source / attribution / license if needed
```

When notes already exist, append or revise carefully. Preserve any existing presenter instructions unless the user asked to replace them.

## Smart quotes and special characters

Unpack and pack may preserve these correctly, but direct editing tools can normalize them unexpectedly.

When adding new text with smart quotes directly in XML, use entities:

```xml
<a:t>the &#x201C;Agreement&#x201D;</a:t>
```

| Character | Name | Unicode | XML Entity |
|-----------|------|---------|------------|
| `“` | Left double quote | U+201C | `&#x201C;` |
| `”` | Right double quote | U+201D | `&#x201D;` |
| `‘` | Left single quote | U+2018 | `&#x2018;` |
| `’` | Right single quote | U+2019 | `&#x2019;` |

Also preserve whitespace intentionally with `xml:space="preserve"` on `<a:t>` when leading or trailing spaces matter.

## Media, charts, embeddings, and comments

### Images and videos

Swapping a relationship target is often safer than rebuilding large layout groups. Preserve image frames, crop geometry, and positioning when possible.

### Charts and embedded workbooks

Treat charts and OLE or embedded workbooks as preservation-sensitive. Avoid deleting or recreating chart parts unless necessary. If a chart is purely decorative and easier to replace visually, rebuilding the slide may be safer than surgically rewriting the chart package.

### Comments

Do not accidentally duplicate review comments onto new slides. The bundled `add_slide.py` strips comment relationships by default for duplicated slides.

### Hidden slides

Preserve hidden states unless the user explicitly asks to change them.

## XML parser safety

Use namespace-safe XML tooling. Avoid workflows that rewrite namespace prefixes or flatten attributes casually.

When writing custom scripts, prefer safe XML parsers and make sure the serializer preserves required namespaces and relationship attributes.

## When python-pptx is acceptable

Use `python-pptx` only when the edit scope is modest and the deck is not highly template-sensitive.

```python
from pptx import Presentation

prs = Presentation("input.pptx")
slide = prs.slides[0]
slide.shapes.title.text = "Updated Title"
body = slide.placeholders[1].text_frame
body.clear()
body.paragraphs[0].text = "Updated bullet 1"
p = body.add_paragraph()
p.text = "Updated bullet 2"
prs.save("output.pptx")
```

Do not use this path when the user expects close preservation of intricate template mechanics.

## Cleaning and validation

After structural changes, always run:

```bash
python scripts/clean.py unpacked/
python scripts/office/validate.py unpacked/ --original working.pptx
```

Then repack:

```bash
python scripts/office/pack.py unpacked/ output.pptx --original working.pptx
```

## Final QA loop

Before delivery:

1. Render previews.
   ```bash
   python scripts/preview.py output.pptx --output-dir preview_final/ --montage
   ```
2. Run QC.
   ```bash
   python scripts/qc.py output.pptx --baseline working.pptx --output-dir qc/
   ```
3. Check:
   - slide order
   - hidden slides
   - notes and `[Sources]` coverage
   - no placeholder leftovers
   - no broken package relationships
   - no missing masters, layouts, themes, media, notes, or comments
   - no obvious visual regressions in rendered previews
