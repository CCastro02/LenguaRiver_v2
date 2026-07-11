/**
 * Run: `npx tsx lib/lesson-display-mode.test.ts`
 */
import assert from "node:assert/strict";

import { shouldRenderComicLesson } from "./lesson-display-mode";
import type { LessonSceneStep } from "./lesson-storyboard-types";

const sampleScene: LessonSceneStep = {
  id: "easy-1-arrival",
  order: 1,
  semanticGoal: "Ask if a chair is free",
  sourceType: "generated",
  hintStrength: "strong",
  panels: [
    {
      speaker: "learner",
      text: "Perdón, ¿este asiento está ocupado?",
      bubbleStyle: "speech",
      position: "top-left",
    },
  ],
};

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
  shouldRenderComicLesson({
    lessonDisplayMode: "comic",
    lessonId: "other-lesson",
    scene: sampleScene,
  }),
  false
);

console.log("lesson-display-mode.test.ts: ok");
