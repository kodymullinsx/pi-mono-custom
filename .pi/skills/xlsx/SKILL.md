---
name: xlsx
description: "Use this skill when an OOXML Excel workbook is the primary input or deliverable. Trigger for creating, editing, repairing, auditing, recalculating, previewing, or converting .xlsx, .xlsm, .xltx, and .xltm files; for preserving and updating existing Excel templates; and for producing spreadsheet-native deliverables with formulas, formatting, tables, charts, validations, comments, macros, or cached formula results. Do not trigger merely because data is tabular: CSV/TSV/plain tables are sources or lightweight outputs unless the user asks for an Excel workbook. Do not trigger when the primary deliverable is a Word document, PDF report, standalone Python script, database pipeline, Google Sheets API integration, or general data analysis without an Excel workbook deliverable."
license: Proprietary. LICENSE.txt has complete terms
---

# Purpose

This skill is for high-control Excel work. It should help create or modify workbooks that preserve structure, keep formulas live, follow professional formatting conventions, and pass package, formula, and visual QA before delivery.

The primary target formats are OOXML Excel workbooks:

- `.xlsx`
- `.xlsm`
- `.xltx`
- `.xltm`

Use CSV/TSV only as inputs, intermediate artifacts, or explicitly requested lightweight exports. If the user needs formulas, formatting, multiple tabs, tables, comments, validations, charts, macros, or cached calculated values, deliver an Excel workbook.

# File-type policy

## OOXML workbooks

For `.xlsx`, `.xlsm`, `.xltx`, and `.xltm`, preserve the workbook package and edit with the least destructive workflow possible.

## Macro-enabled workbooks

For `.xlsm` and `.xltm`, preserve the macro-enabled extension and load with `keep_vba=True` when using openpyxl. Do not convert a macro-enabled workbook to `.xlsx` unless the user explicitly asks to remove macros.

## `.xlsb` binary workbooks

`.xlsb` files are not OOXML ZIP packages and cannot be safely edited or round-tripped by this skill’s openpyxl/OOXML tooling.

Safe `.xlsb` handling:

- read/extract values only, using `pyxlsb`, pandas with a compatible engine, or a LibreOffice conversion path when available
- convert/extract to `.xlsx` or `.xlsm` before editing
- tell the user that exact `.xlsb` round-tripping is not available
- do not promise to preserve `.xlsb` formatting, macros, pivot caches, charts, slicers, or binary workbook internals

## Legacy `.xls`

Treat `.xls` as a legacy binary source. Extract or convert to `.xlsx` before editing. Do not promise exact round-tripping.

## Encrypted or password-protected workbooks

If a workbook is encrypted or requires an open password, use a decrypt-first workflow only when the user has provided the password. Do not try to bypass protection. If the file only has workbook/sheet protection, inspect it and avoid changing protected structure unless the user asks and has the authority to do so.

# Core operating principles

## Preservation beats reinvention

If the user provides an existing workbook, preserve:

- sheet order, sheet names, tab colors, and hidden/very hidden states
- formulas, shared formulas, array formulas, defined names, and links
- tables, filters, sorting behavior, and data validations
- charts, drawings, images, comments, notes, and conditional formatting
- frozen panes, page layout, print settings, headers/footers, and workbook protection
- pivot tables, pivot caches, slicers, timelines, query tables, external links, and connections
- VBA projects and macro-enabled file types when present

Do not rebuild a user-provided workbook with pandas or XlsxWriter if preservation matters.

## Formulas stay in Excel

Derived values must be implemented as spreadsheet formulas, not calculated in Python and pasted as constants.

Use Python for data cleaning, mapping, source preparation, workbook assembly, and formatting. Use Excel formulas for totals, ratios, percentages, margins, growth rates, checks, KPIs, linked outputs, and model logic.

### Wrong: hardcoding calculated values

```python
# Bad: this calculates a dynamic output in Python and hardcodes it.
total = df["Sales"].sum()
ws["B10"] = total

# Bad: this hardcodes a growth rate that should update when the workbook changes.
growth = (df.iloc[-1]["Revenue"] - df.iloc[0]["Revenue"]) / df.iloc[0]["Revenue"]
ws["C5"] = growth
```

