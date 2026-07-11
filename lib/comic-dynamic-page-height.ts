/** Breathing room added below a focused bubble when growing the comic panel. */
export const COMIC_PAGE_EXTRA_HEIGHT_PADDING_PX = 16;

/** Upper bound on how much the comic main panel may grow vertically. */
export const COMIC_PAGE_MAX_EXTRA_HEIGHT_PX = 420;

/** Default inset from panel edges when checking bubble overflow (px). */
export const COMIC_PAGE_EDGE_PAD_PX = 8;

/** Ignore extra-height updates smaller than this (prevents subpixel oscillation). */
export const COMIC_EXTRA_HEIGHT_EPSILON_PX = 12;

/** Round extra height to this grid to avoid feedback loops. */
export const COMIC_EXTRA_HEIGHT_ROUND_PX = 8;

export type CalculateComicExtraHeightInput = {
  /** Distance from panel top to bubble bottom (px), before upward translate shift. */
  bubbleBottomPx: number;
  /** Panel height before dynamic extra height is applied (px). */
  basePanelHeightPx: number;
  edgePadPx?: number;
  extraPaddingPx?: number;
  maxExtraHeightPx?: number;
  /** Only the focused bubble should trigger page growth. */
  isFocusedBubble?: boolean;
};

export function roundComicExtraHeight(px: number): number {
  if (px <= 0) {
    return 0;
  }
  return Math.ceil(px / COMIC_EXTRA_HEIGHT_ROUND_PX) * COMIC_EXTRA_HEIGHT_ROUND_PX;
}

export function clampComicExtraHeight(
  px: number,
  maxExtraHeightPx = COMIC_PAGE_MAX_EXTRA_HEIGHT_PX
): number {
  return Math.max(0, Math.min(maxExtraHeightPx, px));
}

/**
 * Computes how much taller the comic main panel should grow so a focused bubble
 * is not clipped. Returns 0 when the bubble fits or when measuring a preview bubble.
 */
export function calculateComicExtraHeight(input: CalculateComicExtraHeightInput): number {
  if (input.isFocusedBubble === false) {
    return 0;
  }
  const base = input.basePanelHeightPx;
  if (base <= 0) {
    return 0;
  }
  const edgePad = input.edgePadPx ?? COMIC_PAGE_EDGE_PAD_PX;
  const extraPad = input.extraPaddingPx ?? COMIC_PAGE_EXTRA_HEIGHT_PADDING_PX;
  const maxExtra = input.maxExtraHeightPx ?? COMIC_PAGE_MAX_EXTRA_HEIGHT_PX;
  const overflow = input.bubbleBottomPx - (base - edgePad);
  if (overflow <= 1) {
    return 0;
  }
  return clampComicExtraHeight(
    roundComicExtraHeight(Math.ceil(overflow + extraPad)),
    maxExtra
  );
}

export type StabilizeComicExtraHeightInput = {
  measuredExtraPx: number;
  currentExtraPx: number;
  /** When false, only allow increases until the layout key changes. */
  allowShrink: boolean;
  epsilonPx?: number;
};

/**
 * Applies hysteresis and grow-only policy so panel height does not pulse between frames.
 */
export function stabilizeComicExtraHeight(input: StabilizeComicExtraHeightInput): number {
  const epsilon = input.epsilonPx ?? COMIC_EXTRA_HEIGHT_EPSILON_PX;
  const measured = clampComicExtraHeight(roundComicExtraHeight(input.measuredExtraPx));
  const current = clampComicExtraHeight(roundComicExtraHeight(input.currentExtraPx));

  if (!input.allowShrink) {
    if (measured <= current) {
      return current;
    }
    if (measured - current <= epsilon) {
      return current;
    }
    return measured;
  }

  if (Math.abs(measured - current) <= epsilon) {
    return current;
  }
  return measured;
}

export type ComicLayoutOverflowAfterGrowInput = {
  bubbleBottomPx: number;
  basePanelHeightPx: number;
  extraHeightPx: number;
  edgePadPx?: number;
};

/** True when the bubble still overflows after panel growth and max upward shift. */
export function comicBubbleNeedsScrollFallbackAfterGrow(
  input: ComicLayoutOverflowAfterGrowInput,
  shift: { shiftY: number; needsScrollFallback: boolean },
  maxExtraHeightPx = COMIC_PAGE_MAX_EXTRA_HEIGHT_PX
): boolean {
  const edgePad = input.edgePadPx ?? COMIC_PAGE_EDGE_PAD_PX;
  const effectiveHeight = input.basePanelHeightPx + input.extraHeightPx;
  const bottomAfterShift = input.bubbleBottomPx - shift.shiftY;
  if (bottomAfterShift <= effectiveHeight - edgePad + 1) {
    return false;
  }
  if (input.extraHeightPx < maxExtraHeightPx) {
    return false;
  }
  return shift.needsScrollFallback;
}

/** Read stable base panel height from DOM (excluding dynamic extra height). */
export function readComicBasePanelHeightPx(
  panelEl: HTMLElement,
  appliedExtraHeightPx = 0
): number {
  const height = panelEl.getBoundingClientRect().height;
  const computedExtra =
    Number.parseFloat(getComputedStyle(panelEl).getPropertyValue("--lr-comic-extra-height")) ||
    0;
  const extra = Math.max(computedExtra, appliedExtraHeightPx);
  return Math.max(0, Math.round(height - extra));
}

export type ComicDynamicHeightKeyInput = {
  navResetKey: string;
  sceneId: string;
  phase: string;
  panelIndex: number;
  focusedBubbleId?: string;
  showInlineInput?: boolean;
  showRetryButton?: boolean;
  hintOpen?: boolean;
  answerRevealed?: boolean;
};

/** Stable key — when it changes, extra height resets and may be recomputed once. */
export function buildComicDynamicHeightKey(input: ComicDynamicHeightKeyInput): string {
  return [
    input.navResetKey,
    input.sceneId,
    input.phase,
    input.panelIndex,
    input.focusedBubbleId ?? "none",
    input.showInlineInput ? 1 : 0,
    input.showRetryButton ? 1 : 0,
    input.hintOpen ? 1 : 0,
    input.answerRevealed ? 1 : 0,
  ].join(":");
}
