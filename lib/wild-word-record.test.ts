/**
 * Run: `npx tsx lib/wild-word-record.test.ts`
 */
import assert from "node:assert/strict";

import { coerceWildWordRawRecord, parseWildWordCoreFields } from "./wild-word-record";

const legacyExtensionRow = {
  id: "ext-1",
  text: "learning",
  language: "es",
  sourceUrl: "https://example.com/page",
  sourceKind: "web",
  savedAt: "2026-01-01T00:00:00.000Z",
  enrichmentErrors: { translation: "Translation model en → es not installed." },
  customFutureField: { nested: true },
};

const coerced = coerceWildWordRawRecord(legacyExtensionRow);
assert.ok(coerced);
assert.equal(coerced.word.text, "learning");
assert.equal(coerced.extras.sourceUrl, "https://example.com/page");
assert.deepEqual(coerced.rawRecord.customFutureField, { nested: true });
assert.equal(
  (coerced.extras.enrichmentErrors as { translation?: string })?.translation,
  "Translation model en → es not installed."
);
assert.equal(coerced.extras.targetLanguage, undefined);

assert.equal(coerceWildWordRawRecord({ id: "x", text: "" }), null);
assert.equal(coerceWildWordRawRecord(null), null);

const withTarget = coerceWildWordRawRecord({
  ...legacyExtensionRow,
  targetLanguage: "en",
  translationTargetLanguage: "es",
  translation: "aprendizaje",
});
assert.equal(withTarget?.extras.targetLanguage, "en");
assert.equal(withTarget?.extras.translationTargetLanguage, "es");

const withDefinitionLang = coerceWildWordRawRecord({
  ...legacyExtensionRow,
  definition: "forma femenina plural de mucho",
  definitionLanguage: "es",
});
assert.equal(withDefinitionLang?.extras.definitionLanguage, "es");

const withExplanation = coerceWildWordRawRecord({
  ...legacyExtensionRow,
  explanation: "proceso de adquirir conocimiento",
  explanationLanguage: "es",
  explanationSource: "argos",
});
assert.equal(withExplanation?.extras.explanationLanguage, "es");
assert.equal(withExplanation?.extras.explanationSource, "argos");

assert.equal(parseWildWordCoreFields({ id: "a", text: "hola", language: "es" })?.lexemeKey, undefined);
assert.equal(
  parseWildWordCoreFields({
    id: "a",
    text: "hola",
    language: "es",
    lexemeKey: "lr:v1|es|hola",
  })?.lexemeKey,
  "lr:v1|es|hola"
);

console.log("wild-word-record.test.ts: ok");
