import { devLogMyWordsImagePipeline } from "@/lib/dev-my-words-image-pipeline";
import {
  applyWildWordsJsonImportToRows,
  normalizeWildWordImportText,
  wildWordImportDedupeKey,
} from "@/lib/wild-word-import-dedupe";
import {
  ensureWildWordsStorageVersion,
  loadWildWordsRowsWithMigration,
  touchWildWordsStorageMetaOnWrite,
  WILD_WORDS_META_STORAGE_KEY,
} from "@/lib/wild-word-storage-version";

export { normalizeWildWordImportText, wildWordImportDedupeKey };

export type ExploreCategory = "news" | "culture" | "travel" | "reading" | "listening";

export type ExploreSource =
  | "wikinews"
  | "wikivoyage"
  | "wiktionary"
  | "gutenberg"
  | "librivox"
  | "manual-seed";

export type ExploreContentItem = {
  id: string;
  language: string;
  source: ExploreSource;
  category: ExploreCategory;
  country?: string;
  title: string;
  summary?: string;
  text?: string;
  url?: string;
  audioUrl?: string;
  imageUrl?: string;
  publishedAt?: string;
  difficultyEstimate?: number;
  tags: string[];
  extractedWords?: string[];
  extractedPhrases?: string[];
};

/**
 * Core wild-word fields (web + extension). Open JSON rows may include enrichment caches and provenance;
 * @see {@link ./wild-word-schema.ts}.
 */
export type UserWildWord = {
  id: string;
  /** Detected / source language of `text` (not the gloss language). */
  language: string;
  text: string;
  /** Canonical identity; optional for legacy rows (`lr:v1|…`). */
  lexemeKey?: string;
  sourceItemId: string;
  sourceTitle: string;
  contextSentence?: string;
  translation?: string;
  pronunciation?: string;
  savedAt: string;
};

export type ExploreSeedFile = {
  language: string;
  generatedAt: string;
  items: ExploreContentItem[];
};

export const WILD_WORDS_STORAGE_KEY = "lenguariver_wild_words"; // web app localStorage key (not extension chrome.storage key)

/** Stable snapshot for SSR / hydration default; reused by identity for React useSyncExternalStore. */
const EMPTY_WEB_APP_WILD_WORD_ROWS: Record<string, unknown>[] = [];

const wildWordsListeners = new Set<() => void>();

let wildWordsPassiveListenersInstalled = false;
let wildWordsStorageSubscriptionRefCount = 0;

/** Parse + normalized row cache keyed by raw localStorage payload (cheap referential reuse). */
let lastWildWordsRawSeen: string | null = null;
let lastWildWordsRowsSnapshot: Record<string, unknown>[] = EMPTY_WEB_APP_WILD_WORD_ROWS;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rebuildWildWordsRowsSnapshot(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.length === 0 ? EMPTY_WEB_APP_WILD_WORD_ROWS : rows;
}

function parseWildWordsStoredJson(raw: string): Record<string, unknown>[] {
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) {
      return [];
    }
    return data.filter(isRecord).map((row) => ({ ...row }));
  } catch {
    return [];
  }
}

