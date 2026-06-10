from __future__ import annotations

import argparse
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

from common import copytree_clean, mkdir_parent, normalize_output_member, remove_macos_artifacts
from validate import validate_visio_dir

OUTPUT_EXTENSIONS = {".vsdx", ".vsdm", ".vssx", ".vssm", ".vstx", ".vstm", ".zip"}


def pack(input_directory: str, output_file: str, validate: bool = True) -> tuple[bool, str]:
    input_dir = Path(input_directory)
    output_path = Path(output_file)

    if not input_dir.is_dir():
        return False, f"Error: {input_dir} is not a directory"
    if output_path.suffix.lower() not in OUTPUT_EXTENSIONS:
        return False, f"Error: {output_path} must be one of: {', '.join(sorted(OUTPUT_EXTENSIONS))}"

    with tempfile.TemporaryDirectory(prefix="visio-pack-") as temp_dir:
        temp_content = Path(temp_dir) / "content"
        copytree_clean(input_dir, temp_content)
        remove_macos_artifacts(temp_content)

        if validate:
            errors, warnings = validate_visio_dir(temp_content)
            for warning in warnings:
                print(f"Warning: {warning}")
            if errors:
                return False, "Error: validation failed:\n" + "\n".join(f"- {e}" for e in errors)

        mkdir_parent(output_path)
        if output_path.exists():
            output_path.unlink()
        with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
            files = [path for path in temp_content.rglob("*") if path.is_file()]
            files.sort(key=lambda path: _zip_order(normalize_output_member(path, temp_content)))
            for path in files:
                zf.write(path, normalize_output_member(path, temp_content))

    return True, f"Packed {input_dir} to {output_path}"


def _zip_order(member: str) -> tuple[int, str]:
    if member == "[Content_Types].xml":
        return (0, member)
    if member == "_rels/.rels":
        return (1, member)
    return (2, member)


def main() -> int:
    parser = argparse.ArgumentParser(description="Pack an unpacked Visio OOXML directory")
    parser.add_argument("input_directory", help="Unpacked Visio package directory")
    parser.add_argument("output_file", help="Output file (.vsdx/.vsdm/.vssx/.vssm/.vstx/.vstm or .zip)")
    parser.add_argument(
        "--validate",
        type=lambda value: value.lower() == "true",
        default=True,
        metavar="true|false",
        help="Run structural validation before packing",
    )
    args = parser.parse_args()

    ok, message = pack(args.input_directory, args.output_file, validate=args.validate)
    print(message)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
