"""Decrypt a password-protected OOXML workbook using msoffcrypto-tool if available."""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path
from typing import Any

from office.helpers.xlsx_package import EXCEL_PACKAGE_EXTENSIONS, is_probably_encrypted_excel, is_zip_package


def decrypt_workbook(source: str | Path, output: str | Path, password: str) -> dict[str, Any]:
    src = Path(source)
    dst = Path(output)

    if not src.exists():
        return {"error": f"Workbook does not exist: {src}"}
    if src.suffix.lower() not in EXCEL_PACKAGE_EXTENSIONS:
        return {"error": f"Unsupported workbook extension '{src.suffix}'."}
    if not password:
        return {"error": "A non-empty password is required."}

    if is_zip_package(src) and not is_probably_encrypted_excel(src):
        shutil.copy2(src, dst)
        return {
            "status": "already_unencrypted",
            "source": str(src.resolve()),
            "output": str(dst.resolve()),
            "warnings": ["Source workbook was already an OOXML ZIP package; copied without decryption."],
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

    if not is_zip_package(dst):
        return {
            "error": "Decryption finished but the output is not a valid OOXML ZIP package. The password may be incorrect or the file type may not be supported.",
        }

    return {
        "status": "success",
        "source": str(src.resolve()),
        "output": str(dst.resolve()),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Decrypt a password-protected Excel workbook")
    parser.add_argument("source", help="Encrypted .xlsx/.xlsm/.xltx/.xltm input file")
    parser.add_argument("output", help="Output path for decrypted workbook")
    parser.add_argument("--password", required=True, help="Workbook password")
    args = parser.parse_args()
    print(json.dumps(decrypt_workbook(args.source, args.output, args.password), indent=2))


if __name__ == "__main__":
    main()
