/** Padding from comic page edges when clamping bubble position (percent of page). */
export const COMIC_BUBBLE_PAGE_PAD_PCT = 2;

/** Minimum focused bubble height (px): sentence + Play + Speak + status. */
export const COMIC_FOCUSED_BUBBLE_MIN_HEIGHT_PX = 150;

/** Minimum focused bubble height (px) when inline input + Check are shown. */
export const COMIC_FOCUSED_BUBBLE_RECALL_MIN_HEIGHT_PX = 220;

/** Minimum focused bubble height (px) when Try again is shown. */
export const COMIC_FOCUSED_BUBBLE_RETRY_MIN_HEIGHT_PX = 200;

export type FocusedComicBubbleContentEstimate = {
  minHeightPx: number;
  /** Approximate height as % of a 460px comic panel (matches home-dashboard.css). */
  heightPercentOnDefaultPanel: number;
};

/**
 * Estimates minimum focused bubble height from visible controls.
 * Runtime safe-bounds uses DOM getBoundingClientRect after layout; this supports tests/checklists.
 */
export function estimateFocusedComicBubbleContent(
  options?: { hasInlineInput?: boolean; hasRetry?: boolean },
  panelHeightPx = 460
): FocusedComicBubbleContentEstimate {
  let minHeightPx = COMIC_FOCUSED_BUBBLE_MIN_HEIGHT_PX;
  if (options?.hasInlineInput) {
    minHeightPx = COMIC_FOCUSED_BUBBLE_RECALL_MIN_HEIGHT_PX;
  } else if (options?.hasRetry) {
    minHeightPx = COMIC_FOCUSED_BUBBLE_RETRY_MIN_HEIGHT_PX;
  }
  const heightPercentOnDefaultPanel =
    panelHeightPx > 0 ? (minHeightPx / panelHeightPx) * 100 : minHeightPx;
  return { minHeightPx, heightPercentOnDefaultPanel };
}

export type ComicBubblePagePosition = {
  topPercent: number;
  leftPercent: number;
  widthPercent: number;
  heightPercent: number;
};

export type ComicBubbleSafeBoundsResult = {
  topPercent: number;
  leftPercent: number;
  /** How much the bubble was shifted upward (percent of page). */
  shiftUpPercent: number;
  /** How much the bubble was shifted left (percent of page). */
  shiftLeftPercent: number;
  /** True when the bubble still overflows vertically after max upward shift. */
  needsScrollFallback: boolean;
};

/**
 * Keeps a page-positioned bubble rectangle inside the comic page.
 * Used for pre-layout estimates in tests; runtime uses DOM measurement in LessonComicPanel.
 */
export function adjustComicBubblePageBounds(
  position: ComicBubblePagePosition,
  options?: { padPercent?: number; minTopPercent?: number }
): ComicBubbleSafeBoundsResult {
  const pad = options?.padPercent ?? COMIC_BUBBLE_PAGE_PAD_PCT;
  const minTop = options?.minTopPercent ?? pad;
  const maxBottom = 100 - pad;
  const maxRight = 100 - pad;
  const minLeft = pad;

  let top = position.topPercent;
  let left = position.leftPercent;
  let shiftUp = 0;
  let shiftLeft = 0;

  const bottom = top + position.heightPercent;
  const right = left + position.widthPercent;

  if (right > maxRight) {
    shiftLeft = right - maxRight;
    left = Math.max(minLeft, left - shiftLeft);
  }

  if (bottom > maxBottom) {
    shiftUp = bottom - maxBottom;
    top = Math.max(minTop, top - shiftUp);
    shiftUp = position.topPercent - top;
  }

  const finalBottom = top + position.heightPercent;
  const needsScrollFallback = finalBottom > maxBottom + 0.25;

  return {
    topPercent: top,
    leftPercent: left,
    shiftUpPercent: shiftUp,
    shiftLeftPercent: shiftLeft,
    needsScrollFallback,
  };
}

export type ComicBubblePixelShift = {
  shiftX: number;
  shiftY: number;
  needsScrollFallback: boolean;
};

/**
 * Computes pixel translate to keep a focused bubble inside its panel container.
 * Callers should pass getBoundingClientRect() values after layout so bubbleBottom
 * reflects the full auto height (sentence + actions + status), not a CSS max-height cap.
 *
 * Layout priority (see LessonComicPanel + calculateComicExtraHeight):
 * 1. Keep bubble near intended panel position
 * 2. Grow panel via --lr-comic-extra-height when bubble overflows
 * 3. Apply this upward/inward shift when still needed
 * 4. Internal scroll fallback only when max growth + max shift are exhausted
 */
export function computeComicBubblePixelShift(
  panelHeight: number,
  panelWidth: number,
  bubbleTop: number,
  bubbleLeft: number,
  bubbleBottom: number,
  bubbleRight: number,
  padPx = 8
): ComicBubblePixelShift {
  if (panelHeight <= 0 || panelWidth <= 0) {
    return { shiftX: 0, shiftY: 0, needsScrollFallback: false };
  }

  let shiftY = 0;
  let shiftX = 0;

  if (bubbleBottom > panelHeight - padPx) {
    shiftY = bubbleBottom - (panelHeight - padPx);
  }
  if (bubbleRight > panelWidth - padPx) {
    shiftX = bubbleRight - (panelWidth - padPx);
  }
  if (bubbleLeft < padPx) {
    const leftShift = bubbleLeft - padPx;
    if (Math.abs(leftShift) > Math.abs(shiftX)) {
      shiftX = leftShift;
    }
  }

  const maxShiftUp = Math.max(0, bubbleTop - padPx);
  if (shiftY > maxShiftUp) {
    const overflowAfterShift = bubbleBottom - maxShiftUp - (panelHeight - padPx);
    return {
      shiftX,
      shiftY: maxShiftUp,
      needsScrollFallback: overflowAfterShift > 1,
    };
  }

  return { shiftX, shiftY, needsScrollFallback: false };
}

export function mergeComicBubbleTransform(
  baseTransform: string | undefined,
  shiftX: number,
  shiftY: number
): string | undefined {
  const translate =
    shiftX !== 0 || shiftY !== 0 ? `translate(${-shiftX}px, ${-shiftY}px)` : "";
  const base = baseTransform && baseTransform !== "none" ? baseTransform : "";
  const parts = [translate, base].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : undefined;
}
