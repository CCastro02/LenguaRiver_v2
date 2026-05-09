import argparse
import json
import sys

import argostranslate.package
import argostranslate.translate

NOT_INSTALLED_MSG = (
    "Translation is not installed yet. Use Wiktionary lookup for word meanings."
)


def emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False))


def find_translation(from_lang: str, to_lang: str):
    installed_languages = argostranslate.translate.get_installed_languages()
    source = next((lang for lang in installed_languages if lang.code == from_lang), None)
    target = next((lang for lang in installed_languages if lang.code == to_lang), None)
    if not source or not target:
        return None
    return source.get_translation(target)


def ensure_translation_model(from_lang: str, to_lang: str) -> bool:
    existing = find_translation(from_lang, to_lang)
    if existing:
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
            return False
        download_path = pkg.download()
        argostranslate.package.install_from_path(download_path)
        return find_translation(from_lang, to_lang) is not None
    except Exception:
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Translate text with Argos Translate.")
    parser.add_argument("text", help="Text to translate.")
    parser.add_argument("from_lang", help="Source language code.")
    parser.add_argument("to_lang", help="Target language code.")
    args = parser.parse_args()

    text = args.text.strip()
    from_lang = args.from_lang.strip().lower()
    to_lang = args.to_lang.strip().lower()

    if not text:
        emit({"ok": False, "error": "Missing text."})
        return 1

    model_ready = ensure_translation_model(from_lang, to_lang)
    if not model_ready:
        emit({"ok": False, "error": NOT_INSTALLED_MSG})
        return 1

    try:
        translated = argostranslate.translate.translate(text, from_lang, to_lang)
        emit({"ok": True, "translation": translated})
        return 0
    except Exception:
        emit({"ok": False, "error": NOT_INSTALLED_MSG})
        return 1


if __name__ == "__main__":
    sys.exit(main())
