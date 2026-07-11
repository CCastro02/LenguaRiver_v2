#!/usr/bin/env python3
"""JSON status for one Argos language pair (used by /api/translate/status)."""

from __future__ import annotations

import json
import sys
import traceback

from argos_support import list_installed_pairs, package_data_dir, pair_is_ready


def main() -> int:
    from_lang = (sys.argv[1] if len(sys.argv) > 1 else "es").strip().lower()
    to_lang = (sys.argv[2] if len(sys.argv) > 2 else "en").strip().lower()

    payload: dict[str, object] = {
        "ready": False,
        "from": from_lang,
        "to": to_lang,
        "pythonPathUsed": sys.executable,
        "pythonExists": True,
        "installedPairs": [],
        "stderr": None,
        "argosPackageDir": None,
    }

    try:
        import argostranslate.translate  # noqa: F401

        payload["argosPackageDir"] = package_data_dir()
        payload["installedPairs"] = [
            f"{source}->{target}" for source, target in list_installed_pairs()
        ]
        payload["ready"] = pair_is_ready(from_lang, to_lang)
    except Exception as error:
        payload["stderr"] = "".join(traceback.format_exception_only(type(error), error)).strip()

    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
