# Local Speech Transcription

Development recording checks can use local faster-whisper transcription before falling back to browser speech recognition.

## Setup

Create and activate a Python virtual environment from the project root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Install the speech requirements:

```powershell
pip install -r scripts/speech/requirements.txt
```

Or use the npm helper:

```powershell
npm run speech:setup
```

The first transcription downloads the `small` faster-whisper model. Transcription is local and free, but it uses your CPU by default and can take a few seconds.

## Manual Test

```powershell
python scripts/speech/transcribe.py path\to\audio.webm es
```

The script prints JSON:

```json
{
  "ok": true,
  "transcript": "hola",
  "language": "es"
}
```
