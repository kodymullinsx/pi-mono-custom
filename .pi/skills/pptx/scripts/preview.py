"""Render a PowerPoint package to PDF and per-slide PNGs for visual QA."""

from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageOps

from office.soffice import initialize_profile, run_soffice, temporary_profile

POWERPOINT_PACKAGE_EXTENSIONS = {".pptx", ".pptm", ".potx", ".potm", ".ppsx", ".ppsm"}


def _create_montage(image_paths: list[Path], output_path: Path, thumb_width: int = 320, gutter: int = 24) -> None:
    if not image_paths:
        raise ValueError("No images provided for montage")

    thumbs = []
    labels = []
    for idx, path in enumerate(image_paths, start=1):
        img = Image.open(path).convert("RGB")
        aspect = img.height / img.width if img.width else 0.5625
        thumb = img.resize((thumb_width, max(1, int(thumb_width * aspect))))
        thumbs.append(thumb)
        labels.append(f"Slide {idx}")

    cols = max(1, min(4, math.ceil(math.sqrt(len(thumbs)))))
    rows = math.ceil(len(thumbs) / cols)
    label_h = 28
    tile_w = thumb_width
    tile_h = max(t.height for t in thumbs)

    canvas_w = gutter + cols * (tile_w + gutter)
    canvas_h = gutter + rows * (tile_h + label_h + gutter)
    canvas = Image.new("RGB", (canvas_w, canvas_h), "white")
    draw = ImageDraw.Draw(canvas)

    for idx, thumb in enumerate(thumbs):
        row = idx // cols
        col = idx % cols
        x = gutter + col * (tile_w + gutter)
        y = gutter + row * (tile_h + label_h + gutter)
        framed = ImageOps.expand(thumb, border=1, fill="#D1D5DB")
        canvas.paste(framed, (x, y))
        draw.text((x, y + tile_h + 6), labels[idx], fill="black")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output_path)


def render_presentation(
    input_path: str | Path,
    output_dir: str | Path,
    dpi: int = 160,
    create_montage: bool = False,
) -> dict[str, Any]:
    input_file = Path(input_path)
    if not input_file.exists():
        raise FileNotFoundError(f"Input file does not exist: {input_file}")
    if input_file.suffix.lower() not in POWERPOINT_PACKAGE_EXTENSIONS:
        raise ValueError(f"Unsupported extension '{input_file.suffix}'")
    if shutil.which("pdftoppm") is None:
        raise RuntimeError("pdftoppm is required but not available in PATH")

    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = out_dir / f"{input_file.stem}.pdf"

    with temporary_profile() as profile_dir:
        initialize_profile(profile_dir)
        result = run_soffice(
            [
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                str(out_dir),
                str(input_file.resolve()),
            ],
            profile_dir=profile_dir,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0 or not pdf_path.exists():
            raise RuntimeError(
                "PDF conversion failed. "
                + (result.stderr.strip() or result.stdout.strip() or "LibreOffice returned a non-zero exit code.")
            )

    png_prefix = out_dir / "slide"
    ppm_result = subprocess.run(
        ["pdftoppm", "-png", "-r", str(dpi), str(pdf_path), str(png_prefix)],
        capture_output=True,
        text=True,
        check=False,
    )
    if ppm_result.returncode != 0:
        raise RuntimeError(ppm_result.stderr.strip() or ppm_result.stdout.strip() or "pdftoppm failed")

    rendered = sorted(out_dir.glob("slide-*.png"))
    renamed: list[Path] = []
    for idx, image_path in enumerate(rendered, start=1):
        dest = out_dir / f"slide-{idx}.png"
        if image_path != dest:
            image_path.replace(dest)
        renamed.append(dest)

    montage_path: Path | None = None
    if create_montage and renamed:
        montage_path = out_dir / "montage.png"
        _create_montage(renamed, montage_path)

    report = {
        "input": str(input_file.resolve()),
        "pdf": str(pdf_path.resolve()),
        "slide_images": [str(path.resolve()) for path in renamed],
        "slide_count": len(renamed),
        "dpi": dpi,
        "montage": str(montage_path.resolve()) if montage_path else None,
    }
    with open(out_dir / "preview_report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Render a PowerPoint package to PDF and PNG previews")
    parser.add_argument("input", help="Input PowerPoint package")
    parser.add_argument("--output-dir", default="preview", help="Output directory (default: preview)")
    parser.add_argument("--dpi", type=int, default=160, help="Rasterization DPI for PNG slides (default: 160)")
    parser.add_argument("--montage", action="store_true", help="Create a montage image of all rendered slides")
    args = parser.parse_args()

    report = render_presentation(args.input, args.output_dir, dpi=args.dpi, create_montage=args.montage)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
