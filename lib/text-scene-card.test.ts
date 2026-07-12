/**
 * Run: `npx tsx lib/text-scene-card.test.ts`
 */
import assert from "node:assert/strict";

import { buildTextSceneCard } from "./text-scene-card";
import type { LessonSceneStep } from "./lesson-storyboard-types";

const textOnlyScene: LessonSceneStep = {
  id: "cafe-2-ordering",
  order: 2,
  title: "Ordering coffee",
  semanticGoal: "Order coffee politely with the pattern Quiero ___, por favor",
  sourceType: "fallback",
  hintStrength: "strong",
  comicLayout: "three_strip",
  panels: [],
};

const card = buildTextSceneCard(textOnlyScene, "At the Café");
assert.equal(card.icon, "☕");
assert.equal(card.eyebrow, "Text scene");
assert.equal(card.title, "Ordering coffee");
assert.equal(card.description, "Order coffee politely with the pattern Quiero ___, por favor");
assert.equal(card.ariaLabel, "Ordering coffee: Order coffee politely with the pattern Quiero ___, por favor");

const untitledScene: LessonSceneStep = {
  ...textOnlyScene,
  title: undefined,
  semanticGoal: "Understand a handoff phrase and thank the barista",
};
const fallbackCard = buildTextSceneCard(untitledScene, "At the Café");
assert.equal(fallbackCard.title, "At the Café");
assert.equal(fallbackCard.description, "Understand a handoff phrase and thank the barista");

const duplicateScene: LessonSceneStep = {
  ...textOnlyScene,
  title: "Ordering coffee",
  semanticGoal: "Ordering coffee",
};
const duplicateCard = buildTextSceneCard(duplicateScene, "At the Café");
assert.equal(duplicateCard.title, "Ordering coffee");
assert.equal(duplicateCard.description, "Watch the dialogue, then tap each bubble to understand the chunks.");

console.log("text-scene-card.test.ts: ok");
