/**
 * Run: `npx tsx lib/comic-bubble-controls.test.ts`
 */
import assert from "node:assert/strict";

import type { ComicBubbleView } from "./comic-bubble-layout";
import { getComicBubbleCompletionKey } from "./comic-bubble-text";
import { getComicBubbleRetryState } from "./comic-bubble-retry";
import {
  isSpeakableComicBubble,
  shouldShowComicBubbleSpeak,
} from "./comic-bubble-controls";
import { getVisibleComicBreakdownBubbles } from "./comic-visible-bubbles";
import { getLessonStoryboard } from "./lesson-storyboards";

function speechBubble(
  overrides: Partial<ComicBubbleView> & Pick<ComicBubbleView, "text">
): ComicBubbleView {
  const speechTargetText = overrides.speechTargetText ?? overrides.text;
  return {
    id: overrides.id ?? "bubble-1",
    speaker: overrides.speaker ?? "learner",
    text: overrides.text,
    speechTargetText,
    playText: overrides.playText ?? speechTargetText,
    completionKey: overrides.completionKey ?? getComicBubbleCompletionKey(overrides.text),
    bubbleStyle: overrides.bubbleStyle ?? "speech",
    anchor: overrides.anchor ?? "top-left",
    isActive: overrides.isActive ?? false,
    isContext: overrides.isContext ?? true,
    ...overrides,
  };
}

{
  const vineLine = "Vine por un café rápido antes de entrar.";
  const bubble = speechBubble({ text: vineLine });

  assert.equal(
    isSpeakableComicBubble({ phase: "breakdown", bubble }),
    true,
    "breakdown dialogue with speechTargetText is speakable"
  );
  assert.equal(
    shouldShowComicBubbleSpeak({ phase: "breakdown", bubble, isFocused: true }),
    true,
    "focused breakdown bubble should show Speak"
  );
  assert.equal(
    shouldShowComicBubbleSpeak({ phase: "breakdown", bubble, isFocused: false }),
    false,
    "non-focused breakdown bubble does not require inline Speak"
  );
}

{
  const board = getLessonStoryboard("es-intro-coffee-stranger-03");
  assert.ok(board);
  const scene = board!.scenes.find((s) => s.id === "real-2-pace");
  assert.ok(scene);

  const breakdownBubbles = getVisibleComicBreakdownBubbles(scene!, {
    tier: "real",
    showCaption: false,
  });
  const vineKey = getComicBubbleCompletionKey("Vine por un café rápido antes de entrar.");
  const vineBubble = breakdownBubbles.find((b) => b.completionKey === vineKey);
  assert.ok(vineBubble, "vine breakdown bubble exists on real-2-pace scene");

  assert.equal(
    shouldShowComicBubbleSpeak({
      phase: "breakdown",
      bubble: vineBubble,
      isFocused: true,
    }),
    true,
    "Vine por un café… focused panel exposes Speak"
  );
  assert.ok(vineBubble.speechTargetText.includes("Vine por un café"));
  assert.ok(vineBubble.playText);
}

{
  const caption = speechBubble({
    text: "En la cafetería",
    bubbleStyle: "caption",
    speaker: "narration",
  });
  assert.equal(
    isSpeakableComicBubble({ phase: "exposure", bubble: caption }),
    false,
    "caption/narration bubbles are not speakable"
  );
  assert.equal(
    shouldShowComicBubbleSpeak({ phase: "exposure", bubble: caption, isFocused: true }),
    false
  );
}

{
  const exposureBubble = speechBubble({ text: "Sí, total." });
  assert.equal(
    shouldShowComicBubbleSpeak({
      phase: "exposure",
      bubble: exposureBubble,
      isFocused: true,
    }),
    true,
    "exposure dialogue bubbles remain speakable"
  );
}

{
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
}

console.log("comic-bubble-controls.test.ts: all assertions passed");
