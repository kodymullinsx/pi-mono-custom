"""Workbook inspection CLI with stdlib-inspect compatibility.

The documented command is `python scripts/inspect.py ...`. Because this file is
named `inspect.py`, it can shadow Python's standard-library `inspect` module
when other scripts in this directory import dependencies such as dataclasses or
openpyxl. To avoid that, importing this file as module `inspect` transparently
loads and exposes the real stdlib module. Running it as a script executes the
workbook inspector.
"""

from __future__ import annotations

from pathlib import Path
import importlib.util
import sys
import sysconfig


def _load_stdlib_inspect():
    """Load the real standard-library inspect module even when this file shadows it."""
    stdlib_path = Path(sysconfig.get_paths()["stdlib"]) / "inspect.py"
    script_dir = Path(__file__).resolve().parent
    original_path = list(sys.path)
    # Remove this script directory so nested imports cannot resolve back here.
    sys.path = [p for p in sys.path if Path(p or ".").resolve() != script_dir]
    sys.modules.pop("inspect", None)
    try:
        spec = importlib.util.spec_from_file_location("inspect", stdlib_path)
        if spec is None or spec.loader is None:
            raise ImportError(f"Could not load stdlib inspect from {stdlib_path}")
        module = importlib.util.module_from_spec(spec)
        sys.modules["inspect"] = module
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path = original_path


if __name__ == "inspect":
    # Imported by another module as `inspect`; behave exactly like stdlib inspect.
    _stdlib_inspect = _load_stdlib_inspect()
    globals().update(_stdlib_inspect.__dict__)
else:
    # Executed as a CLI wrapper.
    _stdlib_inspect = _load_stdlib_inspect()
    sys.modules["inspect"] = _stdlib_inspect
    SCRIPT_DIR = Path(__file__).resolve().parent
    if str(SCRIPT_DIR) not in sys.path:
        sys.path.insert(0, str(SCRIPT_DIR))

    from workbook_inspect import compare_inspections, inspect_workbook, main  # noqa: E402,F401

    if __name__ == "__main__":
        main()
