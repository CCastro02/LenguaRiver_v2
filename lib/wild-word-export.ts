/**
 * Export My Words rows from web app `localStorage` (`lenguariver_wild_words`) as JSON.
 * Image blobs live in IndexedDB only — export carries metadata (`imageAssetId`, etc.) when present.
 */

/** Keys that must never be written into export files (device-local blobs / legacy experiments). */
const EXPORT_OMIT_KEYS = new Set(["imageBlob", "imageData", "imageBase64"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** `lenguariver-my-words-export-YYYY-MM-DD.json` using local calendar date. */
export function formatMyWordsExportFilename(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `lenguariver-my-words-export-${y}-${m}-${d}.json`;
}

/** Shallow-copy rows for export; preserves unknown keys; omits blob payload keys if present. */
export function prepareMyWordsExportRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.filter(isRecord).map((row) => {
    const copy: Record<string, unknown> = { ...row };
    for (const key of EXPORT_OMIT_KEYS) {
      delete copy[key];
    }
    return copy;
  });
}

/** JSON array matching `localStorage` persistence shape (compact, no blob fields). */
export function buildMyWordsExportJson(rows: Record<string, unknown>[]): string {
  return JSON.stringify(prepareMyWordsExportRows(rows));
}

/** Trigger a browser download of the export file. No-op when not in a browser. */
export function downloadMyWordsExportInBrowser(
  rows: Record<string, unknown>[],
  options?: { filename?: string }
): void {
  if (typeof window === "undefined" || rows.length === 0) {
    return;
  }
  const filename = options?.filename ?? formatMyWordsExportFilename();
  const json = buildMyWordsExportJson(rows);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