### Correct: use workbook formulas

```python
ws["B10"] = "=SUM(B2:B9)"
ws["C5"] = "=(C4-C2)/C2"
ws["D20"] = "=AVERAGE(D2:D19)"
```

## No new workbook breakage

Do not deliver workbooks that introduce:

- formula errors such as `#REF!`, `#DIV/0!`, `#VALUE!`, `#N/A`, `#NAME?`, `#NUM!`, `#NULL!`, `#SPILL!`, or `#CALC!`
- broken defined names
- broken package relationships
- missing content type declarations
- corrupted workbook XML
- duplicate worksheet auto filters over table ranges
- lost macros, pivots, charts, images, validations, comments, or hidden sheets unless intentionally removed

## Cached values are required

If formulas were added or modified, the delivered workbook must have refreshed cached values. An openpyxl-saved workbook generally stores formula strings but does not calculate formula results. Recalculate before delivery.

# Tool selection

## Use openpyxl for preservation-sensitive editing

Choose openpyxl for:

- editing existing workbooks
- preserving formatting and workbook structure
- adding or modifying formulas, comments, validations, tables, defined names, and targeted styles
- updating user-provided templates
- working with `.xlsm` or `.xltm` while preserving VBA via `keep_vba=True`

Critical openpyxl rules:

- Load workbooks for editing with `data_only=False`. This is the default and preserves formulas.
- Use `data_only=True` only to read cached values from a separate workbook object after recalculation.
- Never save a workbook that was loaded with `data_only=True`; doing so can replace formulas with cached values and permanently lose formulas.
- For `.xlsm` and `.xltm`, use `keep_vba=True` and preserve the original extension.
- If a worksheet has an Excel Table, do not also set `ws.auto_filter.ref` to the same range.
- Avoid destructive row/column deletes in workbooks containing pivots, charts, external links, slicers, query tables, or complex drawings unless you have inspected and compared the package.
- Prefer targeted cell/range updates over sheet rebuilds.

## Use XlsxWriter for brand-new polished workbooks

Choose XlsxWriter for new workbook generation when no existing workbook must be preserved and you need:

- polished formatting from scratch
- chart-heavy or dashboard-style outputs
- tables, conditional formats, data validation, sparklines, print settings, and layout control
- deterministic workbook creation from dataframes or Python objects

Do not use XlsxWriter to edit existing workbooks. It is a write-only generator.

## Use pandas or Polars for tabular wrangling

Use dataframe libraries for:

- reading raw workbook tabs
- cleaning, joining, reshaping, deduplicating, grouping, and pivoting data
- validating tabular schema before writing to a workbook
- producing source tabs that will then feed formulas

Do not use pandas to overwrite a styled, macro-enabled, or preservation-sensitive workbook.

For large read-only ingestion, prefer faster engines when available:

- pandas `read_excel(..., engine="calamine")`
- Polars/fastexcel/calamine-based readers
- `pyxlsb` for `.xlsb` value extraction

These engines are for ingestion and analysis, not high-fidelity workbook editing.

## Use dataframe validation when correctness depends on schema

For messy business data, regulated reporting, finance model inputs, or contractually important tables, validate source data before writing to Excel. Good options include Pandera and Great Expectations. Keep these checks upstream of the workbook generation step.

## Formula-engine libraries are optional test aids only

Libraries such as `formulas`, `xlsx_evaluate`, or similar local formula evaluators may be useful for narrow unit tests or lint experiments. They are not the default workflow and are not authoritative for final delivery. Final cached values should come from a spreadsheet-native recalculation path such as LibreOffice/Excel-compatible evaluation through the provided recalc workflow.

# Standard workflows

## Existing workbook workflow

1. Save a copy of the original workbook.
2. Inspect the workbook structure and preservation risks.
3. Render or preview important sheets when visual fidelity matters.
4. Choose the least destructive edit path, usually openpyxl.
5. Make targeted edits with formulas preserved.
6. Recalculate formulas and update cached values.
7. Validate OOXML package integrity.
8. Compare against the original workbook when preservation matters.
9. Render a final preview and visually check key sheets.
10. Deliver only after formula, package, and visual QA pass.

