/**
 * Run: `npx tsx lib/lesson-chunk-filter.test.ts`
 */
import assert from "node:assert/strict";

import { lessons } from "./lesson-data";
import {
  filterPracticeChunks,
  isLikelyProperNameChunk,
  shouldExcludeChunkFromPractice,
} from "./lesson-chunk-filter";

assert.equal(isLikelyProperNameChunk("Andrés"), true);
assert.equal(isLikelyProperNameChunk("Andrés."), true);
assert.equal(isLikelyProperNameChunk("María"), true);
assert.equal(isLikelyProperNameChunk("maría"), true);
assert.equal(isLikelyProperNameChunk("Laura"), true);
assert.equal(isLikelyProperNameChunk("Laura."), true);

assert.equal(isLikelyProperNameChunk("Me llamo"), false);
assert.equal(isLikelyProperNameChunk("me llamo"), false);
assert.equal(isLikelyProperNameChunk("Mucho gusto"), false);
assert.equal(isLikelyProperNameChunk("mucho gusto"), false);
assert.equal(isLikelyProperNameChunk("por cierto"), false);
assert.equal(isLikelyProperNameChunk("Por cierto"), false);

// Sentence-initial ordinary words should not be excluded blindly.
assert.equal(isLikelyProperNameChunk("Perdón"), false);
assert.equal(isLikelyProperNameChunk("Bueno"), false);

assert.equal(
  shouldExcludeChunkFromPractice({
    text: "Laura",
    translation: "Laura",
    type: "person-name",
  }),
  true
);

assert.equal(
  shouldExcludeChunkFromPractice({
    text: "me llamo",
    translation: "my name is",
    type: "core",
  }),
  false
);

const filtered = filterPracticeChunks([
  { text: "me llamo", translation: "my name is", type: "core" },
  { text: "Andrés", translation: "Andrés", type: "person-name" },
  { text: "mucho gusto", translation: "nice to meet you", type: "core" },
]);
assert.deepEqual(
  filtered.map((chunk) => chunk.text),
  ["me llamo", "mucho gusto"]
);

const lesson03 = lessons.find((lesson) => lesson.id === "es-intro-coffee-stranger-03");
assert.ok(lesson03, "expected lesson 03");

const lauraSentence = lesson03!.sentences.find((sentence) =>
  sentence.text.toLowerCase().includes("me llamo laura")
);
assert.ok(lauraSentence, "expected Laura introduction sentence");

const practiceWords = filterPracticeChunks(lauraSentence!.words, {
  sentenceText: lauraSentence!.text,
  language: "es",
});
assert.ok(
  practiceWords.some((word) => word.text.toLowerCase().includes("me llamo")),
  "me llamo should remain practiceable"
);
assert.ok(
  !practiceWords.some((word) => word.text.toLowerCase() === "laura"),
  "Laura should not be a practice chunk"
);

const andresSentence = lesson03!.sentences.find((sentence) =>
  sentence.text.startsWith("Andrés")
);
assert.ok(andresSentence, "expected Andrés reply sentence");
assert.ok(
  !andresSentence!.words.some(
    (word) =>
      !shouldExcludeChunkFromPractice(word, {
        sentenceText: andresSentence!.text,
        language: "es",
      }) && word.text.toLowerCase().includes("andres")
  ),
  "Andrés should not appear as a target chunk in lesson data"
);

console.log("lesson-chunk-filter.test.ts: ok");
