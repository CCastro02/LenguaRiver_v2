"""Shared Argos Translate helpers for setup and runtime translation."""

from __future__ import annotations

import sys
from typing import Iterable

import argostranslate.package
import argostranslate.translate
from argostranslate import settings

REQUIRED_PAIRS: tuple[tuple[str, str], ...] = (("en", "es"), ("es", "en"))

NOT_INSTALLED_MSG = (
    "Translation is not installed yet. Run npm run translate:setup to install Argos models."
)

SAMPLE_TRANSLATIONS: tuple[tuple[str, str, str], ...] = (
    ("paid", "en", "es"),
    ("free", "en", "es"),
    ("learning", "en", "es"),
    ("Disculpe", "es", "en"),
)


def package_data_dir() -> str:
    return str(settings.package_data_dir)


def find_translation(from_lang: str, to_lang: str):
    installed_languages = argostranslate.translate.get_installed_languages()
    source = next((lang for lang in installed_languages if lang.code == from_lang), None)
    target = next((lang for lang in installed_languages if lang.code == to_lang), None)
    if not source or not target:
        return None
    return source.get_translation(target)


def pair_is_ready(from_lang: str, to_lang: str) -> bool:
    return find_translation(from_lang.strip().lower(), to_lang.strip().lower()) is not None


def list_installed_pairs() -> list[tuple[str, str]]:
    pairs: set[tuple[str, str]] = set()
    for language in argostranslate.translate.get_installed_languages():
        for translation in language.translations_from:
            pairs.add((language.code, translation.to_lang.code))
    return sorted(pairs)


def format_pair(from_lang: str, to_lang: str) -> str:
    return f"{from_lang} -> {to_lang}"


def install_pair(from_lang: str, to_lang: str) -> bool:
    from_lang = from_lang.strip().lower()
    to_lang = to_lang.strip().lower()

    if pair_is_ready(from_lang, to_lang):
        return True

    try:
        argostranslate.package.update_package_index()
        available = argostranslate.package.get_available_packages()
        pkg = next(
            (
                package
                for package in available
                if package.from_code == from_lang and package.to_code == to_lang
            ),
            None,
        )
        if not pkg:
            print(
                f"  No Argos package found for {format_pair(from_lang, to_lang)} in the online index.",
                file=sys.stderr,
            )
            return False

        download_path = pkg.download()
        argostranslate.package.install_from_path(download_path)
        return pair_is_ready(from_lang, to_lang)
    except Exception as error:
        print(f"  Install failed: {error}", file=sys.stderr)
        return False


def ensure_translation_model(from_lang: str, to_lang: str) -> bool:
    if pair_is_ready(from_lang, to_lang):
        return True
    return install_pair(from_lang, to_lang)


def missing_required_pairs(pairs: Iterable[tuple[str, str]] = REQUIRED_PAIRS) -> list[tuple[str, str]]:
    return [(from_lang, to_lang) for from_lang, to_lang in pairs if not pair_is_ready(from_lang, to_lang)]


def translate_text(text: str, from_lang: str, to_lang: str) -> str:
    if not ensure_translation_model(from_lang, to_lang):
        raise RuntimeError(NOT_INSTALLED_MSG)
    return argostranslate.translate.translate(text, from_lang, to_lang)


def debug_log(event: str, **fields: object) -> None:
    import json
    import os

    if os.environ.get("ARGOS_TRANSLATE_DEBUG") != "1":
        return
    print(json.dumps({"event": event, **fields}), file=sys.stderr)