## New workbook workflow

1. Build and validate source data in Python.
2. Choose XlsxWriter for polished one-shot generation, or openpyxl when later in-place edits or openpyxl-specific objects are needed.
3. Put assumptions and raw inputs in clearly labeled cells or tabs.
4. Use formulas for all derived outputs.
5. Apply professional formatting, widths, number formats, and comments/source notes.
6. Recalculate formulas and cache results.
7. Validate and preview before delivery.

# Included quality-control scripts

Run scripts from the skill root unless paths are absolute.

## `scripts/inspect.py`

Use this first on any non-trivial workbook.

It inventories package parts, sheet structure, tables, validations, conditional formatting, comments, charts, images, merged cells, defined names, calculation settings, protection, formula risks, cached errors, external links, VBA, pivots, query tables, and other preservation-sensitive features.

Example:

```bash
python scripts/inspect.py model.xlsm > inspect_before.json
python scripts/inspect.py modified.xlsm --compare-to model.xlsm > inspect_after.json
```

## `scripts/recalc.py`

Recalculates formulas and writes refreshed cached values back into the original OOXML workbook package using a LibreOffice-evaluated snapshot. It also removes stale calc chains, forces full/automatic recalc on open, and scans cached results for Excel error literals.

Important: `scripts/recalc.py` modifies the workbook in place. Work on a copy if you need to preserve the pre-recalc file.

Usage:

```bash
python scripts/recalc.py output.xlsx 60
```

Success or formula-error output schema:

```json
{
  "status": "success",
  "total_formulas": 42,
  "cached_values_updated": 42,
  "total_errors": 0,
  "error_summary": {},
  "warnings": [],
  "evaluation_backend": "libreoffice_roundtrip_snapshot",
  "calc_chain_removed": true
}
```

When formula errors are found, `status` is `errors_found` and `error_summary` is grouped by error literal:

```json
{
  "status": "errors_found",
  "total_formulas": 42,
  "cached_values_updated": 42,
  "total_errors": 3,
  "error_summary": {
    "#REF!": {
      "count": 2,
      "locations": ["Summary!D12", "Model!F20"]
    },
    "#DIV/0!": {
      "count": 1,
      "locations": ["Ratios!C8"]
    }
  },
  "warnings": [],
  "evaluation_backend": "libreoffice_roundtrip_snapshot",
  "calc_chain_removed": true
}
```

Failure schema:

```json
{
  "error": "Workbook appears to be password-protected or encrypted. Decrypt it first, or use msoffcrypto-tool if available."
}
```

How to act on recalc output:

- If `error` exists, fix the file/access/tooling problem before delivery.
- If `status` is `errors_found`, inspect every entry in `error_summary`, fix formulas, then recalc again.
- If `cached_values_updated < total_formulas`, treat the warning as a delivery blocker unless the missing cached formulas are intentionally unsupported and documented.
- If `warnings` is non-empty, read and address them before delivery.

## `scripts/office/validate.py`

Validates packed or unpacked OOXML files. For Excel workbooks it checks XML well-formedness, namespaces, relationship targets, content types, XSD conformance, workbook sheet references, defined names, table integrity, duplicate auto filters on table ranges, and package-level issues.

Examples:

```bash
python scripts/office/validate.py output.xlsx
python scripts/office/validate.py output.xlsm --original template.xlsm --auto-repair
python scripts/office/validate.py broken.xlsx --auto-repair --write-repaired repaired.xlsx
```

## `scripts/preview.py`

Exports a workbook to PDF and PNG previews for visual QA.

Use this whenever formatting, charts, page layout, print areas, column widths, row heights, or dashboards matter.

Example:

```bash
python scripts/preview.py output.xlsx --output-dir preview/
```

## `scripts/decrypt.py`

If a workbook is encrypted and the user has provided the password, decrypt it into a normal OOXML workbook before editing. This helper uses `msoffcrypto-tool` when available.

Example:

