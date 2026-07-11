import type { ComicBubbleView } from "./comic-bubble-layout";
import { getComicBubbleSpeechTargetText } from "./comic-bubble-text";
import type { LessonStoryPhase } from "./lesson-storyboard-types";

export type ComicBubbleControlsPhase = LessonStoryPhase;

export type IsSpeakableComicBubbleInput = {
  phase: ComicBubbleControlsPhase;
  bubble: Pick<
    ComicBubbleView,
    "speechTargetText" | "text" | "bubbleStyle" | "speaker" | "isActive"
  >;
  /** Optional override from phase-specific control builders. */
  controls?: { showSpeak?: boolean };
};

/** Map LessonRunner UI phase labels to storyboard phase keys. */
export function lessonUiPhaseToComicControlsPhase(
  phaseLabel: string
): ComicBubbleControlsPhase | null {
  switch (phaseLabel) {
    case "Exposure":
      return "exposure";
    case "Breakdown":
      return "breakdown";
    case "Active Recall":
      return "active_recall";
    case "Reinforcement":
      return "reinforcement";
    default:
      return null;
  }
}

function bubbleSpeechTargetText(
  bubble: Pick<ComicBubbleView, "speechTargetText" | "text">
): string {
  return (bubble.speechTargetText || getComicBubbleSpeechTargetText(bubble.text)).trim();
}

/**
 * Whether a comic bubble represents speakable dialogue/sentence content.
 * Scoring gates do not affect speakability — optional practice still gets a Speak control.
 */
export function isSpeakableComicBubble(input: IsSpeakableComicBubbleInput): boolean {
  if (input.controls?.showSpeak === false) {
    return false;
  }

  const { bubble, phase } = input;

  if (bubble.bubbleStyle === "caption" || bubble.speaker === "narration") {
    return false;
  }

  if (!bubbleSpeechTargetText(bubble)) {
    return false;
  }

  if (phase === "active_recall" || phase === "reinforcement") {
    return bubble.isActive === true;
  }

  return true;
}

export type ComicBubbleSpeakVisibilityInput = IsSpeakableComicBubbleInput & {
  isFocused: boolean;
};

/** Focused speakable bubbles always expose compact Speak controls in comic mode. */
export function shouldShowComicBubbleSpeak(input: ComicBubbleSpeakVisibilityInput): boolean {
  return input.isFocused && isSpeakableComicBubble(input);
}

export function resolveComicBubbleSpeechTarget(
  bubble: Pick<ComicBubbleView, "speechTargetText" | "text">
): string {
  return bubbleSpeechTargetText(bubble);
}
