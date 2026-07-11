/**
 * Run: `npx tsx lib/wild-word-language-cleanup.test.ts`
 */
import assert from "node:assert/strict";

import { buildLexemeKey } from "./lexeme-key";
import { WILD_WORD_FIELD_CLEAR } from "./wild-word-image-patch";
import {
  buildWildWordLanguageCleanupPatch,
  formatWildWordLanguageCleanupSummary,
  planWildWordLanguageCleanup,
  planWildWordLanguageRepairForEnrichment,
} from "./wild-word-language-cleanup";

function row(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "test-id",
    text: "learning",
    language: "es",
    sourceItemId: "https://example.com",
    sourceTitle: "Example",
    savedAt: "2026-01-01T00:00:00.000Z",
    targetLanguage: "es",
    ...overrides,
  };
}

const learningFix = buildWildWordLanguageCleanupPatch(row({ text: "learning", language: "es" }));
assert.equal(learningFix.outcome, "updated");
assert.equal(learningFix.patch?.language, "en");
assert.equal(learningFix.patch?.lexemeKey, buildLexemeKey("en", "learning"));

const knowledgeFix = buildWildWordLanguageCleanupPatch(row({ text: "knowledge", language: "es" }));
assert.equal(knowledgeFix.outcome, "updated");
assert.equal(knowledgeFix.patch?.language, "en");

for (const word of ["paid", "free", "trial"]) {
  const result = buildWildWordLanguageCleanupPatch(row({ text: word, language: "es" }));
  assert.equal(result.outcome, "updated", word);
  assert.equal(result.patch?.language, "en", word);
}

for (const word of ["bienvenidos", "pronto", "disculpe"]) {
  const result = buildWildWordLanguageCleanupPatch(row({ text: word, language: "en" }));
  assert.equal(result.outcome, "updated", word);
  assert.equal(result.patch?.language, "es", word);
}

const russian = buildWildWordLanguageCleanupPatch(row({ text: "Москва", language: "es" }));
assert.equal(russian.outcome, "updated");
assert.equal(russian.patch?.language, "ru");

const arabic = buildWildWordLanguageCleanupPatch(row({ text: "مرحبا", language: "en" }));
assert.equal(arabic.outcome, "updated");
assert.equal(arabic.patch?.language, "ar");

const contextEn = buildWildWordLanguageCleanupPatch(
  row({
    text: "xyz",
    language: "es",
    contextSentence: "Learning platforms help you build knowledge with paid and free trial options.",
  })
);
assert.equal(contextEn.outcome, "updated");
assert.equal(contextEn.patch?.language, "en");

const skippedAmbiguous = buildWildWordLanguageCleanupPatch(
  row({
    text: "xyz",
    language: "es",
    contextSentence: "abc qqq rrr",
  })
);
assert.equal(skippedAmbiguous.outcome, "skipped_low_confidence");

const unchanged = buildWildWordLanguageCleanupPatch(
  row({
    text: "learning",
    language: "en",
    lexemeKey: buildLexemeKey("en", "learning"),
    detectedLanguage: "en",
    detectedLanguageConfidence: "high",
    detectedLanguageReason: "selected: en wordlist: learning",
  })
);
assert.equal(unchanged.outcome, "unchanged");

const plan = planWildWordLanguageCleanup([
  row({ id: "a", text: "learning", language: "es" }),
  row({ id: "b", text: "disculpe", language: "en" }),
  row({ id: "c", text: "zzq", language: "es" }),
]);
assert.equal(plan.summary.updated, 2);
assert.equal(plan.summary.skippedLowConfidence, 1);
assert.equal(
  formatWildWordLanguageCleanupSummary(plan.summary),
  "Updated 2, skipped 1 low-confidence."
);

const targetPreserved = buildWildWordLanguageCleanupPatch(row({ text: "learning", language: "es", targetLanguage: "es" }));
assert.equal(targetPreserved.patch?.targetLanguage, undefined);

