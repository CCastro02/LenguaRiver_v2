/**
 * Web app My Words storage schema version + lightweight row migration (V1).
 *
 * Row array stays at {@link WILD_WORDS_STORAGE_KEY} as a raw JSON array for backward compatibility.
 * Metadata lives separately at {@link WILD_WORDS_META_STORAGE_KEY}.
 */

import { buildLexemeKey } from "@/lib/lexeme-key";
import { dedupeWildWordRows } from "@/lib/wild-word-import-dedupe";

/** Must match {@link ./explore-content.ts} `WILD_WORDS_STORAGE_KEY`. */
const WILD_WORDS_ROW_STORAGE_KEY = "lenguariver_wild_words";

export const CURRENT_WILD_WORDS_SCHEMA_VERSION = 1;
export const WILD_WORDS_META_STORAGE_KEY = "lenguariver_wild_words_meta";

export type WildWordsStorageMeta = {
  schemaVersion: number;
  updatedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function nowIso(): string {
  return new Date().toISOString();
}

function defaultMeta(updatedAt: string = nowIso()): WildWordsStorageMeta {
  return {
    schemaVersion: CURRENT_WILD_WORDS_SCHEMA_VERSION,
    updatedAt,
  };
}

/** Parse stored meta JSON; returns null when missing or unusable. */
export function parseWildWordsStorageMeta(raw: string | null): WildWordsStorageMeta | null {
  if (raw == null || raw.trim() === "") {
    return null;
  }
  try {
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data)) {
      return null;
    }
    const version = data.schemaVersion;
    const updatedAt = nonEmptyString(data.updatedAt);
    if (typeof version !== "number" || !Number.isFinite(version) || version < 1 || !updatedAt) {
      return null;
    }
    return {
      schemaVersion: Math.floor(version),
      updatedAt,
    };
  } catch {
    return null;
  }
}

function readMetaRawFromStorage(storage: Storage): string | null {
  try {
    return storage.getItem(WILD_WORDS_META_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeMetaToStorage(storage: Storage, meta: WildWordsStorageMeta): void {
  try {
    storage.setItem(WILD_WORDS_META_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    /* ignore quota / private mode */
  }
}

function resolveStorage(storage?: Storage): Storage | null {
  if (storage) {
    return storage;
  }
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Read meta from browser storage; missing or malformed meta yields null. */
export function getWildWordsStorageMeta(storage?: Storage): WildWordsStorageMeta | null {
  const ls = resolveStorage(storage);
  if (!ls) {
    return null;
  }
  return parseWildWordsStorageMeta(readMetaRawFromStorage(ls));
}

/** Persist meta JSON (browser only unless `storage` is passed). */
export function setWildWordsStorageMeta(meta: WildWordsStorageMeta, storage?: Storage): void {
  const ls = resolveStorage(storage);
  if (!ls) {
    return;
  }
  writeMetaToStorage(ls, meta);
}

/**
 * Ensure meta exists at {@link CURRENT_WILD_WORDS_SCHEMA_VERSION}.
 * Malformed meta is replaced with a fresh V1 record (does not throw).
 */
export function ensureWildWordsStorageVersion(storage?: Storage): WildWordsStorageMeta {
  const ls = resolveStorage(storage);
  if (!ls) {
    return defaultMeta();
  }

  const existing = getWildWordsStorageMeta(ls);
  if (!existing) {
    const created = defaultMeta();
    writeMetaToStorage(ls, created);
    return created;
  }

  if (existing.schemaVersion >= CURRENT_WILD_WORDS_SCHEMA_VERSION) {
    return existing;
  }

  const upgraded: WildWordsStorageMeta = {
    schemaVersion: CURRENT_WILD_WORDS_SCHEMA_VERSION,
    updatedAt: nowIso(),
  };
  writeMetaToStorage(ls, upgraded);
  return upgraded;
}

/** Bump `updatedAt` after any write to {@link WILD_WORDS_STORAGE_KEY}. */
export function touchWildWordsStorageMetaOnWrite(storage?: Storage): void {
  const ls = resolveStorage(storage);
  if (!ls) {
    return;
  }
  const current = getWildWordsStorageMeta(ls);
  setWildWordsStorageMeta(
    {
      schemaVersion: current?.schemaVersion ?? CURRENT_WILD_WORDS_SCHEMA_VERSION,
      updatedAt: nowIso(),
    },
    ls
  );
}

/**
 * V1 row migration: preserve unknown keys; only safe backfills.
 * - `lexemeKey` when `text` + `language` exist and key is absent/empty
 * - does not set `targetLanguage` (runtime defaults handle legacy rows)
 */
export function migrateWildWordsRowsIfNeeded(rows: Record<string, unknown>[]): {
  rows: Record<string, unknown>[];
  changed: boolean;
} {
  let changed = false;
  const next = rows.map((row) => {
    const text = nonEmptyString(row.text);
    const language = nonEmptyString(row.language);
    const existingLexeme = nonEmptyString(row.lexemeKey);
    if (existingLexeme || !text || !language) {
      return row;
    }
    changed = true;
    return {
      ...row,
      lexemeKey: buildLexemeKey(language, text),
    };
  });
  return { rows: changed ? next : rows, changed };
}

/**
 * Read path: ensure meta, optionally migrate rows, persist when rows changed.
 * Returns migrated rows for the caller snapshot cache.
 */
export function loadWildWordsRowsWithMigration(
  parsedRows: Record<string, unknown>[],
  storage?: Storage
): Record<string, unknown>[] {
  ensureWildWordsStorageVersion(storage);
  const { rows: migrated, changed: lexemeChanged } = migrateWildWordsRowsIfNeeded(parsedRows);
  const { rows: deduped, mergedDuplicates } = dedupeWildWordRows(migrated);
  const changed = lexemeChanged || mergedDuplicates > 0;
  if (!changed) {
    return deduped;
  }
  const ls = resolveStorage(storage);
  if (!ls) {
    return deduped;
  }
  try {
    ls.setItem(WILD_WORDS_ROW_STORAGE_KEY, JSON.stringify(deduped));
    touchWildWordsStorageMetaOnWrite(ls);
  } catch {
    return parsedRows;
  }
  return deduped;
}
