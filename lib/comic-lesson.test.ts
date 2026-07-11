/**
 * Run: `npx tsx lib/comic-lesson.test.ts`
 */
import assert from "node:assert/strict";

import { buildComicBubbles, bubblePageRect } from "./comic-bubble-layout";
import {
  comicBubbleTextsMatch,
  getComicBubbleCompletionKey,
  getComicBubbleSpeechTargetText,
  normalizeComicBubbleText,
} from "./comic-bubble-text";
import { buildInlineBlankParts } from "./comic-inline-blank";
import { getComicBubbleRetryState } from "./comic-bubble-retry";
import { COFFEE_SHOP_DIALOGUE } from "./coffee-shop-story-dialogue";
import { shouldUseComicLesson, COMIC_LESSON_IDS } from "./comic-lesson";
import {
  getComicExposureGateAlignment,
  isComicExposureComplete,
} from "./comic-exposure-gate";
import { buildVisibleComicBubblesForPhase } from "./comic-visible-bubbles";
import {
  getComicActiveRecallBubbleActiveText,
  resolveComicActiveRecallTask,
} from "./comic-active-recall-prompt";
import { getComicPanelRegions, panelSlotsForLayout } from "./comic-panel-layout";
import { shouldRenderComicLesson } from "./lesson-display-mode";
import { getLessonStoryboard } from "./lesson-storyboards";
import type { LessonSceneStep } from "./lesson-storyboard-types";
import { lessons } from "./lesson-data";
import { filterPracticeChunks, shouldExcludeChunkFromPractice } from "./lesson-chunk-filter";

const sampleScene: LessonSceneStep = {
  id: "easy-1-arrival",
  order: 1,
  semanticGoal: "Ask if a chair is free",
  sourceType: "generated",
  hintStrength: "strong",
  comicLayout: "three_strip",
  panels: [
    {
      speaker: "learner",
      text: "Perdón, ¿este asiento está ocupado?",
      bubbleStyle: "speech",
      position: "top-left",
      panelSlot: "panel-1",
      placement: { x: 10, y: 20, width: 80 },
    },
    {
      speaker: "stranger",
      text: "Sí, claro, siéntate.",
      bubbleStyle: "speech",
      position: "top-right",
      panelSlot: "panel-3",
      placement: { x: 8, y: 18, width: 84 },
    },
  ],
};

assert.equal(shouldUseComicLesson("es-intro-coffee-stranger", sampleScene), true);
assert.equal(COMIC_LESSON_IDS.has("es-intro-coffee-stranger-02"), true);
assert.equal(COMIC_LESSON_IDS.has("es-cafe-ordering-v1"), true);
assert.equal(shouldUseComicLesson("es-cafe-ordering-v1", sampleScene), true);
assert.equal(shouldUseComicLesson("es-intro-coffee-stranger", null), false);
assert.equal(shouldUseComicLesson("other-lesson", sampleScene), false);

assert.equal(
  shouldRenderComicLesson({
    lessonDisplayMode: "comic",
    lessonId: "es-intro-coffee-stranger",
    scene: sampleScene,
  }),
  true
);
assert.equal(
  shouldRenderComicLesson({
    lessonDisplayMode: "classic",
    lessonId: "es-intro-coffee-stranger",
    scene: sampleScene,
  }),
  false
);
assert.equal(
  shouldRenderComicLesson({
    lessonDisplayMode: "comic",
    lessonId: "es-intro-coffee-stranger",
    scene: null,
  }),
  false
);

assert.equal(
  normalizeComicBubbleText("Perdón, ¿este asiento... está ocupado?"),
  "Perdón, ¿este asiento está ocupado?"
);
assert.equal(normalizeComicBubbleText("Eh... largo, pero bien."), "Eh... largo, pero bien.");
assert.ok(
  comicBubbleTextsMatch(
    "Perdón, ¿este asiento... está ocupado?",
    "Perdón, ¿este asiento está ocupado?"
  )
);

const bubbles = buildComicBubbles(sampleScene, "Sí, claro, siéntate.");
assert.equal(bubbles.find((b) => b.text === "Sí, claro, siéntate.")?.isActive, true);
assert.equal(bubbles.find((b) => b.text.startsWith("Perdón"))?.isActive, false);
assert.ok(bubbles.length <= 3, "should cap visible bubbles");

const truncatedActive = buildComicBubbles(
  sampleScene,
  "Perdón, ¿este asiento... está ocupado?",
  { showAllPanels: true }
);
const activeBubble = truncatedActive.find((b) => b.isActive);
assert.equal(activeBubble?.text, "Perdón, ¿este asiento está ocupado?");

