"""Inspect a PowerPoint OOXML package for preservation risks, slide structure, and placeholder leftovers."""

from __future__ import annotations

import argparse
import json
import re
import tempfile
import zipfile
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

from defusedxml import ElementTree as DefusedET

POWERPOINT_PACKAGE_EXTENSIONS = {".pptx", ".pptm", ".potx", ".potm", ".ppsx", ".ppsm"}

NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}
REL_NS = "{http://schemas.openxmlformats.org/package/2006/relationships}"

PLACEHOLDER_PATTERNS = [
    re.compile(pat, re.IGNORECASE)
    for pat in [
        r"click to add",
        r"lorem ipsum",
        r"placeholder",
        r"your title",
        r"your subtitle",
        r"insert text here",
        r"sample text",
        r"tbd",
        r"todo",
        r"xxxx+",
        r"dummy",
        r"replace me",
        r"image caption",
    ]
]


def _load_xml(path: Path):
    return DefusedET.parse(path).getroot()


def _extract_if_needed(path: Path) -> tuple[Path, tempfile.TemporaryDirectory[str] | None]:
    if path.is_dir():
        return path, None
    if path.suffix.lower() not in POWERPOINT_PACKAGE_EXTENSIONS:
        raise ValueError(f"Unsupported extension '{path.suffix}'")
    if not zipfile.is_zipfile(path):
        raise ValueError(f"Not a valid OOXML ZIP package: {path}")
    tmp = tempfile.TemporaryDirectory(prefix="pptx-inspect-")
    with zipfile.ZipFile(path, "r") as zf:
        zf.extractall(tmp.name)
    return Path(tmp.name), tmp


def _resolve_target(rels_file: Path, target: str) -> Path:
    return (rels_file.parent.parent / target).resolve()


def _iter_relationships(rels_file: Path) -> Iterable[dict[str, str]]:
    if not rels_file.exists():
        return []
    root = _load_xml(rels_file)
    rels = []
    for rel in root.findall(f"{REL_NS}Relationship"):
        rels.append({
            "Id": rel.attrib.get("Id", ""),
            "Type": rel.attrib.get("Type", ""),
            "Target": rel.attrib.get("Target", ""),
            "TargetMode": rel.attrib.get("TargetMode", ""),
        })
    return rels


def _content_type_for_main_part(unpacked_dir: Path) -> str | None:
    ct = unpacked_dir / "[Content_Types].xml"
    if not ct.exists():
        return None
    try:
        root = _load_xml(ct)
        ns = "{http://schemas.openxmlformats.org/package/2006/content-types}"
        for ov in root.findall(f"{ns}Override"):
            if ov.attrib.get("PartName") == "/ppt/presentation.xml":
                return ov.attrib.get("ContentType")
    except Exception:
        return None
    return None


def _slide_size(presentation_root) -> dict[str, Any] | None:
    sld_sz = presentation_root.find("p:sldSz", NS)
    if sld_sz is None:
        return None
    try:
        cx = int(sld_sz.attrib.get("cx", "0"))
        cy = int(sld_sz.attrib.get("cy", "0"))
    except Exception:
        return None
    return {
        "cx_emu": cx,
        "cy_emu": cy,
        "width_in": round(cx / 914400, 4),
        "height_in": round(cy / 914400, 4),
    }


def _section_summary(presentation_root) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = []
    for elem in presentation_root.iter():
        if not isinstance(elem.tag, str) or "}" not in elem.tag:
            continue
        local = elem.tag.rsplit("}", 1)[-1]
        if local == "section":
            sections.append({
                "id": elem.attrib.get("id"),
                "name": elem.attrib.get("name"),
                "first_slide_id": elem.attrib.get("firstSlideId"),
            })
    return sections


def _excerpt(lines: list[str], max_len: int = 240) -> str:
    text = "\n".join(line.strip() for line in lines if line and line.strip())
    if len(text) <= max_len:
        return text
    return text[: max_len - 1].rstrip() + "…"


