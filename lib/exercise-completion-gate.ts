import type { GradingStatus } from "@/lib/quick-recall-grading";
import { PASS_THRESHOLD_PERCENT } from "@/lib/speech-evaluation";

export type ExerciseSectionId = "speaking" | "typing" | "exposure-shadow" | "reinforcement";

export type ExerciseCompletionGateState = {
  canComplete: boolean;
  missing: string[];
  completedSections: string[];
};

export type ActiveRecallExerciseGateInput = {
  exerciseId: string;
  voiceMarkedCorrect: boolean;
  typingStatus?: GradingStatus;
  speechEvalOk?: boolean;
  speechMatchPercent?: number | null;
};

export function isSpeakingSectionComplete(input: ActiveRecallExerciseGateInput): boolean {
  if (input.voiceMarkedCorrect) {
    return true;
  }
  if (input.speechEvalOk === true) {
    return true;
  }
  if (
    input.speechMatchPercent != null &&
    input.speechMatchPercent >= PASS_THRESHOLD_PERCENT
  ) {
    return true;
  }
  return false;
}

export function isTypingSectionComplete(typingStatus?: GradingStatus): boolean {
  return typingStatus === "correct";
}

export function getActiveRecallExerciseGateState(
  input: ActiveRecallExerciseGateInput
): ExerciseCompletionGateState {
  const completedSections: string[] = [];
  const missing: string[] = [];

  if (isSpeakingSectionComplete(input)) {
    completedSections.push("speaking");
  } else {
    missing.push("speaking");
  }

  if (isTypingSectionComplete(input.typingStatus)) {
    completedSections.push("typing");
  } else {
    missing.push("typing");
  }

  return {
    canComplete: missing.length === 0,
    missing,
    completedSections,
  };
}

export function getActiveRecallPhaseGateState(
  exercises: ActiveRecallExerciseGateInput[]
): ExerciseCompletionGateState {
  if (exercises.length === 0) {
    return { canComplete: true, missing: [], completedSections: [] };
  }

  const missing = new Set<string>();
  let allComplete = true;

  for (const exercise of exercises) {
    const gate = getActiveRecallExerciseGateState(exercise);
    if (!gate.canComplete) {
      allComplete = false;
      gate.missing.forEach((section) => missing.add(section));
    }
  }

  return {
    canComplete: allComplete,
    missing: Array.from(missing),
    completedSections: allComplete ? ["speaking", "typing"] : [],
  };
}

export type ExposureShadowSlice = {
  hasPlayedAudio: boolean;
  hasSpoken: boolean;
};

export function getExposurePhaseGateState(
  sentenceTexts: string[],
  shadowBySentence: Record<string, ExposureShadowSlice | undefined>,
  sttSupported: boolean
): ExerciseCompletionGateState {
  if (sentenceTexts.length === 0) {
    return { canComplete: true, missing: [], completedSections: ["exposure-shadow"] };
  }

  const incomplete = sentenceTexts.filter((text) => {
    const slice = shadowBySentence[text];
    if (!sttSupported) {
      return !slice?.hasPlayedAudio;
    }
    return !slice?.hasSpoken;
  });

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

export function getReinforcementPhaseGateState(
  targetCount: number,
  completedTargetIndex: number
): ExerciseCompletionGateState {
  const done = targetCount === 0 || completedTargetIndex >= targetCount;
  return {
    canComplete: done,
    missing: done ? [] : ["reinforcement"],
    completedSections: done ? ["reinforcement"] : [],
  };
}

const MISSING_LABELS: Record<string, string> = {
  speaking: "Complete speaking first",
  typing: "Complete typing first",
  "exposure-shadow": "Listen and shadow each sentence first",
  reinforcement: "Finish reinforcement targets first",
};

export function getPhaseAdvanceBlockedReason(
  gate: ExerciseCompletionGateState
): string | null {
  if (gate.canComplete) {
    return null;
  }
  const labels = gate.missing.map((key) => MISSING_LABELS[key] ?? `Complete ${key} first`);
  return labels[0] ?? "Complete exercises first";
}
