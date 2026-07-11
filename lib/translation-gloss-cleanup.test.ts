/**
 * Run: `npx tsx lib/translation-gloss-cleanup.test.ts`
 */
import assert from "node:assert/strict";

import { cleanupTranslationGloss, translationGlossNeedsCleanup } from "./translation-gloss-cleanup";

assert.equal(
  cleanupTranslationGloss({
    sourceText: "aprender",
    sourceLang: "es",
    targetLang: "en",
    translation: "Learning",
    partOfSpeech: "verb",
  }),
  "to learn"
);

assert.equal(
  cleanupTranslationGloss({
    sourceText: "estudiar",
    sourceLang: "es",
    targetLang: "en",
    translation: "Studying",
  }),
  "to study"
);

assert.equal(
  cleanupTranslationGloss({
    sourceText: "traducir",
    sourceLang: "es",
    targetLang: "en",
    translation: "Translation",
    partOfSpeech: "verb",
  }),
  "to translate"
);

assert.equal(
  cleanupTranslationGloss({
    sourceText: "comer",
    sourceLang: "es",
    targetLang: "en",
    translation: "Eating",
  }),
  "to eat"
);

assert.equal(
  cleanupTranslationGloss({
    sourceText: "hablar",
    sourceLang: "es",
    targetLang: "en",
    translation: "Speaking",
  }),
  "to speak"
);

assert.equal(
  cleanupTranslationGloss({
    sourceText: "aprender",
    sourceLang: "es",
    targetLang: "en",
    translation: "to learn",
  }),
  "to learn"
);

assert.equal(
  cleanupTranslationGloss({
    sourceText: "mesa",
    sourceLang: "es",
    targetLang: "en",
    translation: "table",
  }),
  "table"
);

assert.equal(
  translationGlossNeedsCleanup({
    sourceText: "aprender",
    sourceLang: "es",
    targetLang: "en",
    translation: "Learning",
  }),
  true
);

console.log("translation-gloss-cleanup.test.ts: all tests passed");
