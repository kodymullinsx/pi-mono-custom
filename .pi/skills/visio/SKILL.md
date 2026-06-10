---
name: visio
description: Use this skill whenever a Microsoft Visio file or Visio OOXML package is a primary input or deliverable. Trigger for inspecting, unpacking, validating, extracting text from, auditing, repairing, lightly editing, repacking, converting, or explaining `.vsdx`, `.vsdm`, `.vssx`, `.vssm`, `.vstx`, `.vstm`, `.vdx`, or legacy `.vsd` files; for preserving editable Visio diagrams, pages, masters, stencils, shape data, connectors, relationship parts, embedded media, and template behavior; and when a user asks whether a Visio file can be read as XML/text or used as a source for another artifact.
---

# Purpose

This skill is for high-control work with Visio drawings and Visio OOXML packages. It helps inspect diagram structure, extract text and graph relationships, make preservation-sensitive edits, and repack files without damaging pages, masters, ShapeSheet formulas, connectors, or embedded media.

Primary target formats:

- `.vsdx`
- `.vsdm`
- `.vssx`
- `.vssm`
- `.vstx`
- `.vstm`
- `.vdx`
- legacy `.vsd` as a read/convert source only

Use PDF, PNG, SVG, Markdown, CSV, or JSON as intermediate analysis artifacts unless the user explicitly asks for those as the final output. If the user needs an editable Visio drawing, deliver a Visio package and preserve Visio-native structure.

# Quick reference

| Task | Guide |
|------|-------|
| Inspect package structure | `python scripts/visio_inspect.py drawing.vsdx > inspect.json` |
| Validate package integrity | `python scripts/validate.py drawing.vsdx` |
| Unpack for editing | `python scripts/unpack.py drawing.vsdx unpacked/` |
| Repack after editing | `python scripts/pack.py unpacked/ output.vsdx` |
| Understand raw XML parts | Read `references/visio-ooxml.md` |

# File-type policy

## Visio OOXML packages

For `.vsdx`, `.vsdm`, `.vssx`, `.vssm`, `.vstx`, and `.vstm`, treat the file as an Open Packaging Convention ZIP with Visio XML parts. Preserve the package and edit with the least destructive workflow available.

## Macro-enabled drawings, stencils, and templates

If the package is macro-enabled or contains binary project parts, preserve the macro-enabled extension. Do not convert `.vsdm`, `.vssm`, or `.vstm` to a non-macro extension unless the user explicitly asks to remove macros.

## Legacy `.vsd`

Treat `.vsd` as a legacy binary source. Convert it to `.vsdx` or `.vdx` before XML-level editing. Do not promise exact round-tripping from legacy binary Visio.

## Visio XML `.vdx`

Treat `.vdx` as directly XML-readable, but keep it separate from `.vsdx` package workflows. Do not zip a `.vdx` and call it a `.vsdx`.

## Misnamed `.zip`

Some Visio packages are handed over with a `.zip` extension. Inspect `[Content_Types].xml` and `_rels/.rels`; if they point to `visio/document.xml` with Visio relationship types, treat the file as a Visio OOXML package.

# Core operating principles

## Preservation beats reconstruction

If the user provides an existing Visio file, preserve:

- page IDs, names, order, page dimensions, layers, background pages, and page sheet cells
- shape IDs, names, masters, ShapeSheet cells, formulas, units, geometry rows, controls, actions, custom properties, and user cells
- text runs and formatting markers such as `cp`, `pp`, `tp`, `fld`, and `text` element tail content
- connector shapes, `BeginX` and `EndX` formulas, trigger cells, arrow cells, route geometry, and `<Connects>` edges
- master catalogue entries, master XML parts, stencil references, icons, and master relationships
- embedded media, OLE objects, data graphics, data recordsets, comments, review markup, and external relationships when present
- macro project parts and macro-enabled extensions when present

Do not rebuild a user-provided diagram from scratch when fidelity matters. Clone or edit the original package.

## Use structured XML operations

Visio XML is ShapeSheet-like. A shape is usually a `<Shape>` element with direct `<Cell N="..." V="...">` children and nested `<Section>/<Row>/<Cell>` blocks. Text often contains formatting child elements whose tail text carries the actual words. Use an XML parser and `itertext()` for analysis, not line-oriented text scraping.

