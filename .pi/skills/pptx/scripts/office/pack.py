"""Pack an unpacked OOXML directory into a DOCX, PowerPoint OOXML, or Excel OOXML file.

Validates with optional auto-repair, condenses XML formatting, and creates the OOXML package.

Usage:
    python pack.py <input_directory> <output_file> [--original <file>] [--validate true|false]

Examples:
    python pack.py unpacked/ output.docx --original input.docx
    python pack.py unpacked/ output.pptm --original template.pptm
    python pack.py unpacked/ output.xlsm --original input.xlsm
    python pack.py unpacked/ output.xlsx --validate false
"""

from __future__ import annotations

import argparse
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

import defusedxml.minidom

from validators import DOCXSchemaValidator, PPTXSchemaValidator, RedliningValidator, XLSXSchemaValidator

POWERPOINT_PACKAGE_EXTENSIONS = {".pptx", ".pptm", ".potx", ".potm", ".ppsx", ".ppsm"}
OOXML_OUTPUT_EXTENSIONS = {".docx", *POWERPOINT_PACKAGE_EXTENSIONS, ".xlsx", ".xlsm", ".xltx", ".xltm"}


def pack(
    input_directory: str,
    output_file: str,
    original_file: str | None = None,
    validate: bool = True,
    infer_author_func=None,
) -> tuple[None, str]:
    input_dir = Path(input_directory)
    output_path = Path(output_file)
    suffix = output_path.suffix.lower()

    if not input_dir.is_dir():
        return None, f"Error: {input_dir} is not a directory"

    if suffix not in OOXML_OUTPUT_EXTENSIONS:
        return None, f"Error: {output_file} must be one of: {', '.join(sorted(OOXML_OUTPUT_EXTENSIONS))}"

    original_path = Path(original_file) if original_file else None
    if original_path and not original_path.exists():
        return None, f"Error: Original file does not exist: {original_path}"

    if validate:
        success, output = _run_validation(input_dir, original_path, suffix, infer_author_func)
        if output:
            print(output)
        if not success:
            return None, f"Error: Validation failed for {input_dir}"

    with tempfile.TemporaryDirectory(prefix="office-pack-") as temp_dir:
        temp_content_dir = Path(temp_dir) / "content"
        shutil.copytree(input_dir, temp_content_dir)

        for pattern in ["*.xml", "*.rels"]:
            for xml_file in temp_content_dir.rglob(pattern):
                _condense_xml(xml_file)

        output_path.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in temp_content_dir.rglob("*"):
                if f.is_file():
                    zf.write(f, f.relative_to(temp_content_dir))

    return None, f"Successfully packed {input_dir} to {output_file}"


def _run_validation(
    unpacked_dir: Path,
    original_file: Path | None,
    suffix: str,
    infer_author_func=None,
) -> tuple[bool, str | None]:
    output_lines = []
    validators = []

    if suffix == ".docx":
        author = "Claude"
        if infer_author_func:
            try:
                author = infer_author_func(unpacked_dir, original_file) if original_file else author
            except ValueError as exc:
                print(f"Warning: {exc} Using default author 'Claude'.", file=sys.stderr)
        validators = [DOCXSchemaValidator(unpacked_dir, original_file)]
        if original_file:
            validators.append(RedliningValidator(unpacked_dir, original_file, author=author))
    elif suffix in POWERPOINT_PACKAGE_EXTENSIONS:
        validators = [PPTXSchemaValidator(unpacked_dir, original_file)]
    elif suffix in {".xlsx", ".xlsm", ".xltx", ".xltm"}:
        validators = [XLSXSchemaValidator(unpacked_dir, original_file)]

    if not validators:
        return True, None

    total_repairs = sum(v.repair() for v in validators)
    if total_repairs:
        output_lines.append(f"Auto-repaired {total_repairs} issue(s)")

    success = all(v.validate() for v in validators)

    if success:
        output_lines.append("All validations PASSED!")

    return success, "\n".join(output_lines) if output_lines else None


def _condense_xml(xml_file: Path) -> None:
    try:
        with open(xml_file, encoding="utf-8") as f:
            dom = defusedxml.minidom.parse(f)

        for element in dom.getElementsByTagName("*"):
            if element.tagName.endswith(":t"):
                continue

            for child in list(element.childNodes):
                if (
                    child.nodeType == child.TEXT_NODE
                    and child.nodeValue
                    and child.nodeValue.strip() == ""
                ) or child.nodeType == child.COMMENT_NODE:
                    element.removeChild(child)

        xml_file.write_bytes(dom.toxml(encoding="UTF-8"))
    except Exception as exc:
        print(f"ERROR: Failed to parse {xml_file.name}: {exc}", file=sys.stderr)
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Pack an unpacked OOXML directory into an Office file")
    parser.add_argument("input_directory", help="Unpacked Office document directory")
    parser.add_argument(
        "output_file",
        help="Output Office file (.docx/.pptx/.pptm/.potx/.potm/.ppsx/.ppsm/.xlsx/.xlsm/.xltx/.xltm)",
    )
    parser.add_argument("--original", help="Original file for validation comparison")
    parser.add_argument(
        "--validate",
        type=lambda x: x.lower() == "true",
        default=True,
        metavar="true|false",
        help="Run validation with auto-repair (default: true)",
    )
    args = parser.parse_args()

    _, message = pack(
        args.input_directory,
        args.output_file,
        original_file=args.original,
        validate=args.validate,
    )
    print(message)

    if "Error" in message:
        sys.exit(1)
