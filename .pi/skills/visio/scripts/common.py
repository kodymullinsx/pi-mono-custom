from __future__ import annotations

import contextlib
import os
import posixpath
import shutil
import tempfile
import zipfile
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree as ET

VISIO_PACKAGE_EXTENSIONS = {".vsdx", ".vsdm", ".vssx", ".vssm", ".vstx", ".vstm", ".zip"}
MAIN_NS = "http://schemas.microsoft.com/office/visio/2012/main"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types"

V = f"{{{MAIN_NS}}}"
R = f"{{{OFFICE_REL_NS}}}"
CT = f"{{{CONTENT_TYPES_NS}}}"


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def parse_xml(path: Path) -> ET.ElementTree:
    return ET.parse(path)


def rel_id(element: ET.Element | None) -> str | None:
    if element is None:
        return None
    return element.attrib.get(f"{R}id") or element.attrib.get("r:id") or element.attrib.get("id")


def cell_map(element: ET.Element) -> dict[str, dict[str, str]]:
    cells: dict[str, dict[str, str]] = {}
    for child in list(element):
        if local_name(child.tag) != "Cell":
            continue
        name = child.attrib.get("N")
        if name:
            cells[name] = dict(child.attrib)
    return cells


def cell_value(element: ET.Element, name: str) -> str | None:
    cell = cell_map(element).get(name)
    return cell.get("V") if cell else None


def visible_text(element: ET.Element | None) -> str:
    if element is None:
        return ""
    return " ".join("".join(element.itertext()).split())


def shape_text(shape: ET.Element) -> str:
    return visible_text(shape.find(f"{V}Text"))


def safe_extract_zip(package_path: Path, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    root = output_dir.resolve()
    with zipfile.ZipFile(package_path, "r") as zf:
        for info in zf.infolist():
            name = info.filename
            parts = PurePosixPath(name).parts
            if name.startswith("/") or ".." in parts:
                raise ValueError(f"Unsafe ZIP member path: {name}")
            dest = (output_dir / name).resolve()
            try:
                dest.relative_to(root)
            except ValueError as exc:
                raise ValueError(f"Unsafe ZIP member path: {name}") from exc
            zf.extract(info, output_dir)


@contextlib.contextmanager
def materialized_visio_source(path: Path):
    if path.is_dir():
        yield path
        return

    if not path.is_file():
        raise ValueError(f"{path} is not a file or directory")
    if path.suffix.lower() not in VISIO_PACKAGE_EXTENSIONS:
        raise ValueError(
            f"{path} must have one of these extensions: {', '.join(sorted(VISIO_PACKAGE_EXTENSIONS))}"
        )

    temp_dir = Path(tempfile.mkdtemp(prefix="visio-package-"))
    try:
        safe_extract_zip(path, temp_dir)
        yield temp_dir
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def parse_relationships(rels_path: Path) -> list[dict[str, str]]:
    if not rels_path.exists():
        return []
    root = parse_xml(rels_path).getroot()
    relationships = []
    for rel in root:
        if local_name(rel.tag) == "Relationship":
            relationships.append(dict(rel.attrib))
    return relationships


def relationship_source_base(rels_rel_path: str) -> str:
    if rels_rel_path == "_rels/.rels":
        return ""

    parts = PurePosixPath(rels_rel_path).parts
    if "_rels" not in parts:
        return ""

    idx = parts.index("_rels")
    source_dir = PurePosixPath(*parts[:idx])
    rels_name = parts[-1]
    source_name = rels_name[:-5] if rels_name.endswith(".rels") else rels_name
    source_part = source_dir / source_name
    parent = source_part.parent
    return "" if str(parent) == "." else str(parent)


def resolve_relationship_target(rels_rel_path: str, target: str) -> str:
    if target.startswith("/"):
        resolved = target.lstrip("/")
    else:
        base = relationship_source_base(rels_rel_path)
        resolved = posixpath.normpath(posixpath.join(base, target))
    return "" if resolved == "." else resolved


def package_rel_path(root_dir: Path, path: Path) -> str:
    return path.relative_to(root_dir).as_posix()


def iter_package_files(root_dir: Path):
    for path in root_dir.rglob("*"):
        if path.is_file():
            yield path


def content_type_overrides(root_dir: Path) -> dict[str, str]:
    path = root_dir / "[Content_Types].xml"
    if not path.exists():
        return {}
    root = parse_xml(path).getroot()
    return {
        child.attrib["PartName"]: child.attrib["ContentType"]
        for child in root
        if local_name(child.tag) == "Override"
        and "PartName" in child.attrib
        and "ContentType" in child.attrib
    }


def normalize_output_member(path: Path, root_dir: Path) -> str:
    return path.relative_to(root_dir).as_posix()


def path_exists_in_package(root_dir: Path, rel_target: str) -> bool:
    if rel_target.startswith("../") or rel_target == "..":
        return False
    return (root_dir / rel_target).exists()


def zip_test(path: Path) -> str | None:
    with zipfile.ZipFile(path, "r") as zf:
        return zf.testzip()


def ensure_empty_or_force(output_dir: Path, force: bool) -> None:
    if output_dir.exists() and any(output_dir.iterdir()) and not force:
        raise ValueError(f"{output_dir} already exists and is not empty. Use --force to replace it.")
    if output_dir.exists() and force:
        shutil.rmtree(output_dir)


def remove_macos_artifacts(root_dir: Path) -> None:
    for path in list(root_dir.rglob(".DS_Store")):
        path.unlink()
    macosx = root_dir / "__MACOSX"
    if macosx.exists():
        shutil.rmtree(macosx)


def is_external_relationship(rel: dict[str, str]) -> bool:
    return rel.get("TargetMode") == "External"


def within_directory(root: Path, child: Path) -> bool:
    try:
        child.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def mkdir_parent(path: Path) -> None:
    parent = path.parent
    if str(parent):
        parent.mkdir(parents=True, exist_ok=True)


def copytree_clean(src: Path, dst: Path) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)
    remove_macos_artifacts(dst)


def package_extension_message() -> str:
    return ", ".join(sorted(VISIO_PACKAGE_EXTENSIONS))
