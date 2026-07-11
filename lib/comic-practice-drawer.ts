import { clampComicPanelIndex } from "./comic-panel-navigation";
import type { ComicBubbleView } from "./comic-bubble-layout";
import type { LessonStoryPhase } from "./lesson-storyboard-types";

export type ComicPracticeDrawerOptions = {
  /** Breakdown / active recall drawer content (translation, input, chunk list, etc.). */
  hasPracticeContent?: boolean;
  /** Active recall / reinforcement answer hints (typing help). */
  hasAnswerHints?: boolean;
  /** Focused bubble still overflows the comic panel after safe-bounds shift. */
  needsLayoutFallback?: boolean;
};

/** Phases that render expanded practice below the comic art (not inside bubbles). */
export function shouldShowComicPracticeDrawer(
  phase: LessonStoryPhase,
  options?: ComicPracticeDrawerOptions
): boolean {
  if (phase === "breakdown") {
    return options?.hasPracticeContent === true;
  }
  if (phase === "active_recall" || phase === "reinforcement") {
    return (
      options?.needsLayoutFallback === true &&
      options?.hasAnswerHints === true &&
      options?.hasPracticeContent !== true
    );
  }
  return false;
}

/** Bubble feedback should stay compact (status only) when the drawer owns practice UI. */
export function comicBubbleFeedbackIsCompactOnly(
  phase: LessonStoryPhase,
  options?: { drawerOwnsPracticeUi?: boolean }
): boolean {
  if (phase === "breakdown" || phase === "exposure") {
    return true;
  }
  if (
    (phase === "active_recall" || phase === "reinforcement") &&
    options?.drawerOwnsPracticeUi
  ) {
    return true;
  }
  return false;
}

/** Content types that must not render inside a speech bubble during Breakdown. */
export const COMIC_BREAKDOWN_DRAWER_ONLY_KEYS = [
  "translation",
  "contextNote",
  "phonetic",
  "chunkPractice",
  "wordList",
] as const;

export type ComicBreakdownDrawerOnlyKey = (typeof COMIC_BREAKDOWN_DRAWER_ONLY_KEYS)[number];

/**
 * Resolves which bubble's practice content belongs in the drawer for the current panel index.
 */
export function getPracticeDrawerBubble(
  bubbles: ComicBubbleView[],
  panelIndex: number
): ComicBubbleView | undefined {
  if (bubbles.length === 0) {
    return undefined;
  }
  return bubbles[clampComicPanelIndex(panelIndex, bubbles.length)];
}

export function getComicPracticeDrawerTitle(
  bubble: Pick<ComicBubbleView, "text" | "speechTargetText">,
  phase?: LessonStoryPhase
): string {
  if (phase === "active_recall") {
    return "Answer help";
  }
  if (phase === "reinforcement") {
    return "Translation help";
  }
  const line = bubble.speechTargetText?.trim() || bubble.text.trim();
  return line.length > 0 ? line : "Practice";
}
