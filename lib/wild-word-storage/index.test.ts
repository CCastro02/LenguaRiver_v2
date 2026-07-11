/**
 * Run: `npx tsx lib/wild-word-storage/index.test.ts`
 */
import assert from "node:assert/strict";

import {
  CURRENT_WILD_WORDS_SCHEMA_VERSION,
  ensureWildWordsStorageVersion,
  getWildWordsServerSnapshot,
  getWildWordsStorageDiagnostics,
  getWildWordsStorageMeta,
  getWildWordsSync,
  importWildWordsFromExtensionJson,
  patchWildWordsById,
  persistWildWords,
  subscribeWildWords,
  WILD_WORDS_META_STORAGE_KEY,
  WILD_WORDS_STORAGE_KEY,
} from "./index";

const diag = getWildWordsStorageDiagnostics();
assert.equal(diag.backend, "localStorage");
assert.equal(typeof diag.rowCount, "number");
assert.equal(typeof diag.approxBytes, "number");
assert.equal(diag.rowCount, getWildWordsSync().length);

assert.equal(WILD_WORDS_STORAGE_KEY, "lenguariver_wild_words");
assert.equal(WILD_WORDS_META_STORAGE_KEY, "lenguariver_wild_words_meta");
assert.equal(CURRENT_WILD_WORDS_SCHEMA_VERSION, 1);
assert.equal(getWildWordsStorageMeta(), null);
assert.doesNotThrow(() => ensureWildWordsStorageVersion());

assert.doesNotThrow(() => getWildWordsSync());
assert.doesNotThrow(() => getWildWordsServerSnapshot());
assert.doesNotThrow(() => persistWildWords([]));
assert.doesNotThrow(() => patchWildWordsById(new Map()));
assert.doesNotThrow(() => importWildWordsFromExtensionJson([]));
assert.doesNotThrow(() => subscribeWildWords(() => {}));

console.log("wild-word-storage/index.test.ts: ok");