```bash
python scripts/decrypt.py protected.xlsx decrypted.xlsx --password "secret"
```

## `scripts/qc.py`

Runs the end-to-end QA chain: inspect, recalc, validate, and preview.

Example:

```bash
python scripts/qc.py output.xlsx --baseline original.xlsx --output-dir qc/
```

Treat `status: "issues_found"` or `status: "error"` as a blocker. Review `critical_issues`, `warnings`, and `qc_report.json` before delivery.

# Code examples

## 1) pandas read/analyze workflow

Use this for data analysis and preparation. Do not use it to overwrite preservation-sensitive templates.

```python
from pathlib import Path
import pandas as pd

input_path = Path("source.xlsx")

# Prefer calamine for fast read-only ingestion when installed; fall back gracefully.
try:
    sheets = pd.read_excel(input_path, sheet_name=None, engine="calamine")
except Exception:
    sheets = pd.read_excel(input_path, sheet_name=None)

raw = sheets["Data"]

# Clean and analyze in pandas.
df = (
    raw.dropna(how="all")
       .rename(columns=lambda c: str(c).strip())
)

summary = (
    df.groupby("Region", as_index=False)["Revenue"]
      .sum()
      .sort_values("Revenue", ascending=False)
)

# Safe only for a simple new workbook, not for overwriting a styled template.
with pd.ExcelWriter("analysis_output.xlsx", engine="xlsxwriter") as writer:
    df.to_excel(writer, sheet_name="Clean Data", index=False)
    summary.to_excel(writer, sheet_name="Summary", index=False)
```

For `.xlsb` value extraction, use a read-only path and then convert the deliverable to `.xlsx`:

```python
import pandas as pd

# Requires pyxlsb or a compatible engine in the environment.
df = pd.read_excel("legacy_source.xlsb", sheet_name="Data", engine="pyxlsb")
df.to_excel("converted_for_editing.xlsx", index=False)
```

## 2) openpyxl edit-existing workflow

Use this for user-provided workbooks where formatting, formulas, macros, pivots, charts, or hidden structure must be preserved.

```python
from copy import copy
from pathlib import Path
import json
import shutil
import subprocess

from openpyxl import load_workbook
from openpyxl.comments import Comment
from openpyxl.styles import Font, PatternFill

src = Path("template.xlsm")
out = Path("template_updated.xlsm")
shutil.copy2(src, out)

keep_vba = out.suffix.lower() in {".xlsm", ".xltm"}

# For editing, keep data_only=False. Never save a workbook loaded with data_only=True.
wb = load_workbook(out, data_only=False, keep_vba=keep_vba, keep_links=True)
ws = wb["Model"]

# Preserve nearby formatting when writing into a new period/column.
source_col = 4  # D
new_col = 5     # E
for row in range(1, ws.max_row + 1):
    src_cell = ws.cell(row=row, column=source_col)
    dst_cell = ws.cell(row=row, column=new_col)
    if src_cell.has_style:
        dst_cell._style = copy(src_cell._style)
    if src_cell.number_format:
        dst_cell.number_format = src_cell.number_format
    if src_cell.alignment:
        dst_cell.alignment = copy(src_cell.alignment)

# Hardcoded input: blue font, source comment.
ws["E5"] = 0.075
ws["E5"].number_format = "0.0%"
ws["E5"].font = Font(color="0000FF")  # Blue input: RGB 0,0,255
ws["E5"].comment = Comment(
    "Source: Company guidance deck, 2026-04-15, Revenue growth slide, URL if applicable",
    "AI"
)

# Formula output: black font and live Excel formula.
ws["E10"] = "=D10*(1+$E$5)"
ws["E10"].font = Font(color="000000")  # Formula: RGB 0,0,0

# Review flag: yellow fill.
ws["E5"].fill = PatternFill("solid", fgColor="FFFF00")  # RGB 255,255,0

wb.save(out)
wb.close()

# Recalculate and parse JSON output.
proc = subprocess.run(
    ["python", "scripts/recalc.py", str(out), "60"],
    check=False,
    capture_output=True,
    text=True,
)
recalc_result = json.loads(proc.stdout)

if recalc_result.get("error"):
    raise RuntimeError(recalc_result["error"])
if recalc_result.get("status") == "errors_found":
    raise RuntimeError(f"Formula errors found: {recalc_result['error_summary']}")
```

