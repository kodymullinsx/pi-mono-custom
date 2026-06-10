"""Run QA checks for a PowerPoint package and write a qc_report.json summary."""

from __future__ import annotations

import argparse
import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

from presentation_inspect import inspect_presentation
from preview import render_presentation


def _run_validate(input_path: Path, baseline: Path | None, output_dir: Path) -> tuple[bool, str]:
    validate_script = Path(__file__).resolve().parent / "office" / "validate.py"
    cmd = [sys.executable, str(validate_script), str(input_path)]
    if baseline:
        cmd.extend(["--original", str(baseline)])
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    log = (result.stdout or "") + ("\n" + result.stderr if result.stderr else "")
    log_path = output_dir / "validate.txt"
    log_path.write_text(log, encoding="utf-8")
    return result.returncode == 0, str(log_path.resolve())


def _run_markitdown(input_path: Path, output_dir: Path) -> tuple[bool, str | None, list[str]]:
    warnings: list[str] = []
    if importlib.util.find_spec("markitdown") is None:
        warnings.append("MarkItDown is not installed; skipped Markdown extraction.")
        return False, None, warnings
    md_path = output_dir / "extracted.md"
    try:
        result = subprocess.run([sys.executable, "-m", "markitdown", str(input_path)], capture_output=True, text=True, check=False, timeout=120)
    except subprocess.TimeoutExpired:
        md_path.write_text("", encoding="utf-8")
        warnings.append("MarkItDown timed out; skipped Markdown extraction.")
        return False, str(md_path.resolve()), warnings
    md_path.write_text(result.stdout or "", encoding="utf-8")
    if result.returncode != 0:
        warnings.append("MarkItDown extraction failed; see extracted.md and process stderr.")
    return result.returncode == 0, str(md_path.resolve()), warnings


def _run_slides_test(input_path: Path, output_dir: Path) -> tuple[bool, str | None, list[str]]:
    warnings: list[str] = []
    tool = Path("/home/oai/skills/slides/container_tools/slides_test.py")
    if not tool.exists():
        warnings.append("slides_test.py not found; skipped overflow detection.")
        return False, None, warnings
    log_path = output_dir / "slides_test.txt"
    try:
        result = subprocess.run([sys.executable, str(tool), str(input_path)], capture_output=True, text=True, check=False, timeout=120)
    except subprocess.TimeoutExpired:
        log_path.write_text("", encoding="utf-8")
        warnings.append("slides_test.py timed out; review the deck manually for overflow issues.")
        return False, str(log_path.resolve()), warnings
    log_path.write_text((result.stdout or "") + ("\n" + result.stderr if result.stderr else ""), encoding="utf-8")
    if result.returncode != 0:
        warnings.append("slides_test.py reported potential overflow or rendering issues; review slides_test.txt.")
    return result.returncode == 0, str(log_path.resolve()), warnings


def run_qc(input_path: str | Path, output_dir: str | Path, baseline: str | Path | None = None, require_sources_notes: bool = False, dpi: int = 160) -> dict[str, Any]:
    src = Path(input_path).resolve()
    out_dir = Path(output_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    preview_dir = out_dir / "preview"
    critical_issues: list[str] = []
    warnings: list[str] = []

    inspect_report = inspect_presentation(src, compare_to=baseline)
    inspect_path = out_dir / "inspect.json"
    inspect_path.write_text(json.dumps(inspect_report, indent=2), encoding="utf-8")

    placeholder_hits = inspect_report.get("placeholder_summary", {}).get("slides_with_hits", [])
    if placeholder_hits:
        critical_issues.append("Placeholder or leftover-template text was found. See inspect.json.")

    notes_summary = inspect_report.get("notes_summary", {})
    if require_sources_notes:
        missing_sources = notes_summary.get("slides_with_notes_but_no_sources_block", [])
        missing_notes = notes_summary.get("slides_missing_notes", [])
        if missing_sources:
            critical_issues.append(f"Slides with notes but no [Sources] block: {', '.join(missing_sources)}")
        if missing_notes:
            critical_issues.append(f"Slides missing notes while sources are required: {', '.join(missing_notes)}")
    else:
        missing_sources = notes_summary.get("slides_with_notes_but_no_sources_block", [])
        if missing_sources:
            warnings.append(f"Slides with notes but no [Sources] block: {', '.join(missing_sources)}")

    valid, validate_log = _run_validate(src, Path(baseline).resolve() if baseline else None, out_dir)
    if not valid:
        critical_issues.append("Office package validation failed. See validate.txt.")

    try:
        preview_report = render_presentation(src, preview_dir, dpi=dpi, create_montage=True)
        preview_report_path = preview_dir / "preview_report.json"
    except Exception as exc:
        preview_report = {"error": str(exc)}
        preview_report_path = None
        critical_issues.append(f"Preview rendering failed: {exc}")

    md_ok, markdown_path, md_warnings = _run_markitdown(src, out_dir)
    warnings.extend(md_warnings)
    slides_test_ok, slides_test_path, slides_test_warnings = _run_slides_test(src, out_dir)
    warnings.extend(slides_test_warnings)

    status = "success"
    if critical_issues:
        status = "issues_found"

    report = {
        "status": status,
        "input": str(src),
        "critical_issues": critical_issues,
        "warnings": warnings,
        "artifacts": {
            "inspect": str(inspect_path),
            "validate_log": validate_log,
            "preview_report": str(preview_report_path) if preview_report_path else None,
            "markdown": markdown_path,
            "slides_test": slides_test_path,
            "qc_report": str((out_dir / "qc_report.json").resolve()),
        },
        "summary": {
            "slides": inspect_report.get("counts", {}).get("slides"),
            "hidden_slides": inspect_report.get("counts", {}).get("hidden_slides"),
            "slides_with_notes": inspect_report.get("counts", {}).get("slides_with_notes"),
            "slides_with_sources_notes": inspect_report.get("counts", {}).get("slides_with_sources_notes"),
            "validation_passed": valid,
            "markitdown_passed": md_ok,
            "slides_test_passed": slides_test_ok,
        },
    }
    (out_dir / "qc_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Run QA checks for a PowerPoint package")
    parser.add_argument("input", help="Input PowerPoint package")
    parser.add_argument("--baseline", help="Optional baseline package for comparison")
    parser.add_argument("--output-dir", default="qc", help="Output directory (default: qc)")
    parser.add_argument("--require-sources-notes", action="store_true", help="Treat missing [Sources] notes blocks as a critical issue")
    parser.add_argument("--dpi", type=int, default=160, help="Preview render DPI (default: 160)")
    args = parser.parse_args()
    print(json.dumps(run_qc(args.input, args.output_dir, baseline=args.baseline, require_sources_notes=args.require_sources_notes, dpi=args.dpi), indent=2))


if __name__ == "__main__":
    main()
