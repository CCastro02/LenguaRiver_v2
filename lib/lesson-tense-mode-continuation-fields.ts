import { normalizeTenseMode, type TenseMode } from "./lesson-tense-mode";

/** Minimal shape for normalizing continuation fields from raw lesson rows. */
export type RawLessonContinuationSource = {
  tenseMode?: string;
  continuationOf?: string;
  discourseGoal?: string;
  connectors?: string[];
  targetVerbs?: string[];
  expectedStructures?: string[];
  requiredChunks?: string[];
};

export type NormalizedContinuationFields = {
  tenseMode: TenseMode;
  continuationOf?: string;
  discourseGoal?: string;
  connectors: string[];
  targetVerbs: string[];
  expectedStructures: string[];
  requiredChunks: string[];
};

export function buildContinuationFieldsForLesson(
  lesson: RawLessonContinuationSource
): NormalizedContinuationFields {
  const tenseMode = normalizeTenseMode(lesson.tenseMode);
  return {
    tenseMode,
    continuationOf: lesson.continuationOf?.trim() || undefined,
    discourseGoal: lesson.discourseGoal?.trim() || undefined,
    connectors: lesson.connectors ?? [],
    targetVerbs: lesson.targetVerbs ?? [],
    expectedStructures: lesson.expectedStructures ?? [],
    requiredChunks: lesson.requiredChunks ?? [],
  };
}
