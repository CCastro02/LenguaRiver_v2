/**
 * Validates continuation / tense-mode metadata on lessons.
 * Does not throw from imports; call validateLessonContinuationDataset explicitly
 * (e.g. scripts/lessons/validate_continuation.ts).
 */

import type { Lesson, LessonTier } from "@/lib/lesson-data";
import { isContinuationTenseMode, normalizeTenseMode, type TenseMode } from "@/lib/lesson-tense-mode";

export type ContinuationValidationSeverity = "error" | "warning";

export type ContinuationValidationIssue = {
  severity: ContinuationValidationSeverity;
  lessonId: string;
  code: string;
  message: string;
};

export type ContinuationValidationReport = {
  errors: ContinuationValidationIssue[];
  warnings: ContinuationValidationIssue[];
};

const FORBIDDEN_USER_FACING_SUBSTRINGS = [
  "past tense",
  "future tense",
  "preterite",
  "conjugation",
  "subjunctive",
] as const;

function containsForbiddenTerminology(text: string): string | null {
  const lower = text.toLowerCase();
  for (const phrase of FORBIDDEN_USER_FACING_SUBSTRINGS) {
    if (lower.includes(phrase)) {
      return phrase;
    }
  }
  return null;
}

function collectUserFacingStrings(lesson: Lesson): Array<{ field: string; text: string }> {
  const rows: Array<{ field: string; text: string }> = [
    { field: "title", text: lesson.title },
    { field: "objective", text: lesson.objective },
  ];
  if (lesson.discourseGoal?.trim()) {
    rows.push({ field: "discourseGoal", text: lesson.discourseGoal });
  }
  for (let i = 0; i < lesson.sentences.length; i += 1) {
    rows.push({ field: `sentences[${i}].text`, text: lesson.sentences[i]!.text });
  }
  return rows;
}

function validateGrammarFreeUserFacing(lesson: Lesson, warnings: ContinuationValidationIssue[]): void {
  for (const { field, text } of collectUserFacingStrings(lesson)) {
    const hit = containsForbiddenTerminology(text);
    if (hit) {
      warnings.push({
        severity: "warning",
        lessonId: lesson.id,
        code: "grammar_terminology_in_user_facing",
        message: `Lesson ${lesson.id} ${field} may contain learner-facing grammar jargon ("${hit}").`,
      });
    }
  }
}

function isMediumOrRealTier(tier: LessonTier | undefined): boolean {
  return tier === "medium" || tier === "real";
}

/**
 * Validates the full lesson array. Existing core lessons (all present tense)
 * should produce zero errors; optional warnings only.
 */
export function validateLessonContinuationDataset(lessons: readonly Lesson[]): ContinuationValidationReport {
  const errors: ContinuationValidationIssue[] = [];
  const warnings: ContinuationValidationIssue[] = [];
  const byId = new Map<string, Lesson>();
  lessons.forEach((l) => byId.set(l.id, l));

  for (const lesson of lessons) {
    const tenseMode: TenseMode = normalizeTenseMode(lesson.tenseMode);

    validateGrammarFreeUserFacing(lesson, warnings);

    if (!isContinuationTenseMode(tenseMode)) {
      if (lesson.continuationOf?.trim()) {
        warnings.push({
          severity: "warning",
          lessonId: lesson.id,
          code: "continuation_of_on_present",
          message: `Lesson ${lesson.id} has tenseMode "present" but sets continuationOf; continuationOf is ignored until tense mode is non-present.`,
        });
      }
      continue;
    }

    if (!lesson.continuationOf?.trim()) {
      errors.push({
        severity: "error",
        lessonId: lesson.id,
        code: "continuation_missing_prerequisite",
        message: `Lesson ${lesson.id} has tenseMode "${tenseMode}" but missing continuationOf (prerequisite lesson id).`,
      });
    } else {
      const prereqId = lesson.continuationOf.trim();
      if (prereqId === lesson.id) {
        errors.push({
          severity: "error",
          lessonId: lesson.id,
          code: "continuation_self_reference",
          message: `Lesson ${lesson.id} continuationOf must not reference itself.`,
        });
      }
      const prereq = byId.get(prereqId);
      if (!prereq) {
        errors.push({
          severity: "error",
          lessonId: lesson.id,
          code: "continuation_unknown_prerequisite",
          message: `Lesson ${lesson.id} continuationOf "${prereqId}" does not match any lesson id.`,
        });
      } else if (normalizeTenseMode(prereq.tenseMode) !== "present") {
        errors.push({
          severity: "error",
          lessonId: lesson.id,
          code: "continuation_prerequisite_not_present",
          message: `Lesson ${lesson.id} continuationOf must reference a lesson with tenseMode "present" (got "${normalizeTenseMode(prereq.tenseMode)}" on ${prereq.id}).`,
        });
      }
    }

    if (tenseMode === "mixed" && (!lesson.connectors || lesson.connectors.length === 0)) {
      errors.push({
        severity: "error",
        lessonId: lesson.id,
        code: "mixed_requires_connectors",
        message: `Lesson ${lesson.id} tenseMode "mixed" requires a non-empty connectors array.`,
      });
    }

    if (!lesson.expectedStructures || lesson.expectedStructures.length === 0) {
      errors.push({
        severity: "error",
        lessonId: lesson.id,
        code: "continuation_requires_expected_structures",
        message: `Lesson ${lesson.id} continuation lesson must define at least one expectedStructures entry.`,
      });
    }

    if (isMediumOrRealTier(lesson.tier) && (!lesson.requiredChunks || lesson.requiredChunks.length === 0)) {
      warnings.push({
        severity: "warning",
        lessonId: lesson.id,
        code: "medium_real_should_require_chunks",
        message: `Lesson ${lesson.id} is Medium/Real continuation; requiredChunks should be defined for later strict validation.`,
      });
    }
  }

  return { errors, warnings };
}
