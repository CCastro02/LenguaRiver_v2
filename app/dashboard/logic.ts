import { lessons, type Lesson, type LessonLanguage } from "@/lib/lesson-data";
import type { LessonWordType } from "@/lib/lesson-data";
import type { TopicProgress } from "@/app/topic-progress";
import { getLessonCompletionStatus, isChunkMastered } from "@/lib/lesson-status";
import { toCoreTopic, type CoreTopic } from "@/lib/core-topics";

export { lessons, type Lesson, type LessonLanguage };

export const DASHBOARD_REVIEW_ANCHOR = new Date().getTime();

export type ProgressChunk = {
  text: string;
  type: LessonWordType;
  timesSeen: number;
  timesCorrect: number;
  lastPracticed: string;
  speechAttempts?: number;
  speechCorrect?: number;
  speechMatchPercent?: number;
  lastSpeechPracticedAt?: string;
  writingAttempts?: number;
  writingCorrect?: number;
  writingAccuracy?: number;
};

export type LessonStatus = "completed" | "in progress" | "not started";

type TopicProgressByLessonId = Map<string, TopicProgress>;

export { getReviewIntervalMs } from "@/lib/review-queue";

export function chunkAccuracy(timesSeen: number, timesCorrect: number): number {
  if (timesSeen === 0) {
    return 0;
  }
  return timesCorrect / timesSeen;
}

export function getLessonStatus(
  lesson: Lesson,
  chunks: Record<string, { timesSeen: number; timesCorrect: number }>,
  topicProgressById?: TopicProgressByLessonId
): LessonStatus {
  const canonicalProgress = topicProgressById?.get(lesson.id);
  if (canonicalProgress) {
    const completion = getLessonCompletionStatus(lesson, canonicalProgress);
    if (completion.isComplete) {
      return "completed";
    }
    if (completion.isStarted) {
      return "in progress";
    }
    return "not started";
  }

  const allWords = lesson.sentences.flatMap((sentence) => sentence.words);
  const seenCount = allWords.filter((word) => (chunks[word.text.toLowerCase()]?.timesSeen ?? 0) > 0).length;
  const learnedCount = allWords.filter((word) => {
    const tracked = chunks[word.text.toLowerCase()];
    if (!tracked) {
      return false;
    }
    return chunkAccuracy(tracked.timesSeen, tracked.timesCorrect) >= 0.6;
  }).length;
  const completionRatio = allWords.length === 0 ? 0 : learnedCount / allWords.length;

  if (completionRatio >= 0.7) {
    return "completed";
  }
  if (seenCount > 0) {
    return "in progress";
  }
  return "not started";
}

export const CORE_PILLAR_DEFS: { name: CoreTopic; blurb: string; topics: CoreTopic[] }[] = [
  { name: "Introductions", blurb: "Greetings, names, and first phrases.", topics: ["Introductions"] },
  { name: "Ordering Food", blurb: "Menus, orders, and paying the bill.", topics: ["Ordering Food"] },
  { name: "Directions", blurb: "Finding your way and asking for routes.", topics: ["Directions"] },
  { name: "Shopping", blurb: "Prices, sizes, and what you are looking for.", topics: ["Shopping"] },
  { name: "Hotel", blurb: "Check-in, the room, and help from staff.", topics: ["Hotel"] },
  { name: "Emergencies & Help", blurb: "When you need help fast or feel unsure.", topics: ["Emergencies & Help"] },
  { name: "Job & Hobbies", blurb: "Work, interests, and everyday life.", topics: ["Job & Hobbies"] },
];

export function orderedCoreLessons(languageLessons: Lesson[]): Lesson[] {
  const ordered: Lesson[] = [];
  const seen = new Set<string>();
  for (const pillar of CORE_PILLAR_DEFS) {
    for (const oneLesson of languageLessons) {
      if (
        oneLesson.sourceType === "core" &&
        toCoreTopic(oneLesson.topic) === pillar.name &&
        !seen.has(oneLesson.id)
      ) {
        seen.add(oneLesson.id);
        ordered.push(oneLesson);
      }
    }
  }
  return ordered;
}

export function pillarReadiness(
  lessonsIn: Lesson[],
  chunks: Record<string, { timesSeen: number; timesCorrect: number }>,
  topicProgressById?: TopicProgressByLessonId
): { readiness: number; status: string } {
  const byLesson = lessonsIn.map((l) => ({ lesson: l, st: getLessonStatus(l, chunks, topicProgressById) }));
  const allWords = lessonsIn.flatMap((l) => l.sentences.flatMap((s) => s.words));
  if (allWords.length === 0) {
    return { readiness: 0, status: "Not available" };
  }
  const learned = allWords.filter((word) => {
    const t = chunks[word.text.toLowerCase()];
    return isChunkMastered(t);
  }).length;
  const readiness = Math.round((learned / allWords.length) * 100);
  const allDone = byLesson.length > 0 && byLesson.every((x) => x.st === "completed");
  const anyStarted = byLesson.some((x) => x.st !== "not started");
  const status = allDone ? "Complete" : anyStarted ? "In progress" : "Not started";
  return { readiness, status };
}

export function weakCoreCount(chunks: Record<string, ProgressChunk>): number {
  return Object.values(chunks).filter(
    (c) => c.type === "core" && c.timesSeen > 0 && chunkAccuracy(c.timesSeen, c.timesCorrect) < 0.6
  ).length;
}

export function nextLessonProgressPct(lesson: Lesson | null, uiChunks: Record<string, ProgressChunk>): number {
  if (!lesson) {
    return 0;
  }
  const allWords = lesson.sentences.flatMap((s) => s.words);
  if (allWords.length === 0) {
    return 0;
  }
  const learned = allWords.filter((word) => {
    const t = uiChunks[word.text.toLowerCase()];
    return isChunkMastered(t);
  }).length;
  return Math.round((learned / allWords.length) * 100);
}
