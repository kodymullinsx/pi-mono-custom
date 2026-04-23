"""Validate Office OOXML packages against XSD schemas and package integrity rules.

Usage:
    python validate.py <path> [--original <original_file>] [--auto-repair] [--author NAME]

The first argument can be either:
- An unpacked directory containing the Office document XML files
- A packed Office file (.docx/.pptx/.xlsx/.xlsm/.xltx/.xltm) which will be unpacked to a temp directory

Auto-repair fixes currently include:
- DOCX: missing xml:space="preserve" on whitespace-sensitive text runs
- XLSX: missing SpreadsheetML content-type declarations for known parts
- XLSX: duplicate worksheet autoFilter on a table range
- Generic: some whitespace-preservation fixes in XML text nodes
"""

from __future__ import annotations

import argparse
import sys
import tempfile
import zipfile
from pathlib import Path

from helpers.xlsx_package import EXCEL_PACKAGE_EXTENSIONS, is_probably_encrypted_excel
from pack import pack as pack_office
from validators import DOCXSchemaValidator, PPTXSchemaValidator, RedliningValidator, XLSXSchemaValidator

OFFICE_EXTENSIONS = {".docx", ".pptx", *EXCEL_PACKAGE_EXTENSIONS}


def _extract_if_needed(path: Path) -> Path:
    if path.is_file() and path.suffix.lower() in OFFICE_EXTENSIONS:
        if path.suffix.lower() in EXCEL_PACKAGE_EXTENSIONS and is_probably_encrypted_excel(path):
            raise ValueError("Encrypted/password-protected Excel files must be decrypted before validation.")
        temp_dir = tempfile.mkdtemp(prefix="office-validate-")
        with zipfile.ZipFile(path, "r") as zf:
            zf.extractall(temp_dir)
        return Path(temp_dir)
    if path.is_dir():
        return path
    raise ValueError(f"{path} is not a directory or supported Office file")


def main():
    parser = argparse.ArgumentParser(description="Validate Office OOXML XML files")
    parser.add_argument(
        "path",
        help="Path to unpacked directory or packed Office file (.docx/.pptx/.xlsx/.xlsm/.xltx/.xltm)",
    )
    parser.add_argument(
        "--original",
        required=False,
        default=None,
        help="Path to original file. If omitted, all XSD errors are reported and DOCX redlining validation is skipped.",
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable verbose output")
    parser.add_argument(
        "--auto-repair",
        action="store_true",
        help="Automatically repair common issues before validation",
    )
    parser.add_argument(
        "--author",
        default="Claude",
        help="Author name for DOCX redlining validation (default: Claude)",
    )
    parser.add_argument(
        "--write-repaired",
        help="Optional output file to write a repaired OOXML package when validating a packed input file with --auto-repair",
    )
    args = parser.parse_args()

    path = Path(args.path)
    assert path.exists(), f"Error: {path} does not exist"

    original_file = None
    if args.original:
        original_file = Path(args.original)
        assert original_file.is_file(), f"Error: {original_file} is not a file"
        assert original_file.suffix.lower() in OFFICE_EXTENSIONS, (
            f"Error: {original_file} must be one of: {', '.join(sorted(OFFICE_EXTENSIONS))}"
        )

    file_extension = (original_file or path).suffix.lower()
    assert file_extension in OFFICE_EXTENSIONS, (
        f"Error: Cannot determine file type from {path}. Use --original or provide a supported Office file."
    )

    packed_input = path.is_file() and path.suffix.lower() in OFFICE_EXTENSIONS

    try:
        unpacked_dir = _extract_if_needed(path)
    except zipfile.BadZipFile:
        print(f"Error: {path} is not a valid OOXML ZIP package")
        sys.exit(1)
    except ValueError as exc:
        print(f"Error: {exc}")
        sys.exit(1)

    match file_extension:
        case ".docx":
            validators = [DOCXSchemaValidator(unpacked_dir, original_file, verbose=args.verbose)]
            if original_file:
                validators.append(
                    RedliningValidator(unpacked_dir, original_file, verbose=args.verbose, author=args.author)
                )
        case ".pptx":
            validators = [PPTXSchemaValidator(unpacked_dir, original_file, verbose=args.verbose)]
        case ".xlsx" | ".xlsm" | ".xltx" | ".xltm":
            validators = [XLSXSchemaValidator(unpacked_dir, original_file, verbose=args.verbose)]
        case _:
            print(f"Error: Validation not supported for file type {file_extension}")
            sys.exit(1)

    total_repairs = 0
    if args.auto_repair:
        total_repairs = sum(v.repair() for v in validators)
        if total_repairs:
            print(f"Auto-repaired {total_repairs} issue(s)")
        if args.write_repaired:
            if not packed_input:
                print("Error: --write-repaired is only supported when the input path is a packed Office file")
                sys.exit(1)
            _, message = pack_office(
                str(unpacked_dir),
                args.write_repaired,
                original_file=str(original_file or path),
                validate=False,
            )
            print(message)
            if "Error" in message:
                sys.exit(1)
    elif args.write_repaired:
        print("Error: --write-repaired requires --auto-repair")
        sys.exit(1)

    success = all(v.validate() for v in validators)

    if success:
        print("All validations PASSED!")

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
