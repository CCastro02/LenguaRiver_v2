import type { Lesson } from "@/lib/lesson-data";
import type { LessonPhase, TopicProgress } from "@/app/topic-progress";

export type ChunkProgressLike = {
  timesSeen: number;
  timesCorrect: number;
};

export type ChunkProgressMapLike =
  | Record<string, ChunkProgressLike>
  | Map<string, ChunkProgressLike>;

export type TopicCompletionStatus = {
  requiredCoreCount: number;
  completeCoreCount: number;
  masteredCoreCount: number;
  isComplete: boolean;
  isMastered: boolean;
};

const LESSON_PHASES: LessonPhase[] = [
  "Exposure",
  "Breakdown",
  "Active Recall",
  "Reinforcement",
];
const RECALL_UNLOCK_PHASES: LessonPhase[] = ["Exposure", "Breakdown", "Active Recall"];
export const ACTIVE_RECALL_TARGET_PERCENT = 70;

export type LessonCompletionStatus = {
  activeRecallAccuracy: number;
  phasesDone: number;
  totalPhases: number;
  isStarted: boolean;
  allPhasesComplete: boolean;
  recallTargetMet: boolean;
  noPhaseUntrainedForRecallUnlock: boolean;
  isComplete: boolean;
};

export type LessonProgressStatus = "Not started" | "In progress" | "Complete" | "Locked";

function getChunkProgress(
  chunkProgressMap: ChunkProgressMapLike,
  key: string
): ChunkProgressLike | undefined {
  if (chunkProgressMap instanceof Map) {
    return chunkProgressMap.get(key);
  }
  return chunkProgressMap[key];
}

export function getChunkMastery(chunkProgress: ChunkProgressLike | undefined): number {
  if (!chunkProgress || chunkProgress.timesSeen <= 0) {
    return 0;
  }
  return chunkProgress.timesCorrect / chunkProgress.timesSeen;
}

export function isChunkMastered(chunkProgress: ChunkProgressLike | undefined): boolean {
  if (!chunkProgress) {
    return false;
  }
  return chunkProgress.timesSeen >= 2 && getChunkMastery(chunkProgress) >= 0.8;
}

export function getLessonActiveRecallAccuracy(topicProgress: TopicProgress | undefined): number {
  if (!topicProgress || topicProgress.activeRecallAttempts <= 0) {
    return 0;
  }
  return (topicProgress.activeRecallCorrect / topicProgress.activeRecallAttempts) * 100;
}

export function getLessonPhasesDone(topicProgress: TopicProgress | undefined): number {
  if (!topicProgress) {
    return 0;
  }
  return LESSON_PHASES.filter((phase) => topicProgress.completedPhases[phase] === true).length;
}

export function getLessonCompletionStatus(
  _lesson: Lesson,
  topicProgress: TopicProgress | undefined
): LessonCompletionStatus {
  const activeRecallAccuracy = getLessonActiveRecallAccuracy(topicProgress);
  const phasesDone = getLessonPhasesDone(topicProgress);
  const isStarted = Boolean(
    topicProgress && (phasesDone > 0 || topicProgress.activeRecallAttempts > 0)
  );
  const allPhasesComplete = Boolean(
    topicProgress && LESSON_PHASES.every((phase) => topicProgress.completedPhases[phase] === true)
  );
  const recallTargetMet = activeRecallAccuracy >= ACTIVE_RECALL_TARGET_PERCENT;
  const noPhaseUntrainedForRecallUnlock = Boolean(
    topicProgress && RECALL_UNLOCK_PHASES.every((phase) => topicProgress.completedPhases[phase] === true)
  );
  return {
    activeRecallAccuracy,
    phasesDone,
    totalPhases: LESSON_PHASES.length,
    isStarted,
    allPhasesComplete,
    recallTargetMet,
    noPhaseUntrainedForRecallUnlock,
    isComplete: allPhasesComplete,
  };
}

export function getLessonProgressStatus(
  completion: LessonCompletionStatus,
  isLocked: boolean
): LessonProgressStatus {
  if (isLocked && !completion.isComplete) {
    return "Locked";
  }
  if (completion.isComplete) {
    return "Complete";
  }
  if (completion.isStarted) {
    return "In progress";
  }
  return "Not started";
}

export function isLessonComplete(lesson: Lesson, topicProgress: TopicProgress | undefined): boolean {
  if (!topicProgress) {
    return false;
  }
  return getLessonCompletionStatus(lesson, topicProgress).isComplete;
}

export function getLessonChunkMasteryRatio(
  lesson: Lesson,
  chunkProgressMap: ChunkProgressMapLike
): number {
  const uniqueChunkKeys = Array.from(
    new Set(lesson.sentences.flatMap((sentence) => sentence.words.map((word) => word.text.toLowerCase())))
  );
  if (uniqueChunkKeys.length === 0) {
    return 0;
  }
  const masteredCount = uniqueChunkKeys.filter((chunkKey) =>
    isChunkMastered(getChunkProgress(chunkProgressMap, chunkKey))
  ).length;
  return masteredCount / uniqueChunkKeys.length;
}

export function isLessonMastered(
  lesson: Lesson,
  topicProgress: TopicProgress | undefined,
  chunkProgressMap: ChunkProgressMapLike
): boolean {
  return isLessonComplete(lesson, topicProgress) && getLessonChunkMasteryRatio(lesson, chunkProgressMap) >= 0.8;
}

export function getTopicCompletionStatus(
  topicLessons: Lesson[],
  topicProgressMap: Map<string, TopicProgress>,
  chunkProgressMap: ChunkProgressMapLike
): TopicCompletionStatus {
  const requiredCoreLessons = topicLessons.filter(
    (lesson) => lesson.sourceType === "core" && lesson.trackType === "core" && lesson.required
  );
  if (requiredCoreLessons.length === 0) {
    return {
      requiredCoreCount: 0,
      completeCoreCount: 0,
      masteredCoreCount: 0,
      isComplete: false,
      isMastered: false,
    };
  }
  const completeCoreCount = requiredCoreLessons.filter((lesson) =>
    isLessonComplete(lesson, topicProgressMap.get(lesson.id))
  ).length;
  const masteredCoreCount = requiredCoreLessons.filter((lesson) =>
    isLessonMastered(lesson, topicProgressMap.get(lesson.id), chunkProgressMap)
  ).length;
  return {
    requiredCoreCount: requiredCoreLessons.length,
    completeCoreCount,
    masteredCoreCount,
    isComplete: completeCoreCount === requiredCoreLessons.length,
    isMastered: masteredCoreCount === requiredCoreLessons.length,
  };
}