const enrichmentRepair = planWildWordLanguageRepairForEnrichment(
  row({
    text: "learning",
    language: "es",
    translation: "Learning",
    translationTargetLanguage: "en",
  })
);
assert.ok(enrichmentRepair);
assert.equal(enrichmentRepair.repairedLanguage, "en");
assert.match(enrichmentRepair.reason, /en wordlist: learning/);

const learningStaleClear = buildWildWordLanguageCleanupPatch(
  row({
    text: "learning",
    language: "es",
    translation: "Learning",
    translationTargetLanguage: "en",
    translationSource: "argos",
    enrichedAt: "2026-01-01T00:00:00.000Z",
    enrichmentStatus: "complete",
    definition: "El aprendizaje.",
    definitionSource: "wiktionary",
    enrichmentErrors: { translation: "stale" },
  })
);
assert.equal(learningStaleClear.outcome, "updated");
assert.equal(learningStaleClear.patch?.language, "en");
assert.equal(learningStaleClear.patch?.translation, WILD_WORD_FIELD_CLEAR);
assert.equal(learningStaleClear.patch?.translationTargetLanguage, WILD_WORD_FIELD_CLEAR);
assert.equal(learningStaleClear.patch?.translationSource, WILD_WORD_FIELD_CLEAR);
assert.equal(learningStaleClear.patch?.enrichedAt, WILD_WORD_FIELD_CLEAR);
assert.equal(learningStaleClear.patch?.enrichmentStatus, WILD_WORD_FIELD_CLEAR);
assert.equal(learningStaleClear.patch?.definition, WILD_WORD_FIELD_CLEAR);
assert.equal(learningStaleClear.patch?.definitionSource, WILD_WORD_FIELD_CLEAR);
assert.equal(learningStaleClear.patch?.enrichmentErrors, WILD_WORD_FIELD_CLEAR);

const disculpeKeepsTranslation = buildWildWordLanguageCleanupPatch(
  row({
    text: "disculpe",
    language: "es",
    lexemeKey: buildLexemeKey("es", "disculpe"),
    detectedLanguage: "es",
    detectedLanguageConfidence: "high",
    detectedLanguageReason: "selected: es wordlist: disculpe",
    translation: "Excuse me",
    translationTargetLanguage: "en",
  })
);
assert.equal(disculpeKeepsTranslation.outcome, "unchanged");
assert.equal(disculpeKeepsTranslation.patch, undefined);

const mesasKeepsImage = buildWildWordLanguageCleanupPatch(
  row({
    text: "Mesas",
    language: "es",
    lexemeKey: buildLexemeKey("es", "Mesas"),
    detectedLanguage: "es",
    detectedLanguageConfidence: "high",
    detectedLanguageReason: "selected: es wordlist: mesas",
    translation: "Tables",
    translationTargetLanguage: "en",
    imageUrl: "/images/chunks/mesa.png",
    imageSource: "lesson",
  })
);
assert.equal(mesasKeepsImage.outcome, "unchanged");
assert.equal(mesasKeepsImage.patch?.imageUrl, undefined);
assert.equal(mesasKeepsImage.patch?.imageSource, undefined);

const userImagePreserved = buildWildWordLanguageCleanupPatch(
  row({
    text: "learning",
    language: "es",
    translation: "Learning",
    imageSource: "user",
    imageAssetId: "asset-123",
    imageAlt: "my photo",
    imageUpdatedAt: "2026-01-01T00:00:00.000Z",
    imageUrl: "/images/chunks/learning.png",
    sourceUrl: "https://example.com/page",
    sourceTitle: "Example",
    contextSentence: "Keep this sentence.",
  })
);
assert.equal(userImagePreserved.outcome, "updated");
assert.equal(userImagePreserved.patch?.language, "en");
assert.equal(userImagePreserved.patch?.imageSource, undefined);
assert.equal(userImagePreserved.patch?.imageAssetId, undefined);
assert.equal(userImagePreserved.patch?.imageAlt, undefined);
assert.equal(userImagePreserved.patch?.imageUrl, undefined);
assert.equal(userImagePreserved.patch?.sourceUrl, undefined);
assert.equal(userImagePreserved.patch?.contextSentence, undefined);

console.log("wild-word-language-cleanup.test.ts: ok");
