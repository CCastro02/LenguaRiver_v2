/**
 * Run: `npx tsx lib/comic-panel-layout.test.ts`
 */
import assert from "node:assert/strict";

import {
  getComicPanelRegions,
  panelSlotsForLayout,
} from "./comic-panel-layout";

function regionsOverlap(
  a: { left: number; top: number; width: number; height: number },
  b: { left: number; top: number; width: number; height: number }
): boolean {
  const aRight = a.left + a.width;
  const aBottom = a.top + a.height;
  const bRight = b.left + b.width;
  const bBottom = b.top + b.height;
  const overlapX = a.left < bRight && aRight > b.left;
  const overlapY = a.top < bBottom && aBottom > b.top;
  return overlapX && overlapY;
}

function assertWithinPercentBounds(region: {
  left: number;
  top: number;
  width: number;
  height: number;
}): void {
  assert.ok(region.left >= 0 && region.left <= 100, `left out of range: ${region.left}`);
  assert.ok(region.top >= 0 && region.top <= 100, `top out of range: ${region.top}`);
  assert.ok(region.width > 0 && region.left + region.width <= 100.5, "width out of range");
  assert.ok(region.height > 0 && region.top + region.height <= 100.5, "height out of range");
}

const threeStrip = getComicPanelRegions("three_strip");
assert.equal(Object.keys(threeStrip).length, 3);
for (const region of Object.values(threeStrip)) {
  assertWithinPercentBounds(region!);
}
const stripSlots = panelSlotsForLayout("three_strip");
for (let i = 0; i < stripSlots.length; i++) {
  for (let j = i + 1; j < stripSlots.length; j++) {
    assert.equal(
      regionsOverlap(threeStrip[stripSlots[i]!]!, threeStrip[stripSlots[j]!]!),
      false,
      `${stripSlots[i]} overlaps ${stripSlots[j]}`
    );
  }
}

const fourGrid = getComicPanelRegions("four_grid");
assert.equal(Object.keys(fourGrid).length, 4);
for (const region of Object.values(fourGrid)) {
  assertWithinPercentBounds(region!);
}

const wideTop = getComicPanelRegions("wide_top");
assert.equal(Object.keys(wideTop).length, 3);
for (const region of Object.values(wideTop)) {
  assertWithinPercentBounds(region!);
}

assert.equal(Object.keys(getComicPanelRegions("two_plus_one")).length, 3);
assert.equal(panelSlotsForLayout("two_plus_one").length, 3);

console.log("comic-panel-layout.test.ts: ok");
