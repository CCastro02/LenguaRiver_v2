/**
 * Debug CLI: print computed bubble page rects for a coffee-shop scene.
 * Run: `npx tsx scripts/debug-bubble-positions.ts`
 */
import { bubblePageRect } from "../lib/comic-bubble-layout";
import { buildVisibleComicBubblesForPhase } from "../lib/comic-visible-bubbles";
import { getLessonStoryboard } from "../lib/lesson-storyboards";

const board = getLessonStoryboard("es-intro-coffee-stranger-03");
if (!board) {
  throw new Error("Missing real-tier storyboard");
}

const scene = board.scenes.find((s) => s.id === "real-1-arrival");
if (!scene) {
  throw new Error("Missing real-1-arrival scene");
}

const bubbles = buildVisibleComicBubblesForPhase({
  scene,
  phase: "exposure",
  tier: board.tier,
  showAllPanels: true,
  activeText: null,
});

for (const b of bubbles) {
  const r = bubblePageRect(scene.comicLayout, b.panelSlot, b.placement);
  console.log(JSON.stringify({ text: b.text, slot: b.panelSlot, placement: b.placement, rect: r }));
}
