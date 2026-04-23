"""Decrypt a password-protected PowerPoint OOXML package using msoffcrypto-tool if available."""

from __future__ import annotations

import argparse
import json
import shutil
import zipfile
from pathlib import Path
from typing import Any

POWERPOINT_PACKAGE_EXTENSIONS = {".pptx", ".pptm", ".potx", ".potm", ".ppsx", ".ppsm"}


def _is_zip_package(path: Path) -> bool:
    return path.exists() and zipfile.is_zipfile(path)


def decrypt_presentation(source: str | Path, output: str | Path, password: str) -> dict[str, Any]:
    src = Path(source)
    dst = Path(output)

    if not src.exists():
        return {"error": f"Presentation does not exist: {src}"}
    if src.suffix.lower() not in POWERPOINT_PACKAGE_EXTENSIONS:
        return {"error": f"Unsupported presentation extension '{src.suffix}'."}
    if not password:
        return {"error": "A non-empty password is required."}

    if _is_zip_package(src):
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        return {
            "status": "already_unencrypted",
            "source": str(src.resolve()),
            "output": str(dst.resolve()),
            "warnings": ["Source presentation was already an OOXML ZIP package; copied without decryption."],
        }

    try:
        import msoffcrypto
    except Exception:
        return {
            "error": "msoffcrypto-tool is not installed in this environment. Install it to decrypt password-protected Office files.",
        }

    dst.parent.mkdir(parents=True, exist_ok=True)
    with src.open("rb") as infile, dst.open("wb") as outfile:
        office_file = msoffcrypto.OfficeFile(infile)
        office_file.load_key(password=password)
        office_file.decrypt(outfile)

    if not _is_zip_package(dst):
        return {
            "error": "Decryption finished but the output is not a valid OOXML ZIP package. The password may be incorrect or the file type may not be supported.",
        }

    return {
        "status": "success",
        "source": str(src.resolve()),
        "output": str(dst.resolve()),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Decrypt a password-protected PowerPoint package")
    parser.add_argument("source", help="Encrypted .pptx/.pptm/.potx/.potm/.ppsx/.ppsm input file")
    parser.add_argument("output", help="Output path for decrypted presentation")
    parser.add_argument("--password", required=True, help="Presentation password")
    args = parser.parse_args()
    print(json.dumps(decrypt_presentation(args.source, args.output, args.password), indent=2))


if __name__ == "__main__":
    main()
