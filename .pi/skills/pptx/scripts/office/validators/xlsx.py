"""Validator for Excel OOXML workbooks (.xlsx/.xlsm/.xltx/.xltm)."""

from __future__ import annotations

import posixpath
import re
from pathlib import Path, PurePosixPath

import lxml.etree
from openpyxl.utils.cell import range_boundaries

try:
    from ..helpers.xlsx_package import NS, OOXML_MAIN_NS, OOXML_REL_NS, PKG_REL_NS
except ImportError:  # script-style execution from scripts/office/
    from helpers.xlsx_package import NS, OOXML_MAIN_NS, OOXML_REL_NS, PKG_REL_NS

from .base import BaseSchemaValidator


class XLSXSchemaValidator(BaseSchemaValidator):
    """SpreadsheetML validator with workbook-specific integrity checks.

    The base validator already covers well-formed XML, namespaces, broken package
    references, content-types, XSD validation, and generic relationship IDs. This
    subclass adds the workbook-specific checks that make the most practical
    difference when editing existing Excel files:

    - workbook sheet r:id and target validation
    - defined names with #REF! or missing sheet targets
    - duplicate / overlapping table definitions
    - worksheet autoFilter duplication on table ranges
    - repair of missing content-types for known SpreadsheetML parts
    """

    ELEMENT_RELATIONSHIP_TYPES = {
        "drawing": "drawing",
        "legacydrawing": "vmldrawing",
        "legacydrawinghf": "vmldrawing",
        "hyperlink": "hyperlink",
        "tablepart": "table",
        "pivottablepart": "pivottable",
        "externalreference": "externallink",
    }

    SHEET_REL_TOKENS = ("worksheet", "chartsheet", "dialogsheet", "macrosheet")

    PART_TYPE_PATTERNS = [
        (re.compile(r"^xl/worksheets/[^/]+\.xml$"), "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"),
        (re.compile(r"^xl/chartsheets/[^/]+\.xml$"), "application/vnd.openxmlformats-officedocument.spreadsheetml.chartsheet+xml"),
        (re.compile(r"^xl/dialogsheets/[^/]+\.xml$"), "application/vnd.openxmlformats-officedocument.spreadsheetml.dialogsheet+xml"),
        (re.compile(r"^xl/macrosheets/[^/]+\.xml$"), "application/vnd.ms-excel.macrosheet+xml"),
        (re.compile(r"^xl/theme/[^/]+\.xml$"), "application/vnd.openxmlformats-officedocument.theme+xml"),
        (re.compile(r"^xl/styles\.xml$"), "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"),
        (re.compile(r"^xl/sharedStrings\.xml$"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"),
        (re.compile(r"^xl/calcChain\.xml$"), "application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml"),
        (re.compile(r"^xl/charts/[^/]+\.xml$"), "application/vnd.openxmlformats-officedocument.drawingml.chart+xml"),
        (re.compile(r"^xl/drawings/[^/]+\.xml$"), "application/vnd.openxmlformats-officedocument.drawing+xml"),
        (re.compile(r"^xl/comments[^/]*\.xml$"), "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"),
        (re.compile(r"^xl/threadedComments/[^/]+\.xml$"), "application/vnd.ms-excel.threadedcomments+xml"),
        (re.compile(r"^xl/persons/[^/]+\.xml$"), "application/vnd.ms-excel.person+xml"),
        (re.compile(r"^xl/tables/[^/]+\.xml$"), "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"),
        (re.compile(r"^xl/queryTables/[^/]+\.xml$"), "application/vnd.openxmlformats-officedocument.spreadsheetml.queryTable+xml"),
        (re.compile(r"^xl/pivotTables/[^/]+\.xml$"), "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotTable+xml"),
        (re.compile(r"^xl/pivotCache/pivotCacheDefinition[^/]*\.xml$"), "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheDefinition+xml"),
        (re.compile(r"^xl/pivotCache/pivotCacheRecords[^/]*\.xml$"), "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheRecords+xml"),
        (re.compile(r"^xl/externalLinks/[^/]+\.xml$"), "application/vnd.openxmlformats-officedocument.spreadsheetml.externalLink+xml"),
        (re.compile(r"^xl/connections\.xml$"), "application/vnd.openxmlformats-officedocument.spreadsheetml.connections+xml"),
        (re.compile(r"^xl/slicers/[^/]+\.xml$"), "application/vnd.ms-excel.slicer+xml"),
        (re.compile(r"^xl/slicerCaches/[^/]+\.xml$"), "application/vnd.ms-excel.slicerCache+xml"),
        (re.compile(r"^xl/metadata\.xml$"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml"),
        (re.compile(r"^xl/richData/[^/]+\.xml$"), "application/vnd.ms-excel.richdata+xml"),
        (re.compile(r"^xl/ctrlProps/[^/]+\.xml$"), "application/vnd.ms-excel.controlproperties+xml"),
        (re.compile(r"^xl/volatileDependencies\.xml$"), "application/vnd.openxmlformats-officedocument.spreadsheetml.volatileDependencies+xml"),
        (re.compile(r"^xl/printerSettings/[^/]+\.bin$"), "application/vnd.openxmlformats-officedocument.spreadsheetml.printerSettings"),
        (re.compile(r"^xl/vbaProject\.bin$"), "application/vnd.ms-office.vbaProject"),
    ]

    MEDIA_DEFAULTS = {
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "gif": "image/gif",
        "bmp": "image/bmp",
        "tif": "image/tiff",
        "tiff": "image/tiff",
        "wmf": "image/x-wmf",
        "emf": "image/x-emf",
        "svg": "image/svg+xml",
    }

    MAIN_WORKBOOK_TYPES = {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
        "application/vnd.ms-excel.sheet.macroEnabled.main+xml",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml",
        "application/vnd.ms-excel.template.macroEnabled.main+xml",
    }

    def validate(self):
        if not self.validate_xml():
            return False

        all_valid = True
        if not self.validate_namespaces():
            all_valid = False

        if not self.validate_unique_ids():
            all_valid = False

        if not self.validate_file_references():
            all_valid = False

        if not self.validate_content_types():
            all_valid = False

        if not self.validate_spreadsheet_content_types():
            all_valid = False

        if not self.validate_against_xsd():
            all_valid = False

        if not self.validate_workbook_sheet_references():
            all_valid = False

        if not self.validate_defined_names():
            all_valid = False

        if not self.validate_table_references():
            all_valid = False

        if not self.validate_all_relationship_ids():
            all_valid = False

        return all_valid

    def repair(self) -> int:
        repairs = 0
        repairs += super().repair()
        repairs += self.repair_missing_content_types()
        repairs += self.repair_duplicate_autofilters()
        return repairs

    def _read_xml_root(self, relative_path: str) -> lxml.etree._Element:
        return lxml.etree.parse(str(self.unpacked_dir / relative_path)).getroot()

    def _resolve_part_path(self, base_part: str, target: str) -> str:
        if target.startswith("/"):
            return target.lstrip("/")
        base_dir = str(PurePosixPath(base_part).parent)
        if base_dir == ".":
            base_dir = ""
        return posixpath.normpath(posixpath.join(base_dir, target)).lstrip("/")

    def _rels_path_for_part(self, part: str) -> str:
        part_path = PurePosixPath(part)
        if str(part_path.parent) == ".":
            return f"_rels/{part_path.name}.rels"
        return str(part_path.parent / "_rels" / f"{part_path.name}.rels")

    def _relationship_map(self, rels_part: str) -> dict[str, dict[str, str]]:
        rels_path = self.unpacked_dir / rels_part
        if not rels_path.exists():
            return {}
        root = lxml.etree.parse(str(rels_path)).getroot()
        base_part = rels_part[:-5] if rels_part.endswith(".rels") else rels_part
        relationships: dict[str, dict[str, str]] = {}
        for rel in root.findall(f".//{{{self.PACKAGE_RELATIONSHIPS_NAMESPACE}}}Relationship"):
            rid = rel.get("Id")
            target = rel.get("Target")
            if not rid or not target:
                continue
            relationships[rid] = {
                "target": target,
                "target_part": self._resolve_part_path(base_part, target),
                "type": rel.get("Type", ""),
                "target_mode": rel.get("TargetMode", "Internal"),
            }
        return relationships

    def _workbook_sheet_descriptors(self) -> list[dict[str, str]]:
        workbook_path = self.unpacked_dir / "xl/workbook.xml"
        if not workbook_path.exists():
            return []
        root = lxml.etree.parse(str(workbook_path)).getroot()
        rels = self._relationship_map("xl/_rels/workbook.xml.rels")
        sheets: list[dict[str, str]] = []
        for sheet in root.findall(".//main:sheets/main:sheet", NS):
            rid = sheet.get(f"{{{OOXML_REL_NS}}}id") or ""
            rel = rels.get(rid, {})
            part = rel.get("target_part", "")
            root_name = ""
            part_path = self.unpacked_dir / part
            if part and part_path.exists():
                try:
                    root_name = lxml.etree.parse(str(part_path)).getroot().tag.split("}")[-1]
                except Exception:
                    root_name = ""
            sheets.append(
                {
                    "name": sheet.get("name", ""),
                    "sheetId": sheet.get("sheetId", ""),
                    "state": sheet.get("state", "visible"),
                    "rid": rid,
                    "part": part,
                    "rel_type": rel.get("type", ""),
                    "root_name": root_name,
                }
            )
        return sheets

    def _all_package_files(self) -> list[str]:
        return sorted(
            str(p.relative_to(self.unpacked_dir)).replace("\\", "/")
            for p in self.unpacked_dir.rglob("*")
            if p.is_file()
        )

    def _content_types_root(self) -> lxml.etree._Element | None:
        path = self.unpacked_dir / "[Content_Types].xml"
        if not path.exists():
            return None
        return lxml.etree.parse(str(path)).getroot()

    def _content_type_maps(self) -> tuple[dict[str, str], dict[str, str], lxml.etree._Element | None]:
        root = self._content_types_root()
        overrides: dict[str, str] = {}
        defaults: dict[str, str] = {}
        if root is None:
            return overrides, defaults, None
        for node in root.findall(f".//{{{self.CONTENT_TYPES_NAMESPACE}}}Override"):
            part = node.get("PartName")
            ctype = node.get("ContentType")
            if part and ctype:
                overrides[part.lstrip("/")] = ctype
        for node in root.findall(f".//{{{self.CONTENT_TYPES_NAMESPACE}}}Default"):
            ext = node.get("Extension")
            ctype = node.get("ContentType")
            if ext and ctype:
                defaults[ext.lower()] = ctype
        return overrides, defaults, root

    def _workbook_main_content_type(self) -> str:
        suffix = self.original_file.suffix.lower() if self.original_file else ""
        has_vba = (self.unpacked_dir / "xl/vbaProject.bin").exists()
        if suffix == ".xlsm":
            return "application/vnd.ms-excel.sheet.macroEnabled.main+xml"
        if suffix == ".xltx":
            return "application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml"
        if suffix == ".xltm":
            return "application/vnd.ms-excel.template.macroEnabled.main+xml"
        if has_vba:
            return "application/vnd.ms-excel.sheet.macroEnabled.main+xml"
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"

    def _expected_content_type_for_part(self, part: str) -> str | None:
        if part == "xl/workbook.xml":
            return self._workbook_main_content_type()
        for pattern, content_type in self.PART_TYPE_PATTERNS:
            if pattern.match(part):
                return content_type
        return None

    def validate_spreadsheet_content_types(self):
        errors: list[str] = []
        overrides, defaults, _ = self._content_type_maps()
        if not overrides and not defaults:
            print("FAILED - [Content_Types].xml file not found or unreadable")
            return False

        for part in self._all_package_files():
            if part == "[Content_Types].xml" or part.endswith(".rels") or "/_rels/" in part:
                continue
            if part.startswith("docProps/"):
                continue
            expected = self._expected_content_type_for_part(part)
            if expected:
                actual = overrides.get(part)
                if actual is None:
                    errors.append(f"  {part}: Missing <Override> in [Content_Types].xml (expected {expected})")
                elif part == "xl/workbook.xml":
                    if actual not in self.MAIN_WORKBOOK_TYPES:
                        errors.append(
                            f"  {part}: Invalid workbook content type '{actual}' (expected one of: {', '.join(sorted(self.MAIN_WORKBOOK_TYPES))})"
                        )
                elif actual != expected:
                    errors.append(
                        f"  {part}: Wrong content type '{actual}' in [Content_Types].xml (expected {expected})"
                    )
                continue

            ext = Path(part).suffix.lstrip(".").lower()
            if ext in self.MEDIA_DEFAULTS and defaults.get(ext) != self.MEDIA_DEFAULTS[ext]:
                errors.append(
                    f"  {part}: Missing or wrong <Default> for extension '{ext}' in [Content_Types].xml (expected {self.MEDIA_DEFAULTS[ext]})"
                )

        if errors:
            print(f"FAILED - Found {len(errors)} SpreadsheetML content type issues:")
            for error in errors:
                print(error)
            return False
        if self.verbose:
            print("PASSED - Spreadsheet-specific content type overrides/defaults are consistent")
        return True

    def repair_missing_content_types(self) -> int:
        overrides, defaults, root = self._content_type_maps()
        if root is None:
            return 0

        repairs = 0
        modified = False

        def _add_override(part_name: str, content_type: str) -> None:
            nonlocal repairs, modified
            node = lxml.etree.Element(f"{{{self.CONTENT_TYPES_NAMESPACE}}}Override")
            node.set("PartName", f"/{part_name}")
            node.set("ContentType", content_type)
            root.append(node)
            repairs += 1
            modified = True
            print(f"  Repaired: Added [Content_Types].xml override for /{part_name}")

        def _add_default(ext: str, content_type: str) -> None:
            nonlocal repairs, modified
            node = lxml.etree.Element(f"{{{self.CONTENT_TYPES_NAMESPACE}}}Default")
            node.set("Extension", ext)
            node.set("ContentType", content_type)
            root.append(node)
            repairs += 1
            modified = True
            print(f"  Repaired: Added [Content_Types].xml default for .{ext}")

        for part in self._all_package_files():
            if part == "[Content_Types].xml" or part.endswith(".rels") or "/_rels/" in part:
                continue
            if part.startswith("docProps/"):
                continue
            expected = self._expected_content_type_for_part(part)
            if expected and part not in overrides:
                _add_override(part, expected)
                overrides[part] = expected
                continue
            ext = Path(part).suffix.lstrip(".").lower()
            if ext in self.MEDIA_DEFAULTS and ext not in defaults:
                _add_default(ext, self.MEDIA_DEFAULTS[ext])
                defaults[ext] = self.MEDIA_DEFAULTS[ext]

        if modified:
            content_types_path = self.unpacked_dir / "[Content_Types].xml"
            content_types_path.write_bytes(
                lxml.etree.tostring(root, encoding="UTF-8", xml_declaration=True, pretty_print=True)
            )
        return repairs

    def validate_workbook_sheet_references(self):
        errors: list[str] = []
        workbook_path = self.unpacked_dir / "xl/workbook.xml"
        if not workbook_path.exists():
            print("FAILED - xl/workbook.xml file not found")
            return False

        sheet_ids: dict[str, str] = {}
        descriptors = self._workbook_sheet_descriptors()
        if not descriptors:
            if self.verbose:
                print("PASSED - No workbook sheets found")
            return True

        for sheet in descriptors:
            name = sheet["name"]
            sheet_id = sheet["sheetId"]
            rid = sheet["rid"]
            rel_type = sheet["rel_type"]
            part = sheet["part"]
            if not rid:
                errors.append(f"  xl/workbook.xml: Sheet '{name}' is missing r:id")
            if not sheet_id.isdigit() or int(sheet_id) <= 0:
                errors.append(f"  xl/workbook.xml: Sheet '{name}' has invalid sheetId='{sheet_id}'")
            elif sheet_id in sheet_ids:
                errors.append(
                    f"  xl/workbook.xml: Duplicate sheetId='{sheet_id}' used by '{name}' and '{sheet_ids[sheet_id]}'"
                )
            else:
                sheet_ids[sheet_id] = name
            if not part:
                errors.append(f"  xl/workbook.xml: Sheet '{name}' has no relationship target for r:id='{rid}'")
            else:
                part_path = self.unpacked_dir / part
                if not part_path.exists():
                    errors.append(f"  xl/workbook.xml: Sheet '{name}' target part is missing: {part}")
            if rel_type and not any(token in rel_type.lower() for token in self.SHEET_REL_TOKENS):
                errors.append(
                    f"  xl/workbook.xml: Sheet '{name}' r:id='{rid}' points to unexpected relationship type '{rel_type}'"
                )

        if errors:
            print(f"FAILED - Found {len(errors)} workbook sheet reference issues:")
            for error in errors:
                print(error)
            return False
        if self.verbose:
            print("PASSED - Workbook sheets reference valid relationship targets")
        return True

    def validate_defined_names(self):
        errors: list[str] = []
        workbook_path = self.unpacked_dir / "xl/workbook.xml"
        if not workbook_path.exists():
            print("FAILED - xl/workbook.xml file not found")
            return False

        root = lxml.etree.parse(str(workbook_path)).getroot()
        sheet_names = {d["name"] for d in self._workbook_sheet_descriptors()}
        pattern = re.compile(r"(?:^|,)\s*(?:'((?:[^']|'')+)'|([^'!,\[]+))!")

        for defined_name in root.findall(".//main:definedNames/main:definedName", NS):
            name = defined_name.get("name", "")
            formula = (defined_name.text or "").strip()
            local_sheet_id = defined_name.get("localSheetId")

            if "#REF!" in formula:
                errors.append(
                    f"  xl/workbook.xml: Line {defined_name.sourceline}: Defined name '{name}' contains #REF!: {formula}"
                )

            if local_sheet_id is not None and (not local_sheet_id.isdigit() or int(local_sheet_id) < 0):
                errors.append(
                    f"  xl/workbook.xml: Line {defined_name.sourceline}: Defined name '{name}' has invalid localSheetId='{local_sheet_id}'"
                )

            for match in pattern.finditer(formula):
                sheet_name = match.group(1) or match.group(2) or ""
                sheet_name = sheet_name.replace("''", "'")
                if sheet_name and sheet_name not in sheet_names:
                    errors.append(
                        f"  xl/workbook.xml: Line {defined_name.sourceline}: Defined name '{name}' references missing sheet '{sheet_name}'"
                    )

        if errors:
            print(f"FAILED - Found {len(errors)} defined name issues:")
            for error in errors:
                print(error)
            return False
        if self.verbose:
            print("PASSED - Defined names do not contain broken local workbook references")
        return True

    def _table_specs_for_sheet(self, sheet_part: str) -> tuple[str | None, list[dict[str, str]], list[str]]:
        sheet_path = self.unpacked_dir / sheet_part
        if not sheet_path.exists():
            return None, [], [f"  {sheet_part}: Worksheet part not found"]

        errors: list[str] = []
        sheet_root = lxml.etree.parse(str(sheet_path)).getroot()
        auto_filter = sheet_root.find("main:autoFilter", NS)
        auto_filter_ref = auto_filter.get("ref") if auto_filter is not None else None
        rels = self._relationship_map(self._rels_path_for_part(sheet_part))

        table_specs: list[dict[str, str]] = []
        for table_part in sheet_root.findall(".//main:tableParts/main:tablePart", NS):
            rid = table_part.get(f"{{{OOXML_REL_NS}}}id")
            if not rid:
                errors.append(f"  {sheet_part}: Line {table_part.sourceline}: tablePart is missing r:id")
                continue
            rel = rels.get(rid)
            if not rel:
                errors.append(f"  {sheet_part}: Line {table_part.sourceline}: tablePart r:id='{rid}' not found in relationships")
                continue
            if "table" not in rel.get("type", "").lower():
                errors.append(
                    f"  {sheet_part}: Line {table_part.sourceline}: tablePart r:id='{rid}' points to non-table relationship '{rel.get('type', '')}'"
                )
                continue
            target_part = rel.get("target_part", "")
            target_path = self.unpacked_dir / target_part
            if not target_part or not target_path.exists():
                errors.append(f"  {sheet_part}: Line {table_part.sourceline}: Missing table part target '{target_part}'")
                continue
            try:
                table_root = lxml.etree.parse(str(target_path)).getroot()
                table_specs.append(
                    {
                        "sheet_part": sheet_part,
                        "table_part": target_part,
                        "rid": rid,
                        "displayName": table_root.get("displayName") or table_root.get("name") or "",
                        "name": table_root.get("name") or table_root.get("displayName") or "",
                        "ref": table_root.get("ref") or "",
                    }
                )
            except Exception as exc:
                errors.append(f"  {target_part}: Could not parse table XML: {exc}")

        return auto_filter_ref, table_specs, errors

    @staticmethod
    def _ranges_overlap(ref_a: str, ref_b: str) -> bool:
        try:
            a_min_col, a_min_row, a_max_col, a_max_row = range_boundaries(ref_a)
            b_min_col, b_min_row, b_max_col, b_max_row = range_boundaries(ref_b)
        except Exception:
            return False
        return not (
            a_max_row < b_min_row
            or b_max_row < a_min_row
            or a_max_col < b_min_col
            or b_max_col < a_min_col
        )

    def validate_table_references(self):
        errors: list[str] = []
        seen_table_names: dict[str, str] = {}

        for sheet in self._workbook_sheet_descriptors():
            rel_type = sheet.get("rel_type", "").lower()
            if "worksheet" not in rel_type:
                continue
            sheet_name = sheet["name"]
            sheet_part = sheet["part"]
            auto_filter_ref, table_specs, sheet_errors = self._table_specs_for_sheet(sheet_part)
            errors.extend(sheet_errors)

            for table in table_specs:
                table_name = table["displayName"] or table["name"]
                table_ref = table["ref"]
                if not table_name:
                    errors.append(f"  {table['table_part']}: Table is missing displayName/name")
                elif table_name in seen_table_names:
                    errors.append(
                        f"  {table['table_part']}: Duplicate table name '{table_name}' already used in {seen_table_names[table_name]}"
                    )
                else:
                    seen_table_names[table_name] = table["table_part"]

                if not table_ref:
                    errors.append(f"  {table['table_part']}: Table '{table_name or table['table_part']}' is missing ref")
                else:
                    try:
                        range_boundaries(table_ref)
                    except Exception as exc:
                        errors.append(f"  {table['table_part']}: Invalid table ref '{table_ref}': {exc}")

            for idx, left in enumerate(table_specs):
                for right in table_specs[idx + 1 :]:
                    if left["ref"] and right["ref"] and self._ranges_overlap(left["ref"], right["ref"]):
                        errors.append(
                            f"  {sheet_part}: Overlapping tables in sheet '{sheet_name}': {left['displayName'] or left['table_part']} {left['ref']} overlaps {right['displayName'] or right['table_part']} {right['ref']}"
                        )

            if auto_filter_ref:
                for table in table_specs:
                    if table["ref"] == auto_filter_ref:
                        errors.append(
                            f"  {sheet_part}: Worksheet autoFilter ref '{auto_filter_ref}' duplicates table range for '{table['displayName'] or table['table_part']}'"
                        )

        if errors:
            print(f"FAILED - Found {len(errors)} table / sheet filter issues:")
            for error in errors:
                print(error)
            print("When using openpyxl tables, avoid setting ws.auto_filter.ref on the same range.")
            return False
        if self.verbose:
            print("PASSED - Tables are uniquely named and do not duplicate worksheet filters")
        return True

    def repair_duplicate_autofilters(self) -> int:
        repairs = 0
        for sheet in self._workbook_sheet_descriptors():
            rel_type = sheet.get("rel_type", "").lower()
            if "worksheet" not in rel_type:
                continue
            sheet_part = sheet["part"]
            sheet_path = self.unpacked_dir / sheet_part
            if not sheet_path.exists():
                continue

            auto_filter_ref, table_specs, _ = self._table_specs_for_sheet(sheet_part)
            if not auto_filter_ref:
                continue
            if not any(table["ref"] == auto_filter_ref for table in table_specs):
                continue

            root = lxml.etree.parse(str(sheet_path)).getroot()
            auto_filter = root.find("main:autoFilter", NS)
            if auto_filter is not None:
                parent = auto_filter.getparent()
                if parent is not None:
                    parent.remove(auto_filter)
                    sheet_path.write_bytes(
                        lxml.etree.tostring(root, encoding="UTF-8", xml_declaration=True, pretty_print=True)
                    )
                    repairs += 1
                    print(
                        f"  Repaired: Removed worksheet autoFilter from {sheet_part} because the same range is already owned by a table"
                    )
        return repairs
