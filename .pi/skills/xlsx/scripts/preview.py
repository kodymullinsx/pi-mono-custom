"""Render an Excel workbook to PDF and optional PNG previews via LibreOffice."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from office.helpers.xlsx_package import EXCEL_PACKAGE_EXTENSIONS, is_probably_encrypted_excel, is_zip_package
from office.soffice import initialize_profile, run_soffice, temporary_profile


def _rasterize_pdf(pdf_path: Path, output_dir: Path, stem: str, dpi: int) -> tuple[list[str], list[str]]:
    warnings: list[str] = []
    png_paths: list[str] = []
    prefix = output_dir / stem

    pdftoppm = shutil.which("pdftoppm")
    if pdftoppm:
        cmd = [pdftoppm, "-png", "-r", str(dpi), str(pdf_path), str(prefix)]
    else:
        pdftocairo = shutil.which("pdftocairo")
        if not pdftocairo:
            return [], ["Neither pdftoppm nor pdftocairo is available; returning PDF only."]
        cmd = [pdftocairo, "-png", "-r", str(dpi), str(pdf_path), str(prefix)]

    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        warnings.append(proc.stderr.strip() or proc.stdout.strip() or "PDF rasterization failed")
        return [], warnings

    png_paths = sorted(
        str(path.resolve())
        for path in output_dir.glob(f"{stem}*.png")
    )
    if not png_paths:
        warnings.append("Rasterizer completed but no PNG previews were produced.")
    return png_paths, warnings


def preview_workbook(workbook: str | Path, output_dir: str | Path | None = None, dpi: int = 144, timeout: int = 60) -> dict[str, Any]:
    path = Path(workbook)
    if not path.exists():
        return {"error": f"Workbook does not exist: {path}"}
    if path.suffix.lower() not in EXCEL_PACKAGE_EXTENSIONS:
        return {"error": f"Unsupported workbook extension '{path.suffix}'."}
    if is_probably_encrypted_excel(path):
        return {"error": "Workbook appears encrypted/password-protected. Decrypt before previewing."}
    if not is_zip_package(path):
        return {"error": "Workbook is not a valid OOXML ZIP package."}

    output_path = Path(output_dir) if output_dir else path.with_suffix("")
    output_path.mkdir(parents=True, exist_ok=True)

    warnings: list[str] = []

    with temporary_profile() as profile:
        initialize_profile(profile, timeout=min(timeout, 20))
        with tempfile.TemporaryDirectory(prefix="xlsx-preview-") as td:
            temp_dir = Path(td)
            source_copy = temp_dir / f"preview-source{path.suffix.lower()}"
            shutil.copy2(path, source_copy)

            proc = run_soffice(
                [
                    "--headless",
                    "--norestore",
                    "--nodefault",
                    "--nolockcheck",
                    "--nofirststartwizard",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    str(output_path),
                    str(source_copy),
                ],
                profile_dir=profile,
                timeout=timeout,
                capture_output=True,
                text=True,
                check=False,
            )
            pdf_path = output_path / f"{source_copy.stem}.pdf"
            if proc.returncode != 0 or not pdf_path.exists():
                detail = proc.stderr.strip() or proc.stdout.strip() or "unknown LibreOffice conversion error"
                return {"error": f"LibreOffice failed to export PDF: {detail}"}

            final_pdf = output_path / f"{path.stem}.pdf"
            if pdf_path != final_pdf:
                shutil.move(pdf_path, final_pdf)
            png_paths, raster_warnings = _rasterize_pdf(final_pdf, output_path, path.stem, dpi)
            warnings.extend(raster_warnings)

    return {
        "status": "success" if not warnings else "success_with_warnings",
        "workbook": str(path.resolve()),
        "pdf": str(final_pdf.resolve()),
        "png_previews": png_paths,
        "page_count": len(png_paths) if png_paths else None,
        "warnings": warnings,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Render an Excel workbook to PDF and PNG previews")
    parser.add_argument("workbook", help="Path to .xlsx/.xlsm/.xltx/.xltm workbook")
    parser.add_argument("--output-dir", help="Directory for PDF/PNG output")
    parser.add_argument("--dpi", type=int, default=144, help="PNG rasterization DPI (default: 144)")
    parser.add_argument("--timeout", type=int, default=60, help="LibreOffice timeout in seconds (default: 60)")
    args = parser.parse_args()
    print(json.dumps(preview_workbook(args.workbook, args.output_dir, args.dpi, args.timeout), indent=2))


if __name__ == "__main__":
    main()
