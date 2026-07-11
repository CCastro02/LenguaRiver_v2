# My Words manual smoke test

Post-cleanup checklist for My Words, extension import/export, enrichment, images, and audio. Run in **Chrome** (not Cursor preview).

## 1. Start app

```bash
cd LenguaRiver
npm run dev
```

App: http://localhost:3000/my-words (extension auto-sync allowlist: localhost:3000 and :3001; production origins in `extensions/lenguariver-extension/lib/web-bridge.ts`)

## 2. Rebuild extension

```bash
cd extensions/lenguariver-extension
npm run build
```

Load unpacked from `extensions/lenguariver-extension/.output/chrome-mv3`.

## 3. Reload Chrome extension

1. Open `chrome://extensions`
2. Find **LenguaRiver**
3. Click **Reload**

## 4. Save test words (extension)

On any page, select and save:

| Word | Context hint |
|------|----------------|
| **learning** | English sentence (e.g. article about learning platforms) |
| **Disculpe** | Spanish sentence |
| **Mesas** | Spanish sentence |

## 5. Extension popup

1. Open the LenguaRiver popup
2. Confirm all three rows appear
3. **Export JSON** — save the file

## 6. Import in web app

1. Open http://localhost:3000/my-words
2. **Import JSON** — choose the extension export file
3. Confirm import summary shows imported rows

## 7. Fix detected languages

1. Click **Fix detected languages**
2. Confirm summary (e.g. updated count for mis-tagged rows)

## 8. Enrich missing

1. Click **Enrich missing**
2. Wait until enrichment finishes

## 9. Verify cards

### learning

- **Language:** `en`
- **Translation:** `aprendizaje` (rough match; punctuation may vary)
- **Details → Translation direction:** `en → es`

### Disculpe

- **Language:** `es`
- **Translation:** `Excuse me` (rough match)
- **Details → Translation direction:** `es → en`

### Mesas

- **Language:** `es`
- **Image:** lesson path `/images/chunks/mesa.png` (or equivalent mesa chunk image)

## 10. Audio (Chrome TTS)

- **Word ▶** uses source language (`en` for learning, `es` for Disculpe/Mesas)
- **Translation ▶** uses translation/gloss language (`es` for learning gloss, `en` for Spanish→English glosses)

## 11. Custom image upload

1. Open **Details** on any card → **Upload image**
2. Refresh the page — image still shows
3. **Refresh** / **Enrich missing** on that card — user image must **not** be replaced by lesson/enrichment image
4. **Remove image** — card falls back to lesson image or placeholder

## 12. Export from My Words

1. **Export JSON**
2. File downloads (`lenguariver-my-words-export-YYYY-MM-DD.json`)
3. Open file — confirm **no** `imageBlob`, `imageData`, `imageBase64`, or long base64 strings

## Optional: API checks (with `npm run dev` running)

```text
GET http://localhost:3000/api/translate/status?from=en&to=es
GET http://localhost:3000/api/translate/status?from=es&to=en
```

Expect `ready: true` and `pythonPathUsed` ending in `LenguaRiver/.venv/Scripts/python.exe`.

POST `/api/translate` body `{ "text", "from", "to" }`:

| text | from | to | rough result |
|------|------|-----|--------------|
| paid | en | es | pagado |
| free | en | es | gratis |
| learning | en | es | aprendizaje |
| Disculpe | es | en | excuse me |
