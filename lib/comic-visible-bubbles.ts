import {
  buildComicBubbles,
  bubblePageRect,
  type ComicBubbleView,
} from "./comic-bubble-layout";
import {
  comicBubbleStackGroupKey,
  hasStackedComicBubbleGroups,
  type ComicBubbleStackInput,
} from "./comic-bubble-stack-layout";
import { comicBubbleTextsMatch, getComicBubbleCompletionKey } from "./comic-bubble-text";
import { isNameOnlyPracticeText } from "./lesson-chunk-filter";
import type { LessonSentence } from "./lesson-data";
import type {
  LessonSceneStep,
  LessonStoryPhase,
  LessonStoryTier,
} from "./lesson-storyboard-types";

export type BuildVisibleComicBubblesInput = {
  scene: LessonSceneStep;
  phase: LessonStoryPhase;
  tier?: LessonStoryTier;
  showCaption?: boolean;
  showAllPanels?: boolean;
  activeText?: string | null;
};

/** Whether name-only speech bubbles should be omitted from practice phases. */
export function shouldExcludeNameOnlyComicPanels(phase: LessonStoryPhase): boolean {
  return phase === "active_recall" || phase === "breakdown" || phase === "reinforcement";
}

function filterNameOnlyComicBubbles(
  bubbles: ComicBubbleView[],
  phase: LessonStoryPhase
): ComicBubbleView[] {
  if (!shouldExcludeNameOnlyComicPanels(phase)) {
    return bubbles;
  }
  return bubbles.filter(
    (bubble) =>
      bubble.bubbleStyle === "caption" ||
      bubble.speaker === "narration" ||
      !isNameOnlyPracticeText(bubble.speechTargetText)
  );
}
/** Panel-relative % tolerance when grouping bubbles on the same horizontal track. */
const PLACEMENT_AXIS_ROUND = 4;
/** Minimum vertical gap between stacked bubbles inside one panel (% of panel height). */
const MIN_PANEL_VERTICAL_GAP = 22;
/** Keep bubbles inside the panel with room for bubble body + controls. */
const MAX_PANEL_PLACEMENT_Y = 68;
const MIN_PANEL_PLACEMENT_Y = 6;

type ComicPanelPlacementCoords = NonNullable<ComicBubbleView["placement"]>;

function defaultPanelPlacement(): ComicPanelPlacementCoords {
  return { x: 10, y: 14, width: 80 };
}

function roundPlacementAxis(value: number): number {
  return Math.round(value / PLACEMENT_AXIS_ROUND) * PLACEMENT_AXIS_ROUND;
}

/** Groups bubbles that share a panel slot and nearly the same horizontal placement. */
function bubblePlacementGroupKey(bubble: ComicBubbleView): string {
  if (!bubble.panelSlot) {
    return `anchor:${bubble.anchor}:${bubble.speaker}`;
  }
  const placement = bubble.placement ?? defaultPanelPlacement();
  const x = roundPlacementAxis(placement.x ?? 10);
  const width = roundPlacementAxis(placement.width ?? 80);
  return `${bubble.panelSlot}:${x}:${width}`;
}

function panelRelativeY(bubble: ComicBubbleView): number {
  return bubble.placement?.y ?? defaultPanelPlacement().y ?? 14;
}

function needsVerticalSpread(ys: number[]): boolean {
  if (ys.length <= 1) {
    return false;
  }
  const sorted = [...ys].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i]! - sorted[i - 1]! < MIN_PANEL_VERTICAL_GAP) {
      return true;
    }
  }
  return false;
}

function clampPanelY(y: number): number {
  return Math.min(MAX_PANEL_PLACEMENT_Y, Math.max(MIN_PANEL_PLACEMENT_Y, y));
}

/**
 * When multiple bubbles share the same panel slot and near-identical placement,
 * offset Y so panel nav reveals each line in its own visible slot (Exposure / Breakdown).
 */
export function spreadOverlappingBubblePlacements(
  bubbles: ComicBubbleView[],
  layout: LessonSceneStep["comicLayout"]
): ComicBubbleView[] {
  void layout;
  if (bubbles.length <= 1) {
    return bubbles;
  }

  const groups = new Map<string, number[]>();
  bubbles.forEach((bubble, index) => {
    const key = bubblePlacementGroupKey(bubble);
    const group = groups.get(key) ?? [];
    group.push(index);
    groups.set(key, group);
  });

  const nextPlacements = bubbles.map(
    (bubble) => ({ ...(bubble.placement ?? defaultPanelPlacement()) }) as ComicPanelPlacementCoords
  );

  for (const indices of groups.values()) {
    if (indices.length <= 1) {
      continue;
    }

    const ys = indices.map((index) => panelRelativeY(bubbles[index]!));
    if (!needsVerticalSpread(ys)) {
      continue;
    }

    const sorted = [...indices].sort((a, b) => {
      const yDiff = panelRelativeY(bubbles[a]!) - panelRelativeY(bubbles[b]!);
      return yDiff !== 0 ? yDiff : a - b;
    });

    let cursorY = panelRelativeY(bubbles[sorted[0]!]!);
    nextPlacements[sorted[0]!] = {
      ...nextPlacements[sorted[0]!]!,
      y: clampPanelY(cursorY),
    };

    for (let i = 1; i < sorted.length; i += 1) {
      const index = sorted[i]!;
      const baseY = panelRelativeY(bubbles[index]!);
      cursorY = clampPanelY(Math.max(baseY, cursorY + MIN_PANEL_VERTICAL_GAP));
      nextPlacements[index] = {
        ...nextPlacements[index]!,
        y: cursorY,
      };
    }
  }

  return bubbles.map((bubble, index) => {
    const placement = nextPlacements[index];
    const original = bubble.placement ?? defaultPanelPlacement();
    if (
      placement.x === original.x &&
      placement.y === original.y &&
      placement.width === original.width
    ) {
      return bubble;
    }
    return {
      ...bubble,
      placement,
    };
  });
}

