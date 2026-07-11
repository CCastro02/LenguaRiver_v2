import type { ComicLayoutName, ComicPanelSlot } from "./lesson-storyboard-types";

export type { ComicLayoutName, ComicPanelSlot };

/** Panel bounds as percentages of the full comic page image (0–100). */
export type ComicPanelRegion = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Source image dimensions used by the scene generator (see generate-coffee-shop-story-scenes.py). */
const PAGE_W = 1024;
const PAGE_H = 576;
const PAGE_MARGIN = 10;
const GUTTER = 8;

type PixelRect = { left: number; top: number; right: number; bottom: number };

function toPercentRect(rect: PixelRect): ComicPanelRegion {
  return {
    left: (rect.left / PAGE_W) * 100,
    top: (rect.top / PAGE_H) * 100,
    width: ((rect.right - rect.left) / PAGE_W) * 100,
    height: ((rect.bottom - rect.top) / PAGE_H) * 100,
  };
}

/** Mirrors `draw_panel_layout` in the Python scene generator. */
export function getComicPanelRegions(
  layout: ComicLayoutName
): Partial<Record<ComicPanelSlot, ComicPanelRegion>> {
  const m = PAGE_MARGIN;
  const g = GUTTER;
  const innerW = PAGE_W - 2 * m;
  const innerH = PAGE_H - 2 * m;

  const slots: Partial<Record<ComicPanelSlot, ComicPanelRegion>> = {};

  if (layout === "three_strip") {
    const pw = (innerW - 2 * g) / 3;
    slots["panel-1"] = toPercentRect({ left: m, top: m, right: m + pw, bottom: m + innerH });
    slots["panel-2"] = toPercentRect({
      left: m + pw + g,
      top: m,
      right: m + 2 * pw + g,
      bottom: m + innerH,
    });
    slots["panel-3"] = toPercentRect({
      left: m + 2 * pw + 2 * g,
      top: m,
      right: m + innerW,
      bottom: m + innerH,
    });
    return slots;
  }

  if (layout === "two_plus_one") {
    const bigW = innerW * 0.52;
    const halfH = (innerH - g) / 2;
    slots["panel-1"] = toPercentRect({ left: m, top: m, right: m + bigW, bottom: m + innerH });
    slots["panel-2"] = toPercentRect({
      left: m + bigW + g,
      top: m,
      right: m + innerW,
      bottom: m + halfH,
    });
    slots["panel-3"] = toPercentRect({
      left: m + bigW + g,
      top: m + halfH + g,
      right: m + innerW,
      bottom: m + innerH,
    });
    return slots;
  }

  if (layout === "four_grid") {
    const pw = (innerW - g) / 2;
    const ph = (innerH - g) / 2;
    slots["panel-1"] = toPercentRect({ left: m, top: m, right: m + pw, bottom: m + ph });
    slots["panel-2"] = toPercentRect({
      left: m + pw + g,
      top: m,
      right: m + innerW,
      bottom: m + ph,
    });
    slots["panel-3"] = toPercentRect({
      left: m,
      top: m + ph + g,
      right: m + pw,
      bottom: m + innerH,
    });
    slots["panel-4"] = toPercentRect({
      left: m + pw + g,
      top: m + ph + g,
      right: m + innerW,
      bottom: m + innerH,
    });
    return slots;
  }

  // wide_top
  const topH = innerH * 0.42;
  const halfW = (innerW - g) / 2;
  slots["panel-1"] = toPercentRect({ left: m, top: m, right: m + innerW, bottom: m + topH });
  slots["panel-2"] = toPercentRect({
    left: m,
    top: m + topH + g,
    right: m + halfW,
    bottom: m + innerH,
  });
  slots["panel-3"] = toPercentRect({
    left: m + halfW + g,
    top: m + topH + g,
    right: m + innerW,
    bottom: m + innerH,
  });
  return slots;
}

export function panelSlotsForLayout(layout: ComicLayoutName): ComicPanelSlot[] {
  const regions = getComicPanelRegions(layout);
  return (["panel-1", "panel-2", "panel-3", "panel-4"] as const).filter(
    (slot) => regions[slot] != null
  );
}
