#!/usr/bin/env python3
"""Install and verify Argos Translate models for LenguaRiver local translation."""

from __future__ import annotations

import argparse
import sys

import argostranslate

from argos_support import (
    REQUIRED_PAIRS,
    SAMPLE_TRANSLATIONS,
    format_pair,
    install_pair,
    list_installed_pairs,
    missing_required_pairs,
    package_data_dir,
    pair_is_ready,
    translate_text,
)


def print_troubleshooting() -> None:
    print("\nTroubleshooting:", file=sys.stderr)
    print(f"  Python: {sys.executable}", file=sys.stderr)
    print(f"  argostranslate: {getattr(argostranslate, '__version__', 'unknown')}", file=sys.stderr)
    print(f"  Model storage: {package_data_dir()}", file=sys.stderr)
    print("  Try:", file=sys.stderr)
    print("    python -m pip install -r scripts/translate/requirements.txt", file=sys.stderr)
    print("    python scripts/translate/install_argos_models.py", file=sys.stderr)
    print("  To reinstall from scratch, delete the model storage folder above and rerun setup.", file=sys.stderr)


def print_installed_pairs() -> None:
    pairs = list_installed_pairs()
    print("\nInstalled language pairs:")
    if not pairs:
        print("  (none)")
        return
    for from_lang, to_lang in pairs:
        print(f"  {format_pair(from_lang, to_lang)}")


def run_sample_translations() -> bool:
    print("\nSample translations:")
    ok = True
    for text, from_lang, to_lang in SAMPLE_TRANSLATIONS:
        try:
            result = translate_text(text, from_lang, to_lang)
            print(f"  {format_pair(from_lang, to_lang)}  {text!r} -> {result!r}")
        except Exception as error:
            ok = False
            print(f"  {format_pair(from_lang, to_lang)}  {text!r} -> ERROR: {error}", file=sys.stderr)
    return ok


def main() -> int:
    parser = argparse.ArgumentParser(description="Install Argos translation models for LenguaRiver.")
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Skip installs; only verify required pairs and run sample translations.",
    )
    args = parser.parse_args()

    print(f"Python: {sys.executable}")
    print(f"Argos model storage: {package_data_dir()}")

    if not args.verify_only:
        print("\nUpdating Argos package index…")
        for from_lang, to_lang in REQUIRED_PAIRS:
            label = format_pair(from_lang, to_lang)
            if pair_is_ready(from_lang, to_lang):
                print(f"Installing Argos model: {label}")
                print("  Already installed.")
                continue

            print(f"Installing Argos model: {label}")
            if not install_pair(from_lang, to_lang):
                print(f"Failed to install {label}.", file=sys.stderr)
                print_troubleshooting()
                return 1
            print("  Installed successfully.")

    missing = missing_required_pairs()
    print_installed_pairs()

    if missing:
        print("\nMissing required pairs:", file=sys.stderr)
        for from_lang, to_lang in missing:
            print(f"  {format_pair(from_lang, to_lang)}", file=sys.stderr)
        print_troubleshooting()
        return 1

    print("\nRequired pairs verified:")
    for from_lang, to_lang in REQUIRED_PAIRS:
        print(f"  {format_pair(from_lang, to_lang)}  OK")

    if not run_sample_translations():
        print_troubleshooting()
        return 1

    print("\nArgos translation setup complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
