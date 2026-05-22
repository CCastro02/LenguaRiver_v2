# LenguaRiver extension — quick testing guide

Short steps to build, load in Chrome, and sanity-check the extension locally.

## 1. Build

From your repo root (or anywhere), run:

```bash
cd extensions/lenguariver-extension
npm run build
```

This produces the unpacked extension under `.output/chrome-mv3`.

## 2. Load unpacked in Chrome

1. Open **chrome://extensions** in the address bar.
2. Turn on **Developer mode** (toggle in the top-right).
3. Click **Load unpacked**.
4. Choose the folder: **`extensions/lenguariver-extension/.output/chrome-mv3`** (the folder that contains `manifest.json`).

Chrome should show the LenguaRiver extension card.

## 3. Reload after code changes

1. Run **`npm run build`** again.
2. On **chrome://extensions**, find the extension card and click **Reload** (circular arrow).

You must reload after each build so Chrome picks up new files.

## 4. Basic manual test (webpage)

On a normal webpage (not `chrome://`):

1. **Highlight some text** — a toolbar should appear near the selection.
2. **Save** — saving should succeed.
3. **Save again** on the same highlight — you should see **Already saved** (or equivalent duplicate behavior).
4. **Pronounce** — text-to-speech should play for the selection.
5. **Escape** — press Esc; the toolbar should close.
6. **Scroll** — scrolling the page should close the toolbar.

## 5. Options page

1. **Right‑click** the extension icon in the toolbar.
2. Choose **Options** (or **Extension options**, depending on Chrome wording).
3. Change **word/source language** and save if needed.
4. Change **TTS rate** and verify pronunciation reflects it on a webpage.

## 6. Debugging

| What | Where |
|------|--------|
| **Content script** logs | Open **DevTools** on the tab (**F12** or right‑click → Inspect) → **Console**. Logs from the injected script appear there. |
| **Background / service worker** logs | **chrome://extensions** → find LenguaRiver → click **service worker** (or **Inspect views: service worker**) to open DevTools for the worker. |
| **Stored settings / data** | In the extension’s service worker DevTools, **Application** (or **Storage**) → **Extension storage** → **Local** (extension local storage). |

---

**Tip:** If something looks stale, rebuild (`npm run build`) and hit **Reload** on the extension card before retesting.
