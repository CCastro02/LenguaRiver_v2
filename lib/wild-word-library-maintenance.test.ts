/**
 * Run: `npx tsx lib/wild-word-library-maintenance.test.ts`
 */
import assert from "node:assert/strict";

import { buildLexemeKey } from "./lexeme-key";
import { MOJIBAKE_REPLACEMENT_CHAR } from "./fix-common-mojibake";
import { hasUserWildWordImage } from "./wild-word-image-display";
import { runWildWordLocalMaintenance } from "./wild-word-library-maintenance";

const baseSaved = "2026-01-01T00:00:00.000Z";

function duplicateRows(): Record<string, unknown>[] {
  const row = {
    id: "dup-a",
    text: "mesa",
    language: "es",
    lexemeKey: buildLexemeKey("es", "mesa"),
    sourceItemId: "",
    sourceTitle: "",
    savedAt: baseSaved,
  };
  return [row, { ...row, id: "dup-b" }];
}

const dedupeResult = runWildWordLocalMaintenance(duplicateRows());
assert.equal(dedupeResult.rows.length, 1);
assert.equal(dedupeResult.summary.deduped, 1);
assert.equal(dedupeResult.changed, true);

const fakeDefRow = {
  id: "fake-def",
  text: "hola",
  language: "es",
  lexemeKey: buildLexemeKey("es", "hola"),
  definition: 'Means "hello" in English.',
  definitionSource: "translation-fallback",
  explanation: "A greeting.",
  explanationLanguage: "en",
  sourceItemId: "",
  sourceTitle: "",
  savedAt: baseSaved,
};
const fakeDefResult = runWildWordLocalMaintenance([fakeDefRow]);
const fakeDefOut = fakeDefResult.rows[0] as Record<string, unknown>;
assert.equal(fakeDefOut.definition, undefined);
assert.equal(fakeDefOut.explanation, undefined);
assert.equal(fakeDefResult.summary.fakeDefinitionsCleared, 1);
assert.equal(fakeDefResult.summary.orphanExplanationsCleared, 1);

const orphanExplanationRow = {
  id: "orphan-exp",
  text: "mesa",
  language: "es",
  lexemeKey: buildLexemeKey("es", "mesa"),
  explanation: "A table.",
  explanationLanguage: "en",
  sourceItemId: "",
  sourceTitle: "",
  savedAt: baseSaved,
};
const orphanResult = runWildWordLocalMaintenance([orphanExplanationRow]);
const orphanOut = orphanResult.rows[0] as Record<string, unknown>;
assert.equal(orphanOut.explanation, undefined);
assert.equal(orphanResult.summary.orphanExplanationsCleared, 1);

const mojibakeRow = {
  id: "mojibake",
  text: "quizás",
  language: "es",
  lexemeKey: buildLexemeKey("es", "quizás"),
  translation: `quiz${MOJIBAKE_REPLACEMENT_CHAR}s`,
  translationTargetLanguage: "en",
  sourceItemId: "",
  sourceTitle: "",
  savedAt: baseSaved,
};
const mojibakeResult = runWildWordLocalMaintenance([mojibakeRow]);
const mojibakeOut = mojibakeResult.rows[0] as Record<string, unknown>;
assert.equal(mojibakeOut.translation, "quizás");
assert.equal(mojibakeResult.summary.mojibakeFixed, 1);

const perhapsRow = {
  id: "perhaps",
  text: "perhaps",
  language: "en",
  lexemeKey: buildLexemeKey("en", "perhaps"),
  translation: "quizás",
  imageUrl: "/images/concepts/uncertainty.png",
  imageSource: "concept",
  imageAlt: "Perhaps",
  sourceItemId: "",
  sourceTitle: "",
  savedAt: baseSaved,
};
const perhapsResult = runWildWordLocalMaintenance([perhapsRow]);
const perhapsOut = perhapsResult.rows[0] as Record<string, unknown>;
assert.equal(perhapsOut.imageUrl, undefined);
assert.equal(perhapsOut.imageSource, undefined);
assert.equal(perhapsResult.summary.rejectedImagesCleared, 1);

const expectsRow = {
  id: "expects",
  text: "expects",
  language: "en",
  lexemeKey: buildLexemeKey("en", "expects"),
  translation: "espera",
  imageUrl: "/images/concepts/expectation.png",
  imageSource: "concept",
  imageAlt: "Expects",
  sourceItemId: "",
  sourceTitle: "",
  savedAt: baseSaved,
};
const expectsResult = runWildWordLocalMaintenance([expectsRow]);
const expectsOut = expectsResult.rows[0] as Record<string, unknown>;
assert.equal(expectsOut.imageUrl, undefined);
assert.equal(expectsResult.summary.rejectedImagesCleared, 1);

const frequencyRow = {
  id: "frequency",
  text: "frequency",
  language: "en",
  lexemeKey: buildLexemeKey("en", "frequency"),
  imageUrl: "/images/concepts/frequency.png",
  imageSource: "concept",
  imageAlt: "Frequency",
  sourceItemId: "",
  sourceTitle: "",
  savedAt: baseSaved,
};
const frequencyResult = runWildWordLocalMaintenance([frequencyRow]);
const frequencyOut = frequencyResult.rows[0] as Record<string, unknown>;
assert.equal(frequencyOut.imageUrl, "/images/concepts/frequency.png");
assert.equal(frequencyOut.imageSource, "concept");
assert.equal(frequencyResult.summary.rejectedImagesCleared, 0);

const userImageRow = {
  id: "user-img",
  text: "mesa",
  language: "es",
  lexemeKey: buildLexemeKey("es", "mesa"),
  imageSource: "user",
  imageAssetId: "asset-123",
  imageUrl: "/images/concepts/uncertainty.png",
  customNote: "keep-me",
  sourceItemId: "",
  sourceTitle: "",
  savedAt: baseSaved,
};
const userResult = runWildWordLocalMaintenance([userImageRow]);
const userOut = userResult.rows[0] as Record<string, unknown>;
assert.equal(hasUserWildWordImage(userOut), true);
assert.equal(userOut.imageUrl, "/images/concepts/uncertainty.png");
assert.equal(userOut.customNote, "keep-me");
assert.equal(userResult.summary.rejectedImagesCleared, 0);

const aprenderRow = {
  id: "aprender",
  text: "aprender",
  language: "es",
  lexemeKey: buildLexemeKey("es", "aprender"),
  translation: "Learning",
  translationTargetLanguage: "en",
  enrichmentVersion: 1,
  sourceItemId: "",
  sourceTitle: "",
  savedAt: baseSaved,
};
const aprenderResult = runWildWordLocalMaintenance([aprenderRow]);
const aprenderOut = aprenderResult.rows[0] as Record<string, unknown>;
assert.equal(aprenderOut.translation, "to learn");
assert.equal(aprenderResult.changed, true);

const unchanged = runWildWordLocalMaintenance([frequencyRow]);
assert.equal(unchanged.changed, false);

console.log("wild-word-library-maintenance.test.ts: all tests passed");
