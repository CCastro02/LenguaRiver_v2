/**
 * Run: `npx tsx lib/lesson-storyboard-resolver.test.ts`
 */
import assert from "node:assert/strict";

import { getLessonStoryboard } from "./lesson-storyboards";
import { filterScenesForPhase, getCurrentLessonScene } from "./lesson-storyboard-resolver";
import type { LessonSceneStep } from "./lesson-storyboard-types";

assert.equal(getCurrentLessonScene({ lessonId: "lesson-1", phase: "exposure" }), null);

const easyBoard = getLessonStoryboard("es-intro-coffee-stranger");
assert.ok(easyBoard);

const exposureOnlyScenes: LessonSceneStep[] = [
  {
    id: "only-exposure",
    order: 1,
    semanticGoal: "Exposure only",
    phaseKeys: ["exposure"],
    sourceType: "fallback",
    hintStrength: "strong",
  },
  {
    id: "only-breakdown",
    order: 2,
    semanticGoal: "Breakdown only",
    phaseKeys: ["breakdown"],
    sourceType: "fallback",
    hintStrength: "strong",
  },
];
const noPhaseMatchPool = filterScenesForPhase(exposureOnlyScenes, "reinforcement");
assert.equal(noPhaseMatchPool[0]?.id, "only-exposure");

const easyFirstInPhase = getCurrentLessonScene({
  lessonId: "es-intro-coffee-stranger",
  phase: "breakdown",
});
assert.equal(easyFirstInPhase?.id, "easy-2-greeting");

const easyExposure = getCurrentLessonScene({
  lessonId: "es-intro-coffee-stranger",
  phase: "exposure",
});
assert.ok(easyExposure);
assert.equal(easyExposure.id, "easy-1-arrival");
assert.equal(easyExposure.phaseKeys?.includes("exposure"), true);

const easyRecall = getCurrentLessonScene({
  lessonId: "es-intro-coffee-stranger",
  phase: "active_recall",
});
assert.ok(easyRecall);
assert.equal(easyRecall.id, "easy-4-names");

for (const scene of easyBoard.scenes) {
  assert.equal(scene.hintStrength, "strong");
  assert.ok(scene.imageUrl?.startsWith("/images/lesson-scenes/coffee-shop/easy/"));
  assert.equal(scene.sourceType, "generated");
  assert.ok(scene.panels && scene.panels.length > 0, `easy scene ${scene.id} should have comic panels`);
  assert.ok(scene.sentenceKeys && scene.sentenceKeys.length > 0);
  assert.equal(scene.sentenceKeys?.[0], scene.panels?.[0]?.text);
}

const mediumBoard = getLessonStoryboard("es-intro-coffee-stranger-02");
assert.ok(mediumBoard);
for (const scene of mediumBoard.scenes) {
  assert.equal(scene.hintStrength, "medium");
  assert.ok(scene.imageUrl?.startsWith("/images/lesson-scenes/coffee-shop/medium/"));
  assert.equal(scene.sourceType, "generated");
  assert.ok(scene.panels && scene.panels.length >= 1);
}

const realBoard = getLessonStoryboard("es-intro-coffee-stranger-03");
assert.ok(realBoard);
for (const scene of realBoard.scenes) {
  assert.equal(scene.hintStrength, "light");
  assert.ok(scene.imageUrl?.startsWith("/images/lesson-scenes/coffee-shop/real/"));
  assert.equal(scene.sourceType, "generated");
  assert.ok(scene.panels && scene.panels.length >= 1);
  assert.ok(scene.panels.length <= 4, "real tier allows up to 4 panel utterances");
}

const deterministicA = getCurrentLessonScene({
  lessonId: "es-intro-coffee-stranger",
  phase: "exposure",
  exerciseIndex: 1,
});
const deterministicB = getCurrentLessonScene({
  lessonId: "es-intro-coffee-stranger",
  phase: "exposure",
  exerciseIndex: 1,
});
assert.deepEqual(deterministicA, deterministicB);
assert.equal(deterministicA?.id, "easy-2-greeting");

console.log("lesson-storyboard-resolver.test.ts: ok");