def _text_lines_from_part(xml_path: Path) -> list[str]:
    if not xml_path.exists():
        return []
    try:
        root = _load_xml(xml_path)
    except Exception:
        return []
    lines: list[str] = []
    for p in root.findall(".//a:p", NS):
        texts = []
        for t in p.findall(".//a:t", NS):
            if t.text:
                texts.append(t.text)
        if texts:
            lines.append("".join(texts))
    return lines


def _placeholder_hits(lines: list[str]) -> list[str]:
    hits: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        for pat in PLACEHOLDER_PATTERNS:
            if pat.search(stripped):
                hits.append(stripped)
                break
    return hits[:20]


def _classify_media(files: Iterable[Path]) -> dict[str, dict[str, Any]]:
    image_exts = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff", ".svg", ".wmf", ".emf"}
    audio_exts = {".mp3", ".wav", ".m4a", ".wma", ".aac", ".ogg"}
    video_exts = {".mp4", ".mov", ".avi", ".wmv", ".m4v", ".mpeg", ".mpg"}
    buckets = {"images": [], "audio": [], "video": [], "other": []}
    for path in files:
        ext = path.suffix.lower()
        rel = str(path).replace("\\", "/")
        if ext in image_exts:
            buckets["images"].append(rel)
        elif ext in audio_exts:
            buckets["audio"].append(rel)
        elif ext in video_exts:
            buckets["video"].append(rel)
        else:
            buckets["other"].append(rel)
    return {
        key: {"count": len(vals), "files": sorted(vals)}
        for key, vals in buckets.items()
    }


def _shape_counts(slide_root) -> dict[str, int]:
    return {
        "text_boxes": len(slide_root.findall(".//p:sp", NS)),
        "pictures": len(slide_root.findall(".//p:pic", NS)),
        "graphic_frames": len(slide_root.findall(".//p:graphicFrame", NS)),
        "groups": len(slide_root.findall(".//p:grpSp", NS)),
        "placeholders": len(slide_root.findall(".//p:ph", NS)),
        "tables": len(slide_root.findall(".//a:tbl", NS)),
    }


def _relationship_categories(rels_file: Path, unpacked_dir: Path) -> dict[str, list[str]]:
    cats: dict[str, list[str]] = {
        "charts": [],
        "images": [],
        "video": [],
        "audio": [],
        "diagrams": [],
        "embeddings": [],
        "external_hyperlinks": [],
        "notes": [],
        "comments": [],
    }
    image_exts = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff", ".svg", ".wmf", ".emf"}
    audio_exts = {".mp3", ".wav", ".m4a", ".wma", ".aac", ".ogg"}
    video_exts = {".mp4", ".mov", ".avi", ".wmv", ".m4v", ".mpeg", ".mpg"}
    for rel in _iter_relationships(rels_file):
        target = rel["Target"]
        rel_type = rel["Type"]
        if rel.get("TargetMode") == "External" or rel_type.endswith("/hyperlink"):
            cats["external_hyperlinks"].append(target)
            continue
        resolved = _resolve_target(rels_file, target)
        try:
            rel_path = str(resolved.relative_to(unpacked_dir.resolve())).replace("\\", "/")
        except Exception:
            rel_path = target
        lower_type = rel_type.lower()
        if "chart" in lower_type:
            cats["charts"].append(rel_path)
        elif "image" in lower_type or resolved.suffix.lower() in image_exts:
            cats["images"].append(rel_path)
        elif "video" in lower_type or resolved.suffix.lower() in video_exts:
            cats["video"].append(rel_path)
        elif "audio" in lower_type or resolved.suffix.lower() in audio_exts or "media" in lower_type and resolved.suffix.lower() in audio_exts:
            cats["audio"].append(rel_path)
        elif "diagram" in lower_type or "/diagrams/" in rel_path:
            cats["diagrams"].append(rel_path)
        elif "embedding" in lower_type or "/embeddings/" in rel_path:
            cats["embeddings"].append(rel_path)
        elif "notesSlide" in rel_type or rel_type.endswith("/notesSlide"):
            cats["notes"].append(rel_path)
        elif "comment" in lower_type:
            cats["comments"].append(rel_path)
    return {k: sorted(dict.fromkeys(v)) for k, v in cats.items()}


