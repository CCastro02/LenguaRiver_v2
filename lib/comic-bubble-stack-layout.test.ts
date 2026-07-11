/**
 * Run: `npx tsx lib/comic-bubble-stack-layout.test.ts`
 */
import assert from "node:assert/strict";

import { bubblePageRect } from "./comic-bubble-layout";
import {
  COMIC_STACK_MIN_GAP_PX,
  estimateComicBubbleHeightPx,
  layoutStackedComicBubbles,
  type ComicBubbleStackInput,
} from "./comic-bubble-stack-layout";
import { panelsForCoffeeScene } from "./coffee-shop-story-dialogue";
import type { LessonSceneStep } from "./lesson-storyboard-types";

const PANEL_W = 600;
const PANEL_H = 460;

function stackInput(
  partial: Partial<ComicBubbleStackInput> & Pick<ComicBubbleStackInput, "bubbleId" | "bubbleIndex" | "desiredRect">
): ComicBubbleStackInput {
  const isFocused = partial.isFocused ?? false;
  return {
    panelSlot: "panel-3",
    isFocused,
    estimatedHeightPx:
      partial.estimatedHeightPx ??
      estimateComicBubbleHeightPx({ isFocused }),
    ...partial,
  };
}

function topsDoNotOverlap(outputs: ReturnType<typeof layoutStackedComicBubbles>): boolean {
  const sorted = [...outputs].sort((a, b) => a.top - b.top);
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]!;
    const next = sorted[i]!;
    const prevHeight =
      prev.displayMode === "focused"
        ? estimateComicBubbleHeightPx({ isFocused: true })
        : estimateComicBubbleHeightPx({ isFocused: false });
    const prevBottom = (prev.top / 100) * PANEL_H + prevHeight + COMIC_STACK_MIN_GAP_PX;
    const nextTop = (next.top / 100) * PANEL_H;
    if (nextTop < prevBottom - 0.5) {
      return false;
    }
  }
  return true;
}

{
  const inputs: ComicBubbleStackInput[] = [
    stackInput({
      bubbleId: "a",
      bubbleIndex: 0,
      desiredRect: { left: 52, top: 48, width: 22 },
      estimatedHeightPx: 150,
      isFocused: true,
    }),
    stackInput({
      bubbleId: "b",
      bubbleIndex: 1,
      desiredRect: { left: 52, top: 50, width: 22 },
      estimatedHeightPx: 72,
      isFocused: false,
    }),
  ];
  const out = layoutStackedComicBubbles({
    bubbles: inputs,
    panelBoundsPx: { width: PANEL_W, height: PANEL_H },
  });
  assert.equal(out.length, 2);
  assert.ok(topsDoNotOverlap(out), "two bubbles in same track must not overlap");
  assert.equal(out.find((b) => b.bubbleId === "a")?.displayMode, "focused");
  assert.equal(out.find((b) => b.bubbleId === "b")?.displayMode, "preview");
}

{
  const inputs: ComicBubbleStackInput[] = [
    stackInput({ bubbleId: "a", bubbleIndex: 0, desiredRect: { left: 10, top: 40, width: 30 }, isFocused: true }),
    stackInput({ bubbleId: "b", bubbleIndex: 1, desiredRect: { left: 10, top: 42, width: 30 } }),
    stackInput({ bubbleId: "c", bubbleIndex: 2, desiredRect: { left: 10, top: 44, width: 30 } }),
  ];
  const out = layoutStackedComicBubbles({
    bubbles: inputs,
    panelBoundsPx: { width: PANEL_W, height: PANEL_H },
  });
  assert.equal(out.length, 3);
  assert.ok(topsDoNotOverlap(out), "three bubbles enforce minimum vertical gap");
  assert.equal(out.filter((b) => b.displayMode === "preview").length, 2);
  assert.equal(out.find((b) => b.bubbleIndex === 0)?.displayMode, "focused");
}

{
  const inputs: ComicBubbleStackInput[] = [
    stackInput({
      bubbleId: "a",
      bubbleIndex: 0,
      desiredRect: { left: 52, top: 70, width: 22 },
      isFocused: false,
    }),
    stackInput({
      bubbleId: "b",
      bubbleIndex: 1,
      desiredRect: { left: 52, top: 72, width: 22 },
      isFocused: true,
      estimatedHeightPx: 150,
    }),
  ];
  const out = layoutStackedComicBubbles({
    bubbles: inputs,
    panelBoundsPx: { width: PANEL_W, height: PANEL_H },
  });
  const focused = out.find((b) => b.bubbleIndex === 1)!;
  assert.equal(focused.displayMode, "focused");
  assert.ok(focused.zIndex > out.find((b) => b.bubbleIndex === 0)!.zIndex);
}

