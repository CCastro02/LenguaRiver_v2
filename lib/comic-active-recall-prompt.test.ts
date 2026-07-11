/**
 * Run: `npx tsx lib/comic-active-recall-prompt.test.ts`
 */
import assert from "node:assert/strict";

import {
  buildChunkHighlightSegments,
  buildComicActiveRecallPrompt,
  expectedMatchesFullSentence,
  getComicActiveRecallBubbleActiveText,
  getComicActiveRecallExpectedAnswerLabel,
  getComicActiveRecallInputPlaceholder,
  resolveComicActiveRecallTask,
  shouldExcludeActiveRecallExercisePrompt,
  validateActiveRecallTask,
} from "./comic-active-recall-prompt";

{
  const prompt = buildComicActiveRecallPrompt({
    type: "chunk-to-meaning",
    prompt: "me llamo",
    expectedParts: ["my", "name", "is"],
    sentenceText: "Ya... yo igual, siempre corriendo. Me llamo Laura, por cierto.",
    targetChunks: [
      {
        text: "me llamo",
        translation: "my name is",
        acceptedMeanings: ["my name is", "I call myself"],
      },
    ],
  });

  assert.equal(prompt.mode, "chunk-meaning");
  assert.equal(prompt.taskType, "chunk-meaning");
  assert.equal(prompt.targetText, "me llamo");
  assert.equal(prompt.displayText, "me llamo");
  assert.notEqual(prompt.bubbleActiveText, prompt.contextText);
  assert.equal(prompt.bubbleActiveText, "me llamo");
  assert.match(prompt.instruction, /highlighted phrase/i);
  assert.ok(prompt.expectedAnswers.includes("my name is"));
  assert.ok(
    prompt.highlightSegments.some((segment) => segment.highlighted && /me llamo/i.test(segment.text)),
    "highlight should mark me llamo inside the sentence"
  );
  assert.ok(
    prompt.contextText?.includes("Laura"),
    "full sentence preserved as context"
  );
}

{
  const segments = buildChunkHighlightSegments(
    "Me llamo Laura, por cierto.",
    "me llamo"
  );
  const highlighted = segments.filter((segment) => segment.highlighted).map((segment) => segment.text);
  assert.ok(highlighted.some((text) => /me llamo/i.test(text)));
}

assert.equal(
  shouldExcludeActiveRecallExercisePrompt({
    prompt: "Andrés.",
    targetChunks: [{ text: "Andrés.", translation: "Andrés" }],
  }),
  true
);

assert.equal(
  shouldExcludeActiveRecallExercisePrompt({
    prompt: "me llamo",
    targetChunks: [{ text: "me llamo", translation: "my name is" }],
  }),
  false
);

assert.equal(
  getComicActiveRecallBubbleActiveText({
    type: "chunk-to-meaning",
    prompt: "me llamo",
    expectedParts: ["my", "name", "is"],
    sentenceText: "Me llamo Laura, por cierto.",
    targetChunks: [{ text: "me llamo", translation: "my name is" }],
  }),
  "me llamo"
);

const perdónSentence = "Perdón, ¿este asiento... está ocupado?";
const perdónTask = resolveComicActiveRecallTask({
  type: "full-sentence-recall",
  prompt: "Sorry, this seat... is it taken?",
  expectedParts: ["perdón"],
  sentenceText: perdónSentence,
  targetLanguage: "es",
  targetChunks: [{ text: "perdón", translation: "sorry" }],
});

assert.equal(perdónTask.taskType, "chunk-target");
assert.match(perdónTask.instruction, /highlighted Spanish word/i);
assert.doesNotMatch(perdónTask.instruction, /full sentence/i);
assert.deepEqual(perdónTask.expectedAnswers, ["perdón"]);
assert.equal(perdónTask.inputLanguage, "target");
assert.ok(
  perdónTask.highlightSegments.some(
    (segment) => segment.highlighted && /perdón/i.test(segment.text)
  )
);
assert.equal(getComicActiveRecallInputPlaceholder(perdónTask, "es"), "Type in Spanish…");
assert.equal(
  getComicActiveRecallExpectedAnswerLabel(perdónTask.taskType),
  "Expected word/phrase:"
);

const fullSentenceTask = resolveComicActiveRecallTask({
  type: "full-sentence-recall",
  prompt: "Sorry, this seat... is it taken?",
  expectedParts: ["Perdón, ¿este asiento está ocupado?"],
  sentenceText: "Perdón, ¿este asiento está ocupado?",
  targetLanguage: "es",
  targetChunks: [{ text: "perdón", translation: "sorry" }],
});

assert.equal(fullSentenceTask.taskType, "full-sentence-target");
assert.match(fullSentenceTask.instruction, /full Spanish sentence/i);
assert.ok(
  expectedMatchesFullSentence(
    fullSentenceTask.expectedAnswers,
    "Perdón, ¿este asiento está ocupado?"
  )
);
assert.equal(
  getComicActiveRecallExpectedAnswerLabel(fullSentenceTask.taskType),
  "Expected full sentence:"
);

const invalidTask = {
  taskType: "full-sentence-target" as const,
  instruction: "Type the full Spanish sentence",
  displayText: perdónSentence,
  contextText: perdónSentence,
  inputLanguage: "target" as const,
  expectedAnswers: ["perdón"],
  highlightSegments: [{ text: perdónSentence }],
  bubbleActiveText: perdónSentence,
};

const invalidValidation = validateActiveRecallTask(invalidTask);
assert.equal(invalidValidation.valid, false);
assert.ok(invalidValidation.issues.some((issue) => /full sentence/i.test(issue)));
assert.equal(invalidValidation.fallbackTask?.taskType, "chunk-target");
assert.doesNotMatch(
  invalidValidation.fallbackTask?.instruction ?? "",
  /full sentence/i
);

console.log("comic-active-recall-prompt.test.ts: ok");
