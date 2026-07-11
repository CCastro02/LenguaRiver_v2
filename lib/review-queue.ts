/**
 * Shared review scheduling helpers and chunked queue builders for Recall / sprint flows.
 */

import type {
  LessonLanguage,
  LessonPartOfSpeech,
  LessonRepetitionPriority,
  LessonWordType,
} from "@/lib/lesson-data";
import { lessons } from "@/lib/lesson-data";
import { getExerciseSurfaceText } from "@/lib/chunk-normalizer";
import { buildLexemeKey } from "@/lib/lexeme-key";
import { normalizeForSpeechCompare } from "@/lib/speech-evaluation";

export function getReviewIntervalMs(
  timesCorrect: number,
  repetitionPriority: LessonRepetitionPriority
): number {
  if (repetitionPriority === "high") {
    if (timesCorrect <= 1) {
      return 3 * 60 * 1000;
    }
    if (timesCorrect <= 3) {
      return 20 * 60 * 1000;
    }
    return 2 * 60 * 60 * 1000;
  }
  if (repetitionPriority === "low") {
    if (timesCorrect <= 1) {
      return 30 * 60 * 1000;
    }
    if (timesCorrect <= 3) {
      return 3 * 60 * 60 * 1000;
    }
    return 18 * 60 * 60 * 1000;
  }
  if (timesCorrect <= 1) {
    return 10 * 60 * 1000;
  }
  if (timesCorrect <= 3) {
    return 60 * 60 * 1000;
  }
  return 6 * 60 * 60 * 1000;
}

/** Matches LessonRunner chunk help reveals (`language::chunk::normalized`). */
export function getChunkHelpUsageKey(language: LessonLanguage, chunkText: string): string {
  return `${language}::chunk::${normalizeForSpeechCompare(chunkText)}`;
}

/** First-seen LessonWord-derived metadata per normalized chunk key and language (same pattern as Review page). */
export type LessonChunkMetadata = {
  repetitionPriority: LessonRepetitionPriority;
  type: LessonWordType;
  partOfSpeech: LessonPartOfSpeech;
  translation: string;
  phonetic?: string;
  language: LessonLanguage;
  /** Canonical lexical identity (`lr:v1|…`). */
  lexemeKey?: string;
  context: string;
  exerciseAnchorText?: string;
  acceptedMeanings?: string[];
  /** Bundled chunk image path when imageability allows. */
  image?: string;
};

export function buildLessonChunkMetadataMap(): Map<string, LessonChunkMetadata> {
  const map = new Map<string, LessonChunkMetadata>();
  lessons.forEach((oneLesson) => {
    const lang = oneLesson.language;
    oneLesson.sentences.forEach((sentence) => {
      sentence.words.forEach((word) => {
        const key = `${lang}::${word.text.toLowerCase()}`;
        if (!map.has(key)) {
          map.set(key, {
            repetitionPriority: word.repetitionPriority,
            type: word.type,
            partOfSpeech: word.partOfSpeech,
            translation: word.translation,
            phonetic: word.phonetic,
            language: lang,
            lexemeKey: buildLexemeKey(lang, word.text),
            context: sentence.text,
            exerciseAnchorText: word.exerciseAnchorText,
            acceptedMeanings: word.acceptedMeanings,
            image: word.image,
          });
        }
      });
    });
  });
  return map;
}

export type StoredChunkSnapshot = {
  text: string;
  type: LessonWordType;
  timesSeen: number;
  timesCorrect: number;
  lastPracticed: string;
};

export function chunkIsDueForReview(
  chunk: StoredChunkSnapshot,
  meta: LessonChunkMetadata,
  nowMs: number
): boolean {
  const repetitionPriority = meta.repetitionPriority;
  const lastPracticedMs = new Date(chunk.lastPracticed).getTime();
  const intervalMs = getReviewIntervalMs(chunk.timesCorrect, repetitionPriority);
  return Number.isFinite(lastPracticedMs) && nowMs - lastPracticedMs >= intervalMs;
}

export type RecallSortContext = {
  helpUsage: Record<string, { translationReveals: number; phoneticReveals: number }>;
  language: LessonLanguage;
};

export type QuickRecallItem = {
  key: string;
  /** Canonical chunk spelling as stored in progress (matches LessonWord.text for first-hit metadata). */
  text: string;
  surfaceText: string;
  type: LessonWordType;
  translation: string;
  phonetic?: string;
  acceptedMeanings?: string[];
  repetitionPriority: LessonRepetitionPriority;
  context: string;
  /** Canonical lexical identity (`lr:v1|…`). */
  lexemeKey?: string;
  mode: "l2-to-meaning" | "meaning-to-l2";
};