def _layout_name_from_slide_rels(rels_file: Path) -> str | None:
    for rel in _iter_relationships(rels_file):
        rel_type = rel["Type"]
        if rel_type.endswith("/slideLayout") or "slideLayout" in rel_type:
            return Path(rel["Target"]).name
    return None


def _notes_path_from_slide_rels(rels_file: Path, unpacked_dir: Path) -> Path | None:
    for rel in _iter_relationships(rels_file):
        rel_type = rel["Type"]
        if rel_type.endswith("/notesSlide") or "notesSlide" in rel_type:
            resolved = _resolve_target(rels_file, rel["Target"])
            return resolved if resolved.exists() else None
    return None


def _has_transition(slide_root) -> bool:
    return slide_root.find("p:transition", NS) is not None


def _has_timing_or_animation(slide_root) -> bool:
    return slide_root.find("p:timing", NS) is not None


def _package_parts(unpacked_dir: Path) -> list[str]:
    return sorted(str(p.relative_to(unpacked_dir)).replace("\\", "/") for p in unpacked_dir.rglob("*") if p.is_file())


def _read_presentation_structure(unpacked_dir: Path) -> tuple[Any, dict[str, str], list[dict[str, Any]]]:
    pres_path = unpacked_dir / "ppt" / "presentation.xml"
    rels_path = unpacked_dir / "ppt" / "_rels" / "presentation.xml.rels"
    pres_root = _load_xml(pres_path)
    rid_to_slide = {}
    for rel in _iter_relationships(rels_path):
        if rel["Type"].endswith("/slide") or "relationships/slide" in rel["Type"]:
            rid_to_slide[rel["Id"]] = Path(rel["Target"]).name
    slides = []
    sld_lst = pres_root.find("p:sldIdLst", NS)
    if sld_lst is not None:
        for idx, sld in enumerate(sld_lst.findall("p:sldId", NS), start=1):
            rid = sld.attrib.get(f"{{{NS['r']}}}id", "")
            name = rid_to_slide.get(rid, "")
            slides.append(
                {
                    "position": idx,
                    "slide_id": int(sld.attrib.get("id", "0") or 0),
                    "relationship_id": rid,
                    "name": name,
                    "hidden": sld.attrib.get("show") == "0",
                }
            )
    return pres_root, rid_to_slide, slides


def _notes_sources_info(notes_lines: list[str]) -> tuple[bool, bool]:
    if not notes_lines:
        return False, False
    has_notes = any(line.strip() for line in notes_lines)
    joined = "\n".join(notes_lines)
    has_sources = "[sources]" in joined.lower()
    return has_notes, has_sources