After recalculation, use `data_only=True` only for readback, and never save that object:

```python
from openpyxl import load_workbook

values_wb = load_workbook("template_updated.xlsm", data_only=True, keep_vba=True, keep_links=True)
try:
    print(values_wb["Model"]["E10"].value)
finally:
    values_wb.close()
```

## 3) XlsxWriter create-new workflow

Use this for new polished workbooks when there is no existing file to preserve.

```python
import pandas as pd

rows = [
    {"Year": "2026", "Revenue": 100.0, "Growth": 0.10},
    {"Year": "2027", "Revenue": None, "Growth": 0.12},
    {"Year": "2028", "Revenue": None, "Growth": 0.09},
]
df = pd.DataFrame(rows)

out = "new_model.xlsx"
with pd.ExcelWriter(out, engine="xlsxwriter") as writer:
    workbook = writer.book
    worksheet = workbook.add_worksheet("Model")
    writer.sheets["Model"] = worksheet

    # Formats. XlsxWriter uses HTML-style hex colors.
    title_fmt = workbook.add_format({"bold": True, "font_size": 14})
    header_fmt = workbook.add_format({"bold": True, "bg_color": "#D9EAF7", "border": 1})
    input_fmt = workbook.add_format({"font_color": "#0000FF", "num_format": "0.0%"})
    formula_fmt = workbook.add_format({"font_color": "#000000", "num_format": "$#,##0.0;[Red]($#,##0.0);-"})
    year_fmt = workbook.add_format({"align": "right"})

    worksheet.write("A1", "Revenue Model", title_fmt)
    worksheet.write_row("A3", ["Year", "Revenue ($mm)", "Growth"], header_fmt)

    start_row = 3
    for i, row in enumerate(rows, start=start_row):
        excel_row = i + 1
        worksheet.write(i, 0, row["Year"], year_fmt)
        if row["Revenue"] is None:
            worksheet.write_formula(i, 1, f"=B{excel_row-1}*(1+C{excel_row})", formula_fmt)
        else:
            worksheet.write_number(i, 1, row["Revenue"], formula_fmt)
        worksheet.write_number(i, 2, row["Growth"], input_fmt)

    total_row = start_row + len(rows)
    worksheet.write(total_row, 0, "Total", header_fmt)
    worksheet.write_formula(total_row, 1, f"=SUM(B{start_row+1}:B{total_row})", formula_fmt)

    worksheet.add_table(start_row - 1, 0, total_row - 1, 2, {
        "name": "RevenueTable",
        "columns": [{"header": "Year"}, {"header": "Revenue ($mm)"}, {"header": "Growth"}],
        "style": "Table Style Medium 2",
    })

    chart = workbook.add_chart({"type": "line"})
    chart.add_series({
        "name": "Revenue",
        "categories": f"=Model!$A${start_row+1}:$A${total_row}",
        "values": f"=Model!$B${start_row+1}:$B${total_row}",
    })
    chart.set_title({"name": "Revenue Forecast"})
    worksheet.insert_chart("E3", chart)

    worksheet.set_column("A:A", 12)
    worksheet.set_column("B:C", 16)
    worksheet.freeze_panes(start_row, 1)
```

Then run `scripts/recalc.py`, `scripts/office/validate.py`, and `scripts/preview.py` before delivery.

## 4) openpyxl create-new workflow

Use this for a new workbook when openpyxl objects, later in-place editing, comments, or close parity with the edit-existing workflow matter more than XlsxWriter’s generation features.

