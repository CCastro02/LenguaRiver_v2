import { comicBubbleTextsMatch, normalizeComicBubbleText } from "./comic-bubble-text";
import type { LessonStoryPhase } from "./lesson-storyboard-types";

export type ComicPanelNavBubble = {
  text: string;
  sentenceKey?: string;
};

export type ComicPanelNavResetInput = {
  lessonId: string;
  sceneId: string;
  phase: LessonStoryPhase;
  activeRecallExerciseId?: string | null;
  reinforcementTargetKey?: string | null;
};

export type ShouldSyncComicPanelToActiveTextInput = {
  phase: LessonStoryPhase;
  hasPanelNavigation: boolean;
  reason?: "reset" | "active_text" | "progress";
};

/**
 * When false, comic panel focus stays on comicPanelIndex only (manual nav / click).
 * Exposure recording completion and comicActiveText changes must not move focus.
 */
export function shouldSyncComicPanelToActiveText(
  input: ShouldSyncComicPanelToActiveTextInput
): boolean {
  if (!input.hasPanelNavigation) {
    return input.phase === "active_recall" || input.phase === "reinforcement";
  }
  if (input.phase === "exposure") {
    return false;
  }
  if (input.phase === "breakdown") {
    return false;
  }
  return input.phase === "active_recall" || input.phase === "reinforcement";
}

/** Stable key — unchanged during Exposure recording updates on the same scene. */
export function getComicPanelNavResetKey(input: ComicPanelNavResetInput): string {
  const base = `${input.lessonId}:${input.sceneId}`;
  if (input.phase === "active_recall" && input.activeRecallExerciseId) {
    return `${base}:active_recall:${input.activeRecallExerciseId}`;
  }
  if (input.phase === "reinforcement" && input.reinforcementTargetKey) {
    return `${base}:reinforcement:${input.reinforcementTargetKey}`;
  }
  return `${base}:${input.phase}`;
}

/** Initial index after a nav reset — Exposure always starts at panel 0. */
export function getComicPanelIndexAfterNavReset(
  visibleBubbles: ComicPanelNavBubble[],
  activeTextOrKey: string | null | undefined,
  input: ShouldSyncComicPanelToActiveTextInput
): number {
  if (!shouldSyncComicPanelToActiveText(input)) {
    return 0;
  }
  return getInitialComicPanelIndex(visibleBubbles, activeTextOrKey);
}

export function comicPanelNavLabel(index: number, count: number): string {
  const safeIndex = clampComicPanelIndex(index, count);
  const safeCount = Math.max(0, count);
  return `Panel ${safeIndex + 1} of ${safeCount}`;
}

export function shouldResetComicPanelIndex(
  previousResetKey: string | null,
  nextResetKey: string
): boolean {
  return previousResetKey !== nextResetKey;
}

/** Clamp index when bubble count changes; preserve index if count is unchanged. */
export function clampComicPanelIndexAfterCountChange(
  index: number,
  previousCount: number,
  nextCount: number
): number {
  if (previousCount === nextCount) {
    return index;
  }
  return clampComicPanelIndex(index, nextCount);
}

export function clampComicPanelIndex(index: number, count: number): number {
  if (count <= 0) {
    return 0;
  }
  return Math.min(Math.max(0, index), count - 1);
}

export function getInitialComicPanelIndex(
  visibleBubbles: ComicPanelNavBubble[],
  activeTextOrKey?: string | null
): number {
  if (visibleBubbles.length === 0) {
    return 0;
  }
  const needle = activeTextOrKey?.trim();
  if (!needle) {
    return 0;
  }
  const normalized = normalizeComicBubbleText(needle);
  const byKey = visibleBubbles.findIndex(
    (b) => b.sentenceKey != null && b.sentenceKey === needle
  );
  if (byKey >= 0) {
    return byKey;
  }
  const byText = visibleBubbles.findIndex((b) =>
    comicBubbleTextsMatch(b.text, normalized)
  );
  return byText >= 0 ? byText : 0;
}

export function getNextComicPanelIndex(index: number, count: number): number {
  return clampComicPanelIndex(index + 1, count);
}

export function getPreviousComicPanelIndex(index: number, count: number): number {
  return clampComicPanelIndex(index - 1, count);
}

export function canGoToPreviousComicPanel(index: number): boolean {
  return index > 0;
}

export function canGoToNextComicPanel(index: number, count: number): boolean {
  return count > 1 && index < count - 1;
}

/** Whether a bubble click should change comic panel focus (not Play/Speak/input). */
export function shouldFocusComicPanelFromBubbleClick(
  targetIsInteractive: boolean,
  hasPanelNavigation: boolean
): boolean {
  return hasPanelNavigation && !targetIsInteractive;
}

export type ComicPanelNavBubbleRenderMeta = {
  bubbleIndex: number;
  clickable: boolean;
};

/** Render metadata for panel-nav bubbles (every visible bubble is clickable). */
export function getComicPanelNavBubbleRenderMetadata(
  bubbleCount: number,
  hasPanelNavigation: boolean
): ComicPanelNavBubbleRenderMeta[] {
  return Array.from({ length: bubbleCount }, (_, bubbleIndex) => ({
    bubbleIndex,
    clickable: hasPanelNavigation,
  }));
}

/** Dev-only: nav label count must not exceed rendered clickable bubbles. */
export function getComicPanelNavCountMismatchWarning(
  navCount: number,
  clickableBubbleCount: number
): string | null {
  if (navCount > clickableBubbleCount) {
    return `Comic panel nav count (${navCount}) exceeds clickable bubbles (${clickableBubbleCount})`;
  }
  return null;
}
