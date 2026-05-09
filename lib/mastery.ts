import type { Lesson } from "@/lib/lesson-data";
import type { TopicProgress } from "@/app/topic-progress";
import { getLessonActiveRecallAccuracy, isLessonComplete } from "@/lib/lesson-status";

export type MasteryTier =
  | "Untrained"
  | "Familiar"
  | "Functional"
  | "Strong"
  | "Operational"
  | "Near-native";

export type ChunkProgressLike = {
  timesSeen: number;
  timesCorrect: number;
  lastPracticed?: string;
  speechAttempts?: number;
  speechCorrect?: number;
  speechMatchPercent?: number;
  lastSpeechPracticedAt?: string;
  writingAttempts?: number;
  writingCorrect?: number;
  writingAccuracy?: number;
};

export type TopicMasteryStores = {
  topicProgressByLessonId: Map<string, TopicProgress>;
  chunkProgressByText: Map<string, ChunkProgressLike>;
  now?: Date;
};

export type MasterySignalSource = "exact" | "approx" | "fallback";

export type MasterySignal = {
  value: number;
  source: MasterySignalSource;
};

export type MasteryBreakdown = {
  speaking: MasterySignal;
  recall: MasterySignal;
  writing: MasterySignal;
  consistency: MasterySignal;
};

export type MasteryScoreResult = {
  score: number;
  tier: MasteryTier;
  breakdown: MasteryBreakdown;
};

function clampScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

