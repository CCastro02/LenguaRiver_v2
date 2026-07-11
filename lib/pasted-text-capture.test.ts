import assert from "node:assert/strict";

import {
  buildPastedTextWildWordRows,
  extractPastedTextCandidates,
} from "./pasted-text-capture";

const MIXED_TEXT =
  "Disculpe, mañana quiero café. I am learning web development. Bonjour merci. こんにちは 你好.";

const candidates = extractPastedTextCandidates(MIXED_TEXT, { maxCandidates: 20 });

assert.deepEqual(
  candidates.map((c) => [c.text, c.language]),
  [
    ["disculpe", "es"],
    ["mañana", "es"],
    ["quiero", "es"],
    ["café", "es"],
    ["learning", "en"],
    ["web", "en"],
    ["development", "en"],
    ["bonjour", "fr"],
    ["merci", "fr"],
    ["こんにちは", "ja"],
    ["你好", "zh"],
  ],
);

const duplicateCandidates = extractPastedTextCandidates("café cafe café", { maxCandidates: 20 });
assert.deepEqual(duplicateCandidates.map((c) => c.text), ["café"]);

const rows = buildPastedTextWildWordRows(MIXED_TEXT, {
  idPrefix: "test",
  nowIso: "2026-07-11T10:00:00.000Z",
  targetLanguage: "en",
  sourceTitle: "Pasted text",
  sourceItemId: "paste:test",
  maxCandidates: 3,
});

assert.equal(rows.length, 3);
assert.equal(rows[0]!.id, "test-0");
assert.equal(rows[0]!.language, "es");
assert.equal(rows[0]!.targetLanguage, "en");
assert.equal(rows[0]!.sourceKind, "paste");
assert.equal(rows[0]!.lexemeKey, "lr:v1|es|disculpe");
assert.equal(rows[0]!.contextSentence, "Disculpe, mañana quiero café.");

console.log("pasted-text-capture.test.ts: ok");
