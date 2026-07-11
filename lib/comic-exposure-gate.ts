import type { ComicBubbleView } from "./comic-bubble-layout";
import type { LessonSceneStep, LessonStoryTier } from "./lesson-storyboard-types";
import type { ExerciseCompletionGateState } from "./exercise-completion-gate";
import {
  buildVisibleComicBubblesForPhase,
  getVisibleComicExposureBubbles,
  type BuildVisibleComicBubblesInput,
} from "./comic-visible-bubbles";

export type ComicExposureShadowState = {
  hasPlayedAudio?: boolean;
  hasSpoken?: boolean;
  accepted?: boolean;
  completed?: boolean;
  status?: string;
};

export type ComicExposureBubbleInput = {
  completionKey?: string;
  speechTargetText?: string;
  requiresSpeech?: boolean;
  bubbleStyle?: ComicBubbleView["bubbleStyle"];
  speaker?: ComicBubbleView["speaker"];
};

export type BuildComicExposureBubblesOptions = {
  tier?: LessonStoryTier;
  showCaption?: boolean;
};

export const COMIC_EXPOSURE_BLOCKED_MESSAGE = "Finish the required comic bubbles first";

/** Speech bubbles in the exposure scene that require listen/shadow completion. */
export function comicBubbleRequiresExposureShadow(
  bubble: Pick<ComicExposureBubbleInput, "bubbleStyle" | "speaker" | "requiresSpeech">
): boolean {
  if (bubble.requiresSpeech === false) {
    return false;
  }
  if (bubble.bubbleStyle === "caption") {
    return false;
  }
  if (bubble.speaker === "narration") {
    return false;
  }
  return true;
}

/**
 * Required keys from the same bubble list rendered in LessonComicPanel.
 */
export function getRequiredComicExposureKeys(
  bubbles: ComicExposureBubbleInput[]
): string[] {
  const keys = bubbles
    .filter(comicBubbleRequiresExposureShadow)
    .map((bubble) => (bubble.completionKey ?? bubble.speechTargetText ?? "").trim())
    .filter((key) => key.length > 0);

  return [...new Set(keys)];
}

export function buildComicExposureBubbles(
  scene: LessonSceneStep,
  options?: BuildComicExposureBubblesOptions
): ComicBubbleView[] {
  return getVisibleComicExposureBubbles(scene, options);
}

export function getRequiredComicExposureKeysForScene(
  scene: LessonSceneStep,
  options?: BuildComicExposureBubblesOptions
): string[] {
  return getRequiredComicExposureKeys(getVisibleComicExposureBubbles(scene, options));
}

/** Gate keys must match the bubbles LessonComicPanel renders for Exposure. */
export function getComicExposureGateAlignment(input: BuildVisibleComicBubblesInput): {
  visibleBubbles: ComicBubbleView[];
  requiredKeys: string[];
} {
  const visibleBubbles = buildVisibleComicBubblesForPhase(input);
  return {
    visibleBubbles,
    requiredKeys: getRequiredComicExposureKeys(visibleBubbles),
  };
}

export function isComicExposureShadowSliceComplete(
  slice: ComicExposureShadowState | undefined,
  sttSupported: boolean
): boolean {
  if (!slice) {
    return false;
  }
  if (slice.accepted === true || slice.completed === true) {
    return true;
  }
  const status = slice.status?.toLowerCase();
  if (status === "good" || status === "accepted" || status === "completed") {
    return true;
  }
  if (!sttSupported) {
    return slice.hasPlayedAudio === true;
  }
  return slice.hasSpoken === true;
}

export function isComicExposureComplete(
  requiredKeys: string[],
  exposureShadowBySentence: Record<string, ComicExposureShadowState | undefined>,
  sttSupported = true
): boolean {
  if (requiredKeys.length === 0) {
    return false;
  }
  return requiredKeys.every((key) =>
    isComicExposureShadowSliceComplete(exposureShadowBySentence[key], sttSupported)
  );
}

export function getIncompleteComicExposureKeys(
  requiredKeys: string[],
  shadowBySentence: Record<string, ComicExposureShadowState | undefined>,
  sttSupported: boolean
): string[] {
  return requiredKeys.filter(
    (key) => !isComicExposureShadowSliceComplete(shadowBySentence[key], sttSupported)
  );
}

export function getComicExposurePhaseGateState(
  requiredKeys: string[],
  shadowBySentence: Record<string, ComicExposureShadowState | undefined>,
  sttSupported: boolean
): ExerciseCompletionGateState {
  if (requiredKeys.length === 0) {
    return {
      canComplete: false,
      missing: ["exposure-shadow"],
      completedSections: [],
    };
  }

  const incomplete = getIncompleteComicExposureKeys(
    requiredKeys,
    shadowBySentence,
    sttSupported
  );

  if (incomplete.length === 0) {
    return {
      canComplete: true,
      missing: [],
      completedSections: ["exposure-shadow"],
    };
  }

  return {
    canComplete: false,
    missing: ["exposure-shadow"],
    completedSections: [],
  };
}

export function getComicExposurePhaseAdvanceBlockedReason(
  gate: ExerciseCompletionGateState
): string | null {
  if (gate.canComplete) {
    return null;
  }
  return COMIC_EXPOSURE_BLOCKED_MESSAGE;
}

/** Dev-only hint: which bubble keys still block comic exposure advance. */
export function getComicExposureBlockedDebugNote(
  incompleteKeys: string[]
): string | null {
  if (incompleteKeys.length === 0) {
    return null;
  }
  const waiting = incompleteKeys.join(", ");
  return `Waiting on: ${waiting}`;
}
