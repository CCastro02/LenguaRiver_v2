/**
 * Run: `npx tsx lib/comic-panel-navigation.test.ts`
 */
import assert from "node:assert/strict";

import {
  canGoToNextComicPanel,
  canGoToPreviousComicPanel,
  clampComicPanelIndex,
  clampComicPanelIndexAfterCountChange,
  comicPanelNavLabel,
  getComicPanelIndexAfterNavReset,
  getComicPanelNavResetKey,
  getComicPanelNavBubbleRenderMetadata,
  getComicPanelNavCountMismatchWarning,
  getInitialComicPanelIndex,
  getNextComicPanelIndex,
  getPreviousComicPanelIndex,
  shouldFocusComicPanelFromBubbleClick,
  shouldResetComicPanelIndex,
  shouldSyncComicPanelToActiveText,
} from "./comic-panel-navigation";

const bubbles = [
  { text: "Perdón, ¿este asiento está ocupado?" },
  { text: "Sí, claro, siéntate." },
  { text: "Gracias." },
];

assert.equal(clampComicPanelIndex(-1, 3), 0);
assert.equal(clampComicPanelIndex(5, 3), 2);
assert.equal(clampComicPanelIndex(1, 0), 0);

assert.equal(getInitialComicPanelIndex([], "hola"), 0);
assert.equal(getInitialComicPanelIndex(bubbles, null), 0);
assert.equal(
  getInitialComicPanelIndex(bubbles, "Sí, claro, siéntate."),
  1
);
assert.equal(
  getInitialComicPanelIndex(
    [{ text: "Hola", sentenceKey: "s1" }],
    "s1"
  ),
  0
);
assert.equal(getInitialComicPanelIndex(bubbles, "unknown line"), 0);

assert.equal(getPreviousComicPanelIndex(0, 3), 0);
assert.equal(getPreviousComicPanelIndex(2, 3), 1);
assert.equal(getNextComicPanelIndex(0, 3), 1);
assert.equal(getNextComicPanelIndex(1, 3), 2);
assert.equal(getNextComicPanelIndex(2, 3), 2);

assert.equal(canGoToPreviousComicPanel(0), false);
assert.equal(canGoToPreviousComicPanel(1), true);
assert.equal(canGoToNextComicPanel(0, 3), true);
assert.equal(canGoToNextComicPanel(2, 3), false);
assert.equal(canGoToNextComicPanel(0, 1), false);

assert.equal(comicPanelNavLabel(0, 3), "Panel 1 of 3");
assert.equal(comicPanelNavLabel(1, 3), "Panel 2 of 3");
assert.equal(comicPanelNavLabel(2, 3), "Panel 3 of 3");
assert.equal(comicPanelNavLabel(5, 3), "Panel 3 of 3");

assert.equal(canGoToPreviousComicPanel(0), false);
assert.equal(canGoToNextComicPanel(0, 3), true);
assert.equal(canGoToPreviousComicPanel(1), true);
assert.equal(canGoToNextComicPanel(1, 3), true);
assert.equal(canGoToPreviousComicPanel(2), true);
assert.equal(canGoToNextComicPanel(2, 3), false);

assert.equal(clampComicPanelIndexAfterCountChange(1, 3, 3), 1);
assert.equal(clampComicPanelIndexAfterCountChange(5, 3, 3), 5);
assert.equal(clampComicPanelIndexAfterCountChange(5, 3, 2), 1);

assert.equal(
  shouldSyncComicPanelToActiveText({ phase: "exposure", hasPanelNavigation: true }),
  false
);
assert.equal(
  shouldSyncComicPanelToActiveText({ phase: "breakdown", hasPanelNavigation: true }),
  false
);
assert.equal(
  shouldSyncComicPanelToActiveText({ phase: "active_recall", hasPanelNavigation: true }),
  true
);
assert.equal(
  shouldSyncComicPanelToActiveText({ phase: "reinforcement", hasPanelNavigation: false }),
  true
);

const exposureKey = getComicPanelNavResetKey({
  lessonId: "es-intro-coffee-stranger-03",
  sceneId: "real-1-arrival",
  phase: "exposure",
});
assert.equal(
  getComicPanelNavResetKey({
    lessonId: "es-intro-coffee-stranger-03",
    sceneId: "real-1-arrival",
    phase: "exposure",
  }),
  exposureKey
);
assert.equal(
  getComicPanelIndexAfterNavReset(bubbles, "Sí, claro, siéntate.", {
    phase: "exposure",
    hasPanelNavigation: true,
  }),
  0
);
assert.equal(
  getComicPanelIndexAfterNavReset(bubbles, "Sí, claro, siéntate.", {
    phase: "active_recall",
    hasPanelNavigation: true,
  }),
  1
);
assert.equal(shouldResetComicPanelIndex(exposureKey, exposureKey), false);
assert.equal(
  shouldResetComicPanelIndex(
    exposureKey,
    getComicPanelNavResetKey({
      lessonId: "es-intro-coffee-stranger-03",
      sceneId: "real-2-pace",
      phase: "exposure",
    })
  ),
  true
);
assert.equal(
  getComicPanelNavResetKey({
    lessonId: "es-intro-coffee-stranger-03",
    sceneId: "easy-4-names",
    phase: "active_recall",
    activeRecallExerciseId: "ex-1",
  }),
  "es-intro-coffee-stranger-03:easy-4-names:active_recall:ex-1"
);

assert.equal(shouldFocusComicPanelFromBubbleClick(false, true), true);
assert.equal(shouldFocusComicPanelFromBubbleClick(true, true), false);
assert.equal(shouldFocusComicPanelFromBubbleClick(false, false), false);

const panelNavMeta = getComicPanelNavBubbleRenderMetadata(3, true);
assert.equal(panelNavMeta.length, 3);
assert.equal(panelNavMeta.every((meta) => meta.clickable), true);
assert.equal(
  clampComicPanelIndex(
    panelNavMeta.find((meta) => meta.bubbleIndex === 2)!.bubbleIndex,
    panelNavMeta.length
  ),
  2
);

assert.equal(getComicPanelNavCountMismatchWarning(3, 3), null);
assert.ok(getComicPanelNavCountMismatchWarning(4, 3)?.includes("exceeds clickable"));

{
  let focusedIndex = 0;
  const focusAt = (index: number) => {
    focusedIndex = clampComicPanelIndex(index, bubbles.length);
  };
  assert.equal(shouldFocusComicPanelFromBubbleClick(false, true), true);
  focusAt(0);
  assert.equal(focusedIndex, 0);
  focusAt(2);
  assert.equal(focusedIndex, 2);
  assert.equal(getNextComicPanelIndex(1, bubbles.length), 2);
  assert.equal(comicPanelNavLabel(2, bubbles.length), "Panel 3 of 3");
}

console.log("comic-panel-navigation.test.ts: ok");