const WEAK_ACCURACY = 0.7;
const HELP_WEIGHT = { high: 0, medium: 1, low: 2 } as const;

/**
 * Adaptive ordering for sprint recall:
 * 1. Due review
 * 2. Weak chunks (accuracy < threshold)
 * 3. Helped often
 * 4. Recently practiced (fallback exposure)
 *
 * Dedup by chunk key after sort; cap length.
 */
export function buildQuickRecallSessionItems(
  chunks: Record<string, StoredChunkSnapshot>,
  chunkMetaMap: Map<string, LessonChunkMetadata>,
  ctx: RecallSortContext,
  options: {
    nowMs?: number;
    maxPrompts?: number;
  }
): QuickRecallItem[] {
  const { helpUsage, language } = ctx;
  const maxPrompts = Math.min(Math.max(options.maxPrompts ?? 12, 1), 15);
  const nowMs = options.nowMs ?? Date.now();

  type Row = StoredChunkSnapshot & {
    meta: LessonChunkMetadata;
    storageKeyLower: string;
    isDue: boolean;
    accuracy: number;
    isWeak: boolean;
    helpCount: number;
    lastMs: number;
    priorityWeight: number;
  };

  const rows: Row[] = [];
  for (const raw of Object.values(chunks)) {
    if ((raw.timesSeen ?? 0) <= 0) {
      continue;
    }
    const storageKeyLower = raw.text.toLowerCase();
    const lookupKey = `${language}::${storageKeyLower}`;
    const meta = chunkMetaMap.get(lookupKey);
    if (!meta || meta.language !== language) {
      continue;
    }
    if (meta.type === "person-name") {
      continue;
    }
    const accuracy = raw.timesSeen === 0 ? 0 : raw.timesCorrect / raw.timesSeen;
    const isDue = chunkIsDueForReview(raw, meta, nowMs);
    const isWeak = accuracy < WEAK_ACCURACY;
    const helpKey = getChunkHelpUsageKey(language, raw.text);
    const helpEntry = helpUsage[helpKey];
    const helpCount =
      (helpEntry?.translationReveals ?? 0) + (helpEntry?.phoneticReveals ?? 0);
    const lastMs = new Date(raw.lastPracticed).getTime();
    const priorityWeight =
      HELP_WEIGHT[meta.repetitionPriority ?? "medium"] ?? HELP_WEIGHT.medium;
    rows.push({
      ...raw,
      meta,
      storageKeyLower,
      isDue,
      accuracy,
      isWeak,
      helpCount,
      lastMs,
      priorityWeight,
    });
  }

  rows.sort((a, b) => {
    const dueA = a.isDue ? 1 : 0;
    const dueB = b.isDue ? 1 : 0;
    if (dueA !== dueB) {
      return dueB - dueA;
    }
    const weakA = a.isWeak ? 1 : 0;
    const weakB = b.isWeak ? 1 : 0;
    if (weakA !== weakB) {
      return weakB - weakA;
    }
    if (a.accuracy !== b.accuracy) {
      return a.accuracy - b.accuracy;
    }
    const helpCmp = b.helpCount - a.helpCount;
    if (helpCmp !== 0) {
      return helpCmp;
    }
    if (a.priorityWeight !== b.priorityWeight) {
      return a.priorityWeight - b.priorityWeight;
    }
    if (Number.isFinite(b.lastMs) && Number.isFinite(a.lastMs) && b.lastMs !== a.lastMs) {
      return b.lastMs - a.lastMs;
    }
    return a.text.localeCompare(b.text);
  });

  const seen = new Set<string>();
  const out: QuickRecallItem[] = [];

  for (let i = 0; i < rows.length && out.length < maxPrompts; i += 1) {
    const r = rows[i]!;
    if (seen.has(r.storageKeyLower)) {
      continue;
    }
    seen.add(r.storageKeyLower);

    const surfaceText = getExerciseSurfaceText({
      text: r.text,
      exerciseAnchorText: r.meta.exerciseAnchorText,
    });
    const baseKey = `qr::${language}::${r.storageKeyLower}`;
    out.push({
      key: `${baseKey}::${out.length}`,
      text: r.text,
      surfaceText,
      type: r.type,
      translation: r.meta.translation,
      phonetic: r.meta.phonetic,
      acceptedMeanings: r.meta.acceptedMeanings,
      repetitionPriority: r.meta.repetitionPriority,
      context: r.meta.context,
      lexemeKey: r.meta.lexemeKey ?? buildLexemeKey(language, r.text),
      mode: out.length % 2 === 0 ? "l2-to-meaning" : "meaning-to-l2",
    });
  }

  return out;
}