def _collect_slide_info(unpacked_dir: Path, slide_refs: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any], list[str]]:
    slides_dir = unpacked_dir / "ppt" / "slides"
    slide_infos: list[dict[str, Any]] = []
    all_external_links: list[str] = []
    notes_with_notes: list[str] = []
    notes_with_sources: list[str] = []
    slides_missing_notes: list[str] = []
    slides_with_notes_but_no_sources: list[str] = []
    slides_with_hits: list[str] = []

    for ref in slide_refs:
        slide_name = ref["name"]
        slide_path = slides_dir / slide_name
        rels_path = slides_dir / "_rels" / f"{slide_name}.rels"
        exists = slide_path.exists()
        layout_name = None
        relationships = {k: [] for k in ["charts", "images", "video", "audio", "diagrams", "embeddings", "external_hyperlinks", "notes", "comments"]}
        slide_lines: list[str] = []
        notes_lines: list[str] = []
        notes_path: Path | None = None
        placeholder_hits: list[str] = []
        shape_counts = {"text_boxes": 0, "pictures": 0, "graphic_frames": 0, "groups": 0, "placeholders": 0, "tables": 0}
        has_transition = False
        has_timing_or_animation = False

        if exists:
            try:
                slide_root = _load_xml(slide_path)
                shape_counts = _shape_counts(slide_root)
                slide_lines = _text_lines_from_part(slide_path)
                placeholder_hits = _placeholder_hits(slide_lines)
                if placeholder_hits:
                    slides_with_hits.append(slide_name)
                has_transition = _has_transition(slide_root)
                has_timing_or_animation = _has_timing_or_animation(slide_root)
            except Exception:
                pass

        if rels_path.exists():
            layout_name = _layout_name_from_slide_rels(rels_path)
            relationships = _relationship_categories(rels_path, unpacked_dir)
            all_external_links.extend(relationships["external_hyperlinks"])
            notes_path = _notes_path_from_slide_rels(rels_path, unpacked_dir)

        if notes_path and notes_path.exists():
            notes_lines = _text_lines_from_part(notes_path)
        has_notes, has_sources = _notes_sources_info(notes_lines)
        if has_notes:
            notes_with_notes.append(slide_name)
            if has_sources:
                notes_with_sources.append(slide_name)
            else:
                slides_with_notes_but_no_sources.append(slide_name)
        else:
            slides_missing_notes.append(slide_name)

        slide_infos.append(
            {
                "position": ref["position"],
                "slide_id": ref["slide_id"],
                "relationship_id": ref["relationship_id"],
                "target": f"ppt/slides/{slide_name}" if slide_name else None,
                "name": slide_name,
                "hidden": ref["hidden"],
                "exists": exists,
                "layout": layout_name,
                "shape_counts": shape_counts,
                "relationships": relationships,
                "text": {
                    "paragraph_count": len(slide_lines),
                    "excerpt": _excerpt(slide_lines),
                    "placeholder_hits": placeholder_hits,
                },
                "notes": {
                    "present": bool(notes_path and notes_path.exists()),
                    "path": str(notes_path.relative_to(unpacked_dir)).replace("\\", "/") if notes_path and notes_path.exists() else None,
                    "paragraph_count": len(notes_lines),
                    "excerpt": _excerpt(notes_lines),
                    "placeholder_hits": _placeholder_hits(notes_lines),
                    "has_sources_block": has_sources,
                },
                "has_transition": has_transition,
                "has_timing_or_animation": has_timing_or_animation,
            }
        )

    notes_summary = {
        "slides_with_notes": notes_with_notes,
        "slides_with_sources_blocks": notes_with_sources,
        "slides_missing_notes": slides_missing_notes,
        "slides_with_notes_but_no_sources_block": slides_with_notes_but_no_sources,
    }
    placeholder_summary = {"slides_with_hits": sorted(dict.fromkeys(slides_with_hits))}
    return slide_infos, notes_summary, sorted(dict.fromkeys(all_external_links)), placeholder_summary


def _counts_from_package(unpacked_dir: Path, slide_infos: list[dict[str, Any]], external_links: list[str]) -> dict[str, Any]:
    ppt_dir = unpacked_dir / "ppt"
    slide_masters = len(list((ppt_dir / "slideMasters").glob("slideMaster*.xml"))) if (ppt_dir / "slideMasters").exists() else 0
    slide_layouts = len(list((ppt_dir / "slideLayouts").glob("slideLayout*.xml"))) if (ppt_dir / "slideLayouts").exists() else 0
    themes = len(list((ppt_dir / "theme").glob("theme*.xml"))) if (ppt_dir / "theme").exists() else 0
    comments_files = len(list((ppt_dir / "comments").glob("comment*.xml"))) if (ppt_dir / "comments").exists() else 0
    charts = len(list((ppt_dir / "charts").glob("chart*.xml"))) if (ppt_dir / "charts").exists() else 0
    embeddings = len([p for p in (ppt_dir / "embeddings").glob("*") if p.is_file()]) if (ppt_dir / "embeddings").exists() else 0
    return {
        "slides": len(slide_infos),
        "hidden_slides": sum(1 for s in slide_infos if s["hidden"]),
        "slides_with_notes": sum(1 for s in slide_infos if s["notes"]["paragraph_count"] > 0),
        "slides_with_sources_notes": sum(1 for s in slide_infos if s["notes"]["has_sources_block"]),
        "sections": 0,
        "slide_masters": slide_masters,
        "slide_layouts": slide_layouts,
        "themes": themes,
        "comments_files": comments_files,
        "charts": charts,
        "embeddings": embeddings,
        "external_hyperlinks": len(external_links),
    }


