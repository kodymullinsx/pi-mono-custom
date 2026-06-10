"""End-to-end QC workflow for Excel OOXML workbooks."""

from __future__ import annotations

import argparse
import importlib.util
import io
import json
import sys
import tempfile
import zipfile
from contextlib import redirect_stdout
from pathlib import Path
from typing import Any

from office.validators import XLSXSchemaValidator

SCRIPT_DIR = Path(__file__).resolve().parent


def _load_local_module(module_name: str, filename: str):
    spec = importlib.util.spec_from_file_location(module_name, SCRIPT_DIR / filename)
    if spec is None or spec.loader is None:
        raise ImportError(f"Could not load module {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


inspect_workbook = _load_local_module("xlsx_skill_inspect", "inspect.py").inspect_workbook
preview_workbook = _load_local_module("xlsx_skill_preview", "preview.py").preview_workbook
recalc = _load_local_module("xlsx_skill_recalc", "recalc.py").recalc


def _validate_workbook(workbook: Path, original_file: Path | None = None, auto_repair: bool = True, verbose: bool = False) -> dict[str, Any]:
    if not workbook.exists():
        return {"success": False, "error": f"Workbook does not exist: {workbook}"}

    log_buffer = io.StringIO()
    with tempfile.TemporaryDirectory(prefix="xlsx-validate-") as td:
        unpacked_dir = Path(td)
        with zipfile.ZipFile(workbook, "r") as zf:
            zf.extractall(unpacked_dir)

        validator = XLSXSchemaValidator(unpacked_dir, original_file=original_file, verbose=verbose)
        repairs = 0
        with redirect_stdout(log_buffer):
            if auto_repair:
                repairs = validator.repair()
            success = validator.validate()

    return {
        "success": success,
        "auto_repairs": repairs,
        "log": log_buffer.getvalue().strip(),
    }


def qc_workbook(
    workbook: str | Path,
    *,
    baseline: str | Path | None = None,
    output_dir: str | Path | None = None,
    preview: bool = True,
    timeout: int = 60,
    auto_repair: bool = True,
) -> dict[str, Any]:
    workbook_path = Path(workbook)
    baseline_path = Path(baseline) if baseline else None
    output_path = Path(output_dir) if output_dir else workbook_path.with_name(f"{workbook_path.stem}_qc")
    output_path.mkdir(parents=True, exist_ok=True)

    report: dict[str, Any] = {
        "workbook": str(workbook_path.resolve()),
        "baseline": str(baseline_path.resolve()) if baseline_path and baseline_path.exists() else None,
        "status": "success",
        "critical_issues": [],
        "warnings": [],
        "recalc": {},
        "inspection": {},
        "validation": {},
        "preview": None,
        "artifacts": {
            "output_dir": str(output_path.resolve()),
            "report_json": str((output_path / "qc_report.json").resolve()),
        },
    }

    report["inspection"] = inspect_workbook(workbook_path, compare_to=baseline_path if baseline_path else None)
    if report["inspection"].get("status") == "error":
        report["status"] = "error"
        report["critical_issues"].extend(report["inspection"].get("issues", []))
    else:
        report["critical_issues"].extend(report["inspection"].get("issues", []))
        report["warnings"].extend(report["inspection"].get("warnings", []))

    report["recalc"] = recalc(workbook_path, timeout=timeout)
    if report["recalc"].get("error"):
        report["status"] = "error"
        report["critical_issues"].append(report["recalc"]["error"])
    else:
        report["warnings"].extend(report["recalc"].get("warnings", []))
        if report["recalc"].get("total_errors", 0) > 0:
            report["critical_issues"].append(
                f"Recalc surfaced {report['recalc']['total_errors']} cached Excel error(s): {report['recalc'].get('error_summary', {})}"
            )

    validation_original = baseline_path if baseline_path and baseline_path.suffix.lower() in {".xlsx", ".xlsm", ".xltx", ".xltm"} else None
    report["validation"] = _validate_workbook(
        workbook_path,
        original_file=validation_original,
        auto_repair=auto_repair,
        verbose=False,
    )
    if not report["validation"].get("success", False):
        report["critical_issues"].append("Schema/package validation failed")

    if preview:
        preview_dir = output_path / "preview"
        report["preview"] = preview_workbook(workbook_path, output_dir=preview_dir, timeout=timeout)
        if report["preview"].get("error"):
            report["warnings"].append(report["preview"]["error"])
        else:
            report["warnings"].extend(report["preview"].get("warnings", []))

    if report["status"] != "error" and report["critical_issues"]:
        report["status"] = "issues_found"
    elif report["warnings"]:
        report["status"] = "success_with_warnings"

    report["critical_issues"] = list(dict.fromkeys(report["critical_issues"]))
    report["warnings"] = list(dict.fromkeys(report["warnings"]))
    report_path = output_path / "qc_report.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Run inspect + recalc + validate + preview for an Excel workbook")
    parser.add_argument("workbook", help="Path to .xlsx/.xlsm/.xltx/.xltm workbook")
    parser.add_argument("--baseline", help="Optional original workbook or inspect JSON for structural compare")
    parser.add_argument("--output-dir", help="Directory for QC artifacts and report JSON")
    parser.add_argument("--skip-preview", action="store_true", help="Skip PDF/PNG preview generation")
    parser.add_argument("--timeout", type=int, default=60, help="LibreOffice timeout in seconds (default: 60)")
    parser.add_argument("--no-auto-repair", action="store_true", help="Disable validator auto-repair before validation")
    args = parser.parse_args()
    report = qc_workbook(
        args.workbook,
        baseline=args.baseline,
        output_dir=args.output_dir,
        preview=not args.skip_preview,
        timeout=args.timeout,
        auto_repair=not args.no_auto_repair,
    )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
