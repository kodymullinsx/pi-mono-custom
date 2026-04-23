"""Create a labeled contact sheet of PowerPoint slides for quick template analysis.

Hidden slides are represented with placeholder tiles so slide order remains obvious.
"""

from __future__ import annotations

import argparse
import math
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

from presentation_inspect import POWERPOINT_PACKAGE_EXTENSIONS, inspect_presentation
from preview import render_presentation

THUMBNAIL_WIDTH = 300
MAX_COLS = 6
DEFAULT_COLS = 3
GRID_PADDING = 20
BORDER_WIDTH = 2
LABEL_HEIGHT = 34


def _make_hidden_tile(size: tuple[int, int], label: str) -> Image.Image:
    img = Image.new("RGB", size, "#F3F4F6")
    draw = ImageDraw.Draw(img)
    step = 18
    for x in range(-size[1], size[0], step):
        draw.line((x, 0, x + size[1], size[1]), fill="#D1D5DB", width=2)
    draw.rectangle((0, 0, size[0] - 1, size[1] - 1), outline="#9CA3AF", width=2)
    text = f"Hidden\n{label}"
    draw.multiline_text((16, 16), text, fill="#4B5563", spacing=6)
    return img


def _tile_for_image(image_path: Path, thumb_width: int) -> Image.Image:
    img = Image.open(image_path).convert("RGB")
    aspect = img.height / img.width if img.width else 0.5625
    target_h = max(1, int(thumb_width * aspect))
    return img.resize((thumb_width, target_h))


def create_thumbnail_grid(input_path: str | Path, output_prefix: str = "thumbnails", cols: int = DEFAULT_COLS) -> list[Path]:
    src = Path(input_path)
    if not src.exists() or src.suffix.lower() not in POWERPOINT_PACKAGE_EXTENSIONS:
        raise ValueError(f"Invalid PowerPoint package: {src}")

    cols = max(1, min(MAX_COLS, cols))
    inspect_report = inspect_presentation(src)
    slides = inspect_report.get("slides", [])

    with tempfile.TemporaryDirectory(prefix="pptx-thumbs-") as td:
        preview_report = render_presentation(src, Path(td), dpi=110, create_montage=False)
        visible_images = [Path(p) for p in preview_report.get("slide_images", [])]

        tiles: list[tuple[Image.Image, str]] = []
        visible_idx = 0
        default_ratio = 0.5625
        for slide in slides:
            label = slide.get("name") or f"Slide {slide.get('position')}"
            if slide.get("hidden"):
                height = max(1, int(THUMBNAIL_WIDTH * default_ratio))
                tile = _make_hidden_tile((THUMBNAIL_WIDTH, height), label)
            else:
                if visible_idx >= len(visible_images):
                    height = max(1, int(THUMBNAIL_WIDTH * default_ratio))
                    tile = Image.new("RGB", (THUMBNAIL_WIDTH, height), "#FFFFFF")
                    ImageDraw.Draw(tile).text((16, 16), "Missing preview", fill="red")
                else:
                    tile = _tile_for_image(visible_images[visible_idx], THUMBNAIL_WIDTH)
                    visible_idx += 1
            tiles.append((tile, label))

        if not tiles:
            raise RuntimeError("No slides found")

        tile_h = max(img.height for img, _ in tiles)
        rows = math.ceil(len(tiles) / cols)
        canvas_w = GRID_PADDING + cols * (THUMBNAIL_WIDTH + GRID_PADDING)
        canvas_h = GRID_PADDING + rows * (tile_h + LABEL_HEIGHT + GRID_PADDING)
        canvas = Image.new("RGB", (canvas_w, canvas_h), "white")
        draw = ImageDraw.Draw(canvas)
        font = ImageFont.load_default()

        for idx, (tile, label) in enumerate(tiles):
            row = idx // cols
            col = idx % cols
            x = GRID_PADDING + col * (THUMBNAIL_WIDTH + GRID_PADDING)
            y = GRID_PADDING + row * (tile_h + LABEL_HEIGHT + GRID_PADDING)
            if tile.height != tile_h:
                pad_top = (tile_h - tile.height) // 2
                framed = Image.new("RGB", (THUMBNAIL_WIDTH, tile_h), "white")
                framed.paste(tile, (0, pad_top))
            else:
                framed = tile
            framed = ImageOps.expand(framed, border=BORDER_WIDTH, fill="#D1D5DB")
            canvas.paste(framed, (x, y))
            draw.text((x, y + tile_h + 6), label, fill="black", font=font)

        output_path = Path(f"{output_prefix}.jpg")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(output_path, quality=95)
        return [output_path.resolve()]


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a contact sheet of PowerPoint slide thumbnails")
    parser.add_argument("input", help="Input PowerPoint package")
    parser.add_argument("output_prefix", nargs="?", default="thumbnails", help="Output prefix for the contact sheet (default: thumbnails)")
    parser.add_argument("--cols", type=int, default=DEFAULT_COLS, help=f"Number of columns (default: {DEFAULT_COLS}, max: {MAX_COLS})")
    args = parser.parse_args()
    paths = create_thumbnail_grid(args.input, args.output_prefix, cols=args.cols)
    for path in paths:
        print(path)


if __name__ == "__main__":
    main()
