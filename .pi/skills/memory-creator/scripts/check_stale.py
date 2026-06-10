#!/usr/bin/env python3
"""
Memory staleness checker — reports domains not updated in N days.

Usage:
    python3 check_stale.py                        # both trees, 60-day threshold
    python3 check_stale.py --threshold 30         # stricter threshold
    python3 check_stale.py --tree work            # work tree only
    python3 check_stale.py --tree personal        # personal+projects tree only
"""

import argparse
import json
import sys
from datetime import date, datetime
from pathlib import Path

HOME = Path.home()
MEMORY_ROOTS = {
    "personal": HOME / "projects" / "Memory",
    "work": HOME / "work" / "Memory",
}
DEFAULT_THRESHOLD = 60


def extract_last_updated(file_path: Path):
    """Returns a date object, or None if not found/parseable."""
    if not file_path.exists():
        return None
    content = file_path.read_text(encoding="utf-8")
    if not content.startswith("---"):
        return None
    end = content.find("---", 3)
    if end == -1:
        return None
    for line in content[3:end].strip().split("\n"):
        if line.startswith("last_updated:"):
            value = line.split(":", 1)[1].strip()
            # Handle "2026-03-23 (note...)" format — take only the date portion
            date_part = value.split()[0]
            try:
                return datetime.strptime(date_part, "%Y-%m-%d").date()
            except ValueError:
                return None
    return None


def extract_domain(file_path: Path) -> str:
    if not file_path.exists():
        return str(file_path)
    content = file_path.read_text(encoding="utf-8")
    if not content.startswith("---"):
        return str(file_path)
    end = content.find("---", 3)
    if end == -1:
        return str(file_path)
    for line in content[3:end].strip().split("\n"):
        if line.startswith("domain:"):
            return line.split(":", 1)[1].strip()
    return str(file_path)


def check_tree(root: Path, threshold: int) -> list:
    today = date.today()
    stale = []
    for path in sorted(root.rglob("memory.md")):
        last_updated = extract_last_updated(path)
        domain = extract_domain(path)
        if last_updated is None:
            stale.append({
                "domain": domain,
                "last_updated": "unknown",
                "days_since": 9999,
                "days_display": "?",
            })
            continue
        days = (today - last_updated).days
        if days > threshold:
            stale.append({
                "domain": domain,
                "last_updated": str(last_updated),
                "days_since": days,
                "days_display": str(days),
            })
    return sorted(stale, key=lambda x: x["days_since"], reverse=True)


def main():
    parser = argparse.ArgumentParser(description="Memory staleness checker")
    parser.add_argument(
        "--threshold", type=int, default=DEFAULT_THRESHOLD,
        help=f"Days since last update to flag as stale (default: {DEFAULT_THRESHOLD})"
    )
    parser.add_argument(
        "--tree", choices=["personal", "work", "both"], default="both",
        help="Which memory tree to check (default: both)"
    )
    parser.add_argument("--json", action="store_true", dest="json_output",
                        help="Emit machine-readable JSON")
    args = parser.parse_args()

    trees = (
        list(MEMORY_ROOTS.items())
        if args.tree == "both"
        else [(args.tree, MEMORY_ROOTS[args.tree])]
    )

    found_any = False
    tree_results = []
    for tree_name, root in trees:
        if not root.exists():
            continue
        stale = check_tree(root, args.threshold)
        tree_results.append({
            "name": tree_name,
            "root": str(root),
            "stale": stale,
            "summary": {
                "stale_domains": len(stale),
            },
        })
        if stale:
            found_any = True
            if not args.json_output:
                print(f"\n{'═'*62}")
                print(f"  Stale domains — {tree_name} tree  (>{args.threshold} days)")
                print(f"{'═'*62}")
                print(f"  {'Domain':<42} {'Last Updated':<14} Days")
                print(f"  {'─'*42} {'─'*14} ────")
                for entry in stale:
                    print(
                        f"  {entry['domain']:<42} "
                        f"{entry['last_updated']:<14} "
                        f"{entry['days_display']}"
                    )

    if args.json_output:
        payload = {
            "ok": True,
            "threshold": args.threshold,
            "trees": tree_results,
            "summary": {
                "stale_domains": sum(result["summary"]["stale_domains"] for result in tree_results),
            },
        }
        json.dump(payload, sys.stdout, indent=2)
        sys.stdout.write("\n")
    elif not found_any:
        print(f"All domains updated within the last {args.threshold} days.")

    sys.exit(0)


if __name__ == "__main__":
    main()
