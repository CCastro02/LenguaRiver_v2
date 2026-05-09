import type { Lesson } from "@/lib/lesson-data";
import type { ScenarioFamilyTierKey } from "@/lib/lesson-scenario-family";
import { normalizeTenseMode } from "@/lib/lesson-tense-mode";

export function isPresentTierGateLesson(lesson: Lesson): boolean {
  return normalizeTenseMode(lesson.tenseMode) === "present";
}

function lessonsForTierGateMath(lessons: Lesson[]): Lesson[] {
  return lessons.filter(isPresentTierGateLesson);
}

export type OrderedScenarioTier = {
  tier: ScenarioFamilyTierKey;
  lessons: Lesson[];
};

export type ScenarioTierGate = {
  unlocked: boolean;
  lockReason: string | null;
  completionPercent: number | null;
};

export const SCENARIO_TIER_UNLOCK_PERCENT = 75;

export function getTierCompletionPercent(
  tierLessons: Lesson[],
  isLessonComplete: (lesson: Lesson) => boolean
): number {
  if (tierLessons.length === 0) {
    return 0;
  }
  const completedLessons = tierLessons.reduce(
    (count, lesson) => count + (isLessonComplete(lesson) ? 1 : 0),
    0
  );
  return Math.round((completedLessons / tierLessons.length) * 100);
}

export function getScenarioTierGates(
  orderedTiers: OrderedScenarioTier[],
  isLessonComplete: (lesson: Lesson) => boolean
): Record<ScenarioFamilyTierKey, ScenarioTierGate> {
  const easyLessons = orderedTiers.find((entry) => entry.tier === "easy")?.lessons ?? [];
  const mediumLessons = orderedTiers.find((entry) => entry.tier === "medium")?.lessons ?? [];
  const easyForGate = lessonsForTierGateMath(easyLessons);
  const mediumForGate = lessonsForTierGateMath(mediumLessons);
  const easyCompletionPercent = getTierCompletionPercent(easyForGate, isLessonComplete);
  const mediumCompletionPercent = getTierCompletionPercent(mediumForGate, isLessonComplete);
  return {
    easy: { unlocked: true, lockReason: null, completionPercent: easyCompletionPercent },
    medium: {
      unlocked: easyForGate.length > 0 && easyCompletionPercent >= SCENARIO_TIER_UNLOCK_PERCENT,
      lockReason:
        easyForGate.length === 0
          ? "Locked - Easy tier is missing."
          : easyCompletionPercent < SCENARIO_TIER_UNLOCK_PERCENT
            ? `Locked - complete ${SCENARIO_TIER_UNLOCK_PERCENT}% of Easy lessons.`
            : null,
      completionPercent: mediumCompletionPercent,
    },
    real: {
      unlocked: mediumForGate.length > 0 && mediumCompletionPercent >= SCENARIO_TIER_UNLOCK_PERCENT,
      lockReason:
        mediumForGate.length === 0
          ? "Locked - Medium tier is missing."
          : mediumCompletionPercent < SCENARIO_TIER_UNLOCK_PERCENT
            ? `Locked - complete ${SCENARIO_TIER_UNLOCK_PERCENT}% of Medium lessons.`
            : null,
      completionPercent: null,
    },
    legacy: { unlocked: true, lockReason: null, completionPercent: null },
  };
}
