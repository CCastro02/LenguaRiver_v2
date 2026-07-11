/**
 * Run: `npx tsx lib/comic-practice-drawer.test.ts`
 */
import assert from "node:assert/strict";

import type { ComicBubbleView } from "./comic-bubble-layout";
import {
  comicBubbleFeedbackIsCompactOnly,
  COMIC_BREAKDOWN_DRAWER_ONLY_KEYS,
  getComicPracticeDrawerTitle,
  getPracticeDrawerBubble,
  shouldShowComicPracticeDrawer,
} from "./comic-practice-drawer";
import { buildVisibleComicBubblesForPhase } from "./comic-visible-bubbles";
import { getLessonStoryboard } from "./lesson-storyboards";

assert.equal(shouldShowComicPracticeDrawer("breakdown", { hasPracticeContent: true }), true);
assert.equal(shouldShowComicPracticeDrawer("breakdown", { hasPracticeContent: false }), false);
assert.equal(shouldShowComicPracticeDrawer("exposure"), false);
assert.equal(shouldShowComicPracticeDrawer("active_recall", { hasAnswerHints: true }), false);
assert.equal(shouldShowComicPracticeDrawer("active_recall", { hasAnswerHints: false }), false);
assert.equal(
  shouldShowComicPracticeDrawer("active_recall", { hasPracticeContent: true }),
  false
);
assert.equal(
  shouldShowComicPracticeDrawer("active_recall", {
    needsLayoutFallback: true,
    hasAnswerHints: true,
  }),
  true
);
assert.equal(shouldShowComicPracticeDrawer("reinforcement", { hasAnswerHints: true }), true);

assert.equal(comicBubbleFeedbackIsCompactOnly("breakdown"), true);
assert.equal(comicBubbleFeedbackIsCompactOnly("exposure"), true);
assert.equal(comicBubbleFeedbackIsCompactOnly("active_recall"), false);
assert.equal(
  comicBubbleFeedbackIsCompactOnly("active_recall", { drawerOwnsPracticeUi: true }),
  true
);

assert.ok(COMIC_BREAKDOWN_DRAWER_ONLY_KEYS.includes("translation"));
assert.ok(COMIC_BREAKDOWN_DRAWER_ONLY_KEYS.includes("chunkPractice"));

const sampleBubbles: ComicBubbleView[] = [
  {
    id: "a",
    speaker: "learner",
    text: "Line A",
    speechTargetText: "Line A",
    playText: "Line A",
    completionKey: "line-a",
    bubbleStyle: "speech",
    anchor: "top-left",
    isActive: false,
    isContext: false,
  },
  {
    id: "b",
    speaker: "stranger",
    text: "Line B",
    speechTargetText: "Line B",
    playText: "Line B",
    completionKey: "line-b",
    bubbleStyle: "speech",
    anchor: "top-right",
    isActive: false,
    isContext: false,
  },
];

assert.equal(getPracticeDrawerBubble(sampleBubbles, 0)?.completionKey, "line-a");
assert.equal(getPracticeDrawerBubble(sampleBubbles, 1)?.completionKey, "line-b");
assert.equal(getPracticeDrawerBubble(sampleBubbles, 99)?.completionKey, "line-b");

assert.equal(getComicPracticeDrawerTitle(sampleBubbles[0]!), "Line A");
assert.equal(getComicPracticeDrawerTitle(sampleBubbles[0]!, "active_recall"), "Answer help");

{
  const board = getLessonStoryboard("es-intro-coffee-stranger-03");
  assert.ok(board);
  const scene = board!.scenes.find((s) => s.id === "real-2-pace");
  assert.ok(scene);
  const bubbles = buildVisibleComicBubblesForPhase({
    scene: scene!,
    phase: "breakdown",
    tier: "real",
    showAllPanels: true,
    activeText: null,
  });
  assert.equal(bubbles.length, 3);
  const panel0 = getPracticeDrawerBubble(bubbles, 0);
  const panel1 = getPracticeDrawerBubble(bubbles, 1);
  assert.notEqual(panel0?.completionKey, panel1?.completionKey);
  assert.equal(
    getPracticeDrawerBubble(bubbles, 2)?.completionKey,
    bubbles[2]!.completionKey
  );
}

console.log("comic-practice-drawer.test.ts: ok");