const allPanels = buildComicBubbles(sampleScene, "Perdón, ¿este asiento está ocupado?", {
  showAllPanels: true,
});
assert.ok(allPanels.length >= 2, "showAllPanels should include scene dialogue");
assert.equal(
  allPanels.find((b) => b.text === "Perdón, ¿este asiento está ocupado?")?.isActive,
  true
);
for (const bubble of allPanels) {
  assert.ok(bubble.text.length > 0, "visible bubble should have text");
}

const twoPanelScene: LessonSceneStep = {
  id: "test-two-bubbles",
  order: 1,
  semanticGoal: "Busy cafe chat",
  sourceType: "generated",
  hintStrength: "light",
  comicLayout: "three_strip",
  panels: [
    {
      speaker: "learner",
      text: "Sí, total.",
      bubbleStyle: "speech",
      panelSlot: "panel-1",
    },
    {
      speaker: "stranger",
      text: "Yo igual, siempre corriendo.",
      bubbleStyle: "speech",
      panelSlot: "panel-2",
    },
  ],
};

const twoPanelBubbles = buildComicBubbles(twoPanelScene, null, { showAllPanels: true });
assert.equal(twoPanelBubbles.length, 2);
for (const panel of twoPanelScene.panels!) {
  const bubble = twoPanelBubbles.find((b) => b.completionKey === getComicBubbleCompletionKey(panel.text));
  assert.ok(bubble, `expected bubble for ${panel.text}`);
  assert.equal(bubble.text, getComicBubbleSpeechTargetText(panel.text));
  assert.equal(bubble.playText, bubble.text);
  assert.equal(bubble.speechTargetText, bubble.text);
  assert.equal(bubble.completionKey, bubble.speechTargetText);
}
const completionKeys = new Set(twoPanelBubbles.map((b) => b.completionKey));
assert.equal(completionKeys.size, 2, "each bubble should have a unique completion key");
for (const bubble of twoPanelBubbles) {
  const otherTexts = twoPanelBubbles
    .filter((b) => b.id !== bubble.id)
    .map((b) => b.speechTargetText)
    .join(" ");
  assert.ok(
    !bubble.speechTargetText.includes(otherTexts) && !otherTexts.includes(bubble.speechTargetText),
    "speech target must not combine neighboring panel text"
  );
}

const ellipsisPanel = "Está a tope hoy, ¿no?";
const priorPanel = "No, no, siéntate.";
const combinedLesson = "No, no, siéntate. Está a tope hoy, ¿no?";
const ellipsisScene: LessonSceneStep = {
  ...twoPanelScene,
  panels: [
    { speaker: "stranger", text: priorPanel, bubbleStyle: "speech", panelSlot: "panel-1" },
    { speaker: "stranger", text: ellipsisPanel, bubbleStyle: "speech", panelSlot: "panel-2" },
  ],
};
const ellipsisBubbles = buildComicBubbles(ellipsisScene, combinedLesson, {
  showAllPanels: true,
});
const topeBubble = ellipsisBubbles.find((b) => b.speechTargetText === ellipsisPanel);
assert.ok(topeBubble, "ellipsis bubble should keep exact panel copy");
assert.equal(topeBubble.speechTargetText, ellipsisPanel);
assert.notEqual(topeBubble.speechTargetText, combinedLesson);
assert.notEqual(topeBubble.completionKey, combinedLesson);

const blank = buildInlineBlankParts("Perdón, ¿este asiento está ____?");
assert.equal(blank.hasBlank, true);
assert.equal(blank.prefix, "Perdón, ¿este asiento está ");
assert.equal(blank.suffix, "?");
const noTarget = buildInlineBlankParts("Hola");
assert.equal(noTarget.hasBlank, false);
assert.equal(noTarget.prefix, "Hola");

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
    typingChecked: true,
    typingStatus: "correct",
    voiceComplete: true,
    speechEvalOk: true,
  }),
  { showRetryButton: false, retryKind: null }
);

const panelTwoRect = bubblePageRect("three_strip", "panel-2", { x: 50, y: 40, width: 60 });
assert.ok(panelTwoRect);
const regionTwo = getComicPanelRegions("three_strip")["panel-2"]!;
assert.equal(panelTwoRect.left, regionTwo.left + (regionTwo.width * 50) / 100);
assert.equal(panelTwoRect.top, regionTwo.top + (regionTwo.height * 40) / 100);

const fallbackRect = bubblePageRect(undefined, "panel-1", { x: 10, y: 10 });
assert.equal(fallbackRect, null);

const noSlotScene: LessonSceneStep = {
  ...sampleScene,
  comicLayout: undefined,
  panels: [
    {
      speaker: "learner",
      text: "Hola",
      bubbleStyle: "speech",
      position: "top-left",
    },
  ],
};
const fallbackBubbles = buildComicBubbles(noSlotScene, "Hola");
assert.equal(fallbackBubbles.length, 1);
assert.equal(fallbackBubbles[0]?.anchor, "top-left");

