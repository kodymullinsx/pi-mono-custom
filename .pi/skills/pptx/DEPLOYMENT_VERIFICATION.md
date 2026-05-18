# Deployment Verification

This bundle was smoke-tested in the container on 2026-04-19.

## Checks performed

1. Python syntax compilation
   - `python -m py_compile scripts/*.py scripts/office/*.py scripts/office/helpers/*.py scripts/office/validators/*.py`
2. Created a sample `.pptx` deck.
3. Ran inspection:
   - `python scripts/inspect.py sample.pptx`
4. Rendered preview assets:
   - `python scripts/preview.py sample.pptx --output-dir preview --montage`
5. Unpacked deck:
   - `python scripts/office/unpack.py sample.pptx unpacked`
6. Duplicated a slide into the unpacked package:
   - `python scripts/add_slide.py unpacked slide2.xml --position after:slide2.xml --json`
7. Cleaned orphaned package parts:
   - `python scripts/clean.py unpacked`
8. Validated unpacked PowerPoint directory:
   - `python scripts/office/validate.py unpacked`
9. Repacked and validated:
   - `python scripts/office/pack.py unpacked repacked_sample.pptx --original sample.pptx`
10. Ran end-to-end QC:
    - `python scripts/qc.py repacked_sample.pptx --baseline sample.pptx --output-dir qc`

## Result

All smoke-test steps above completed successfully.

## Documentation corrections included in this build

- Restored the design-direction section in `SKILL.md`, including palettes, layout variety, typography, spacing, and the explicit rule against AI-hallmark accent lines under titles.
- Restored the critical PptxGenJS corruption-prevention guidance in `pptxgenjs.md`, including color-string rules, opacity handling, option-object reuse hazards, rounded-rectangle accent-bar caveat, and bullet/line-spacing pitfalls.
- Restored practical PptxGenJS reference sections for icons, charts, shapes, and backgrounds.
- Reworked helper imports so `/home/oai/skills/slides/pptxgenjs_helpers` is documented as an optional environment-specific path rather than a required hardcoded dependency.
- Restored XML editing examples and the smart-quotes entity table in `editing.md`.
- Broadened the trigger description so “deck,” “slides,” and “presentation” requests are captured when a PowerPoint file is the likely source or deliverable.

## Important implementation notes

- `scripts/add_slide.py` updates `ppt/presentation.xml` itself and preserves the required `<p:sldId id="..." r:id="..."/>` attributes.
- `scripts/office/validate.py` can infer document type from an unpacked OOXML directory, including PowerPoint packages, so `python scripts/office/validate.py unpacked/` works without needing `--original`.
- `scripts/inspect.py` is a thin wrapper around `presentation_inspect.py` to avoid shadowing Python's standard-library `inspect` module.
- `scripts/qc.py` uses timeouts for optional external helpers so QC still produces `qc_report.json` even if an external helper hangs.
