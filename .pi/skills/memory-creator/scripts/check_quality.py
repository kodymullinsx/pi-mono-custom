#!/usr/bin/env python3
"""
Memory quality checker — validates structural integrity of a memory tree.

Usage:
    python3 check_quality.py                          # check both trees
    python3 check_quality.py --root ~/work/Memory    # check one tree
    python3 check_quality.py --domain work/audit/fy26-tplc  # check one domain

Checks:
    - Frontmatter completeness (domain, description, last_updated)
    - Line count violations (warn >60, error >65)
    - _index.md sync (memory.md description matches _index.md entry)
    - Reference pointer integrity (all referenced files exist)
    - Reference file frontmatter (warn if present)

Exit codes:
    0 — clean (no errors; warnings are informational)
    1 — one or more errors found
"""

import argparse
import json
import re
import sys
from pathlib import Path

HOME = Path.home()
MEMORY_ROOTS = {
    "personal": HOME / "projects" / "Memory",
    "work": HOME / "work" / "Memory",
}
SOFT_LIMIT = 60
HARD_LIMIT = 65
REQUIRED_FIELDS = ["domain", "description", "last_updated"]


def extract_frontmatter(file_path: Path) -> dict:
    if not file_path.exists():
        return {}
    content = file_path.read_text(encoding="utf-8")
    if not content.startswith("---"):
        return {}
    end = content.find("---", 3)
    if end == -1:
        return {}
    result = {}
    for line in content[3:end].strip().split("\n"):
        if ":" in line:
            key, value = line.split(":", 1)
            result[key.strip()] = value.strip()
    return result


def load_index(memory_root: Path) -> dict:
    """Returns {domain_path: description} from _index.md."""
    index_file = memory_root / "_index.md"
    if not index_file.exists():
        return {}
    result = {}
    pattern = re.compile(r"^- \*\*(.+?)\*\* — (.+)$")
    for line in index_file.read_text(encoding="utf-8").splitlines():
        m = pattern.match(line)
        if m:
            result[m.group(1)] = m.group(2)
    return result


def find_reference_pointers(content: str) -> list:
    refs = []
    for line in content.splitlines():
        m = re.search(r"`(references/[^`]+\.md)`", line)
        if m:
            refs.append(m.group(1))
    return refs


def check_memory_file(path: Path, memory_root: Path, index: dict) -> list:
    violations = []
    rel = str(path.relative_to(memory_root))
    content = path.read_text(encoding="utf-8")
    lines = len(content.splitlines())
    fm = extract_frontmatter(path)

    # Frontmatter completeness
    for field in REQUIRED_FIELDS:
        if field not in fm:
            violations.append({"file": rel, "level": "ERROR",
                                "msg": f"missing required frontmatter field: '{field}'"})

    # Line count
    if lines > HARD_LIMIT:
        violations.append({"file": rel, "level": "ERROR",
                            "msg": f"{lines} lines — exceeds hard limit of {HARD_LIMIT}"})
    elif lines > SOFT_LIMIT:
        violations.append({"file": rel, "level": "WARN",
                            "msg": f"{lines} lines — exceeds soft limit of {SOFT_LIMIT}"})

    # _index.md sync
    domain = fm.get("domain", "")
    description = fm.get("description", "")
    if domain:
        if domain not in index:
            violations.append({"file": rel, "level": "WARN",
                                "msg": f"domain '{domain}' not found in _index.md"})
        elif description and index[domain] != description:
            violations.append({
                "file": rel, "level": "WARN",
                "msg": (f"_index.md description mismatch\n"
                        f"         memory.md : {description[:90]}\n"
                        f"         _index.md : {index[domain][:90]}")
            })

    # Reference pointer integrity
    for ref in find_reference_pointers(content):
        ref_path = path.parent / ref
        if not ref_path.exists():
            violations.append({"file": rel, "level": "ERROR",
                                "msg": f"orphan reference pointer: '{ref}' does not exist"})

    return violations


def check_reference_file(path: Path, memory_root: Path) -> list:
    violations = []
    rel = str(path.relative_to(memory_root))
    content = path.read_text(encoding="utf-8")
    if content.lstrip().startswith("---"):
        violations.append({"file": rel, "level": "WARN",
                            "msg": "reference file has YAML frontmatter (non-standard; "
                                   "frontmatter belongs only in memory.md)"})
    return violations


def run_checks(memory_root: Path, domain_filter: str = None) -> list:
    violations = []
    index = load_index(memory_root)

    for path in sorted(memory_root.rglob("*.md")):
        if path.name == "_index.md":
            continue

        rel = str(path.relative_to(memory_root))
        if domain_filter:
            # Normalize filter: strip tree prefix
            filt = domain_filter
            for prefix in ("work/", "personal/", "projects/"):
                if filt.startswith(prefix):
                    filt = filt[len(prefix):]
                    break
            if not rel.startswith(filt):
                continue

        if path.name == "memory.md":
            violations.extend(check_memory_file(path, memory_root, index))
        elif "references" in path.parts and path.suffix == ".md":
            violations.extend(check_reference_file(path, memory_root))

    return violations


def print_report(violations: list) -> None:
    if not violations:
        print("  ✓ No violations found.")
        return
    errors = [v for v in violations if v["level"] == "ERROR"]
    warns = [v for v in violations if v["level"] == "WARN"]
    for v in errors + warns:
        tag = "ERROR" if v["level"] == "ERROR" else "WARN "
        print(f"  [{tag}] {v['file']}")
        print(f"          {v['msg']}")
    print(f"\n  {len(errors)} error(s), {len(warns)} warning(s)")


def summarize_violations(violations: list) -> dict:
    errors = sum(1 for violation in violations if violation["level"] == "ERROR")
    warnings = sum(1 for violation in violations if violation["level"] == "WARN")
    return {
        "errors": errors,
        "warnings": warnings,
    }


def main():
    parser = argparse.ArgumentParser(description="Memory quality checker")
    parser.add_argument("--root", help="Memory root path (default: check both trees)")
    parser.add_argument("--domain", help="Filter to a specific domain path")
    parser.add_argument("--json", action="store_true", dest="json_output",
                        help="Emit machine-readable JSON")
    args = parser.parse_args()

    all_violations = []
    root_results = []

    if args.root:
        root = Path(args.root).expanduser().resolve()
        violations = run_checks(root, args.domain)
        root_results.append({
            "name": root.name or "custom",
            "root": str(root),
            "violations": violations,
            "summary": summarize_violations(violations),
        })
        if not args.json_output:
            print_report(violations)
        all_violations.extend(violations)
    else:
        for name, root in MEMORY_ROOTS.items():
            if not root.exists():
                continue
            violations = run_checks(root, args.domain)
            root_results.append({
                "name": name,
                "root": str(root),
                "violations": violations,
                "summary": summarize_violations(violations),
            })
            if not args.json_output:
                print(f"\n{'─'*60}")
                print(f" {name} tree  ({root})")
                print(f"{'─'*60}")
                print_report(violations)
            all_violations.extend(violations)

    if args.json_output:
        payload = {
            "ok": not any(v["level"] == "ERROR" for v in all_violations),
            "roots": root_results,
            "summary": summarize_violations(all_violations),
        }
        json.dump(payload, sys.stdout, indent=2)
        sys.stdout.write("\n")

    sys.exit(1 if any(v["level"] == "ERROR" for v in all_violations) else 0)


if __name__ == "__main__":
    main()
