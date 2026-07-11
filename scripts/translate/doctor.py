#!/usr/bin/env python3
"""Print Argos Translate health for the active Python environment."""

from __future__ import annotations

import sys
import traceback

from argos_support import REQUIRED_PAIRS, list_installed_pairs, package_data_dir, pair_is_ready


def main() -> int:
    print(f"Python executable: {sys.executable}")

    try:
        import argostranslate  # noqa: F401

        print("argostranslate import: success")
        print(f"argostranslate version: {getattr(argostranslate, '__version__', 'unknown')}")
    except Exception as error:
        print("argostranslate import: FAILED")
        print(f"  {error}")
        traceback.print_exc()
        return 1

    print(f"Argos package dir: {package_data_dir()}")

    pairs = list_installed_pairs()
    print("Installed pairs:")
    if not pairs:
        print("  (none)")
    else:
        for from_lang, to_lang in pairs:
            print(f"  {from_lang} -> {to_lang}")

    ok = True
    for from_lang, to_lang in REQUIRED_PAIRS:
        ready = pair_is_ready(from_lang, to_lang)
        label = f"{from_lang} -> {to_lang} ready"
        print(f"{label}: {'yes' if ready else 'NO'}")
        if not ready:
            ok = False

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