{
  const board03 = getLessonStoryboard("es-intro-coffee-stranger-03");
  assert.ok(board03);
  const exposureScene03 = board03!.scenes.find((s) => s.phaseKeys.includes("exposure"));
  assert.ok(exposureScene03);
  const exposureAlignment = getComicExposureGateAlignment({
    scene: exposureScene03!,
    phase: "exposure",
    tier: "real",
    showCaption: false,
    showAllPanels: true,
    activeText: null,
  });
  const comicKeys = exposureAlignment.requiredKeys;
  const visibleBubbles = buildVisibleComicBubblesForPhase({
    scene: exposureScene03!,
    phase: "exposure",
    tier: "real",
    showCaption: false,
    showAllPanels: true,
    activeText: null,
  });
  assert.deepEqual(
    visibleBubbles.map((b) => b.completionKey),
    exposureAlignment.visibleBubbles.map((b) => b.completionKey)
  );
  const sitBubble = visibleBubbles.find((b) => b.speechTargetText === "No, no, siéntate.");
  if (sitBubble) {
    assert.ok(comicKeys.includes(sitBubble.completionKey));
  } else {
    assert.ok(!comicKeys.some((k) => k.includes("siéntate")));
  }
  const hiddenLessonLine =
    "Sí, total. Vine por un café rápido antes de entrar; vengo del intercambiador y paro dos minutos.";
  assert.ok(!comicKeys.includes(hiddenLessonLine));
  const shadow: Record<string, { hasPlayedAudio: boolean; hasSpoken: boolean }> = {};
  for (const key of comicKeys) {
    shadow[key] = { hasPlayedAudio: true, hasSpoken: true };
  }
  assert.equal(isComicExposureComplete(comicKeys, shadow, true), true);
}

for (const board of [
  getLessonStoryboard("es-intro-coffee-stranger"),
  getLessonStoryboard("es-intro-coffee-stranger-02"),
  getLessonStoryboard("es-intro-coffee-stranger-03"),
  getLessonStoryboard("es-cafe-ordering-v1"),
]) {
  assert.ok(board, "expected coffee storyboard");
  for (const scene of board!.scenes) {
    assert.ok(scene.comicLayout, `${scene.id} missing comicLayout`);
    const validSlots = new Set(panelSlotsForLayout(scene.comicLayout!));
    for (const panel of scene.panels ?? []) {
      if (panel.panelSlot) {
        assert.ok(
          validSlots.has(panel.panelSlot),
          `${scene.id} invalid panelSlot ${panel.panelSlot} for ${scene.comicLayout}`
        );
      }
    }
  }
}

for (const [tier, scenes] of Object.entries(COFFEE_SHOP_DIALOGUE)) {
  for (const [filename, spec] of Object.entries(scenes)) {
    assert.ok(spec.layout, `${tier}/${filename} missing layout`);
    for (const panel of spec.panels) {
      assert.ok(panel.panelSlot, `${tier}/${filename}: panel missing panelSlot`);
      assert.ok(panel.placement, `${tier}/${filename}: panel missing placement`);
    }
  }
}