/**
 * Single source of truth for comic bubbles shown in LessonComicPanel and phase gates.
 */
export function buildVisibleComicBubblesForPhase(
  input: BuildVisibleComicBubblesInput
): ComicBubbleView[] {
  const tier = input.tier ?? "easy";
  const showCaption = input.showCaption ?? tier !== "real";
  const showAllPanels = input.showAllPanels ?? false;
  const manualPanelNav =
    showAllPanels && (input.phase === "exposure" || input.phase === "breakdown");
  const bubbleLayoutActiveText =
    manualPanelNav && (input.phase === "exposure" || input.phase === "breakdown")
      ? null
      : (input.activeText ?? null);

  const excludeNameOnlyPanels = shouldExcludeNameOnlyComicPanels(input.phase);

  const bubbles = filterNameOnlyComicBubbles(
    buildComicBubbles(input.scene, bubbleLayoutActiveText, {
      tier,
      showCaption,
      showAllPanels,
      suppressActiveHighlight: manualPanelNav,
      excludeNameOnlyPanels,
    }),
    input.phase
  );

  if (showAllPanels && bubbles.length > 1) {
    return spreadOverlappingBubblePlacements(bubbles, input.scene.comicLayout);
  }

  return bubbles;
}

export function findComicBubbleIndexByCompletionKey(
  bubbles: ComicBubbleView[],
  completionKey: string
): number {
  const normalized = completionKey.trim();
  if (!normalized) {
    return -1;
  }
  return bubbles.findIndex(
    (bubble) =>
      bubble.completionKey === normalized ||
      getComicBubbleCompletionKey(bubble.text) === normalized
  );
}

/** Map a comic bubble line to the lesson sentence that contains or matches it. */
export function findLessonSentenceForComicBubble(
  bubble: Pick<ComicBubbleView, "speechTargetText" | "text" | "completionKey">,
  sentences: LessonSentence[]
): LessonSentence | undefined {
  const targets = [
    bubble.speechTargetText,
    bubble.text,
    bubble.completionKey,
  ].filter((value): value is string => Boolean(value?.trim()));

  for (const target of targets) {
    const direct = sentences.find((sentence) => comicBubbleTextsMatch(sentence.text, target));
    if (direct) {
      return direct;
    }
  }

  for (const target of targets) {
    const normalizedTarget = target.trim().toLowerCase();
    const contained = sentences.find((sentence) => {
      const normalizedSentence = sentence.text.trim().toLowerCase();
      return (
        normalizedSentence.includes(normalizedTarget) ||
        normalizedTarget.includes(normalizedSentence)
      );
    });
    if (contained) {
      return contained;
    }
  }

  return undefined;
}

export function getVisibleComicExposureBubbles(
  scene: LessonSceneStep,
  options?: { tier?: LessonStoryTier; showCaption?: boolean }
): ComicBubbleView[] {
  const tier = options?.tier ?? "easy";
  const showCaption = options?.showCaption ?? tier !== "real";
  return buildVisibleComicBubblesForPhase({
    scene,
    phase: "exposure",
    tier,
    showCaption,
    showAllPanels: true,
    activeText: null,
  });
}

/** Whether panel-nav should run stacked layout (multiple bubbles in one panel/track). */
export function shouldUseStackedComicBubbleLayout(
  bubbles: ComicBubbleView[],
  layout: LessonSceneStep["comicLayout"],
  options?: { panelNavigation?: boolean }
): boolean {
  if (options?.panelNavigation === false || bubbles.length <= 1) {
    return false;
  }
  const inputs = buildComicBubbleStackInputs(bubbles, layout, -1);
  return hasStackedComicBubbleGroups(inputs);
}

export function buildComicBubbleStackInputs(
  bubbles: ComicBubbleView[],
  layout: LessonSceneStep["comicLayout"],
  focusedIndex: number,
  heightEstimates?: Map<number, number>
): ComicBubbleStackInput[] {
  return bubbles.map((bubble, bubbleIndex) => {
    const pageRect = bubblePageRect(layout, bubble.panelSlot, bubble.placement);
    const desiredRect = pageRect
      ? { left: pageRect.left, top: pageRect.top, width: pageRect.width }
      : { left: 8, top: 14, width: 40 };
    return {
      bubbleId: bubble.id,
      bubbleIndex,
      panelSlot: bubble.panelSlot,
      desiredRect,
      estimatedHeightPx: heightEstimates?.get(bubbleIndex),
      isFocused: bubbleIndex === focusedIndex,
    };
  });
}

export { comicBubbleStackGroupKey, hasStackedComicBubbleGroups };

export function getVisibleComicBreakdownBubbles(
  scene: LessonSceneStep,
  options?: { tier?: LessonStoryTier; showCaption?: boolean }
): ComicBubbleView[] {
  const tier = options?.tier ?? "easy";
  const showCaption = options?.showCaption ?? tier !== "real";
  return buildVisibleComicBubblesForPhase({
    scene,
    phase: "breakdown",
    tier,
    showCaption,
    showAllPanels: true,
    activeText: null,
  });
}
