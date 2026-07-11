import argparse
import json
import sys

from argos_support import NOT_INSTALLED_MSG, debug_log, ensure_translation_model, find_translation, translate_text


def emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False))


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

    pair = f"{from_lang} -> {to_lang}"
    debug_log(
        "translate_request",
        text=text,
        from_lang=from_lang,
        to_lang=to_lang,
        pair=pair,
    )

    if not ensure_translation_model(from_lang, to_lang):
        debug_log("translate_failure", pair=pair, reason="model_not_installed")
        emit({"ok": False, "error": NOT_INSTALLED_MSG})
        return 1

    debug_log("argos_pair", pair=pair, ready=find_translation(from_lang, to_lang) is not None)

    try:
        translated = translate_text(text, from_lang, to_lang)
        debug_log("translate_result", pair=pair, translation=translated)
        emit({"ok": True, "translation": translated})
        return 0
    except Exception as error:
        debug_log("translate_failure", pair=pair, reason=str(error))
        emit({"ok": False, "error": NOT_INSTALLED_MSG})
        return 1


if __name__ == "__main__":
    sys.exit(main())
