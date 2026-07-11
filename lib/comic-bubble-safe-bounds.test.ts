/**
 * Run: `npx tsx lib/comic-bubble-safe-bounds.test.ts`
 */
import assert from "node:assert/strict";

import { bubblePageRect } from "./comic-bubble-layout";
import {
  adjustComicBubblePageBounds,
  COMIC_FOCUSED_BUBBLE_MIN_HEIGHT_PX,
  COMIC_FOCUSED_BUBBLE_RECALL_MIN_HEIGHT_PX,
  computeComicBubblePixelShift,
  estimateFocusedComicBubbleContent,
  mergeComicBubbleTransform,
} from "./comic-bubble-safe-bounds";
import { buildVisibleComicBubblesForPhase } from "./comic-visible-bubbles";
import { getLessonStoryboard } from "./lesson-storyboards";

{
  const adjusted = adjustComicBubblePageBounds({
    topPercent: 72,
    leftPercent: 8,
    widthPercent: 30,
    heightPercent: 32,
  });
  assert.ok(adjusted.shiftUpPercent > 0, "should shift up when bottom overflows");
  assert.equal(adjusted.needsScrollFallback, false);
  assert.ok(adjusted.topPercent + 32 <= 98.5, "bottom should stay inside padded page");
}

{
  const tall = adjustComicBubblePageBounds({
    topPercent: 4,
    leftPercent: 10,
    widthPercent: 28,
    heightPercent: 97,
  });
  assert.equal(tall.topPercent, 2, "cannot shift above min top pad");
  assert.equal(tall.needsScrollFallback, true, "very tall bubble needs scroll fallback");
}

{
  const shift = computeComicBubblePixelShift(
    400,
    600,
    320,
    20,
    420,
    580,
    8
  );
  assert.equal(shift.shiftY, 28);
  assert.equal(shift.needsScrollFallback, false);
}

{
  const shift = computeComicBubblePixelShift(320, 600, 8, 20, 400, 580, 8);
  assert.ok(shift.needsScrollFallback, "cannot fit after max upward shift");
}

assert.equal(
  mergeComicBubbleTransform("rotate(0.4deg)", 12, 8),
  "translate(-12px, -8px) rotate(0.4deg)"
);

{
  const defaultEstimate = estimateFocusedComicBubbleContent();
  assert.equal(defaultEstimate.minHeightPx, COMIC_FOCUSED_BUBBLE_MIN_HEIGHT_PX);
  assert.ok(
    defaultEstimate.minHeightPx >= 150,
    "focused bubble content estimate covers sentence + actions + status"
  );

  const recallEstimate = estimateFocusedComicBubbleContent({ hasInlineInput: true });
  assert.equal(recallEstimate.minHeightPx, COMIC_FOCUSED_BUBBLE_RECALL_MIN_HEIGHT_PX);
  assert.ok(recallEstimate.minHeightPx > defaultEstimate.minHeightPx);
}

{
  const board = getLessonStoryboard("es-intro-coffee-stranger-03");
  const scene = board?.scenes.find((s) => s.id === "real-2-pace");
  assert.ok(scene);
  const vine = buildVisibleComicBubblesForPhase({
    scene: scene!,
    phase: "breakdown",
    tier: "real",
    showAllPanels: true,
    activeText: null,
  }).find((b) => b.text.includes("Vine por un café"));
  assert.ok(vine);
  const rect = bubblePageRect(scene!.comicLayout, vine.panelSlot, vine.placement);
  assert.ok(rect);
  const { heightPercentOnDefaultPanel } = estimateFocusedComicBubbleContent();
  const adjusted = adjustComicBubblePageBounds({
    topPercent: rect.top,
    leftPercent: rect.left,
    widthPercent: rect.width,
    heightPercent: heightPercentOnDefaultPanel,
  });
  assert.ok(
    adjusted.topPercent <= rect.top,
    "vine bubble should shift up when estimated tall"
  );
}

{
  const panelHeight = 460;
  const bubbleHeight = COMIC_FOCUSED_BUBBLE_MIN_HEIGHT_PX;
  const bubbleTop = panelHeight - bubbleHeight + 20;
  const shift = computeComicBubblePixelShift(
    panelHeight,
    600,
    bubbleTop,
    20,
    bubbleTop + bubbleHeight,
    580,
    8
  );
  assert.equal(shift.shiftY, 28, "measured bubble bottom should drive upward shift");
  assert.equal(shift.needsScrollFallback, false);
}

console.log("comic-bubble-safe-bounds.test.ts: ok");