{
  const lesson03 = lessons.find((lesson) => lesson.id === "es-intro-coffee-stranger-03");
  assert.ok(lesson03, "expected coffee lesson 03");
  const practicePool = lesson03!.sentences.flatMap((sentence) =>
    filterPracticeChunks(sentence.words, {
      sentenceText: sentence.text,
      language: "es",
    })
  );
  assert.ok(
    practicePool.some((word) => word.text.toLowerCase().includes("me llamo")),
    "me llamo should remain in practice pool"
  );
  assert.ok(
    !practicePool.some((word) => normalizeAnswer(word.text) === "andres"),
    "Andrés must not be a practice chunk in lesson 03"
  );
  const andresWord = lesson03!.sentences
    .flatMap((sentence) => sentence.words)
    .find((word) => word.text.toLowerCase().includes("andres"));
  if (andresWord) {
    assert.equal(
      shouldExcludeChunkFromPractice(andresWord, {
        sentenceText: lesson03!.sentences.find((s) => s.text.startsWith("Andrés"))?.text,
        language: "es",
      }),
      true
    );
  }

  const board = getLessonStoryboard("es-intro-coffee-stranger-03");
  assert.ok(board);
  const namesScene = board!.scenes.find((scene) => scene.id === "real-4-names");
  assert.ok(namesScene, "expected real-4-names scene");
  const andresSentence = lesson03!.sentences.find((sentence) =>
    sentence.text.startsWith("Andrés")
  );
  assert.ok(andresSentence, "expected Andrés sentence in lesson 03");
  const recallBubbles = buildVisibleComicBubblesForPhase({
    scene: namesScene!,
    phase: "active_recall",
    tier: "real",
    showCaption: false,
    showAllPanels: false,
    activeText: andresSentence!.text,
  });
  assert.ok(
    !recallBubbles.some((bubble) => bubble.speechTargetText.trim() === "Andrés."),
    "Andrés. must not be a standalone active recall practice bubble"
  );
  assert.ok(
    comicBubbleTextsMatch("Andrés.", andresSentence!.text) === false,
    "name-only panel must not bind to longer Andrés-prefixed sentence"
  );

  const lauraSentence = lesson03!.sentences.find((sentence) =>
    sentence.text.includes("Me llamo Laura")
  );
  assert.ok(lauraSentence, "expected Laura sentence");
  assert.equal(
    getComicActiveRecallBubbleActiveText({
      type: "chunk-to-meaning",
      prompt: "me llamo",
      expectedParts: ["my", "name", "is"],
      sentenceText: lauraSentence!.text,
      targetChunks: [{ text: "me llamo", translation: "my name is" }],
    }),
    "me llamo"
  );
  const lauraRecallBubbles = buildVisibleComicBubblesForPhase({
    scene: namesScene!,
    phase: "active_recall",
    tier: "real",
    showCaption: false,
    showAllPanels: false,
    activeText: "me llamo",
  });
  const lauraActive = lauraRecallBubbles.find((bubble) => bubble.isActive);
  assert.ok(lauraActive, "expected active bubble for me llamo chunk");
  assert.equal(lauraActive!.text, "me llamo");
  assert.notEqual(lauraActive!.text, lauraSentence!.text);

  const perdónSentence = lesson03!.sentences[0];
  const perdónTask = resolveComicActiveRecallTask({
    type: "full-sentence-recall",
    prompt: perdónSentence.translation,
    expectedParts: ["perdón"],
    sentenceText: perdónSentence.text,
    targetLanguage: "es",
    targetChunks: perdónSentence.words.map((word) => ({
      text: word.text,
      translation: word.translation,
    })),
  });
  assert.equal(perdónTask.taskType, "chunk-target");
  assert.doesNotMatch(perdónTask.instruction, /full sentence/i);
  assert.equal(getComicActiveRecallBubbleActiveText({
    type: "full-sentence-recall",
    prompt: perdónSentence.translation,
    expectedParts: ["perdón"],
    sentenceText: perdónSentence.text,
    targetChunks: perdónSentence.words.map((word) => ({
      text: word.text,
      translation: word.translation,
    })),
  }), "perdón");
}

{
  const cafeLesson = lessons.find((lesson) => lesson.id === "es-cafe-ordering-v1");
  assert.ok(cafeLesson, "expected Spanish Café Scene lesson");
  assert.equal(cafeLesson!.language, "es");
  assert.equal(cafeLesson!.title, "At the Café");
  assert.equal(cafeLesson!.topic, "Ordering Food");
  assert.equal(cafeLesson!.tier, "easy");
  assert.ok(
    cafeLesson!.sentences.some((sentence) => sentence.text === "Quiero un café, por favor."),
    "lesson should teach ordering coffee politely"
  );
  assert.ok(
    cafeLesson!.coreWords.includes("quiero ___"),
    "lesson should expose the reusable ordering pattern"
  );
  const allChunks = cafeLesson!.sentences
    .flatMap((sentence) => sentence.words.map((word) => word.text.toLowerCase()));
  for (const expectedChunk of [
    "¿cómo estás?",
    "estoy ___",
    "quiero ___",
    "por favor",
    "aquí tiene",
    "muchas gracias",
  ]) {
    assert.ok(allChunks.includes(expectedChunk), `missing café lesson chunk: ${expectedChunk}`);
  }

  const board = getLessonStoryboard("es-cafe-ordering-v1");
  assert.ok(board, "expected Spanish Café Scene storyboard");
  assert.equal(board!.scenes.length, 3);
  assert.deepEqual(
    board!.scenes.map((scene) => scene.id),
    ["cafe-1-meeting", "cafe-2-ordering", "cafe-3-receiving"]
  );
  assert.ok(
    board!.scenes.every((scene) => !scene.imageUrl),
    "v1 should not require newly generated image assets"
  );
  assert.ok(
    board!.scenes.some((scene) => scene.panels?.some((panel) => panel.text === "Quiero un café, por favor.")),
    "storyboard should include the key ordering line"
  );
}

function normalizeAnswer(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

console.log("comic-lesson.test.ts: ok");
