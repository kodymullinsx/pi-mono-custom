from __future__ import annotations

import argparse
import sys
import zipfile
from pathlib import Path

from common import ensure_empty_or_force, package_extension_message, safe_extract_zip
from validate import validate_visio_dir


def unpack(input_file: str, output_directory: str, force: bool = False) -> tuple[bool, str]:
    input_path = Path(input_file)
    output_dir = Path(output_directory)

    if not input_path.exists():
        return False, f"Error: {input_path} does not exist"
    if not input_path.is_file():
        return False, f"Error: {input_path} is not a file"
    if input_path.suffix.lower() not in {".vsdx", ".vsdm", ".vssx", ".vssm", ".vstx", ".vstm", ".zip"}:
        return False, f"Error: {input_path} must be one of: {package_extension_message()}"

    try:
        ensure_empty_or_force(output_dir, force)
        safe_extract_zip(input_path, output_dir)
        errors, warnings = validate_visio_dir(output_dir)
    except zipfile.BadZipFile:
        return False, f"Error: {input_path} is not a valid ZIP package"
    except Exception as exc:
        return False, f"Error: {exc}"

    if errors:
        return False, "Error: unpacked package failed validation:\n" + "\n".join(f"- {e}" for e in errors)

    suffix = ""
    if warnings:
        suffix = "\nWarnings:\n" + "\n".join(f"- {w}" for w in warnings)
    return True, f"Unpacked {input_path} to {output_dir}{suffix}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Safely unpack a Visio OOXML package")
    parser.add_argument("input_file", help="Input Visio package (.vsdx/.vsdm/.vssx/.vssm/.vstx/.vstm or .zip)")
    parser.add_argument("output_directory", help="Directory to extract into")
    parser.add_argument("--force", action="store_true", help="Replace output directory if it already has content")
    args = parser.parse_args()

    ok, message = unpack(args.input_file, args.output_directory, force=args.force)
    print(message)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
