import type { TopicProgress } from "@/app/topic-progress";
import type { Lesson } from "@/lib/lesson-data";
import {
  ACTIVE_RECALL_TARGET_PERCENT,
  getLessonCompletionStatus,
} from "@/lib/lesson-status";
import { isContinuationTenseMode, normalizeTenseMode } from "@/lib/lesson-tense-mode";

const LOCK_COMPLETE_ORIGINAL = "Locked - complete the original scenario first.";
const LOCK_RECALL_TARGET = `Locked - reach ${ACTIVE_RECALL_TARGET_PERCENT}% Active Recall in the original scenario.`;

export type ContinuationLessonUnlockInput = {
  lesson: Lesson;
  prerequisiteLesson: Lesson | undefined;
  prerequisiteProgress: TopicProgress | undefined;
};

export type ContinuationLessonUnlockResult = {
  unlocked: boolean;
  reason?: string;
};

export function isContinuationLessonUnlocked(
  input: ContinuationLessonUnlockInput
): ContinuationLessonUnlockResult {
  const { lesson, prerequisiteLesson, prerequisiteProgress } = input;
  const tenseMode = normalizeTenseMode(lesson.tenseMode);
  if (!isContinuationTenseMode(tenseMode)) {
    return { unlocked: true };
  }
  if (!prerequisiteLesson || prerequisiteProgress === undefined) {
    return { unlocked: false, reason: LOCK_COMPLETE_ORIGINAL };
  }
  const completion = getLessonCompletionStatus(prerequisiteLesson, prerequisiteProgress);
  if (!completion.isComplete) {
    return { unlocked: false, reason: LOCK_COMPLETE_ORIGINAL };
  }
  if (completion.activeRecallAccuracy < ACTIVE_RECALL_TARGET_PERCENT) {
    return { unlocked: false, reason: LOCK_RECALL_TARGET };
  }
  return { unlocked: true };
}