```python
from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

wb = Workbook()
ws = wb.active
ws.title = "Model"
ws.sheet_view.showGridLines = False

# Styles. openpyxl colors are RGB hex strings; alpha-prefixed ARGB is also accepted.
blue_input = Font(color="0000FF")     # RGB 0,0,255
black_formula = Font(color="000000")  # RGB 0,0,0
green_link = Font(color="008000")     # RGB 0,128,0
header_fill = PatternFill("solid", fgColor="1F4E78")
yellow_fill = PatternFill("solid", fgColor="FFFF00")
white_bold = Font(color="FFFFFF", bold=True)
top_border = Border(top=Side(style="thin"))

ws["A1"] = "Revenue Model"
ws["A1"].font = Font(bold=True, size=14)

headers = ["Year", "Revenue ($mm)", "Growth"]
for col, header in enumerate(headers, 1):
    cell = ws.cell(row=3, column=col, value=header)
    cell.fill = header_fill
    cell.font = white_bold
    cell.alignment = Alignment(horizontal="center")

inputs = [("2026", 100.0, 0.10), ("2027", None, 0.12), ("2028", None, 0.09)]
for r, (year, revenue, growth) in enumerate(inputs, 4):
    ws.cell(r, 1, year)
    rev_cell = ws.cell(r, 2)
    if revenue is None:
        rev_cell.value = f"=B{r-1}*(1+C{r})"
        rev_cell.font = black_formula
    else:
        rev_cell.value = revenue
        rev_cell.font = blue_input
        rev_cell.comment = Comment("Source: User-provided starting revenue, 2026-04-19, prompt/input file", "AI")
    rev_cell.number_format = '$#,##0.0;[Red]($#,##0.0);-'

    growth_cell = ws.cell(r, 3, growth)
    growth_cell.font = blue_input
    growth_cell.fill = yellow_fill
    growth_cell.number_format = "0.0%"

ws[7][0].value = "Total"
ws[7][1].value = "=SUM(B4:B6)"
ws[7][1].font = black_formula
ws[7][1].number_format = '$#,##0.0;[Red]($#,##0.0);-'
for cell in ws[7]:
    cell.border = top_border
    cell.font = Font(bold=True, color="000000")

for col_idx in range(1, 4):
    ws.column_dimensions[get_column_letter(col_idx)].width = 16

ws.freeze_panes = "B4"
wb.save("new_model_openpyxl.xlsx")
```

# Formula quality rules

## Construction rules

- Use formulas for every derived value.
- Put assumptions in dedicated input cells or assumption tables.
- Use cell references instead of magic numbers: `=B5*(1+$B$6)`, not `=B5*1.05`.
- Use absolute references where needed for copy-safe formulas.
- Use helper rows/cells when a formula would otherwise become unreadable.
- Avoid volatile functions such as `INDIRECT`, `OFFSET`, `TODAY`, `NOW`, `RAND`, and `RANDBETWEEN` unless the model genuinely needs them.
- If writing text that begins with `=`, prefix it with an apostrophe: `'=high-low`.
- Use explicit sheet references for cross-sheet formulas, quoting sheet names with spaces: `'Input Data'!B5`.

## Formula verification checklist

Before delivery, perform these checks:

### Essential mapping checks

- Verify 2-3 sample source references manually before filling formulas across a range.
- Confirm column mapping with `get_column_letter()` or equivalent; far-right columns are easy to mis-map.
- Confirm row offsets between zero-indexed dataframes and one-indexed Excel rows.
- Search all possible matching labels, not just the first match, when mapping line items.
- Confirm formulas point to the intended sheet, especially when sheet names are similar.

### Range and copy checks

- Check first, middle, and last formulas in each filled row/column.
- Confirm copied formulas use the intended relative and absolute references.
- Confirm totals sum the intended contiguous rows and do not include headers, blank spacer rows, or the total row itself.
- Confirm inserted rows/columns did not break tables, named ranges, charts, print areas, validations, or conditional formatting.

### Data-quality checks

- Handle `NaN`, `None`, blank strings, and unexpected text before formulas consume them.
- Guard denominators that may be zero or blank to avoid `#DIV/0!`.
- Test formulas with zero, negative, very large, and missing values when those cases are plausible.
- Verify date values are true Excel dates when date arithmetic is used.
- Verify imported numeric-looking text has been converted where calculations require numbers.

### Workbook calculation checks

