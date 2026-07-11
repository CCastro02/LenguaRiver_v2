import type { Lesson, LessonTier } from "@/lib/lesson-data";
import type { LessonCompletionStatus } from "@/lib/lesson-status";
import { CORE_TOPICS, toCoreTopic, type CoreTopic } from "@/lib/core-topics";

export const phases = ["Exposure", "Breakdown", "Active Recall", "Reinforcement"] as const;

export type TopicStatus = "Not started" | "In progress" | "Complete" | "Locked";

export const CORE_GROUP_ORDER = CORE_TOPICS;

export function getCoreGroupName(lesson: Lesson): CoreTopic | null {
  return toCoreTopic(lesson.topic);
}

export type TopicCompletionSummary = {
  isCompleted: boolean;
  accuracy: number;
  phasesDone: number;
  completion: LessonCompletionStatus;
  masteryScore: number;
  masteryTier: string;
  masteryBreakdown: {
    speaking: { value: number; source: "exact" | "approx" | "fallback" };
    recall: { value: number; source: "exact" | "approx" | "fallback" };
    writing: { value: number; source: "exact" | "approx" | "fallback" };
    consistency: { value: number; source: "exact" | "approx" | "fallback" };
  };
};

export function getCoreGroupAccordionStatus(
  topics: Lesson[],
  topicStatusById: Map<string, TopicStatus>,
  showHydrated: boolean
): "Complete" | "In progress" | "Not started" {
  if (!showHydrated || topics.length === 0) {
    return "Not started";
  }
  const list = topics.map((t) => topicStatusById.get(t.id) ?? "Not started");
  if (list.every((s) => s === "Complete")) {
    return "Complete";
  }
  if (list.every((s) => s === "Not started")) {
    return "Not started";
  }
  return "In progress";
}

export function getCoreGroupAvgAccuracy(
  topics: Lesson[],
  topicCompletionById: Map<string, TopicCompletionSummary>,
  showHydrated: boolean
): number {
  if (!showHydrated || topics.length === 0) {
    return 0;
  }
  let sum = 0;
  topics.forEach((t) => {
    sum += topicCompletionById.get(t.id)?.accuracy ?? 0;
  });
  return Math.round(sum / topics.length);
}

export function getTrackLabel(trackType: Lesson["trackType"]): "Core" | "Lang" | "Interest" {
  if (trackType === "language-specific") {
    return "Lang";
  }
  if (trackType === "interest") {
    return "Interest";
  }
  return "Core";
}

export function getSourceTypeLabel(
  sourceType: Lesson["sourceType"],
  trackType: Lesson["trackType"]
): "Core" | "Extra Practice" | "Real-world scenario" | null {
  if (sourceType === "generated") {
    if (trackType === "language-specific") {
      return "Real-world scenario";
    }
    return "Extra Practice";
  }
  return null;
}

export const LAST_LESSON_STORAGE_KEY = "lenguaRiver.lastLessonId";

export function formatLessonTierLabel(tier: LessonTier): string {
  return tier[0].toUpperCase() + tier.slice(1);
}

export function getLessonTierChipClass(tier: LessonTier): string {
  return `lr-tier-chip lr-tier-chip--${tier}`;
}
