/**
 * Run: `npx tsx lib/comic-answer-hints.test.ts`
 */
import assert from "node:assert/strict";

import {
  buildExpectedAnswerHint,
  getAnswerHintLevel,
  maskExpectedAnswer,
  resolveActiveRecallExpectedAnswer,
  shouldShowComicAnswerHints,
} from "./comic-answer-hints";
import { buildComicActiveRecallPrompt } from "./comic-active-recall-prompt";

const spec = resolveActiveRecallExpectedAnswer({
  type: "meaning-to-chunk",
  prompt: "packed",
  expectedParts: ["abarrotado"],
  targetChunks: [{ text: "abarrotado", translation: "packed" }],
  sentenceText: "El café está abarrotado.",
  lessonLanguage: "es",
});

assert.equal(getAnswerHintLevel(0), 0);
assert.equal(getAnswerHintLevel(0, true), 3);

assert.equal(buildExpectedAnswerHint({ spec, wrongAttempts: 0 }).hintText, null);

const hint1 = buildExpectedAnswerHint({ spec, wrongAttempts: 1 });
assert.equal(hint1.level, 1);
assert.match(hint1.hintText ?? "", /abarrotado/);
assert.match(hint1.hintText ?? "", /sentence/i);

const hint2 = buildExpectedAnswerHint({ spec, wrongAttempts: 2 });
assert.equal(hint2.level, 2);
assert.match(hint2.hintText ?? "", /abarrotado|a_/);

const hintReveal = buildExpectedAnswerHint({ spec, wrongAttempts: 0, revealAnswer: true });
assert.equal(hintReveal.level, 3);
assert.equal(hintReveal.showExpectedAnswer, true);
assert.deepEqual(hintReveal.expectedAnswers, ["abarrotado"]);

assert.equal(
  shouldShowComicAnswerHints({
    typingChecked: true,
    typingStatus: "correct",
    wrongAttempts: 2,
    revealAnswer: false,
  }),
  false
);

assert.equal(maskExpectedAnswer("abarrotado"), "a_________");

const chunkMeaningSpec = resolveActiveRecallExpectedAnswer({
  type: "chunk-to-meaning",
  prompt: "me llamo",
  expectedParts: ["my", "name", "is"],
  targetChunks: [
    {
      text: "me llamo",
      translation: "my name is",
      acceptedMeanings: ["my name is", "I call myself"],
    },
  ],
  sentenceText: "Me llamo Laura, por cierto.",
  lessonLanguage: "es",
});

const chunkHintReveal = buildExpectedAnswerHint({
  spec: chunkMeaningSpec,
  wrongAttempts: 1,
  revealAnswer: true,
});
assert.equal(chunkHintReveal.showExpectedAnswer, true);
assert.ok(chunkHintReveal.expectedAnswers.includes("my name is"));

const chunkHintWrong = buildExpectedAnswerHint({
  spec: chunkMeaningSpec,
  wrongAttempts: 1,
});
assert.match(chunkHintWrong.hintText ?? "", /me llamo/i);
assert.match(chunkHintWrong.hintText ?? "", /Me llamo Laura/i);
assert.match(chunkHintWrong.hintText ?? "", /Target chunk/i);

const lauraPrompt = buildComicActiveRecallPrompt({
  type: "chunk-to-meaning",
  prompt: "me llamo",
  expectedParts: ["my", "name", "is"],
  targetChunks: [
    {
      text: "me llamo",
      translation: "my name is",
      acceptedMeanings: ["my name is"],
    },
  ],
  sentenceText: "Ya... yo igual, siempre corriendo. Me llamo Laura, por cierto.",
});
assert.equal(lauraPrompt.targetText, "me llamo");
assert.notEqual(lauraPrompt.bubbleActiveText, lauraPrompt.contextText);
assert.ok(
  lauraPrompt.highlightSegments.some(
    (segment) => segment.highlighted && /me llamo/i.test(segment.text)
  )
);

const perdónSpec = resolveActiveRecallExpectedAnswer({
  type: "full-sentence-recall",
  prompt: "Sorry, this seat... is it taken?",
  expectedParts: ["perdón"],
  targetChunks: [{ text: "perdón", translation: "sorry" }],
  sentenceText: "Perdón, ¿este asiento... está ocupado?",
  lessonLanguage: "es",
});
assert.equal(perdónSpec.taskType, "chunk-target");
assert.equal(perdónSpec.expectedAnswerLabel, "Expected word/phrase:");
const perdónReveal = buildExpectedAnswerHint({
  spec: perdónSpec,
  wrongAttempts: 0,
  revealAnswer: true,
});
assert.equal(perdónReveal.showExpectedAnswer, true);
assert.deepEqual(perdónReveal.expectedAnswers, ["perdón"]);

console.log("comic-answer-hints.test.ts: ok");
