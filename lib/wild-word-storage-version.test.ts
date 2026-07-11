/**
 * Run: `npx tsx lib/wild-word-storage-version.test.ts`
 */
import assert from "node:assert/strict";

import { buildLexemeKey } from "./lexeme-key";
import {
  CURRENT_WILD_WORDS_SCHEMA_VERSION,
  ensureWildWordsStorageVersion,
  getWildWordsStorageMeta,
  migrateWildWordsRowsIfNeeded,
  parseWildWordsStorageMeta,
  setWildWordsStorageMeta,
  touchWildWordsStorageMetaOnWrite,
  WILD_WORDS_META_STORAGE_KEY,
} from "./wild-word-storage-version";

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

const storage = new MemoryStorage();

assert.equal(parseWildWordsStorageMeta(null), null);
assert.equal(parseWildWordsStorageMeta(""), null);
assert.equal(parseWildWordsStorageMeta("{not-json"), null);
assert.equal(parseWildWordsStorageMeta("[]"), null);
assert.equal(parseWildWordsStorageMeta('{"schemaVersion":1}'), null);
assert.equal(parseWildWordsStorageMeta('{"schemaVersion":0,"updatedAt":"2026-01-01T00:00:00.000Z"}'), null);
assert.equal(
  parseWildWordsStorageMeta('{"schemaVersion":1,"updatedAt":"2026-01-01T00:00:00.000Z"}')?.schemaVersion,
  1
);

assert.equal(getWildWordsStorageMeta(storage), null);
const created = ensureWildWordsStorageVersion(storage);
assert.equal(created.schemaVersion, CURRENT_WILD_WORDS_SCHEMA_VERSION);
assert.ok(created.updatedAt);
const metaRaw = storage.getItem(WILD_WORDS_META_STORAGE_KEY);
assert.ok(metaRaw);
const parsedMeta = JSON.parse(metaRaw!) as { schemaVersion: number; updatedAt: string };
assert.equal(parsedMeta.schemaVersion, 1);

storage.setItem(WILD_WORDS_META_STORAGE_KEY, "{broken");
assert.doesNotThrow(() => ensureWildWordsStorageVersion(storage));
const repaired = getWildWordsStorageMeta(storage);
assert.ok(repaired);
assert.equal(repaired!.schemaVersion, CURRENT_WILD_WORDS_SCHEMA_VERSION);

const legacyRows = [
  {
    id: "a1",
    text: "hola",
    language: "es",
    lexemeKey: buildLexemeKey("es", "hola"),
    savedAt: "2026-01-01T00:00:00.000Z",
    customFutureField: { nested: true },
  },
];
const unchanged = migrateWildWordsRowsIfNeeded(legacyRows);
assert.equal(unchanged.changed, false);
assert.equal(unchanged.rows, legacyRows);
assert.equal(unchanged.rows[0]!.customFutureField, legacyRows[0]!.customFutureField);

const backfillPreservesUnknown = migrateWildWordsRowsIfNeeded([
  {
    id: "a2",
    text: "hola",
    language: "es",
    savedAt: "2026-01-01T00:00:00.000Z",
    customFutureField: { nested: true },
  },
]);
assert.equal(backfillPreservesUnknown.changed, true);
assert.deepEqual(backfillPreservesUnknown.rows[0]!.customFutureField, { nested: true });

const needsLexeme = migrateWildWordsRowsIfNeeded([
  {
    id: "b1",
    text: "Disculpe",
    language: "es",
    sourceUrl: "https://example.com",
  },
]);
assert.equal(needsLexeme.changed, true);
assert.equal(needsLexeme.rows[0]!.lexemeKey, buildLexemeKey("es", "Disculpe"));
assert.equal(needsLexeme.rows[0]!.sourceUrl, "https://example.com");

const hasLexeme = migrateWildWordsRowsIfNeeded([
  {
    id: "c1",
    text: "hola",
    language: "es",
    lexemeKey: "lr:v1|es|custom-stored-key",
  },
]);
assert.equal(hasLexeme.changed, false);
assert.equal(hasLexeme.rows[0]!.lexemeKey, "lr:v1|es|custom-stored-key");

const emptyLexeme = migrateWildWordsRowsIfNeeded([
  { id: "d1", text: "hola", language: "es", lexemeKey: "   " },
]);
assert.equal(emptyLexeme.changed, true);
assert.equal(emptyLexeme.rows[0]!.lexemeKey, buildLexemeKey("es", "hola"));

const missingCore = migrateWildWordsRowsIfNeeded([{ id: "e1", text: "", language: "es" }]);
assert.equal(missingCore.changed, false);

const beforeTouch = getWildWordsStorageMeta(storage)!.updatedAt;
setWildWordsStorageMeta(
  { schemaVersion: CURRENT_WILD_WORDS_SCHEMA_VERSION, updatedAt: beforeTouch },
  storage
);
touchWildWordsStorageMetaOnWrite(storage);
const afterTouch = getWildWordsStorageMeta(storage)!;
assert.equal(afterTouch.schemaVersion, CURRENT_WILD_WORDS_SCHEMA_VERSION);
assert.notEqual(afterTouch.updatedAt, beforeTouch);

console.log("wild-word-storage-version.test.ts: ok");
