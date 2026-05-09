import argparse
import json
import os
import sys

# Force UTF-8 stdout on Windows. By default Python on Windows encodes stdout
# using the system codepage (often cp1252). When this script emits JSON
# containing accented characters like "¿", "ó", "á", those get encoded as
# single-byte cp1252 values (0xBF, 0xF3, 0xE1) which are NOT valid UTF-8.
# Node.js then reads the bytes as UTF-8 and substitutes U+FFFD (the � replacement
# character), so transcripts arrive in the browser as "�C�mo est�s?". Forcing
# UTF-8 here keeps accented Spanish round-tripping cleanly.
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    # `reconfigure` is Python 3.7+. If it's not available we silently fall
    # back; the Node side also passes PYTHONIOENCODING=utf-8 as a backup.
    pass

from faster_whisper import WhisperModel  # noqa: E402  (import after stdout reconfig)


def emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False))


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcribe an audio file with faster-whisper.")
    parser.add_argument("audio_path", help="Path to the audio file to transcribe.")
    parser.add_argument("language", choices=["es", "ru", "en"], help="Language code.")
    parser.add_argument(
        "--model",
        default=os.environ.get("FASTER_WHISPER_MODEL", "small"),
        help='faster-whisper model name. Defaults to "small".',
    )
    args = parser.parse_args()

    try:
        model = WhisperModel(args.model, device="cpu", compute_type="int8")
        segments, _info = model.transcribe(args.audio_path, language=args.language)
        transcript = " ".join(segment.text.strip() for segment in segments).strip()
        emit({"ok": True, "transcript": transcript, "language": args.language})
        return 0
    except Exception as exc:
        emit({"ok": False, "error": str(exc)})
        return 1


if __name__ == "__main__":
    sys.exit(main())
