/**
 * Grouping and authoring helpers for scenario family × tense mode × tier.
 * Does not alter tier unlock behavior or lesson runtime.
 */

import type { Lesson, LessonTier } from "@/lib/lesson-data";
import type { LessonTierBuckets, ScenarioFamilyTierKey } from "@/lib/lesson-scenario-family";
import { normalizeTenseMode, type TenseMode } from "@/lib/lesson-tense-mode";

const TENSE_MODE_ORDER: TenseMode[] = ["present", "past-retell", "future-plan", "mixed"];

function resolveTierKey(lesson: Lesson): ScenarioFamilyTierKey {
  return lesson.tier ?? "legacy";
}

/**
 * All lessons in the dataset that belong to this scenarioFamily (exact string match).
 */
export function getLessonsForScenarioFamily(lessons: readonly Lesson[], scenarioFamily: string): Lesson[] {
  const key = scenarioFamily.trim();
  if (!key) {
    return [];
  }
  return lessons.filter((l) => (l.scenarioFamily ?? "").trim() === key);
}

/**
 * Lessons in a family whose tense mode is not "present" (continuation track).
 */
export function getScenarioContinuationLessons(lessons: readonly Lesson[], scenarioFamily: string): Lesson[] {
  return getLessonsForScenarioFamily(lessons, scenarioFamily).filter((l) => l.tenseMode !== "present");
}

/**
 * Filter by normalized tense mode.
 */
export function getLessonsByTenseMode(lessons: readonly Lesson[], tenseMode: TenseMode): Lesson[] {
  return lessons.filter((l) => l.tenseMode === tenseMode);
}

/**
 * Buckets lessons for one scenario family by tense mode, then by tier (easy / medium / real / legacy).
 * Tense modes with no lessons are omitted from the map.
 */
export function groupLessonsByScenarioFamilyTenseModeAndTier(
  lessons: readonly Lesson[],
  scenarioFamily: string
): Map<TenseMode, LessonTierBuckets> {
  const familyLessons = getLessonsForScenarioFamily(lessons, scenarioFamily);
  const result = new Map<TenseMode, LessonTierBuckets>();

  for (const mode of TENSE_MODE_ORDER) {
    const inMode = familyLessons.filter((l) => l.tenseMode === mode);
    if (inMode.length === 0) {
      continue;
    }
    const tiers: LessonTierBuckets = {};
    for (const lesson of inMode) {
      const tierKey = resolveTierKey(lesson);
      const list = tiers[tierKey] ?? [];
      list.push(lesson);
      tiers[tierKey] = list;
    }
    result.set(mode, tiers);
  }

  return result;
}

export type ContinuationPrerequisiteResolution = {
  prerequisite: Lesson | null;
  /** True when `prerequisite` is a concrete lesson (via continuationOf or chained match). */
  resolved: boolean;
};

/**
 * Unlock metadata: resolve the prerequisite present-scenario lesson for a continuation row.
 */
export function resolveContinuationPrerequisite(
  lesson: Lesson,
  lessonsById: ReadonlyMap<string, Lesson>
): ContinuationPrerequisiteResolution {
  const id = lesson.continuationOf?.trim();
  if (!id) {
    return { prerequisite: null, resolved: false };
  }
  const prerequisite = lessonsById.get(id) ?? null;
  return { prerequisite, resolved: prerequisite !== null };
}

function resolveTierKeyForMatch(lesson: Lesson): ScenarioFamilyTierKey {
  return lesson.tier ?? "legacy";
}

/**
 * Same scenarioFamily + tier + language, given tense mode; excludes `excludeId`.
 * If several match, prefers same continuationOf chain as `lesson`, then id order.
 */
function findMatchingLessonByFamilyTierAndTense(
  lesson: Lesson,
  lessonsById: ReadonlyMap<string, Lesson>,
  tenseMode: TenseMode,
  excludeId: string
): Lesson | null {
  const family = (lesson.scenarioFamily ?? "").trim();
  if (!family) {
    return null;
  }
  const tierKey = resolveTierKeyForMatch(lesson);
  const chainPresentId = lesson.continuationOf?.trim();
  const matches: Lesson[] = [];
  for (const candidate of lessonsById.values()) {
    if (candidate.id === excludeId || candidate.language !== lesson.language) {
      continue;
    }
    if ((candidate.scenarioFamily ?? "").trim() !== family) {
      continue;
    }
    if (resolveTierKeyForMatch(candidate) !== tierKey) {
      continue;
    }
    if (normalizeTenseMode(candidate.tenseMode) !== tenseMode) {
      continue;
    }
    matches.push(candidate);
  }
  if (matches.length === 0) {
    return null;
  }
  if (matches.length === 1) {
    return matches[0];
  }
  if (chainPresentId) {
    const onSameChain = matches.filter((m) => m.continuationOf?.trim() === chainPresentId);
    if (onSameChain.length === 1) {
      return onSameChain[0];
    }
    if (onSameChain.length > 1) {
      return onSameChain.slice().sort((a, b) => a.id.localeCompare(b.id))[0];
    }
  }
  return matches.slice().sort((a, b) => a.id.localeCompare(b.id))[0];
}

/**
 * Prerequisite lesson for continuation unlock: chains present → past-retell →
 * future-plan → mixed by scenarioFamily and tier, with continuationOf fallbacks
 * when an intermediate mode has no lesson in the catalog.
 */
export function resolveEffectiveContinuationPrerequisite(
  lesson: Lesson,
  lessonsById: ReadonlyMap<string, Lesson>
): ContinuationPrerequisiteResolution {
  const mode = normalizeTenseMode(lesson.tenseMode);
  if (mode === "present") {
    return { prerequisite: null, resolved: false };
  }
  if (mode === "past-retell") {
    return resolveContinuationPrerequisite(lesson, lessonsById);
  }
  if (mode === "future-plan") {
    const past = findMatchingLessonByFamilyTierAndTense(lesson, lessonsById, "past-retell", lesson.id);
    if (past) {
      return { prerequisite: past, resolved: true };
    }
    return resolveContinuationPrerequisite(lesson, lessonsById);
  }
  if (mode === "mixed") {
    const future = findMatchingLessonByFamilyTierAndTense(lesson, lessonsById, "future-plan", lesson.id);
    if (future) {
      return { prerequisite: future, resolved: true };
    }
    const past = findMatchingLessonByFamilyTierAndTense(lesson, lessonsById, "past-retell", lesson.id);
    if (past) {
      return { prerequisite: past, resolved: true };
    }
    return resolveContinuationPrerequisite(lesson, lessonsById);
  }
  return resolveContinuationPrerequisite(lesson, lessonsById);
}

/**
 * True if the lesson is authored as a non-present continuation row.
 */
export function isContinuationLessonRow(lesson: Lesson): boolean {
  return lesson.tenseMode !== "present";
}

export type TierWithinTenseMode = LessonTier | "legacy";

export function getTiersForFamilyTenseMode(
  lessons: readonly Lesson[],
  scenarioFamily: string,
  tenseMode: TenseMode
): Partial<Record<TierWithinTenseMode, Lesson[]>> {
  const bucket = groupLessonsByScenarioFamilyTenseModeAndTier(lessons, scenarioFamily).get(tenseMode);
  if (!bucket) {
    return {};
  }
  const out: Partial<Record<TierWithinTenseMode, Lesson[]>> = {};
  (["easy", "medium", "real", "legacy"] as const).forEach((tier) => {
    const list = bucket[tier];
    if (list && list.length > 0) {
      out[tier] = list;
    }
  });
  return out;
}