/** Client-only canonical read helper (wrapped for SecurityError-safe access). */
function readWildWordsLocalStoragePayload(): string {
  if (typeof window === "undefined") {
    return "[]";
  }
  try {
    return window.localStorage.getItem(WILD_WORDS_STORAGE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

/**
 * Called by React `useSyncExternalStore`; keeps stable row references across renders when LS payload unchanged.
 * @deprecated Use `@/lib/wild-word-storage` (`getWildWordsSync`) instead.
 */
export function snapshotWildWordsFromBrowserStorage(): Record<string, unknown>[] {
  if (typeof window === "undefined") {
    return EMPTY_WEB_APP_WILD_WORD_ROWS;
  }
  const raw = readWildWordsLocalStoragePayload();
  if (raw === lastWildWordsRawSeen) {
    return lastWildWordsRowsSnapshot;
  }
  const parsed = parseWildWordsStoredJson(raw);
  const rows = loadWildWordsRowsWithMigration(parsed);
  const serialized = JSON.stringify(rebuildWildWordsRowsSnapshot(rows));
  lastWildWordsRawSeen = serialized;
  lastWildWordsRowsSnapshot = rebuildWildWordsRowsSnapshot(rows);
  return lastWildWordsRowsSnapshot;
}

/** @deprecated Use `@/lib/wild-word-storage` (`getWildWordsServerSnapshot`) instead. */
export function snapshotWildWordsForServerHydration(): Record<string, unknown>[] {
  return EMPTY_WEB_APP_WILD_WORD_ROWS;
}

function refreshWildWordsCacheFromCrossTabChange(): void {
  lastWildWordsRawSeen = null;
}

/** Same-tab localStorage edits (DevTools paste) bypass `storage` events — reconcile on window focus / tab visibility return. */
function reconcileWildWordsCacheAfterPassiveReturn(): void {
  if (typeof window === "undefined") {
    return;
  }
  const nextPayload = readWildWordsLocalStoragePayload();
  if (lastWildWordsRawSeen !== null && nextPayload !== lastWildWordsRawSeen) {
    lastWildWordsRawSeen = null;
    notifyWildWordsStorageListeners();
  }
}

function attachWildWordsPassiveListeners(): void {
  if (typeof window === "undefined" || wildWordsPassiveListenersInstalled) {
    return;
  }
  wildWordsPassiveListenersInstalled = true;
  window.addEventListener("focus", reconcileWildWordsCacheAfterPassiveReturn);
  document.addEventListener("visibilitychange", reconcileWildWordsCacheAfterPassiveReturn);
}

function detachWildWordsPassiveListenersIfIdle(): void {
  if (
    typeof window === "undefined" ||
    wildWordsStorageSubscriptionRefCount > 0 ||
    !wildWordsPassiveListenersInstalled
  ) {
    return;
  }
  wildWordsPassiveListenersInstalled = false;
  window.removeEventListener("focus", reconcileWildWordsCacheAfterPassiveReturn);
  document.removeEventListener("visibilitychange", reconcileWildWordsCacheAfterPassiveReturn);
}

/**
 * Persist raw rows verbatim (caller filters). Keeps LS + cache consistent and notifies subscribers.
 * @deprecated Use `@/lib/wild-word-storage` (`persistWildWords`) instead.
 */
export function persistWildWordsRawRecords(rows: Record<string, unknown>[]): void {
  if (typeof window === "undefined") {
    return;
  }
  const normalized = rebuildWildWordsRowsSnapshot(rows.filter(isRecord).map((row) => ({ ...row })));
  const serialized = JSON.stringify(normalized);
  try {
    window.localStorage.setItem(WILD_WORDS_STORAGE_KEY, serialized);
    ensureWildWordsStorageVersion();
    touchWildWordsStorageMetaOnWrite();
  } catch {
    return;
  }
  lastWildWordsRawSeen = serialized;
  lastWildWordsRowsSnapshot = normalized;
  notifyWildWordsStorageListeners();
}

/**
 * Merge enrichment (or other) patches into existing rows by `id`.
 * Preserves unknown keys on each row; no-op when not in the browser or map is empty.
 * @deprecated Use `@/lib/wild-word-storage` (`patchWildWordsById`) instead.
 */
export function patchWildWordRecordsById(patches: Map<string, Record<string, unknown>>): void {
  if (typeof window === "undefined" || patches.size === 0) {
    return;
  }
  const current = snapshotWildWordsFromBrowserStorage();
  let changed = false;
  const next = current.map((row) => {
    const id = typeof row.id === "string" ? row.id : null;
    if (!id) {
      return row;
    }
    const patch = patches.get(id);
    if (!patch) {
      return row;
    }
    changed = true;
    const merged = { ...row };
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) {
        delete merged[key];
      } else if (value !== undefined) {
        merged[key] = value;
      }
    }
    if ("imageUrl" in patch) {
      devLogMyWordsImagePipeline("patchWildWordRecordsById", {
        rowId: id,
        incomingPatchImageUrl: typeof patch.imageUrl === "string" ? patch.imageUrl : null,
        mergedPersistedImageUrl: typeof merged.imageUrl === "string" ? merged.imageUrl : null,
      });
    }
    return merged;
  });
  if (changed) {
    persistWildWordsRawRecords(next);
  }
}

/**
 * Explore save path — prepends newest word while preserving existing rows untouched.
 * @deprecated Use `@/lib/wild-word-storage` (`prependWildWord`) instead.
 */
export function prependExploreWildWordToWebAppStorage(word: UserWildWord): void {
  const current = snapshotWildWordsFromBrowserStorage();
  persistWildWordsRawRecords([word as unknown as Record<string, unknown>, ...current]);
}

/**
 * Cross-tab (`storage` event), Explore saves, deletes, passive focus sync.
 * @deprecated Use `@/lib/wild-word-storage` (`subscribeWildWords`) instead.
 */
export function subscribeWildWordsStorage(listener: () => void): () => void {
  wildWordsListeners.add(listener);
  wildWordsStorageSubscriptionRefCount += 1;
  attachWildWordsPassiveListeners();

  function onStorage(event: StorageEvent): void {
    if (
      event.key === WILD_WORDS_STORAGE_KEY ||
      event.key === WILD_WORDS_META_STORAGE_KEY ||
      event.key === null
    ) {
      refreshWildWordsCacheFromCrossTabChange();
      listener();
    }
  }

  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }

  return (): void => {
    wildWordsListeners.delete(listener);
    wildWordsStorageSubscriptionRefCount -= 1;
    if (wildWordsStorageSubscriptionRefCount < 0) {
      wildWordsStorageSubscriptionRefCount = 0;
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
    detachWildWordsPassiveListenersIfIdle();
  };
}

export function notifyWildWordsStorageListeners(): void {
  wildWordsListeners.forEach((fn) => {
    fn();
  });
}

/** BCP-47-style placeholder when an extension row omits `language`. */
export const WILD_WORD_IMPORT_LANGUAGE_FALLBACK = "und";

export type WildWordsImportResult = {
  imported: number;
  mergedDuplicates: number;
  skippedDuplicates: number;
  invalidRows: number;
};

/**
 * Merges extension-exported JSON rows into web app localStorage. Preserves unknown keys via row spread.
 * Call only in the browser (uses localStorage + crypto).
 * @deprecated Use `@/lib/wild-word-storage` (`importWildWordsFromExtensionJson`) instead.
 */
export function importWildWordsFromExtensionJsonArray(data: unknown): WildWordsImportResult {
  if (typeof window === "undefined") {
    return { imported: 0, mergedDuplicates: 0, skippedDuplicates: 0, invalidRows: 0 };
  }
  if (!Array.isArray(data)) {
    return { imported: 0, mergedDuplicates: 0, skippedDuplicates: 0, invalidRows: 0 };
  }

  const snap = snapshotWildWordsFromBrowserStorage();
  const result = applyWildWordsJsonImportToRows(snap, data, {
    languageFallback: WILD_WORD_IMPORT_LANGUAGE_FALLBACK,
    newId: () => crypto.randomUUID(),
  });

  const storageChanged =
    result.mergedDuplicates > 0 || result.imported > 0 || result.rows.length !== snap.length;
  if (storageChanged) {
    persistWildWordsRawRecords(result.rows);
  }

  return {
    imported: result.imported,
    mergedDuplicates: result.mergedDuplicates,
    skippedDuplicates: result.skippedDuplicates,
    invalidRows: result.invalidRows,
  };
}
