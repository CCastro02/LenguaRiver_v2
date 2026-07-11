/**
 * Run: `npx tsx lib/comic-dynamic-page-height.test.ts`
 */
import assert from "node:assert/strict";

import {
  buildComicDynamicHeightKey,
  calculateComicExtraHeight,
  clampComicExtraHeight,
  COMIC_EXTRA_HEIGHT_EPSILON_PX,
  COMIC_EXTRA_HEIGHT_ROUND_PX,
  COMIC_PAGE_EDGE_PAD_PX,
  COMIC_PAGE_EXTRA_HEIGHT_PADDING_PX,
  COMIC_PAGE_MAX_EXTRA_HEIGHT_PX,
  comicBubbleNeedsScrollFallbackAfterGrow,
  roundComicExtraHeight,
  stabilizeComicExtraHeight,
} from "./comic-dynamic-page-height";

{
  const extra = calculateComicExtraHeight({
    bubbleBottomPx: 400,
    basePanelHeightPx: 460,
  });
  assert.equal(extra, 0, "bubble within panel needs no extra height");
}

{
  const extra = calculateComicExtraHeight({
    bubbleBottomPx: 532,
    basePanelHeightPx: 460,
    edgePadPx: COMIC_PAGE_EDGE_PAD_PX,
    extraPaddingPx: COMIC_PAGE_EXTRA_HEIGHT_PADDING_PX,
  });
  const overflow = 532 - (460 - COMIC_PAGE_EDGE_PAD_PX);
  assert.ok(extra >= overflow + COMIC_PAGE_EXTRA_HEIGHT_PADDING_PX - 1);
  assert.ok(extra >= 80, "80px overflow should request meaningful extra height");
  assert.equal(extra % COMIC_EXTRA_HEIGHT_ROUND_PX, 0, "extra height is rounded to grid");
}

{
  const extra = calculateComicExtraHeight({
    bubbleBottomPx: 2000,
    basePanelHeightPx: 460,
    maxExtraHeightPx: COMIC_PAGE_MAX_EXTRA_HEIGHT_PX,
  });
  assert.equal(extra, COMIC_PAGE_MAX_EXTRA_HEIGHT_PX, "extra height clamps to max");
}

{
  const preview = calculateComicExtraHeight({
    bubbleBottomPx: 900,
    basePanelHeightPx: 460,
    isFocusedBubble: false,
  });
  assert.equal(preview, 0, "preview bubbles do not grow the page");
}

{
  const focused = calculateComicExtraHeight({
    bubbleBottomPx: 520,
    basePanelHeightPx: 460,
    isFocusedBubble: true,
  });
  assert.ok(focused > 0, "focused bubble overflow triggers growth");
}

{
  assert.equal(roundComicExtraHeight(73), 80);
  assert.equal(clampComicExtraHeight(999), COMIC_PAGE_MAX_EXTRA_HEIGHT_PX);
}

{
  const growOnly = stabilizeComicExtraHeight({
    measuredExtraPx: 40,
    currentExtraPx: 96,
    allowShrink: false,
  });
  assert.equal(growOnly, 96, "grow-only keeps current height when measurement shrinks");

  const grow = stabilizeComicExtraHeight({
    measuredExtraPx: 120,
    currentExtraPx: 80,
    allowShrink: false,
  });
  assert.equal(grow, 120, "grow-only allows meaningful increases");

  const hysteresis = stabilizeComicExtraHeight({
    measuredExtraPx: 88,
    currentExtraPx: 80,
    allowShrink: false,
    epsilonPx: COMIC_EXTRA_HEIGHT_EPSILON_PX,
  });
  assert.equal(hysteresis, 80, "small increases below epsilon are ignored");
}

{
  const keyA = buildComicDynamicHeightKey({
    navResetKey: "lesson-1",
    sceneId: "scene-1",
    phase: "active_recall",
    panelIndex: 0,
    focusedBubbleId: "b1",
    hintOpen: false,
    answerRevealed: false,
  });
  const keyB = buildComicDynamicHeightKey({
    navResetKey: "lesson-1",
    sceneId: "scene-1",
    phase: "active_recall",
    panelIndex: 0,
    focusedBubbleId: "b1",
    hintOpen: true,
    answerRevealed: false,
  });
  assert.notEqual(keyA, keyB, "hint visibility changes layout key");
}

{
  const fitsAfterGrow = comicBubbleNeedsScrollFallbackAfterGrow(
    {
      bubbleBottomPx: 500,
      basePanelHeightPx: 460,
      extraHeightPx: 80,
    },
    { shiftY: 20, needsScrollFallback: true }
  );
  assert.equal(fitsAfterGrow, false, "no scroll when growth + shift fit bubble");

  const stillOverflow = comicBubbleNeedsScrollFallbackAfterGrow(
    {
      bubbleBottomPx: 1100,
      basePanelHeightPx: 460,
      extraHeightPx: COMIC_PAGE_MAX_EXTRA_HEIGHT_PX,
    },
    { shiftY: 220, needsScrollFallback: true }
  );
  assert.equal(stillOverflow, true, "scroll only when max growth and shift exhausted");
}

console.log("comic-dynamic-page-height.test.ts: ok");
