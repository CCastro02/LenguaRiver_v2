# Local Translation (Argos Translate)

Explore and My Words enrichment can translate locally using [Argos Translate](https://github.com/argosopentech/argos-translate) via `/api/translate`.

Required models for LenguaRiver V1:

- **English → Spanish** (`en -> es`)
- **Spanish → English** (`es -> en`)

## Setup

From the `LenguaRiver` project root, create/activate a virtual environment (recommended — the API prefers `.venv` Python on Windows):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Install Python dependencies **and** download the required Argos models:

```powershell
npm run translate:setup
```

Or manually:

```powershell
pip install -r scripts/translate/requirements.txt
python scripts/translate/install_argos_models.py
```

Verify an existing install without downloading:

```powershell
npm run translate:verify
```

## Where models are stored

Argos stores downloaded language packages under:

```text
%USERPROFILE%\.local\share\argos-translate\packages
```

(on Linux/macOS: `~/.local/share/argos-translate/packages`)

The install script prints the exact path for your machine.

## Reinstall / reset

1. Deactivate any running dev server.
2. Delete the model folder above (or only specific `.argosmodel` files inside it).
3. Rerun `npm run translate:setup`.

To reinstall Python deps only:

```powershell
pip install --upgrade -r scripts/translate/requirements.txt
python scripts/translate/install_argos_models.py
```

## Manual translate test

```powershell
python scripts/translate/translate.py paid en es
python scripts/translate/translate.py Disculpe es en
```

Expected JSON:

```json
{ "ok": true, "translation": "pagado" }
```

## API status checks

With the dev server running:

```powershell
curl "http://localhost:3000/api/translate/status?from=en&to=es"
curl "http://localhost:3000/api/translate/status?from=es&to=en"
```

Both should return `"ready": true`.

## Troubleshooting

- **ModuleNotFoundError: argostranslate** — run `npm run translate:setup` in the same Python environment the API uses (activate `.venv` first on Windows).
- **Translation model en → es not installed** — rerun `python scripts/translate/install_argos_models.py`.
- **Hang / timeout on first translate** — run setup explicitly so models download ahead of time; the API times out after ~12s.
- **Wrong Python picked up** — set `TRANSLATE_PYTHON_BIN` to your venv interpreter, e.g. `.venv\Scripts\python.exe`.
