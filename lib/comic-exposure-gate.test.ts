/**
 * Run: `npx tsx lib/comic-exposure-gate.test.ts`
 */
import assert from "node:assert/strict";

import { bubblePageRect } from "./comic-bubble-layout";
import {
  COMIC_EXPOSURE_BLOCKED_MESSAGE,
  getComicExposureBlockedDebugNote,
  getComicExposureGateAlignment,
  getRequiredComicExposureKeys,
  isComicExposureComplete,
} from "./comic-exposure-gate";
import { getComicBubbleCompletionKey } from "./comic-bubble-text";
import { getRequiredComicExposureKeysForScene } from "./comic-exposure-gate";
import { getLessonStoryboard } from "./lesson-storyboards";
import { panelsForCoffeeScene } from "./coffee-shop-story-dialogue";
import type { LessonSceneStep } from "./lesson-storyboard-types";

const keySeat = getComicBubbleCompletionKey("Perdón, ¿este asiento... está ocupado?");
const keySit = getComicBubbleCompletionKey("No, no, siéntate.");
const keyPacked = getComicBubbleCompletionKey("Está a tope hoy, ¿no?");

const exposureBubbles = [
  {
    completionKey: keySeat,
    speechTargetText: keySeat,
    bubbleStyle: "speech" as const,
    speaker: "learner" as const,
  },
  {
    completionKey: keySit,
    speechTargetText: keySit,
    bubbleStyle: "speech" as const,
    speaker: "stranger" as const,
  },
  {
    completionKey: keyPacked,
    speechTargetText: keyPacked,
    bubbleStyle: "speech" as const,
    speaker: "stranger" as const,
  },
];

const requiredKeys = getRequiredComicExposureKeys(exposureBubbles);
assert.deepEqual(requiredKeys, [keySeat, keySit, keyPacked]);

// 1. Two visible required keys, both accepted → complete true
{
  const twoKeyBubbles = exposureBubbles.slice(0, 2);
  const keys = getRequiredComicExposureKeys(twoKeyBubbles);
  const shadow = {
    [keySeat]: { hasSpoken: true, accepted: true },
    [keySit]: { completed: true },
  };
  assert.equal(isComicExposureComplete(keys, shadow, true), true);
}

// 2. Two visible required keys, one missing → complete false
{
  const keys = getRequiredComicExposureKeys(exposureBubbles.slice(0, 2));
  const shadow = {
    [keySeat]: { hasSpoken: true },
  };
  assert.equal(isComicExposureComplete(keys, shadow, true), false);
}

// 3. Hidden classic lesson sentence not in requiredKeys does not block completion
{
  const hiddenLessonSentence =
    "Sí, total. Vine por un café rápido antes de entrar; vengo del intercambiador y paro dos minutos.";
  const shadow = {
    [keySeat]: { hasSpoken: true },
    [keySit]: { hasSpoken: true },
    [keyPacked]: { status: "good" },
  };
  assert.equal(isComicExposureComplete(requiredKeys, shadow, true), true);
  assert.ok(!requiredKeys.includes(hiddenLessonSentence));
}

// 4. Empty requiredKeys → false
assert.equal(isComicExposureComplete([], {}, true), false);

// 5. Duplicate keys are deduped
{
  const duped = getRequiredComicExposureKeys([
    ...exposureBubbles.slice(0, 2),
    {
      completionKey: keySeat,
      speechTargetText: keySeat,
      bubbleStyle: "speech",
      speaker: "learner",
    },
  ]);
  assert.deepEqual(duped, [keySeat, keySit]);
}

// 6. accepted / completed / good status shapes match exposureShadowBySentence
{
  const keys = [keySeat, keySit];
  assert.equal(
    isComicExposureComplete(keys, { [keySeat]: { accepted: true }, [keySit]: { completed: true } }, true),
    true
  );
  assert.equal(
    isComicExposureComplete(keys, { [keySeat]: { status: "good" }, [keySit]: { hasSpoken: true } }, true),
    true
  );
  assert.equal(
    isComicExposureComplete(keys, { [keySeat]: { status: "not-tried" }, [keySit]: { hasSpoken: true } }, true),
    false
  );
}

assert.equal(COMIC_EXPOSURE_BLOCKED_MESSAGE, "Finish the required comic bubbles first");

// Gate keys equal rendered visible required bubble keys
const exposureScene: LessonSceneStep = {
  id: "real-1-arrival",
  order: 1,
  semanticGoal: "Ask if seat is free",
  sourceType: "generated",
  hintStrength: "light",
  comicLayout: "wide_top",
  panels: panelsForCoffeeScene("real", "/images/lesson-scenes/coffee-shop/real/scene-01-arrival.png"),
};
const alignment = getComicExposureGateAlignment({
  scene: exposureScene,
  phase: "exposure",
  tier: "real",
  showCaption: false,
  showAllPanels: true,
  activeText: null,
});
assert.deepEqual(alignment.requiredKeys, getRequiredComicExposureKeysForScene(exposureScene, {
  tier: "real",
  showCaption: false,
}));
for (const key of alignment.requiredKeys) {
  assert.ok(
    alignment.visibleBubbles.some((bubble) => bubble.completionKey === key),
    `required key must be visible: ${key}`
  );
}
assert.equal(alignment.visibleBubbles.length, alignment.requiredKeys.length);
assert.equal(alignment.requiredKeys.length, 3);

const sitBubble = alignment.visibleBubbles.find((b) => b.completionKey === keySit);
const packedBubble = alignment.visibleBubbles.find((b) => b.completionKey === keyPacked);
assert.ok(sitBubble && packedBubble, "sit and packed lines must be visible bubbles");
const sitRect = bubblePageRect(exposureScene.comicLayout, sitBubble.panelSlot, sitBubble.placement);
const packedRect = bubblePageRect(
  exposureScene.comicLayout,
  packedBubble.panelSlot,
  packedBubble.placement
);
assert.ok(sitRect && packedRect);
assert.notEqual(sitRect.top, packedRect.top, "stacked stranger bubbles must not share placement");

{
  const board = getLessonStoryboard("es-intro-coffee-stranger-03");
  assert.ok(board);
  const scene = board!.scenes.find((s) => s.phaseKeys.includes("exposure"));
  assert.ok(scene);
  const coffeeAlignment = getComicExposureGateAlignment({
    scene: scene!,
    phase: "exposure",
    tier: "real",
    showCaption: false,
    showAllPanels: true,
    activeText: null,
  });
  assert.equal(coffeeAlignment.visibleBubbles.length, 3);
  assert.equal(coffeeAlignment.requiredKeys.length, 3);
  assert.ok(coffeeAlignment.visibleBubbles.some((b) => b.completionKey === keySit));
  assert.ok(coffeeAlignment.requiredKeys.includes(keySit));
  assert.ok(coffeeAlignment.visibleBubbles.some((k) => k.completionKey.includes("asiento")));
}

assert.equal(
  getComicExposureBlockedDebugNote([keySit]),
  `Waiting on: ${keySit}`
);

console.log("comic-exposure-gate.test.ts: ok");
