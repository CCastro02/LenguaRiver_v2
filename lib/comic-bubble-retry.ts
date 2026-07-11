import type { GradingStatus } from "@/lib/quick-recall-grading";

export const COMIC_INLINE_INPUT_ID_PREFIX = "lr-comic-inline-input-";

export type ComicBubbleRetryKind = "typing" | "speaking" | "both";

export type ComicBubbleRetryState = {
  showRetryButton: boolean;
  retryKind: ComicBubbleRetryKind | null;
};

export function getComicInlineInputId(sentenceKey: string): string {
  return `${COMIC_INLINE_INPUT_ID_PREFIX}${sentenceKey}`;
}

/** Focus the inline answer input inside the active comic bubble (client-only). */
export function focusComicInlineInput(sentenceKey: string): void {
  if (typeof document === "undefined") {
    return;
  }
  const element = document.getElementById(getComicInlineInputId(sentenceKey));
  if (element instanceof HTMLInputElement) {
    element.focus();
    element.select();
  }
}

export function isComicTypingAttemptFailed(input: {
  typingChecked: boolean;
  typingStatus?: GradingStatus;
}): boolean {
  return input.typingChecked && input.typingStatus != null && input.typingStatus !== "correct";
}

export function isComicSpeakingAttemptFailed(input: {
  voiceComplete: boolean;
  speechEvalOk?: boolean;
}): boolean {
  return !input.voiceComplete && input.speechEvalOk === false;
}

/**
 * Whether the active comic bubble should show a Try again button and which modes failed.
 */
export function getComicBubbleRetryState(input: {
  typingChecked: boolean;
  typingStatus?: GradingStatus;
  voiceComplete: boolean;
  speechEvalOk?: boolean;
}): ComicBubbleRetryState {
  const typingFailed = isComicTypingAttemptFailed(input);
  const speakingFailed = isComicSpeakingAttemptFailed(input);

  if (!typingFailed && !speakingFailed) {
    return { showRetryButton: false, retryKind: null };
  }

  if (typingFailed && speakingFailed) {
    return { showRetryButton: true, retryKind: "both" };
  }
  if (typingFailed) {
    return { showRetryButton: true, retryKind: "typing" };
  }
  return { showRetryButton: true, retryKind: "speaking" };
}

/** Inline input stays editable until the typing section is fully correct. */
export function shouldDisableComicInlineInput(typingStatus?: GradingStatus): boolean {
  return typingStatus === "correct";
}
