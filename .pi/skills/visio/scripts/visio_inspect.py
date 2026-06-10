from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from xml.etree import ElementTree as ET

from common import (
    V,
    cell_map,
    content_type_overrides,
    iter_package_files,
    local_name,
    materialized_visio_source,
    package_rel_path,
    parse_relationships,
    parse_xml,
    rel_id,
    resolve_relationship_target,
    shape_text,
    visible_text,
)

SHAPE_CELL_KEYS = [
    "PinX",
    "PinY",
    "Width",
    "Height",
    "LocPinX",
    "LocPinY",
    "BeginX",
    "BeginY",
    "EndX",
    "EndY",
    "BeginArrow",
    "EndArrow",
    "LinePattern",
    "LayerMember",
]


def inspect_path(path: Path, include_shapes: bool = True) -> dict:
    with materialized_visio_source(path) as root_dir:
        return inspect_dir(root_dir, source_path=str(path), include_shapes=include_shapes)


def inspect_dir(root_dir: Path, source_path: str | None = None, include_shapes: bool = True) -> dict:
    masters = _masters(root_dir)
    pages = _pages(root_dir, masters, include_shapes=include_shapes)
    files = [package_rel_path(root_dir, path) for path in iter_package_files(root_dir)]

    return {
        "source": source_path or str(root_dir),
        "package": {
            "file_count": len(files),
            "xml_file_count": sum(1 for f in files if f.endswith((".xml", ".rels"))),
            "media": sorted(f for f in files if f.startswith("visio/media/")),
            "content_type_overrides": content_type_overrides(root_dir),
            "root_relationships": parse_relationships(root_dir / "_rels/.rels"),
            "document_relationships": parse_relationships(root_dir / "visio/_rels/document.xml.rels"),
        },
        "doc_props": _doc_props(root_dir),
        "document": _document_summary(root_dir),
        "masters": list(masters.values()),
        "pages": pages,
        "summary": {
            "page_count": len(pages),
            "master_count": len(masters),
            "shape_count": sum(page["shape_count"] for page in pages),
            "text_shape_count": sum(page["text_shape_count"] for page in pages),
            "connect_count": sum(page["connect_count"] for page in pages),
            "derived_edge_count": sum(len(page["edges"]) for page in pages),
        },
    }


def _doc_props(root_dir: Path) -> dict:
    props: dict[str, dict[str, str]] = {}
    for name in ("core", "app", "custom"):
        path = root_dir / "docProps" / f"{name}.xml"
        if not path.exists():
            continue
        try:
            values: dict[str, str] = {}
            for elem in parse_xml(path).getroot().iter():
                text = visible_text(elem)
                if text and len(list(elem)) == 0:
                    values[local_name(elem.tag)] = text
            props[name] = values
        except ET.ParseError:
            props[name] = {"error": "parse failed"}
    return props


def _document_summary(root_dir: Path) -> dict:
    path = root_dir / "visio/document.xml"
    if not path.exists():
        return {}
    root = parse_xml(path).getroot()
    style_sheets = [
        {
            "id": style.attrib.get("ID"),
            "name": style.attrib.get("Name"),
            "name_u": style.attrib.get("NameU"),
        }
        for style in root.findall(f".//{V}StyleSheet")
    ]
    colors = [
        {"ix": color.attrib.get("IX"), "rgb": color.attrib.get("RGB")}
        for color in root.findall(f".//{V}ColorEntry")
    ]
    face_names = [
        face.attrib.get("NameU") or face.attrib.get("Name")
        for face in root.findall(f".//{V}FaceName")
    ]
    return {
        "style_sheet_count": len(style_sheets),
        "style_sheets": style_sheets,
        "colors": colors,
        "face_names": [name for name in face_names if name],
    }


def _masters(root_dir: Path) -> dict[str, dict]:
    masters_path = root_dir / "visio/masters/masters.xml"
    rels_path = root_dir / "visio/masters/_rels/masters.xml.rels"
    if not masters_path.exists():
        return {}

    rel_map = {
        rel.get("Id"): resolve_relationship_target("visio/masters/_rels/masters.xml.rels", rel.get("Target", ""))
        for rel in parse_relationships(rels_path)
        if rel.get("Id")
    }

    masters: dict[str, dict] = {}
    root = parse_xml(masters_path).getroot()
    for master in root.findall(f"{V}Master"):
        master_id = master.attrib.get("ID")
        if not master_id:
            continue
        rid = rel_id(master.find(f"{V}Rel"))
        masters[master_id] = {
            "id": master_id,
            "name": master.attrib.get("Name"),
            "name_u": master.attrib.get("NameU"),
            "prompt": master.attrib.get("Prompt"),
            "master_type": master.attrib.get("MasterType"),
            "relationship_id": rid,
            "part": rel_map.get(rid),
        }
    return masters