function percent(value01: number): number {
  return clampScore(value01 * 100);
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

function daysSince(dateLike: string | undefined, now: Date): number {
  if (!dateLike) return Number.POSITIVE_INFINITY;
  const at = new Date(dateLike).getTime();
  if (Number.isNaN(at)) return Number.POSITIVE_INFINITY;
  const diffMs = Math.max(0, now.getTime() - at);
  return diffMs / (1000 * 60 * 60 * 24);
}

function getDecayPenalty(days: number): number {
  if (days <= 3) return 0;
  if (days <= 7) return 5;
  if (days <= 14) return 12;
  return 25;
}

function getLessonChunkKeys(lesson: Lesson): string[] {
  return Array.from(
    new Set(lesson.sentences.flatMap((sentence) => sentence.words.map((word) => word.text.toLowerCase())))
  );
}

function getChunkProgress(map: Map<string, ChunkProgressLike>, key: string): ChunkProgressLike | undefined {
  return map.get(key);
}

function getLessonLastPracticedAt(lesson: Lesson, stores: TopicMasteryStores): string | undefined {
  const keys = getLessonChunkKeys(lesson);
  let latest: string | undefined;
  keys.forEach((key) => {
    const chunk = getChunkProgress(stores.chunkProgressByText, key);
    const at = chunk?.lastPracticed;
    if (!at) return;
    if (!latest || new Date(at).getTime() > new Date(latest).getTime()) {
      latest = at;
    }
  });
  return latest;
}

function getLessonChunkAccuracyPercent(lesson: Lesson, stores: TopicMasteryStores): number {
  const keys = getLessonChunkKeys(lesson);
  if (keys.length === 0) return 0;
  let sum = 0;
  let measured = 0;
  keys.forEach((key) => {
    const chunk = getChunkProgress(stores.chunkProgressByText, key);
    if (!chunk || chunk.timesSeen <= 0) return;
    sum += ratio(chunk.timesCorrect, chunk.timesSeen);
    measured += 1;
  });
  if (measured === 0) return 0;
  return percent(sum / measured);
}

function getLessonSpeechMatchPercent(lesson: Lesson, stores: TopicMasteryStores): number | null {
  const keys = getLessonChunkKeys(lesson);
  if (keys.length === 0) return null;
  let weightedTotal = 0;
  let totalAttempts = 0;
  keys.forEach((key) => {
    const chunk = getChunkProgress(stores.chunkProgressByText, key);
    const attempts = chunk?.speechAttempts ?? 0;
    const avg = chunk?.speechMatchPercent;
    if (attempts <= 0 || typeof avg !== "number") return;
    weightedTotal += clampScore(avg) * attempts;
    totalAttempts += attempts;
  });
  if (totalAttempts <= 0) return null;
  return clampScore(weightedTotal / totalAttempts);
}

function getLessonSpeechAccuracyPercent(lesson: Lesson, stores: TopicMasteryStores): number | null {
  const keys = getLessonChunkKeys(lesson);
  if (keys.length === 0) return null;
  let attempts = 0;
  let correct = 0;
  keys.forEach((key) => {
    const chunk = getChunkProgress(stores.chunkProgressByText, key);
    attempts += chunk?.speechAttempts ?? 0;
    correct += chunk?.speechCorrect ?? 0;
  });
  if (attempts <= 0) return null;
  return percent(ratio(correct, attempts));
}

function getLessonSpeechAttempts(lesson: Lesson, stores: TopicMasteryStores): number {
  const keys = getLessonChunkKeys(lesson);
  if (keys.length === 0) return 0;
  let attempts = 0;
  keys.forEach((key) => {
    const chunk = getChunkProgress(stores.chunkProgressByText, key);
    attempts += chunk?.speechAttempts ?? 0;
  });
  return attempts;
}

function getLessonWritingAccuracyPercent(lesson: Lesson, stores: TopicMasteryStores): number | null {
  const keys = getLessonChunkKeys(lesson);
  if (keys.length === 0) return null;
  let weightedTotal = 0;
  let totalAttempts = 0;
  keys.forEach((key) => {
    const chunk = getChunkProgress(stores.chunkProgressByText, key);
    const attempts = chunk?.writingAttempts ?? 0;
    const avg = chunk?.writingAccuracy;
    if (attempts <= 0 || typeof avg !== "number") return;
    weightedTotal += clampScore(avg) * attempts;
    totalAttempts += attempts;
  });
  if (totalAttempts <= 0) return null;
  return clampScore(weightedTotal / totalAttempts);
}

function combineSignalSources(sources: MasterySignalSource[]): MasterySignalSource {
  if (sources.includes("fallback")) {
    return "fallback";
  }
  if (sources.includes("approx")) {
    return "approx";
  }
  return "exact";
}

function getLessonReviewConsistencyPercent(lesson: Lesson, stores: TopicMasteryStores): number {
  const keys = getLessonChunkKeys(lesson);
  if (keys.length === 0) return 0;
  const now = stores.now ?? new Date();
  let recentCount = 0;
  let measurable = 0;
  keys.forEach((key) => {
    const chunk = getChunkProgress(stores.chunkProgressByText, key);
    if (!chunk?.lastPracticed) return;
    measurable += 1;
    const days = daysSince(chunk.lastPracticed, now);
    if (days <= 7) recentCount += 1;
  });
  if (measurable === 0) return 0;
  return percent(ratio(recentCount, measurable));
}

// Approximation: we do not persist explicit speaking scores yet.
// Use Exposure phase completion as a binary speaking-success proxy.
function getApproxSpeakingSuccessPercent(lesson: Lesson, stores: TopicMasteryStores): number {
  const progress = stores.topicProgressByLessonId.get(lesson.id);
  return progress?.completedPhases["Exposure"] ? 100 : 0;
}

function getSpeakingSuccessSignal(lesson: Lesson, stores: TopicMasteryStores): MasterySignal {
  const realMatchPercent = getLessonSpeechMatchPercent(lesson, stores);
  if (realMatchPercent !== null) {
    return { value: realMatchPercent, source: "exact" };
  }
  const realSpeechPercent = getLessonSpeechAccuracyPercent(lesson, stores);
  if (realSpeechPercent !== null) {
    return { value: realSpeechPercent, source: "approx" };
  }
  return { value: getApproxSpeakingSuccessPercent(lesson, stores), source: "fallback" };
}

// Approximation: we do not persist explicit writing accuracy yet.
// Use Reinforcement phase completion blended with chunk accuracy.
function getApproxWritingAccuracyPercent(lesson: Lesson, stores: TopicMasteryStores): number {
  const progress = stores.topicProgressByLessonId.get(lesson.id);
  const chunkAccuracy = getLessonChunkAccuracyPercent(lesson, stores);
  if (progress?.completedPhases["Reinforcement"]) {
    return clampScore(0.7 * 100 + 0.3 * chunkAccuracy);
  }
  return clampScore(0.4 * chunkAccuracy);
}

function getWritingAccuracySignal(lesson: Lesson, stores: TopicMasteryStores): MasterySignal {
  const writingAccuracyPercent = getLessonWritingAccuracyPercent(lesson, stores);
  if (writingAccuracyPercent !== null) {
    return { value: writingAccuracyPercent, source: "exact" };
  }
  return { value: getApproxWritingAccuracyPercent(lesson, stores), source: "approx" };
}

function getLessonMasteryScore(lesson: Lesson, stores: TopicMasteryStores): number {
  const breakdown = getLessonMasteryBreakdown(lesson, stores);
  const speaking = breakdown.speaking.value;
  const activeRecall = breakdown.recall.value;
  const writing = breakdown.writing.value;
  const review = breakdown.consistency.value;
  const weighted =
    speaking * 0.4 +
    activeRecall * 0.25 +
    writing * 0.2 +
    review * 0.15;
  const lessonLastPracticed = getLessonLastPracticedAt(lesson, stores);
  return applyMasteryDecay(weighted, lessonLastPracticed, stores.now);
}

function getLessonMasteryBreakdown(lesson: Lesson, stores: TopicMasteryStores): MasteryBreakdown {
  const progress = stores.topicProgressByLessonId.get(lesson.id);
  const speaking = getSpeakingSuccessSignal(lesson, stores);
  const writing = getWritingAccuracySignal(lesson, stores);
  const recallSource: MasterySignalSource =
    getLessonSpeechAttempts(lesson, stores) > 0 ? "approx" : "exact";
  return {
    speaking,
    recall: {
      value: getLessonActiveRecallAccuracy(progress),
      source: recallSource,
    },
    writing,
    consistency: {
      value: getLessonReviewConsistencyPercent(lesson, stores),
      source: "approx",
    },
  };
}

export function getMasteryTier(score: number): MasteryTier {
  const clamped = clampScore(score);
  if (clamped < 10) return "Untrained";
  if (clamped < 30) return "Familiar";
  if (clamped < 60) return "Functional";
  if (clamped < 80) return "Strong";
  if (clamped < 95) return "Operational";
  return "Near-native";
}

export function applyMasteryDecay(score: number, lastPracticedAt?: string, now = new Date()): number {
  const days = daysSince(lastPracticedAt, now);
  const penalty = getDecayPenalty(days);
  return clampScore(score - penalty);
}

export function getChunkMasteryScore(chunkProgress: ChunkProgressLike | undefined): number {
  if (!chunkProgress || chunkProgress.timesSeen <= 0) return 0;
  return clampScore(percent(ratio(chunkProgress.timesCorrect, chunkProgress.timesSeen)));
}

export function getTopicMasteryScore(
  topicLessons: Lesson[],
  stores: TopicMasteryStores
): MasteryScoreResult {
  if (topicLessons.length === 0) {
    return {
      score: 0,
      tier: getMasteryTier(0),
      breakdown: {
        speaking: { value: 0, source: "fallback" },
        recall: { value: 0, source: "exact" },
        writing: { value: 0, source: "approx" },
        consistency: { value: 0, source: "approx" },
      },
    };
  }
  const weighted = topicLessons.map((lesson) => {
    const lessonScore = getLessonMasteryScore(lesson, stores);
    const lessonBreakdown = getLessonMasteryBreakdown(lesson, stores);
    const lessonWeight = lesson.sourceType === "generated" ? 0.35 : 1;
    return { lessonScore, lessonBreakdown, lessonWeight };
  });
  const totalWeight = weighted.reduce((sum, row) => sum + row.lessonWeight, 0);
  if (totalWeight <= 0) {
    return {
      score: 0,
      tier: getMasteryTier(0),
      breakdown: {
        speaking: { value: 0, source: "fallback" },
        recall: { value: 0, source: "exact" },
        writing: { value: 0, source: "approx" },
        consistency: { value: 0, source: "approx" },
      },
    };
  }
  const total = weighted.reduce((sum, row) => sum + row.lessonScore * row.lessonWeight, 0);
  const breakdown = {
    speaking: {
      value: clampScore(
        weighted.reduce((sum, row) => sum + row.lessonBreakdown.speaking.value * row.lessonWeight, 0) /
          totalWeight
      ),
      source: combineSignalSources(weighted.map((row) => row.lessonBreakdown.speaking.source)),
    },
    recall: {
      value: clampScore(
        weighted.reduce((sum, row) => sum + row.lessonBreakdown.recall.value * row.lessonWeight, 0) /
          totalWeight
      ),
      source: combineSignalSources(weighted.map((row) => row.lessonBreakdown.recall.source)),
    },
    writing: {
      value: clampScore(
        weighted.reduce((sum, row) => sum + row.lessonBreakdown.writing.value * row.lessonWeight, 0) /
          totalWeight
      ),
      source: combineSignalSources(weighted.map((row) => row.lessonBreakdown.writing.source)),
    },
    consistency: {
      value: clampScore(
        weighted.reduce((sum, row) => sum + row.lessonBreakdown.consistency.value * row.lessonWeight, 0) /
          totalWeight
      ),
      source: combineSignalSources(weighted.map((row) => row.lessonBreakdown.consistency.source)),
    },
  };
  const score = clampScore(total / totalWeight);
  return {
    score,
    tier: getMasteryTier(score),
    breakdown,
  };
}

export function getLanguageMasteryScore(
  coreTopics: Array<{ mastery: MasteryScoreResult; weight?: number }>
): MasteryScoreResult {
  if (coreTopics.length === 0) {
    return {
      score: 0,
      tier: getMasteryTier(0),
      breakdown: {
        speaking: { value: 0, source: "fallback" },
        recall: { value: 0, source: "exact" },
        writing: { value: 0, source: "approx" },
        consistency: { value: 0, source: "approx" },
      },
    };
  }
  const totalWeight = coreTopics.reduce((sum, topic) => sum + (topic.weight ?? 1), 0);
  if (totalWeight <= 0) {
    return {
      score: 0,
      tier: getMasteryTier(0),
      breakdown: {
        speaking: { value: 0, source: "fallback" },
        recall: { value: 0, source: "exact" },
        writing: { value: 0, source: "approx" },
        consistency: { value: 0, source: "approx" },
      },
    };
  }
  const score = clampScore(
    coreTopics.reduce((sum, topic) => sum + clampScore(topic.mastery.score) * (topic.weight ?? 1), 0) /
      totalWeight
  );
  const breakdown = {
    speaking: {
      value: clampScore(
        coreTopics.reduce(
          (sum, topic) => sum + topic.mastery.breakdown.speaking.value * (topic.weight ?? 1),
          0
        ) / totalWeight
      ),
      source: combineSignalSources(coreTopics.map((topic) => topic.mastery.breakdown.speaking.source)),
    },
    recall: {
      value: clampScore(
        coreTopics.reduce(
          (sum, topic) => sum + topic.mastery.breakdown.recall.value * (topic.weight ?? 1),
          0
        ) / totalWeight
      ),
      source: combineSignalSources(coreTopics.map((topic) => topic.mastery.breakdown.recall.source)),
    },
    writing: {
      value: clampScore(
        coreTopics.reduce(
          (sum, topic) => sum + topic.mastery.breakdown.writing.value * (topic.weight ?? 1),
          0
        ) / totalWeight
      ),
      source: combineSignalSources(coreTopics.map((topic) => topic.mastery.breakdown.writing.source)),
    },
    consistency: {
      value: clampScore(
        coreTopics.reduce(
          (sum, topic) => sum + topic.mastery.breakdown.consistency.value * (topic.weight ?? 1),
          0
        ) / totalWeight
      ),
      source: combineSignalSources(coreTopics.map((topic) => topic.mastery.breakdown.consistency.source)),
    },
  };
  return {
    score,
    tier: getMasteryTier(score),
    breakdown,
  };
}

export function isLessonFlowComplete(lesson: Lesson, stores: TopicMasteryStores): boolean {
  return isLessonComplete(lesson, stores.topicProgressByLessonId.get(lesson.id));
}
