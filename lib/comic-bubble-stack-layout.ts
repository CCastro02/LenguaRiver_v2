import {
  COMIC_FOCUSED_BUBBLE_MIN_HEIGHT_PX,
  COMIC_FOCUSED_BUBBLE_RECALL_MIN_HEIGHT_PX,
  COMIC_FOCUSED_BUBBLE_RETRY_MIN_HEIGHT_PX,
} from "./comic-bubble-safe-bounds";

/** Default compact preview bubble height (sentence + compact Play). */
export const COMIC_PREVIEW_BUBBLE_HEIGHT_PX = 72;
/** Minimum preview height when compressing an overflowing stack. */
export const COMIC_PREVIEW_BUBBLE_MIN_HEIGHT_PX = 52;
export const COMIC_STACK_MIN_GAP_PX = 12;
export const COMIC_STACK_PANEL_INSET_PX = 8;
/** Horizontal % tolerance when grouping bubbles without panelSlot. */
const HORIZONTAL_TRACK_ROUND_PCT = 4;

export type ComicBubbleStackInput = {
  bubbleId: string;
  bubbleIndex: number;
  panelSlot?: string;
  desiredRect: {
    left: number;
    top: number;
    width: number;
  };
  measuredHeightPx?: number;
  estimatedHeightPx?: number;
  isFocused: boolean;
};

export type ComicBubbleStackOutput = {
  bubbleId: string;
  bubbleIndex: number;
  left: number;
  top: number;
  width: number;
  zIndex: number;
  displayMode: "focused" | "preview";
  shifted: boolean;
  /** True when this bubble shares a vertical stack with at least one other bubble. */
  stacked: boolean;
  clickable: boolean;
};

export type LayoutStackedComicBubblesArgs = {
  bubbles: ComicBubbleStackInput[];
  panelBoundsPx: { width: number; height: number };
  minGapPx?: number;
  panelInsetPx?: number;
};

export type EstimateComicBubbleHeightOptions = {
  isFocused: boolean;
  hasInlineInput?: boolean;
  hasRetry?: boolean;
};

/** Height estimate for layout before DOM measurement. */
export function estimateComicBubbleHeightPx(
  options: EstimateComicBubbleHeightOptions
): number {
  if (!options.isFocused) {
    return COMIC_PREVIEW_BUBBLE_HEIGHT_PX;
  }
  if (options.hasInlineInput) {
    return COMIC_FOCUSED_BUBBLE_RECALL_MIN_HEIGHT_PX;
  }
  if (options.hasRetry) {
    return COMIC_FOCUSED_BUBBLE_RETRY_MIN_HEIGHT_PX;
  }
  return COMIC_FOCUSED_BUBBLE_MIN_HEIGHT_PX;
}

function roundTrackAxis(value: number): number {
  return Math.round(value / HORIZONTAL_TRACK_ROUND_PCT) * HORIZONTAL_TRACK_ROUND_PCT;
}

/** Groups bubbles that share a panel slot and the same horizontal track. */
export function comicBubbleStackGroupKey(input: Pick<ComicBubbleStackInput, "panelSlot" | "desiredRect">): string {
  const x = roundTrackAxis(input.desiredRect.left);
  const width = roundTrackAxis(input.desiredRect.width);
  if (input.panelSlot) {
    return `${input.panelSlot}:${x}:${width}`;
  }
  return `track:${x}:${width}`;
}

function resolveBubbleHeightPx(
  bubble: ComicBubbleStackInput,
  displayMode: "focused" | "preview",
  compressedPreview = false
): number {
  const measured = bubble.measuredHeightPx;
  if (measured != null && measured > 0) {
    if (displayMode === "preview" && !bubble.isFocused && measured > COMIC_PREVIEW_BUBBLE_HEIGHT_PX + 24) {
      return Math.max(COMIC_PREVIEW_BUBBLE_MIN_HEIGHT_PX, COMIC_PREVIEW_BUBBLE_HEIGHT_PX);
    }
    return measured;
  }
  const estimated = bubble.estimatedHeightPx;
  if (estimated != null && estimated > 0) {
    if (displayMode === "preview" && compressedPreview) {
      return Math.max(COMIC_PREVIEW_BUBBLE_MIN_HEIGHT_PX, Math.min(estimated, COMIC_PREVIEW_BUBBLE_HEIGHT_PX));
    }
    return estimated;
  }
  return displayMode === "focused"
    ? COMIC_FOCUSED_BUBBLE_MIN_HEIGHT_PX
    : compressedPreview
      ? COMIC_PREVIEW_BUBBLE_MIN_HEIGHT_PX
      : COMIC_PREVIEW_BUBBLE_HEIGHT_PX;
}

function percentToPx(percent: number, totalPx: number): number {
  return (percent / 100) * totalPx;
}

function pxToPercent(px: number, totalPx: number): number {
  if (totalPx <= 0) {
    return 0;
  }
  return (px / totalPx) * 100;
}

type StackGroupMember = ComicBubbleStackInput & { displayMode: "focused" | "preview" };

