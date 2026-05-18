from __future__ import annotations

import argparse
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

from common import (
    V,
    content_type_overrides,
    is_external_relationship,
    iter_package_files,
    local_name,
    materialized_visio_source,
    package_rel_path,
    parse_relationships,
    parse_xml,
    path_exists_in_package,
    rel_id,
    resolve_relationship_target,
    zip_test,
)


def validate_visio_dir(root_dir: Path) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    required = [
        "[Content_Types].xml",
        "_rels/.rels",
        "visio/document.xml",
        "visio/_rels/document.xml.rels",
        "visio/pages/pages.xml",
        "visio/pages/_rels/pages.xml.rels",
    ]
    for rel_path in required:
        if not (root_dir / rel_path).exists():
            errors.append(f"Missing required part: {rel_path}")

    for path in iter_package_files(root_dir):
        if path.suffix.lower() in {".xml", ".rels"}:
            try:
                parse_xml(path)
            except ET.ParseError as exc:
                errors.append(f"XML parse error in {package_rel_path(root_dir, path)}: {exc}")

    if errors:
        return errors, warnings

    overrides = content_type_overrides(root_dir)
    doc_ct = overrides.get("/visio/document.xml")
    if doc_ct and not doc_ct.startswith("application/vnd.ms-visio."):
        errors.append(f"Unexpected content type for /visio/document.xml: {doc_ct}")
    if not doc_ct:
        warnings.append("No content-type override found for /visio/document.xml")

    root_rels = parse_relationships(root_dir / "_rels/.rels")
    doc_rels = [
        rel for rel in root_rels
        if rel.get("Target") == "visio/document.xml" or rel.get("Type", "").endswith("/document")
    ]
    if not doc_rels:
        errors.append("Root relationships do not point to visio/document.xml")

    for rels_path in root_dir.rglob("*.rels"):
        rels_rel = package_rel_path(root_dir, rels_path)
        for rel in parse_relationships(rels_path):
            if is_external_relationship(rel):
                continue
            target = rel.get("Target")
            if not target:
                errors.append(f"Relationship without target in {rels_rel}")
                continue
            resolved = resolve_relationship_target(rels_rel, target)
            if not path_exists_in_package(root_dir, resolved):
                errors.append(f"Missing relationship target from {rels_rel}: {target} -> {resolved}")

    master_ids = _master_ids(root_dir, errors)
    page_parts = _page_parts(root_dir, errors)
    for page_part in page_parts:
        _validate_page(root_dir, page_part, master_ids, errors, warnings)

    return errors, warnings


def validate_path(path: Path) -> tuple[list[str], list[str]]:
    if path.is_file():
        bad_member = zip_test(path)
        if bad_member:
            return [f"Corrupt ZIP member: {bad_member}"], []
    with materialized_visio_source(path) as root_dir:
        return validate_visio_dir(root_dir)


def _master_ids(root_dir: Path, errors: list[str]) -> set[str]:
    masters_path = root_dir / "visio/masters/masters.xml"
    if not masters_path.exists():
        return set()
    try:
        root = parse_xml(masters_path).getroot()
    except ET.ParseError as exc:
        errors.append(f"XML parse error in visio/masters/masters.xml: {exc}")
        return set()
    return {master.attrib["ID"] for master in root.findall(f"{V}Master") if "ID" in master.attrib}


def _page_parts(root_dir: Path, errors: list[str]) -> list[str]:
    pages_path = root_dir / "visio/pages/pages.xml"
    pages_rels_path = root_dir / "visio/pages/_rels/pages.xml.rels"
    if not pages_path.exists() or not pages_rels_path.exists():
        return []

    rels = {rel.get("Id"): rel for rel in parse_relationships(pages_rels_path)}
    root = parse_xml(pages_path).getroot()
    parts: list[str] = []

    for page in root.findall(f"{V}Page"):
        rid = rel_id(page.find(f"{V}Rel"))
        page_name = page.attrib.get("Name") or page.attrib.get("NameU") or page.attrib.get("ID", "<unknown>")
        if not rid:
            errors.append(f"Page {page_name} has no relationship id")
            continue
        rel = rels.get(rid)
        if not rel:
            errors.append(f"Page {page_name} references missing relationship id {rid}")
            continue
        target = rel.get("Target")
        if not target:
            errors.append(f"Page relationship {rid} has no target")
            continue
        resolved = resolve_relationship_target("visio/pages/_rels/pages.xml.rels", target)
        if not path_exists_in_package(root_dir, resolved):
            errors.append(f"Page {page_name} target does not exist: {resolved}")
            continue
        parts.append(resolved)

    return parts


def _validate_page(
    root_dir: Path,
    page_part: str,
    master_ids: set[str],
    errors: list[str],
    warnings: list[str],
) -> None:
    path = root_dir / page_part
    root = parse_xml(path).getroot()
    shapes = root.findall(f".//{V}Shape")
    shape_ids = {shape.attrib["ID"] for shape in shapes if "ID" in shape.attrib}

    for shape in shapes:
        shape_id = shape.attrib.get("ID", "<unknown>")
        master_id = shape.attrib.get("Master")
        if master_id and master_ids and master_id not in master_ids:
            errors.append(f"{page_part}: shape {shape_id} references missing master ID {master_id}")

    for connect in root.findall(f".//{V}Connect"):
        for attr in ("FromSheet", "ToSheet"):
            ref = connect.attrib.get(attr)
            if ref and ref not in shape_ids:
                errors.append(f"{page_part}: Connect {attr} references missing shape ID {ref}")

    if not shapes:
        warnings.append(f"{page_part} has no shapes")


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate Visio OOXML package structure")
    parser.add_argument("path", help="Packed Visio file or unpacked Visio package directory")
    args = parser.parse_args()

    path = Path(args.path)
    if not path.exists():
        print(f"Error: {path} does not exist")
        return 1

    try:
        errors, warnings = validate_path(path)
    except zipfile.BadZipFile:
        print(f"Error: {path} is not a valid ZIP package")
        return 1
    except Exception as exc:
        print(f"Error: {exc}")
        return 1

    for warning in warnings:
        print(f"Warning: {warning}")
    if errors:
        print("Validation FAILED")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Validation PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
