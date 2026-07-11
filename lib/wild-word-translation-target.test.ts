/**
 * Run: `npx tsx lib/wild-word-translation-target.test.ts`
 */
import assert from "node:assert/strict";

import {
  fallbackOppositeTarget,
  resolveEffectiveTranslationTarget,
  resolveStoredTargetLanguage,
  resolveWildWordTranslationLanguages,
} from "./wild-word-translation-target";

const baseRow = {
  id: "w1",
  text: "Disculpe",
  language: "es",
  savedAt: "2026-01-01T00:00:00.000Z",
};

assert.equal(fallbackOppositeTarget("en"), "es");
assert.equal(fallbackOppositeTarget("es"), "en");
assert.equal(fallbackOppositeTarget("fr"), "en");

assert.equal(resolveEffectiveTranslationTarget("en", "en"), "es");
assert.equal(resolveEffectiveTranslationTarget("es", "en"), "en");
assert.equal(resolveEffectiveTranslationTarget("es", "es"), "en");
assert.equal(resolveEffectiveTranslationTarget("es", "fr"), "fr");

assert.equal(resolveStoredTargetLanguage({}), "en");
assert.equal(resolveStoredTargetLanguage({ targetLanguage: "fr" }), "fr");

assert.deepEqual(resolveWildWordTranslationLanguages(baseRow, { language: "es", text: "Disculpe" }), {
  sourceLang: "es",
  targetLang: "en",
  effectiveTargetLang: "en",
  speechLang: "es",
});

assert.deepEqual(
  resolveWildWordTranslationLanguages(
    { id: "w2", text: "knowledge", language: "en", targetLanguage: "en" },
    { language: "en", text: "knowledge" }
  ),
  {
    sourceLang: "en",
    targetLang: "en",
    effectiveTargetLang: "es",
    speechLang: "en",
  }
);

assert.deepEqual(
  resolveWildWordTranslationLanguages(
    {
      id: "w3",
      text: "learning",
      language: "es",
      targetLanguage: "es",
      sourceUrl: "https://example.com",
    },
    { language: "es", text: "learning" }
  ),
  {
    sourceLang: "en",
    targetLang: "es",
    effectiveTargetLang: "es",
    speechLang: "en",
  }
);

console.log("wild-word-translation-target.test.ts: ok");