function layoutStackGroup(
  members: StackGroupMember[],
  panelBoundsPx: { width: number; height: number },
  minGapPx: number,
  panelInsetPx: number
): ComicBubbleStackOutput[] {
  const panelH = Math.max(1, panelBoundsPx.height);
  const insetTop = panelInsetPx;
  const insetBottom = panelH - panelInsetPx;
  const isStacked = members.length > 1;

  const sorted = [...members].sort((a, b) => {
    const topDiff = a.desiredRect.top - b.desiredRect.top;
    return topDiff !== 0 ? topDiff : a.bubbleIndex - b.bubbleIndex;
  });

  let shifted = false;

  const layoutOnce = (compress: boolean) => {
    const topsPx: number[] = [];
    const heightsPx: number[] = [];
    let cursorTop = percentToPx(sorted[0]!.desiredRect.top, panelH);

    for (let i = 0; i < sorted.length; i += 1) {
      const member = sorted[i]!;
      const displayMode = member.displayMode;
      const heightPx = resolveBubbleHeightPx(member, displayMode, compress && displayMode === "preview");
      heightsPx.push(heightPx);

      if (i === 0) {
        topsPx.push(cursorTop);
      } else {
        const minTop = topsPx[i - 1]! + heightsPx[i - 1]! + minGapPx;
        const desiredTop = percentToPx(member.desiredRect.top, panelH);
        cursorTop = Math.max(desiredTop, minTop);
        if (cursorTop > desiredTop + 0.5) {
          shifted = true;
        }
        topsPx.push(cursorTop);
      }
    }

    const groupBottom = topsPx[topsPx.length - 1]! + heightsPx[heightsPx.length - 1]!;
    const overflowBottom = groupBottom - insetBottom;
    return { topsPx, heightsPx, overflowBottom };
  };

  let { topsPx, overflowBottom } = layoutOnce(false);

  if (overflowBottom > 0 && sorted.some((m) => m.displayMode === "preview")) {
    ({ topsPx, overflowBottom } = layoutOnce(true));
  }

  if (overflowBottom > 0) {
    const shiftUp = Math.min(overflowBottom, topsPx[0]! - insetTop);
    if (shiftUp > 0) {
      for (let i = 0; i < topsPx.length; i += 1) {
        topsPx[i] = topsPx[i]! - shiftUp;
      }
      shifted = true;
      overflowBottom -= shiftUp;
    }
  }

  const focusedIndexInGroup = sorted.findIndex((m) => m.isFocused);
  const maxZ = sorted.length + 10;

  return sorted.map((member, i) => {
    const isFocusedMember = member.isFocused;
    const zIndex = isFocusedMember
      ? maxZ
      : i + 1 + (focusedIndexInGroup >= 0 && i > focusedIndexInGroup ? 1 : 0);

    return {
      bubbleId: member.bubbleId,
      bubbleIndex: member.bubbleIndex,
      left: member.desiredRect.left,
      top: pxToPercent(topsPx[i]!, panelH),
      width: member.desiredRect.width,
      zIndex,
      displayMode: member.displayMode,
      shifted: shifted || topsPx[i]! !== percentToPx(member.desiredRect.top, panelH),
      stacked: isStacked,
      clickable: true,
    };
  });
}

/**
 * Computes final page-percent positions for comic bubbles that share a panel/track,
 * avoiding vertical overlap using measured or estimated heights.
 */
export function layoutStackedComicBubbles(
  args: LayoutStackedComicBubblesArgs
): ComicBubbleStackOutput[] {
  const { bubbles, panelBoundsPx } = args;
  const minGapPx = args.minGapPx ?? COMIC_STACK_MIN_GAP_PX;
  const panelInsetPx = args.panelInsetPx ?? COMIC_STACK_PANEL_INSET_PX;

  if (bubbles.length === 0) {
    return [];
  }

  if (panelBoundsPx.width <= 0 || panelBoundsPx.height <= 0) {
    return bubbles.map((bubble, index) => ({
      bubbleId: bubble.bubbleId,
      bubbleIndex: bubble.bubbleIndex,
      left: bubble.desiredRect.left,
      top: bubble.desiredRect.top,
      width: bubble.desiredRect.width,
      zIndex: bubble.isFocused ? bubbles.length + 10 : index + 1,
      displayMode: bubble.isFocused ? "focused" : "preview",
      shifted: false,
      stacked: false,
      clickable: true,
    }));
  }

  const groups = new Map<string, ComicBubbleStackInput[]>();
  for (const bubble of bubbles) {
    const key = comicBubbleStackGroupKey(bubble);
    const group = groups.get(key) ?? [];
    group.push(bubble);
    groups.set(key, group);
  }

  const outputByIndex = new Map<number, ComicBubbleStackOutput>();

  for (const group of groups.values()) {
    if (group.length <= 1) {
      const solo = group[0]!;
      outputByIndex.set(solo.bubbleIndex, {
        bubbleId: solo.bubbleId,
        bubbleIndex: solo.bubbleIndex,
        left: solo.desiredRect.left,
        top: solo.desiredRect.top,
        width: solo.desiredRect.width,
        zIndex: solo.isFocused ? 20 : solo.bubbleIndex + 1,
        displayMode: solo.isFocused ? "focused" : "preview",
        shifted: false,
        stacked: false,
        clickable: true,
      });
      continue;
    }

    const members: StackGroupMember[] = group.map((bubble) => ({
      ...bubble,
      displayMode: bubble.isFocused ? "focused" : "preview",
    }));

    for (const laidOut of layoutStackGroup(members, panelBoundsPx, minGapPx, panelInsetPx)) {
      outputByIndex.set(laidOut.bubbleIndex, laidOut);
    }
  }

  return bubbles
    .map((bubble) => outputByIndex.get(bubble.bubbleIndex))
    .filter((entry): entry is ComicBubbleStackOutput => entry != null);
}

/** True when at least one stack group contains multiple bubbles. */
export function hasStackedComicBubbleGroups(bubbles: ComicBubbleStackInput[]): boolean {
  const counts = new Map<string, number>();
  for (const bubble of bubbles) {
    const key = comicBubbleStackGroupKey(bubble);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()].some((count) => count > 1);
}
