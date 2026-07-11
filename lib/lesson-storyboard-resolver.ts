import { getLessonStoryboard } from "./lesson-storyboards";
import type { LessonSceneStep, LessonStoryPhase } from "./lesson-storyboard-types";

export type LessonSceneResolverInput = {
  lessonId: string;
  phase: LessonStoryPhase;
  exerciseIndex?: number;
  sentenceIndex?: number;
};

function sortScenes(scenes: LessonSceneStep[]): LessonSceneStep[] {
  return [...scenes].sort((a, b) => a.order - b.order);
}

export function filterScenesForPhase(
  scenes: LessonSceneStep[],
  phase: LessonStoryPhase
): LessonSceneStep[] {
  const phaseMatched = scenes.filter(
    (scene) => !scene.phaseKeys?.length || scene.phaseKeys.includes(phase)
  );
  return phaseMatched.length > 0 ? phaseMatched : scenes;
}

function progressionIndex(input: LessonSceneResolverInput): number | null {
  if (typeof input.exerciseIndex === "number" && Number.isFinite(input.exerciseIndex)) {
    return Math.max(0, Math.floor(input.exerciseIndex));
  }
  if (typeof input.sentenceIndex === "number" && Number.isFinite(input.sentenceIndex)) {
    return Math.max(0, Math.floor(input.sentenceIndex));
  }
  return null;
}

function pickScene(
  candidates: LessonSceneStep[],
  progression: number | null
): LessonSceneStep | null {
  if (candidates.length === 0) {
    return null;
  }
  if (progression === null) {
    return candidates[0];
  }
  return candidates[progression % candidates.length];
}

export function getCurrentLessonScene(input: LessonSceneResolverInput): LessonSceneStep | null {
  const storyboard = getLessonStoryboard(input.lessonId);
  if (!storyboard) {
    return null;
  }

  const ordered = sortScenes(storyboard.scenes);
  const phaseScenes = filterScenesForPhase(ordered, input.phase);
  return pickScene(phaseScenes, progressionIndex(input));
}

export function getNextLessonScene(input: LessonSceneResolverInput): LessonSceneStep | null {
  const storyboard = getLessonStoryboard(input.lessonId);
  if (!storyboard) {
    return null;
  }

  const ordered = sortScenes(storyboard.scenes);
  const phaseScenes = filterScenesForPhase(ordered, input.phase);
  if (phaseScenes.length === 0) {
    return null;
  }

  const progression = progressionIndex(input);
  const nextIndex = progression === null ? 1 : progression + 1;
  return pickScene(phaseScenes, nextIndex);
}

export function preloadLessonSceneImages(storyboard: { scenes: LessonSceneStep[] }): void {
  if (typeof window === "undefined") {
    return;
  }
  for (const scene of storyboard.scenes) {
    const url = scene.imageUrl ?? scene.thumbnailUrl;
    if (!url) {
      continue;
    }
    const img = new window.Image();
    img.src = url;
  }
}

/** Map LessonRunner UI phase labels to storyboard phase keys. */
export function uiPhaseToStoryPhase(phaseLabel: string): LessonStoryPhase {
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
      return "exposure";
  }
}