- Recalculate with `scripts/recalc.py` after adding or changing formulas.
- Treat every entry in `error_summary` as a blocker until fixed or explicitly documented.
- Read back a few key outputs with `data_only=True` after recalc, but never save that workbook object.
- Confirm workbook calculation mode was not unintentionally left as manual.
- Confirm no unintended external links were introduced.

# Formatting requirements

## Existing workbooks

Existing template conventions always override new-workbook conventions. Study the workbook and match its style exactly. Do not impose standardized formatting on a file with an established pattern.

When editing previously blank areas, infer style from adjacent comparable rows/columns and copy styles carefully. Preserve row heights, column widths, number formats, borders, fills, font colors, alignments, freeze panes, print settings, and page layout.

## New workbooks

Use a clean professional style:

- consistent professional font
- clear title and section headers
- distinct header formatting
- readable column widths and row heights
- appropriate number/date formats
- restrained fills and borders
- strategic whitespace between sections
- frozen panes where useful
- hidden gridlines for finance or presentation-style models

Do not apply borders around every filled cell unless the style specifically calls for it.

## Number formats

Default conventions unless the workbook or user says otherwise:

- Years: store/display as text strings when they are period labels, e.g. `"2026"`, not `2,026`.
- Currency: use an appropriate symbol and separators; specify units in headers, e.g. `Revenue ($mm)`.
- Zeros in finance models: display as `-`.
- Negative numbers in finance models: use parentheses and red where appropriate, e.g. `(500)`, not `-500`.
- Percentages: usually `0.0%`.
- Multiples: use `0.0x`.
- Dates: use date formats; do not leave Excel serial numbers visible.

Common finance number formats:

```text
$#,##0;[Red]($#,##0);-
$#,##0.0;[Red]($#,##0.0);-
0.0%;[Red](0.0%);-
0.0x;[Red](0.0x);-
```

# Finance-specific conventions

Use these only when creating new finance models or adding to an existing finance model without conflicting template conventions.

## Color coding

- Blue text (RGB: 0,0,255; hex `0000FF`): hardcoded inputs and scenario assumptions users may change.
- Black text (RGB: 0,0,0; hex `000000`): formulas and calculations.
- Green text (RGB: 0,128,0; hex `008000`): links pulling from other worksheets in the same workbook.
- Red text (RGB: 255,0,0; hex `FF0000`): external links to other files.
- Yellow background (RGB: 255,255,0; hex `FFFF00`): key assumptions requiring attention or update.
- Gray text or fill may be used for static constants when a model uses that convention.
- Orange or light red may be used for review flags, warnings, or errors when a template does not specify another convention.

Implementation examples:

```python
from openpyxl.styles import Font, PatternFill

ws["B5"].font = Font(color="0000FF")          # Blue hardcode
ws["B6"].font = Font(color="000000")          # Black formula
ws["B7"].font = Font(color="008000")          # Green intra-workbook link
ws["B8"].font = Font(color="FF0000")          # Red external link
ws["B5"].fill = PatternFill("solid", fgColor="FFFF00")
```

```python
input_fmt = workbook.add_format({"font_color": "#0000FF"})
formula_fmt = workbook.add_format({"font_color": "#000000"})
link_fmt = workbook.add_format({"font_color": "#008000"})
external_fmt = workbook.add_format({"font_color": "#FF0000"})
review_fmt = workbook.add_format({"bg_color": "#FFFF00"})
```

## Model layout

- Put assumptions in clearly labeled sections.
- Keep formulas consistent across projection periods.
- Make total calculations direct sums of the rows immediately above whenever possible.
- Add top borders above totals across the relevant label and numeric columns.
- Right-align period headers and numeric columns.
- Left-align row labels; indent sub-metrics such as `% margin` or `% growth`.
- Use black or dark blue section headers with white text when creating investment-banking style models.
- Always specify units in headers.

## Documentation requirements for hardcoded sources

Every externally sourced hardcoded input in a financial model must be documented in a comment or adjacent source column.

Required format:

```text
Source: [System/Document], [Date], [Specific Reference], [URL if applicable]
```

Examples:

