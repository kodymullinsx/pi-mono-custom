"""Add a new slide to an unpacked PowerPoint package.

Usage examples:
  python add_slide.py unpacked/ slide2.xml --position after:slide2.xml
  python add_slide.py unpacked/ slideLayout2.xml --position end
  python add_slide.py unpacked/ slide4.xml --copy-notes --json
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

import defusedxml.minidom

SLIDE_CT = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml"
NOTES_CT = "application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"
SLIDE_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"
LAYOUT_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout"
SLIDE_TO_NOTES_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide"
NOTES_TO_SLIDE_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"


def get_next_number(directory: Path, prefix: str) -> int:
    existing = []
    for file_path in directory.glob(f"{prefix}*.xml"):
        match = re.match(rf"{re.escape(prefix)}(\d+)\.xml", file_path.name)
        if match:
            existing.append(int(match.group(1)))
    return max(existing) + 1 if existing else 1


def _parse_xml(path: Path):
    return defusedxml.minidom.parse(str(path))


def _write_xml(path: Path, dom) -> None:
    path.write_bytes(dom.toxml(encoding="utf-8"))


def _content_types_path(unpacked_dir: Path) -> Path:
    return unpacked_dir / "[Content_Types].xml"


def add_content_override(unpacked_dir: Path, part_name: str, content_type: str) -> None:
    ct_path = _content_types_path(unpacked_dir)
    dom = _parse_xml(ct_path)
    for override in dom.getElementsByTagName("Override"):
        if override.getAttribute("PartName") == part_name:
            return
    elem = dom.createElement("Override")
    elem.setAttribute("PartName", part_name)
    elem.setAttribute("ContentType", content_type)
    dom.documentElement.appendChild(elem)
    _write_xml(ct_path, dom)


def add_presentation_relationship(unpacked_dir: Path, slide_name: str) -> str:
    rels_path = unpacked_dir / "ppt" / "_rels" / "presentation.xml.rels"
    dom = _parse_xml(rels_path)
    rids = []
    for rel in dom.getElementsByTagName("Relationship"):
        rid = rel.getAttribute("Id")
        if rid.startswith("rId") and rid[3:].isdigit():
            rids.append(int(rid[3:]))
    rid = f"rId{max(rids) + 1 if rids else 1}"
    rel = dom.createElement("Relationship")
    rel.setAttribute("Id", rid)
    rel.setAttribute("Type", SLIDE_REL_TYPE)
    rel.setAttribute("Target", f"slides/{slide_name}")
    dom.documentElement.appendChild(rel)
    _write_xml(rels_path, dom)
    return rid


def get_next_slide_id(unpacked_dir: Path) -> int:
    pres_path = unpacked_dir / "ppt" / "presentation.xml"
    dom = _parse_xml(pres_path)
    ids = [int(node.getAttribute("id")) for node in dom.getElementsByTagName("p:sldId") if node.getAttribute("id").isdigit()]
    return max(ids) + 1 if ids else 256


def _presentation_slide_targets(unpacked_dir: Path) -> list[tuple[str, str]]:
    pres_path = unpacked_dir / "ppt" / "presentation.xml"
    rels_path = unpacked_dir / "ppt" / "_rels" / "presentation.xml.rels"
    pres_dom = _parse_xml(pres_path)
    rels_dom = _parse_xml(rels_path)
    rid_to_target = {}
    for rel in rels_dom.getElementsByTagName("Relationship"):
        if rel.getAttribute("Type") == SLIDE_REL_TYPE:
            rid_to_target[rel.getAttribute("Id")] = Path(rel.getAttribute("Target")).name
    ordered: list[tuple[str, str]] = []
    for sld_id in pres_dom.getElementsByTagName("p:sldId"):
        rid = sld_id.getAttribute("r:id")
        ordered.append((rid, rid_to_target.get(rid, "")))
    return ordered


def insert_slide_reference(unpacked_dir: Path, rid: str, slide_id: int, position: str) -> None:
    from lxml import etree

    pres_path = unpacked_dir / "ppt" / "presentation.xml"
    parser = etree.XMLParser(resolve_entities=False, no_network=True, recover=False, remove_blank_text=False)
    tree = etree.parse(str(pres_path), parser)
    root = tree.getroot()
    p_ns = "http://schemas.openxmlformats.org/presentationml/2006/main"
    r_ns = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    sld_list = root.find(f".//{{{p_ns}}}sldIdLst")
    if sld_list is None:
        raise RuntimeError("Could not find <p:sldIdLst> in presentation.xml")

    new_node = etree.Element(f"{{{p_ns}}}sldId")
    new_node.set("id", str(slide_id))
    new_node.set(f"{{{r_ns}}}id", rid)

    ordered = _presentation_slide_targets(unpacked_dir)
    elems = [node for node in sld_list if isinstance(node.tag, str)]

    if position == "end":
        sld_list.append(new_node)
    elif position == "start":
        if elems:
            sld_list.insert(0, new_node)
        else:
            sld_list.append(new_node)
    elif position.startswith("after:") or position.startswith("before:"):
        anchor_name = position.split(":", 1)[1]
        anchor_rid = next((rid_ for rid_, name in ordered if name == anchor_name), None)
        if not anchor_rid:
            raise RuntimeError(f"Anchor slide not found: {anchor_name}")
        anchor_idx = None
        for idx, node in enumerate(elems):
            if node.get(f"{{{r_ns}}}id") == anchor_rid:
                anchor_idx = idx
                break
        if anchor_idx is None:
            raise RuntimeError(f"Anchor slide reference not found for {anchor_name}")
        insert_idx = anchor_idx + 1 if position.startswith("after:") else anchor_idx
        sld_list.insert(insert_idx, new_node)
    elif position.startswith("index:"):
        index = int(position.split(":", 1)[1])
        insert_idx = max(0, min(len(elems), index - 1))
        sld_list.insert(insert_idx, new_node)
    else:
        raise RuntimeError(f"Unsupported position specifier: {position}")

    tree.write(str(pres_path), encoding="utf-8", xml_declaration=True, standalone=True)


def _strip_relationships(rels_path: Path, *, keep_notes: bool) -> str | None:
    if not rels_path.exists():
        return None
    dom = _parse_xml(rels_path)
    notes_target = None
    changed = False
    for rel in list(dom.getElementsByTagName("Relationship")):
        rel_type = rel.getAttribute("Type")
        if rel_type.endswith("/notesSlide") or "notesSlide" in rel_type:
            notes_target = rel.getAttribute("Target")
            if not keep_notes and rel.parentNode:
                rel.parentNode.removeChild(rel)
                changed = True
        elif "comment" in rel_type.lower() and rel.parentNode:
            rel.parentNode.removeChild(rel)
            changed = True
    if changed:
        _write_xml(rels_path, dom)
    return notes_target


def _copy_notes_slide(unpacked_dir: Path, source_notes_target: str, dest_slide_name: str, dest_slide_rels: Path) -> str | None:
    notes_dir = unpacked_dir / "ppt" / "notesSlides"
    notes_rels_dir = notes_dir / "_rels"
    source_notes_path = (dest_slide_rels.parent.parent / source_notes_target).resolve()
    if not source_notes_path.exists():
        return None
    next_num = get_next_number(notes_dir, "notesSlide")
    dest_notes_name = f"notesSlide{next_num}.xml"
    dest_notes_path = notes_dir / dest_notes_name
    shutil.copy2(source_notes_path, dest_notes_path)

    source_notes_rels = notes_rels_dir / f"{source_notes_path.name}.rels"
    dest_notes_rels = notes_rels_dir / f"{dest_notes_name}.rels"
    if source_notes_rels.exists():
        shutil.copy2(source_notes_rels, dest_notes_rels)
        rels_dom = _parse_xml(dest_notes_rels)
        for rel in rels_dom.getElementsByTagName("Relationship"):
            rel_type = rel.getAttribute("Type")
            if rel_type == NOTES_TO_SLIDE_REL_TYPE or rel_type.endswith("/slide"):
                rel.setAttribute("Target", f"../slides/{dest_slide_name}")
        _write_xml(dest_notes_rels, rels_dom)

    add_content_override(unpacked_dir, f"/ppt/notesSlides/{dest_notes_name}", NOTES_CT)

    slide_rels_dom = _parse_xml(dest_slide_rels)
    rids = []
    for rel in slide_rels_dom.getElementsByTagName("Relationship"):
        rid = rel.getAttribute("Id")
        if rid.startswith("rId") and rid[3:].isdigit():
            rids.append(int(rid[3:]))
    next_rid = f"rId{max(rids) + 1 if rids else 1}"
    rel = slide_rels_dom.createElement("Relationship")
    rel.setAttribute("Id", next_rid)
    rel.setAttribute("Type", SLIDE_TO_NOTES_REL_TYPE)
    rel.setAttribute("Target", f"../notesSlides/{dest_notes_name}")
    slide_rels_dom.documentElement.appendChild(rel)
    _write_xml(dest_slide_rels, slide_rels_dom)
    return dest_notes_name


def create_slide_from_layout(unpacked_dir: Path, layout_name: str, position: str) -> dict[str, object]:
    slides_dir = unpacked_dir / "ppt" / "slides"
    rels_dir = slides_dir / "_rels"
    layout_path = unpacked_dir / "ppt" / "slideLayouts" / layout_name
    if not layout_path.exists():
        raise FileNotFoundError(f"Layout not found: {layout_path}")

    next_num = get_next_number(slides_dir, "slide")
    slide_name = f"slide{next_num}.xml"
    slide_path = slides_dir / slide_name
    slide_rels_path = rels_dir / f"{slide_name}.rels"
    slides_dir.mkdir(parents=True, exist_ok=True)
    rels_dir.mkdir(parents=True, exist_ok=True)

    slide_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr>
    <a:masterClrMapping/>
  </p:clrMapOvr>
</p:sld>'''
    slide_path.write_text(slide_xml, encoding="utf-8")

    rels_xml = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="{LAYOUT_REL_TYPE}" Target="../slideLayouts/{layout_name}"/>
</Relationships>'''
    slide_rels_path.write_text(rels_xml, encoding="utf-8")

    add_content_override(unpacked_dir, f"/ppt/slides/{slide_name}", SLIDE_CT)
    rid = add_presentation_relationship(unpacked_dir, slide_name)
    slide_id = get_next_slide_id(unpacked_dir)
    insert_slide_reference(unpacked_dir, rid, slide_id, position)
    return {"created_slide": slide_name, "rid": rid, "slide_id": slide_id, "layout": layout_name, "notes_copied": False}


def duplicate_slide(unpacked_dir: Path, source_name: str, position: str, copy_notes: bool) -> dict[str, object]:
    slides_dir = unpacked_dir / "ppt" / "slides"
    rels_dir = slides_dir / "_rels"
    source_slide = slides_dir / source_name
    if not source_slide.exists():
        raise FileNotFoundError(f"Source slide not found: {source_slide}")

    next_num = get_next_number(slides_dir, "slide")
    slide_name = f"slide{next_num}.xml"
    dest_slide = slides_dir / slide_name
    source_rels = rels_dir / f"{source_name}.rels"
    dest_rels = rels_dir / f"{slide_name}.rels"

    shutil.copy2(source_slide, dest_slide)
    if source_rels.exists():
        shutil.copy2(source_rels, dest_rels)
    source_notes_target = _strip_relationships(dest_rels, keep_notes=False)

    copied_notes = None
    if copy_notes and source_rels.exists() and source_notes_target:
        copied_notes = _copy_notes_slide(unpacked_dir, source_notes_target, slide_name, dest_rels)

    add_content_override(unpacked_dir, f"/ppt/slides/{slide_name}", SLIDE_CT)
    rid = add_presentation_relationship(unpacked_dir, slide_name)
    slide_id = get_next_slide_id(unpacked_dir)
    insert_slide_reference(unpacked_dir, rid, slide_id, position)
    return {"created_slide": slide_name, "rid": rid, "slide_id": slide_id, "source_slide": source_name, "notes_copied": bool(copied_notes), "notes_slide": copied_notes}


def parse_source(source: str) -> tuple[str, str]:
    if source.startswith("slideLayout") and source.endswith(".xml"):
        return "layout", source
    if source.startswith("slide") and source.endswith(".xml"):
        return "slide", source
    raise ValueError("Source must be slideN.xml or slideLayoutN.xml")


def main() -> None:
    parser = argparse.ArgumentParser(description="Add a new slide to an unpacked PowerPoint package")
    parser.add_argument("unpacked_dir", help="Path to unpacked PowerPoint directory")
    parser.add_argument("source", help="slideN.xml to duplicate or slideLayoutN.xml to instantiate")
    parser.add_argument("--position", default="end", help="Where to insert the new slide: end | start | before:slideN.xml | after:slideN.xml | index:N")
    parser.add_argument("--copy-notes", action="store_true", help="When duplicating a slide, also duplicate its notes slide")
    parser.add_argument("--json", action="store_true", help="Print JSON output")
    args = parser.parse_args()

    unpacked_dir = Path(args.unpacked_dir)
    if not unpacked_dir.exists():
        print(f"Error: {unpacked_dir} not found", file=sys.stderr)
        raise SystemExit(1)

    source_type, source_name = parse_source(args.source)
    if source_type == "layout":
        result = create_slide_from_layout(unpacked_dir, source_name, args.position)
    else:
        result = duplicate_slide(unpacked_dir, source_name, args.position, args.copy_notes)

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"Created {result['created_slide']} (rid={result['rid']}, slide_id={result['slide_id']})")
        if result.get("notes_copied"):
            print(f"Copied notes slide: {result.get('notes_slide')}")


if __name__ == "__main__":
    main()
