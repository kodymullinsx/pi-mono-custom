from __future__ import annotations

import posixpath
import zipfile
from pathlib import Path, PurePosixPath
from typing import Iterable

import lxml.etree as ET

OOXML_MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
OOXML_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CT_NS = "http://schemas.openxmlformats.org/package/2006/content-types"

NS = {
    "main": OOXML_MAIN_NS,
    "r": OOXML_REL_NS,
    "pr": PKG_REL_NS,
    "ct": CT_NS,
}

EXCEL_PACKAGE_EXTENSIONS = {".xlsx", ".xlsm", ".xltx", ".xltm"}
OLE_MAGIC = bytes.fromhex("D0CF11E0A1B11AE1")


def is_zip_package(path: str | Path) -> bool:
    return zipfile.is_zipfile(path)


def is_ole_compound_file(path: str | Path) -> bool:
    p = Path(path)
    try:
        with p.open("rb") as f:
            return f.read(8) == OLE_MAGIC
    except OSError:
        return False


def is_probably_encrypted_excel(path: str | Path) -> bool:
    p = Path(path)
    if p.suffix.lower() not in EXCEL_PACKAGE_EXTENSIONS:
        return False
    return is_ole_compound_file(p) and not is_zip_package(p)


def list_package_parts(path: str | Path) -> list[str]:
    with zipfile.ZipFile(path) as zf:
        return sorted(zf.namelist())


def _resolve_part_path(base_part: str, target: str) -> str:
    if target.startswith("/"):
        return target.lstrip("/")
    base_dir = str(PurePosixPath(base_part).parent)
    if base_dir == ".":
        base_dir = ""
    return posixpath.normpath(posixpath.join(base_dir, target)).lstrip("/")


def relationship_map(path: str | Path, rels_part: str) -> dict[str, dict[str, str]]:
    with zipfile.ZipFile(path) as zf:
        root = ET.fromstring(zf.read(rels_part))
    base_part = rels_part[:-5] if rels_part.endswith(".rels") else rels_part
    result: dict[str, dict[str, str]] = {}
    for rel in root.findall(".//pr:Relationship", NS):
        rid = rel.get("Id")
        target = rel.get("Target")
        if not rid or not target:
            continue
        result[rid] = {
            "target": target,
            "target_part": _resolve_part_path(base_part, target),
            "type": rel.get("Type", ""),
            "target_mode": rel.get("TargetMode", "Internal"),
        }
    return result


def workbook_relationship_map(path: str | Path) -> dict[str, dict[str, str]]:
    return relationship_map(path, "xl/_rels/workbook.xml.rels")


def sheet_part_map(path: str | Path) -> list[dict[str, str]]:
    with zipfile.ZipFile(path) as zf:
        workbook_root = ET.fromstring(zf.read("xl/workbook.xml"))
    rels = workbook_relationship_map(path)
    sheets = []
    for sheet in workbook_root.findall(".//main:sheets/main:sheet", NS):
        rid = sheet.get(f"{{{OOXML_REL_NS}}}id")
        rel = rels.get(rid or "", {})
        sheets.append({
            "name": sheet.get("name", ""),
            "sheetId": sheet.get("sheetId", ""),
            "state": sheet.get("state", "visible"),
            "rid": rid or "",
            "target": rel.get("target", ""),
            "part": rel.get("target_part", ""),
            "type": rel.get("type", ""),
        })
    return sheets


def content_type_overrides(path: str | Path) -> dict[str, str]:
    with zipfile.ZipFile(path) as zf:
        root = ET.fromstring(zf.read("[Content_Types].xml"))
    overrides = {}
    for node in root.findall(".//ct:Override", NS):
        part = node.get("PartName")
        ctype = node.get("ContentType")
        if part and ctype:
            overrides[part.lstrip("/")] = ctype
    return overrides


def package_feature_counts(parts: Iterable[str]) -> dict[str, int | bool]:
    items = list(parts)
    return {
        "parts": len(items),
        "charts": sum(p.startswith("xl/charts/") and p.endswith(".xml") for p in items),
        "drawings": sum(p.startswith("xl/drawings/") and p.endswith(".xml") for p in items),
        "images": sum(p.startswith("xl/media/") for p in items),
        "tables": sum(p.startswith("xl/tables/") and p.endswith(".xml") for p in items),
        "pivot_tables": sum(p.startswith("xl/pivotTables/") and p.endswith(".xml") for p in items),
        "pivot_cache_defs": sum(p.startswith("xl/pivotCache/") and "pivotCacheDefinition" in p for p in items),
        "pivot_cache_records": sum(p.startswith("xl/pivotCache/") and "pivotCacheRecords" in p for p in items),
        "external_links": sum(p.startswith("xl/externalLinks/") and p.endswith(".xml") for p in items),
        "query_tables": sum(p.startswith("xl/queryTables/") and p.endswith(".xml") for p in items),
        "slicers": sum(p.startswith("xl/slicers/") and p.endswith(".xml") for p in items),
        "connections": sum(p == "xl/connections.xml" for p in items),
        "custom_xml": sum(p.startswith("customXml/") for p in items),
        "comments": sum("comments" in p and p.endswith(".xml") for p in items),
        "threaded_comments": sum("threadedComment" in p for p in items),
        "has_vba": any(p.endswith("vbaProject.bin") for p in items),
        "has_calc_chain": any(p == "xl/calcChain.xml" for p in items),
    }
