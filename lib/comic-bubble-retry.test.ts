/**
 * Run: `npx tsx lib/comic-bubble-retry.test.ts`
 */
import assert from "node:assert/strict";

import {
  focusComicInlineInput,
  getComicBubbleRetryState,
  getComicInlineInputId,
  isComicSpeakingAttemptFailed,
  isComicTypingAttemptFailed,
  shouldDisableComicInlineInput,
} from "./comic-bubble-retry";

assert.equal(getComicInlineInputId("ex-1"), "lr-comic-inline-input-ex-1");

assert.equal(
  isComicTypingAttemptFailed({ typingChecked: true, typingStatus: "incorrect" }),
  true
);
assert.equal(
  isComicTypingAttemptFailed({ typingChecked: true, typingStatus: "correct" }),
  false
);
assert.equal(
  isComicTypingAttemptFailed({ typingChecked: false, typingStatus: "incorrect" }),
  false
);

assert.equal(isComicSpeakingAttemptFailed({ voiceComplete: false, speechEvalOk: false }), true);
assert.equal(isComicSpeakingAttemptFailed({ voiceComplete: true, speechEvalOk: false }), false);
assert.equal(isComicSpeakingAttemptFailed({ voiceComplete: false, speechEvalOk: true }), false);

assert.deepEqual(
  getComicBubbleRetryState({
    typingChecked: true,
    typingStatus: "incorrect",
    voiceComplete: false,
    speechEvalOk: undefined,
  }),
  { showRetryButton: true, retryKind: "typing" }
);

assert.deepEqual(
  getComicBubbleRetryState({
    typingChecked: false,
    typingStatus: undefined,
    voiceComplete: false,
    speechEvalOk: false,
  }),
  { showRetryButton: true, retryKind: "speaking" }
);

assert.deepEqual(
  getComicBubbleRetryState({
    typingChecked: true,
    typingStatus: "correct",
    voiceComplete: true,
    speechEvalOk: true,
  }),
  { showRetryButton: false, retryKind: null }
);

assert.equal(shouldDisableComicInlineInput("correct"), true);
assert.equal(shouldDisableComicInlineInput("incorrect"), false);
assert.equal(shouldDisableComicInlineInput(undefined), false);

// focusComicInlineInput is a no-op in Node (no document)
focusComicInlineInput("noop");

console.log("comic-bubble-retry.test.ts: ok");