def _pages(root_dir: Path, masters: dict[str, dict], include_shapes: bool = True) -> list[dict]:
    pages_path = root_dir / "visio/pages/pages.xml"
    rels_path = root_dir / "visio/pages/_rels/pages.xml.rels"
    if not pages_path.exists():
        return []

    rel_map = {
        rel.get("Id"): resolve_relationship_target("visio/pages/_rels/pages.xml.rels", rel.get("Target", ""))
        for rel in parse_relationships(rels_path)
        if rel.get("Id")
    }

    pages = []
    root = parse_xml(pages_path).getroot()
    for page in root.findall(f"{V}Page"):
        rid = rel_id(page.find(f"{V}Rel"))
        part = rel_map.get(rid)
        page_summary = {
            "id": page.attrib.get("ID"),
            "name": page.attrib.get("Name"),
            "name_u": page.attrib.get("NameU"),
            "relationship_id": rid,
            "part": part,
            "page_sheet": _page_sheet(page),
            "layers": _layers(page),
            "shape_count": 0,
            "text_shape_count": 0,
            "connect_count": 0,
            "edges": [],
        }
        if part and (root_dir / part).exists():
            page_summary.update(_page_contents(root_dir / part, masters, include_shapes=include_shapes))
        pages.append(page_summary)
    return pages


def _page_sheet(page: ET.Element) -> dict[str, str]:
    sheet = page.find(f"{V}PageSheet")
    if sheet is None:
        return {}
    cells = cell_map(sheet)
    return {key: value.get("V") for key, value in cells.items() if "V" in value}


def _layers(page: ET.Element) -> list[dict[str, str]]:
    sheet = page.find(f"{V}PageSheet")
    if sheet is None:
        return []
    layers = []
    for section in sheet.findall(f"{V}Section"):
        if section.attrib.get("N") != "Layer":
            continue
        for row in section.findall(f"{V}Row"):
            values = {"ix": row.attrib.get("IX")}
            for cell in row.findall(f"{V}Cell"):
                name = cell.attrib.get("N")
                if name:
                    values[name] = cell.attrib.get("V", "")
            layers.append(values)
    return layers


def _page_contents(page_path: Path, masters: dict[str, dict], include_shapes: bool = True) -> dict:
    root = parse_xml(page_path).getroot()
    shapes = root.findall(f".//{V}Shape")
    connects = root.findall(f".//{V}Connect")
    shape_summaries = [_shape_summary(shape, masters) for shape in shapes]
    edges = _derive_edges(shape_summaries, connects)

    result = {
        "shape_count": len(shapes),
        "text_shape_count": sum(1 for shape in shape_summaries if shape.get("text")),
        "connect_count": len(connects),
        "edges": edges,
    }
    if include_shapes:
        result["shapes"] = shape_summaries
        result["connects"] = [dict(connect.attrib) for connect in connects]
    return result


def _shape_summary(shape: ET.Element, masters: dict[str, dict]) -> dict:
    cells = cell_map(shape)
    master_id = shape.attrib.get("Master")
    master = masters.get(master_id or "")
    master_name = (master or {}).get("name_u") or (master or {}).get("name")
    text = shape_text(shape)
    direct_cells = {
        key: cells[key]
        for key in SHAPE_CELL_KEYS
        if key in cells
    }
    return {
        "id": shape.attrib.get("ID"),
        "name": shape.attrib.get("Name"),
        "name_u": shape.attrib.get("NameU"),
        "type": shape.attrib.get("Type"),
        "master": master_id,
        "master_name": master_name,
        "text": text,
        "is_connector": _is_connector(master_name, cells),
        "cells": direct_cells,
    }


def _is_connector(master_name: str | None, cells: dict[str, dict[str, str]]) -> bool:
    if master_name and "connector" in master_name.lower():
        return True
    return "BeginX" in cells or "EndX" in cells


def _derive_edges(shapes: list[dict], connects: list[ET.Element]) -> list[dict]:
    shape_by_id = {shape.get("id"): shape for shape in shapes if shape.get("id")}
    connector_ids = {shape["id"] for shape in shapes if shape.get("is_connector") and shape.get("id")}
    by_connector: dict[str, list[dict[str, str]]] = {}
    for connect in connects:
        from_sheet = connect.attrib.get("FromSheet")
        if from_sheet in connector_ids:
            by_connector.setdefault(from_sheet, []).append(dict(connect.attrib))

    edges = []
    for connector_id, connector_records in by_connector.items():
        begin = next((record for record in connector_records if record.get("FromCell", "").startswith("Begin")), None)
        end = next((record for record in connector_records if record.get("FromCell", "").startswith("End")), None)
        connector = shape_by_id.get(connector_id, {})
        edges.append(
            {
                "connector_id": connector_id,
                "label": connector.get("text", ""),
                "from_shape": begin.get("ToSheet") if begin else None,
                "to_shape": end.get("ToSheet") if end else None,
                "from_text": shape_by_id.get(begin.get("ToSheet"), {}).get("text", "") if begin else "",
                "to_text": shape_by_id.get(end.get("ToSheet"), {}).get("text", "") if end else "",
                "begin_connect": begin,
                "end_connect": end,
            }
        )
    return edges


def main() -> int:
    parser = argparse.ArgumentParser(description="Inspect Visio OOXML package structure and emit JSON")
    parser.add_argument("path", help="Packed Visio file or unpacked Visio package directory")
    parser.add_argument("--summary-only", action="store_true", help="Omit per-shape and raw connect records")
    parser.add_argument("--indent", type=int, default=2, help="JSON indentation")
    args = parser.parse_args()

    path = Path(args.path)
    if not path.exists():
        print(f"Error: {path} does not exist", file=sys.stderr)
        return 1

    try:
        data = inspect_path(path, include_shapes=not args.summary_only)
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print(json.dumps(data, indent=args.indent, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
