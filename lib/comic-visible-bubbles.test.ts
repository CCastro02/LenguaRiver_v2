/**
 * Run: `npx tsx lib/comic-visible-bubbles.test.ts`
 */
import assert from "node:assert/strict";

import { bubblePageRect } from "./comic-bubble-layout";
import {
  comicPanelNavLabel,
  getComicPanelNavBubbleRenderMetadata,
} from "./comic-panel-navigation";
import { getComicBubbleCompletionKey } from "./comic-bubble-text";
import {
  layoutStackedComicBubbles,
} from "./comic-bubble-stack-layout";
import {
  buildComicBubbleStackInputs,
  buildVisibleComicBubblesForPhase,
  findComicBubbleIndexByCompletionKey,
  findLessonSentenceForComicBubble,
  getVisibleComicBreakdownBubbles,
  shouldUseStackedComicBubbleLayout,
  spreadOverlappingBubblePlacements,
} from "./comic-visible-bubbles";
import { panelsForCoffeeScene } from "./coffee-shop-story-dialogue";
import { getLessonStoryboard } from "./lesson-storyboards";
import type { LessonSceneStep } from "./lesson-storyboard-types";

{
  const board = getLessonStoryboard("es-intro-coffee-stranger-03");
  assert.ok(board);
  const scene = board!.scenes.find((s) => s.id === "real-2-pace");
  assert.ok(scene);

  const visibleBubbles = buildVisibleComicBubblesForPhase({
    scene: scene!,
    phase: "breakdown",
    tier: "real",
    showCaption: false,
    showAllPanels: true,
    activeText: null,
  });

  const alignmentExposureStyle = getVisibleComicBreakdownBubbles(scene!, {
    tier: "real",
    showCaption: false,
  });
  assert.deepEqual(
    visibleBubbles.map((b) => b.completionKey),
    alignmentExposureStyle.map((b) => b.completionKey)
  );

  assert.equal(visibleBubbles.length, 3);
  assert.equal(comicPanelNavLabel(0, visibleBubbles.length), "Panel 1 of 3");
  assert.equal(comicPanelNavLabel(2, visibleBubbles.length), "Panel 3 of 3");
  const navMeta = getComicPanelNavBubbleRenderMetadata(visibleBubbles.length, true);
  assert.equal(navMeta.length, visibleBubbles.length);
  assert.equal(navMeta.filter((meta) => meta.clickable).length, visibleBubbles.length);

  const keySit = getComicBubbleCompletionKey("Sí, total.");
  const keyVine = getComicBubbleCompletionKey("Vine por un café rápido antes de entrar.");
  assert.equal(findComicBubbleIndexByCompletionKey(visibleBubbles, keySit), 0);
  assert.equal(findComicBubbleIndexByCompletionKey(visibleBubbles, keyVine), 1);

  const sitBubble = visibleBubbles.find((b) => b.completionKey === keySit);
  const vineBubble = visibleBubbles.find((b) => b.completionKey === keyVine);
  assert.ok(sitBubble && vineBubble);
  const sitRect = bubblePageRect(scene!.comicLayout, sitBubble.panelSlot, sitBubble.placement);
  const vineRect = bubblePageRect(scene!.comicLayout, vineBubble.panelSlot, vineBubble.placement);
  assert.ok(sitRect && vineRect);
  assert.notEqual(sitRect.top, vineRect.top, "breakdown bubbles must not stack");

  const sentence = findLessonSentenceForComicBubble(sitBubble, [
    {
      text: "Sí, total. Vine por un café rápido antes de entrar; vengo del intercambiador y paro dos minutos.",
      translation: "Yeah, totally. I came for a quick coffee…",
      formality: "neutral",
      words: [],
    },
  ]);
  assert.ok(sentence?.text.includes("Sí, total"));
}

