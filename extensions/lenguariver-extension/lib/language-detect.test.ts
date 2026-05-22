/**
 * Run: `npx tsx lib/language-detect.test.ts` (from extension root)
 *
 * Toolbar Pronounce uses the same resolution as Save (`resolveSaveLanguage`).
 */
import assert from "node:assert/strict";

import { resolveSaveLanguage } from "./language-detect";

const EN_CTX =
  "Check out this platform for learning web development. The tools are pretty helpful.";
const ES_FALLBACK = "es";

assert.equal(
  resolveSaveLanguage("Disculpe", "en", undefined).saveLanguage,
  "es",
);
assert.equal(
  resolveSaveLanguage("Mesas", "en", undefined).saveLanguage,
  "es",
);
assert.equal(
  resolveSaveLanguage("learning", "es", EN_CTX).saveLanguage,
  "en",
);
assert.equal(
  resolveSaveLanguage("xyz", ES_FALLBACK, EN_CTX).saveLanguage,
  "en",
);

assert.equal(resolveSaveLanguage("bonjour", "en").saveLanguage, "fr");
assert.equal(resolveSaveLanguage("danke", "en").saveLanguage, "de");
assert.equal(resolveSaveLanguage("ciao", "en").saveLanguage, "it");
assert.equal(resolveSaveLanguage("nella casa", "en").saveLanguage, "it");

console.log("language-detect.test.ts: ok");