When editing text, preserve formatting markers where possible. If a simple text replacement would erase rich run boundaries, either perform a targeted tail/text replacement inside the existing `<Text>` element or explain the fidelity risk before proceeding.

## Connectors are two-layer data

A Visio connector is both a shape and a graph edge. Inspect both:

- the connector shape cells such as `BeginX`, `BeginY`, `EndX`, `EndY`, `BeginArrow`, `EndArrow`, `LinePattern`, and geometry rows
- the page-level `<Connects>` collection that maps connector endpoints to source and target shapes

Do not infer process flow from visual order alone when `<Connects>` is available.

## Visual QA is mandatory for edited diagrams

A package that validates can still look wrong. For user-facing diagram edits, render or open the result when a renderer is available. Prefer Microsoft Visio for the final smoke test on machines that have it. LibreOffice or other converters can be useful for previews but may not preserve Visio-specific behavior exactly.

If no renderer is available, say so and provide package-level validation plus a focused XML diff summary.

# Standard workflows

## Read or audit a Visio package

1. Run `python scripts/validate.py input.vsdx`.
2. Run `python scripts/visio_inspect.py input.vsdx > inspect.json`.
3. Review pages, page dimensions, masters, shape counts, text-bearing shapes, connector-derived edges, media, and relationship targets.
4. For process diagrams, use connector edges from `<Connects>` before writing a flow summary.
5. If the diagram is visual-heavy, render or open the drawing before making conclusions about layout.

## Edit an existing Visio package

1. Keep the original untouched and work on a copy.
2. Run `visio_inspect.py` and `validate.py` before changing anything.
3. Unpack with `scripts/unpack.py`.
4. Make targeted XML edits to page, master, relationship, or property parts.
5. Avoid renumbering shapes, pages, masters, or relationship IDs unless the edit requires it.
6. Run `scripts/validate.py unpacked/`.
7. Repack with `scripts/pack.py unpacked/ output.vsdx`.
8. Validate the packed output.
9. Render or open the output for visual QA when possible.

## Create a new Visio package

Prefer starting from a known-good seed `.vsdx`, template, or stencil. Raw creation is possible only for simple packages and carries more compatibility risk than cloning a working Visio-authored file.

For complex diagrams, use Microsoft Visio automation, a Visio-capable library, or a template-driven workflow. If the user only needs a visual diagram, SVG, PDF, Mermaid, or PowerPoint may be better outputs.

# Common XML structure

Read `references/visio-ooxml.md` for details. The essential package map is:

- `[Content_Types].xml`: content-type declarations for Visio parts
- `_rels/.rels`: package-level relationship to `visio/document.xml`
- `docProps/`: core, app, custom properties, and thumbnail
- `visio/document.xml`: document settings, colors, fonts, style sheets, document sheet
- `visio/_rels/document.xml.rels`: relationships to masters, pages, and windows
- `visio/pages/pages.xml`: page catalogue
- `visio/pages/pageN.xml`: shapes, page contents, and connector graph for a page
- `visio/pages/_rels/pageN.xml.rels`: page relationships to masters, media, or other parts
- `visio/masters/masters.xml`: master catalogue
- `visio/masters/masterN.xml`: master shape definitions
- `visio/media/`: embedded images such as EMF, PNG, JPG, or SVG
- `visio/windows.xml`: view/window state

# Validation expectations

Before calling a Visio edit done, prove at least:

- the ZIP package opens and has no corrupt entries
- all XML and `.rels` parts parse
- required Visio parts exist
- relationship targets resolve unless marked external
- pages referenced from `pages.xml` exist
- master IDs referenced by shapes exist in `masters.xml`
- connector `<Connect>` references point to existing shapes on the page
- the packed output validates after repacking

For high-value deliverables, also prove that desktop Visio opens the file without a repair prompt or that a renderer produced a plausible preview.

# Known limits

The bundled scripts perform structural checks and produce useful inspection JSON. They do not perform full ISO schema validation, do not guarantee visual fidelity, and do not replace a real Visio open/render check. Be explicit about those limits in final responses.