{
  const stackedScene: LessonSceneStep = {
    id: "stack-test",
    order: 1,
    semanticGoal: "test",
    sourceType: "generated",
    comicLayout: "three_strip",
    panels: [
      {
        speaker: "learner",
        text: "Line A",
        bubbleStyle: "speech",
        panelSlot: "panel-1",
        placement: { x: 8, y: 14, width: 84 },
      },
      {
        speaker: "learner",
        text: "Line B",
        bubbleStyle: "speech",
        panelSlot: "panel-1",
        placement: { x: 8, y: 14, width: 84 },
      },
    ],
  };
  const raw = buildVisibleComicBubblesForPhase({
    scene: stackedScene,
    phase: "breakdown",
    tier: "real",
    showAllPanels: true,
    activeText: null,
  });
  assert.equal(raw.length, 2);
  assert.notEqual(raw[0]!.placement?.y, raw[1]!.placement?.y, "pipeline should spread overlaps");
  const spread = spreadOverlappingBubblePlacements(raw, stackedScene.comicLayout);
  const a = bubblePageRect(stackedScene.comicLayout, spread[0]!.panelSlot, spread[0]!.placement);
  const b = bubblePageRect(stackedScene.comicLayout, spread[1]!.panelSlot, spread[1]!.placement);
  assert.ok(a && b);
  assert.notEqual(a.top, b.top);
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
  const exposureBubbles = buildVisibleComicBubblesForPhase({
    scene: exposureScene,
    phase: "exposure",
    tier: "real",
    showAllPanels: true,
    activeText: null,
  });
  assert.equal(exposureBubbles.length, 3);
  const exposureNavMeta = getComicPanelNavBubbleRenderMetadata(exposureBubbles.length, true);
  assert.equal(exposureNavMeta.length, exposureBubbles.length);
  assert.equal(exposureNavMeta.every((meta) => meta.clickable), true);

  const sitBubble = exposureBubbles.find((b) => b.text === "No, no, siéntate.");
  const packedBubble = exposureBubbles.find((b) => b.text === "Está a tope hoy, ¿no?");
  assert.ok(sitBubble && packedBubble, "right-side stranger bubbles must be visible");
  assert.equal(sitBubble.panelSlot, "panel-3");
  assert.equal(packedBubble.panelSlot, "panel-3");

  const sitRect = bubblePageRect(exposureScene.comicLayout, sitBubble.panelSlot, sitBubble.placement);
  const packedRect = bubblePageRect(
    exposureScene.comicLayout,
    packedBubble.panelSlot,
    packedBubble.placement
  );
  assert.ok(sitRect && packedRect);
  assert.ok(
    packedRect.top - sitRect.top >= 14,
    "right-side stranger bubbles must stay vertically separated on the page"
  );
  assert.ok(
    (sitBubble.placement?.y ?? 0) < (packedBubble.placement?.y ?? 0),
    "siéntate bubble should sit higher than the packed line"
  );

  assert.equal(
    shouldUseStackedComicBubbleLayout(exposureBubbles, exposureScene.comicLayout, {
      panelNavigation: true,
    }),
    true,
    "stacked mode activates when same panel has multiple bubbles"
  );
  const stackInputs = buildComicBubbleStackInputs(exposureBubbles, exposureScene.comicLayout, 0);
  const stackedLayout = layoutStackedComicBubbles({
    bubbles: stackInputs.map((input, index) => ({
      ...input,
      isFocused: index === 1,
      estimatedHeightPx: index === 1 ? 150 : 72,
    })),
    panelBoundsPx: { width: 600, height: 460 },
  });
  assert.equal(stackedLayout.length, exposureBubbles.length);
  assert.equal(
    stackedLayout.length,
    exposureNavMeta.length,
    "visible bubble count equals panel nav count"
  );
}

{
  const board = getLessonStoryboard("es-intro-coffee-stranger-03");
  assert.ok(board);
  const scene = board!.scenes.find((s) => s.id === "real-4-names");
  assert.ok(scene, "expected Names on the fly scene");

  const andresSentence =
    "Andrés. Ah, entonces curras media jornada, ¿no?";
  const activeRecallBubbles = buildVisibleComicBubblesForPhase({
    scene: scene!,
    phase: "active_recall",
    tier: "real",
    showCaption: false,
    showAllPanels: false,
    activeText: andresSentence,
  });

  assert.ok(
    !activeRecallBubbles.some((bubble) => bubble.speechTargetText === "Andrés."),
    "Andrés. must not appear as a visible active recall bubble"
  );
  assert.ok(
    activeRecallBubbles.every(
      (bubble) =>
        bubble.speechTargetText !== "Andrés." &&
        bubble.text !== "Andrés."
    ),
    "no name-only Andrés bubble in active recall"
  );
  assert.equal(
    activeRecallBubbles.filter((bubble) => bubble.bubbleStyle === "speech").length,
    activeRecallBubbles.filter((bubble) => bubble.speaker !== "narration").length,
    "panel nav count should exclude filtered name-only speech bubbles"
  );
}

console.log("comic-visible-bubbles.test.ts: ok");