{
  const tallStack: ComicBubbleStackInput[] = Array.from({ length: 4 }, (_, i) =>
    stackInput({
      bubbleId: `b${i}`,
      bubbleIndex: i,
      desiredRect: { left: 52, top: 55 + i, width: 22 },
      isFocused: i === 3,
      estimatedHeightPx: i === 3 ? 150 : 72,
    })
  );
  const out = layoutStackedComicBubbles({
    bubbles: tallStack,
    panelBoundsPx: { width: PANEL_W, height: PANEL_H },
  });
  assert.ok(out.some((b) => b.shifted), "overflow should shift group upward");
  assert.ok(
    (out[out.length - 1]!.top / 100) * PANEL_H + 150 <= PANEL_H + 40,
    "focused bubble should fit after upward shift (within tolerance)"
  );
}

{
  const inputs: ComicBubbleStackInput[] = [
    stackInput({ bubbleId: "a", bubbleIndex: 0, desiredRect: { left: 52, top: 30, width: 22 } }),
    stackInput({ bubbleId: "b", bubbleIndex: 1, desiredRect: { left: 52, top: 55, width: 22 } }),
  ];
  const out = layoutStackedComicBubbles({
    bubbles: inputs,
    panelBoundsPx: { width: PANEL_W, height: PANEL_H },
  });
  assert.equal(out.every((b) => b.clickable), true);
  assert.equal(out.every((b) => b.stacked), true);
}

{
  const inputs: ComicBubbleStackInput[] = [
    stackInput({ bubbleId: "a", bubbleIndex: 0, desiredRect: { left: 52, top: 20, width: 22 } }),
    stackInput({ bubbleId: "b", bubbleIndex: 1, desiredRect: { left: 52, top: 50, width: 22 } }),
  ];
  const out = layoutStackedComicBubbles({
    bubbles: inputs,
    panelBoundsPx: { width: PANEL_W, height: PANEL_H },
  });
  assert.equal(out[0]!.bubbleIndex, 0);
  assert.equal(out[1]!.bubbleIndex, 1);
}

{
  const inputs: ComicBubbleStackInput[] = [
    stackInput({ bubbleId: "a", bubbleIndex: 0, desiredRect: { left: 52, top: 20, width: 22 } }),
    stackInput({ bubbleId: "b", bubbleIndex: 1, desiredRect: { left: 52, top: 58, width: 22 } }),
  ];
  const out = layoutStackedComicBubbles({
    bubbles: inputs,
    panelBoundsPx: { width: PANEL_W, height: PANEL_H },
  });
  assert.equal(out[0]!.shifted, false);
  assert.equal(out[1]!.shifted, false);
  assert.ok(Math.abs(out[0]!.top - 20) < 0.01);
  assert.ok(Math.abs(out[1]!.top - 58) < 0.01);
}

{
  const exposureScene: LessonSceneStep = {
    id: "real-1-arrival",
    order: 1,
    semanticGoal: "Arrival",
    sourceType: "generated",
    hintStrength: "light",
    comicLayout: "wide_top",
    panels: panelsForCoffeeScene("real", "/images/lesson-scenes/coffee-shop/real/scene-01-arrival.png"),
  };
  const sitPanel = exposureScene.panels!.find((p) => p.text === "No, no, siéntate.")!;
  const packedPanel = exposureScene.panels!.find((p) => p.text === "Está a tope hoy, ¿no?")!;
  const sitRect = bubblePageRect(exposureScene.comicLayout, sitPanel.panelSlot, sitPanel.placement)!;
  const packedRect = bubblePageRect(
    exposureScene.comicLayout,
    packedPanel.panelSlot,
    packedPanel.placement
  )!;
  const out = layoutStackedComicBubbles({
    bubbles: [
      {
        bubbleId: "sit",
        bubbleIndex: 1,
        panelSlot: sitPanel.panelSlot,
        desiredRect: { left: sitRect.left, top: sitRect.top, width: sitRect.width },
        estimatedHeightPx: estimateComicBubbleHeightPx({ isFocused: true }),
        isFocused: true,
      },
      {
        bubbleId: "packed",
        bubbleIndex: 2,
        panelSlot: packedPanel.panelSlot,
        desiredRect: { left: packedRect.left, top: packedRect.top, width: packedRect.width },
        estimatedHeightPx: estimateComicBubbleHeightPx({ isFocused: false }),
        isFocused: false,
      },
    ],
    panelBoundsPx: { width: PANEL_W, height: PANEL_H },
  });
  const sitOut = out.find((b) => b.bubbleId === "sit")!;
  const packedOut = out.find((b) => b.bubbleId === "packed")!;
  assert.ok(packedOut.top > sitOut.top + 8, "coffee-shop right bubbles must separate vertically");
  assert.ok(topsDoNotOverlap(out));
}

console.log("comic-bubble-stack-layout.test.ts: ok");