def _compare_reports(current: dict[str, Any], baseline: dict[str, Any]) -> dict[str, Any]:
    current_names = [s["name"] for s in current.get("slides", [])]
    baseline_names = [s["name"] for s in baseline.get("slides", [])]
    current_hidden = {s["name"] for s in current.get("slides", []) if s.get("hidden")}
    baseline_hidden = {s["name"] for s in baseline.get("slides", []) if s.get("hidden")}
    current_counts = current.get("counts", {})
    baseline_counts = baseline.get("counts", {})

    count_changes = {}
    for key in sorted(set(current_counts) | set(baseline_counts)):
        if current_counts.get(key) != baseline_counts.get(key):
            count_changes[key] = {
                "baseline": baseline_counts.get(key),
                "current": current_counts.get(key),
            }

    return {
        "baseline_input": baseline.get("input"),
        "slides_added": [name for name in current_names if name not in baseline_names],
        "slides_removed": [name for name in baseline_names if name not in current_names],
        "slide_order_changed": current_names != baseline_names,
        "hidden_slides_added": sorted(current_hidden - baseline_hidden),
        "hidden_slides_removed": sorted(baseline_hidden - current_hidden),
        "count_changes": count_changes,
        "notes_source_count_changed": current_counts.get("slides_with_sources_notes") != baseline_counts.get("slides_with_sources_notes"),
        "has_vba_changed": current.get("has_vba") != baseline.get("has_vba"),
    }


def inspect_presentation(path: str | Path, compare_to: str | Path | None = None) -> dict[str, Any]:
    src = Path(path)
    unpacked_dir, temp_ref = _extract_if_needed(src)
    try:
        pres_root, rid_to_slide, slide_refs = _read_presentation_structure(unpacked_dir)
        slide_infos, notes_summary, external_links, placeholder_summary = _collect_slide_info(unpacked_dir, slide_refs)
        media_dir = unpacked_dir / "ppt" / "media"
        media = _classify_media(media_dir.glob("*") if media_dir.exists() else [])
        parts = _package_parts(unpacked_dir)
        has_vba = (unpacked_dir / "ppt" / "vbaProject.bin").exists()
        main_ct = _content_type_for_main_part(unpacked_dir)

        report: dict[str, Any] = {
            "input": str(src.resolve()) if src.exists() else str(src),
            "package_type": src.suffix.lower() if src.suffix else "unpacked_directory",
            "main_content_type": main_ct,
            "slide_size": _slide_size(pres_root),
            "sections": _section_summary(pres_root),
            "has_vba": has_vba,
            "counts": {},
            "media": media,
            "notes_summary": notes_summary,
            "placeholder_summary": placeholder_summary,
            "external_hyperlinks": external_links,
            "slides": slide_infos,
            "package_parts": parts,
            "comparison": None,
        }
        report["counts"] = _counts_from_package(unpacked_dir, slide_infos, external_links)
        report["counts"]["sections"] = len(report.get("sections", []))

        if compare_to:
            baseline = inspect_presentation(compare_to)
            report["comparison"] = _compare_reports(report, baseline)
        return report
    finally:
        if temp_ref is not None:
            temp_ref.cleanup()


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect a PowerPoint OOXML package and emit JSON")
    parser.add_argument("input", help="Input .pptx/.pptm/.potx/.potm/.ppsx/.ppsm file or unpacked directory")
    parser.add_argument("--compare-to", help="Optional baseline presentation for comparison")
    args = parser.parse_args()
    report = inspect_presentation(args.input, compare_to=args.compare_to)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
