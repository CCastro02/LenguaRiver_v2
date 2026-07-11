/**
 * Public facade for web app My Words row persistence (localStorage today).
 * Delegates to {@link ../explore-content.ts} until a future IndexedDB record backend.
 */

import {
  importWildWordsFromExtensionJsonArray,
  patchWildWordRecordsById,
  persistWildWordsRawRecords,
  prependExploreWildWordToWebAppStorage,
  snapshotWildWordsForServerHydration,
  snapshotWildWordsFromBrowserStorage,
  subscribeWildWordsStorage,
  WILD_WORDS_STORAGE_KEY,
} from "@/lib/explore-content";
import {
  CURRENT_WILD_WORDS_SCHEMA_VERSION,
  ensureWildWordsStorageVersion,
  getWildWordsStorageMeta,
  setWildWordsStorageMeta,
  WILD_WORDS_META_STORAGE_KEY,
} from "@/lib/wild-word-storage-version";

export {
  CURRENT_WILD_WORDS_SCHEMA_VERSION,
  ensureWildWordsStorageVersion,
  getWildWordsStorageMeta,
  setWildWordsStorageMeta,
  WILD_WORDS_META_STORAGE_KEY,
  WILD_WORDS_STORAGE_KEY,
};

export type WildWordsStorageDiagnostics = {
  backend: "localStorage";
  rowCount: number;
  approxBytes: number;
};

/** Snapshot of persisted rows for React `useSyncExternalStore` and in-tab reads. */
export const getWildWordsSync = snapshotWildWordsFromBrowserStorage;

/** Stable empty snapshot for SSR / hydration defaults. */
export const getWildWordsServerSnapshot = snapshotWildWordsForServerHydration;

/** Persist raw row records verbatim (caller filters). */
export const persistWildWords = persistWildWordsRawRecords;

/** Merge patches into existing rows by `id`. */
export const patchWildWordsById = patchWildWordRecordsById;

/** Explore save path — prepend newest word while preserving existing rows. */
export const prependWildWord = prependExploreWildWordToWebAppStorage;

/** Merge extension-exported JSON rows into web app storage. */
export const importWildWordsFromExtensionJson = importWildWordsFromExtensionJsonArray;

/** Subscribe to cross-tab, same-tab, and passive focus storage updates. */
export const subscribeWildWords = subscribeWildWordsStorage;

/**
 * Lightweight storage diagnostics for debugging and future backend migration.
 * `approxBytes` is the UTF-8 byte length of the raw localStorage JSON payload when available.
 */
export function getWildWordsStorageDiagnostics(): WildWordsStorageDiagnostics {
  const rows = getWildWordsSync();
  let approxBytes = 0;

  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(WILD_WORDS_STORAGE_KEY) ?? "[]";
      approxBytes = new TextEncoder().encode(raw).length;
    } catch {
      approxBytes = 0;
    }
  }

  return {
    backend: "localStorage",
    rowCount: rows.length,
    approxBytes,
  };
}