```text
Source: Company 10-K, FY2024, Page 45, Revenue Note, [SEC EDGAR URL]
Source: Company 10-Q, Q2 2025, Exhibit 99.1, [SEC EDGAR URL]
Source: Bloomberg Terminal, 2025-08-15, AAPL US Equity
Source: FactSet, 2025-08-20, Consensus Estimates Screen
Source: User-provided workbook, 2026-04-19, Input tab cell C12
```

For row-level researched data, use a source column when comments would be hard to audit.

# Preservation guidance for complex workbook features

## VBA and macros

If the package contains `xl/vbaProject.bin`:

- keep the workbook macro-enabled
- use `.xlsm` or `.xltm` output as appropriate
- load with `keep_vba=True`
- do not modify VBA code with openpyxl
- do not convert to `.xlsx` unless the user explicitly wants macros removed

## Pivot tables and pivot caches

Treat pivots as preserve-first artifacts.

Safe pattern:

- update source data or source ranges carefully
- preserve pivot cache parts and relationships
- avoid trying to create, rebuild, or deeply alter pivots with openpyxl
- compare package features before and after edits
- preview the workbook after edits

## External links, query tables, and connections

These are fragile. Avoid broad worksheet surgery. Inspect first, preserve relationships and content types, compare to baseline afterward, and validate the package.

## Tables

Preserve Excel Tables when present.

Rules:

- keep table names unique across the workbook
- keep table refs accurate after row/column changes
- do not overlap tables on the same sheet
- do not duplicate a worksheet-level auto filter over the same table range
- preserve table style and totals-row behavior unless intentionally changed

## Charts, drawings, images, and comments

Prefer surgical edits around these objects. Do not rewrite entire sheets if charts, drawings, images, controls, or comments are present. Always generate a preview after editing.

## Defined names

Inspect defined names before deleting, renaming, or moving sheets. Check for `#REF!` in names after modifications.

## Hidden and very hidden sheets

Preserve hidden states. Do not unhide, delete, or repurpose hidden sheets unless the user asks.

# Large workbook tactics

For large workbooks:

- read only the needed sheets and columns
- use dataframe tools for heavy transforms, then write back surgically
- prefer calamine/fastexcel/pyxlsb for read-only ingestion when appropriate
- avoid writing across huge unused ranges
- avoid expanding sparse worksheets unintentionally
- preserve existing workbook structure rather than copying millions of cells into a new file unless necessary
- use `read_only=True` only for read-only inspection, not editing
- use `write_only=True` only for brand-new streaming workbook creation where styling requirements are simple

# Safe defaults and anti-patterns

## Good defaults

- inspect before editing
- copy the original before mutation
- preserve existing workbook conventions
- use formulas for derived values
- document hardcoded external inputs
- recalc before reading final outputs
- validate package integrity
- preview important sheets
- compare to the original when preservation matters

## Anti-patterns to avoid

- using pandas to overwrite a styled workbook
- using XlsxWriter to “edit” an existing workbook
- saving a workbook loaded with `data_only=True`
- accidentally converting `.xlsm` to `.xlsx`
- promising `.xlsb` round-tripping
- deleting rows/columns blindly in pivot/chart workbooks
- shipping stale formula caches
- duplicating `ws.auto_filter.ref` on a table range
- hardcoding Python-calculated totals into model outputs
- ignoring external links, query tables, slicers, hidden sheets, or defined names
- delivering without opening/validating/rendering a representative preview

# Minimum QA gate before delivery

Do not deliver until all applicable checks pass:

- The workbook is a valid OOXML package for `.xlsx`, `.xlsm`, `.xltx`, or `.xltm` outputs.
- The file extension matches the workbook content, especially for macro-enabled files.
- Formula caches are refreshed after formula edits.
- `scripts/recalc.py` has no `error` and no unresolved `error_summary` entries.
- No new formula error literals remain.
- Package validation passes or auto-repaired output has been written and revalidated.
- Baseline comparison does not show unexplained structural losses.
- Important sheets render correctly in PDF/PNG preview.
- Existing workbook styling and conventions are preserved.
- Hardcoded external inputs are documented with source, date, reference, and URL where applicable.
