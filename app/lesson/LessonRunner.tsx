"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  lessons,
  type LessonLanguage,
  type LessonRepetitionPriority,
  type LessonSentence,
  type LessonWord,
} from "@/lib/lesson-data";
import { starterCoreVocabulary } from "@/lib/core-vocabulary";
import { getEnglishContentTokens, normalizeText, tokenizeText } from "@/lib/text-normalization";
import { isFillInBlankContextValid } from "@/lib/fill-in-blank-validation";
import { getAcceptedMeanings } from "@/lib/translation-synonyms";
import { getExerciseSurfaceText } from "@/lib/chunk-normalizer";
import { useProgressStore } from "@/app/progress-store";
import { useSelectedInterest } from "@/app/interest-preferences";
import { useTopicProgressStore, type LessonPhase } from "@/app/topic-progress";
import { isContinuationLessonUnlocked } from "@/lib/lesson-continuation-unlock";
import { resolveEffectiveContinuationPrerequisite } from "@/lib/lesson-scenario-continuation";
import { isContinuationTenseMode, normalizeTenseMode } from "@/lib/lesson-tense-mode";
import { AppShell } from "@/app/AppShell";
import { useAppSettings } from "@/lib/useAppSettings";
import { ACTIVE_RECALL_TARGET_PERCENT, getLessonCompletionStatus } from "@/lib/lesson-status";
import {
  ensureTtsVoicesLoaded,
  getPreferredVoiceForLanguage,
  getTargetLocaleForLanguage,
  speakTextWithPreferredVoice,
} from "@/lib/tts-voice";
import { phases, LAST_LESSON_STORAGE_KEY } from "./lesson-shared";
import { useLessonProgression } from "./use-lesson-progression";
import { computeWeightedMatchPercent, normalizeForSpeechCompare, RecordingPanel } from "./RecordingPanel";
import { isBrowserSpeechRecognitionSupported } from "./useSpeechRecognition";
import { useVocabularySession } from "./useVocabularySession";

type ActiveRecallExerciseType =
  | "chunk-to-meaning"
  | "meaning-to-chunk"
  | "contextual-fill-in"
  | "full-sentence-recall";

type ActiveRecallExercise = {
  id: string;
  type: ActiveRecallExerciseType;
  prompt: string;
  expectedParts: string[];
  expectedPhoneticParts?: string[];
  targetChunks: LessonWord[];
  sentenceText?: string;
  requiredFormality?: "formal" | "informal";
  contextLabel?: string;
};

function speakText(text: string, language: LessonLanguage | string, rate = 0.9): void {
  speakTextWithPreferredVoice(text, String(language), rate);
}

function speakRepeat(text: string, language: LessonLanguage | string, times: number, rate = 0.9): void {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return;
  }
  const lang = String(language);
  const locale = getTargetLocaleForLanguage(lang);
  const voice = getPreferredVoiceForLanguage(lang);
  window.speechSynthesis.cancel();
  let count = 0;
  function play(): void {
    if (count >= times) {
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locale;
    utterance.rate = rate;
    if (voice) {
      utterance.voice = voice;
    }
    utterance.onend = () => {
      count += 1;
      play();
    };
    window.speechSynthesis.speak(utterance);
  }
  play();
}

function clampTtsRate(value: number): number {
  return Math.min(1.15, Math.max(0.65, value));
}

function clampRepeatCount(value: number): number {
  return Math.min(5, Math.max(1, Math.round(value)));
}

function getExpectedSpeechText(exercise: ActiveRecallExercise): string {
  if (exercise.type === "chunk-to-meaning") {
    return exercise.targetChunks
      .map((chunk) => chunk.acceptedMeanings?.[0] ?? chunk.translation)
      .join(" ")
      .trim();
  }
  return exercise.expectedParts.join(" ").trim();
}

function getActiveRecallAnswerLanguage(
  exercise: ActiveRecallExercise,
  lessonLanguage: LessonLanguage
): string {
  if (exercise.type === "chunk-to-meaning") {
    return "en";
  }
  return lessonLanguage;
}

type ExposureShadowSlice = {
  hasPlayedAudio: boolean;
  hasSpoken: boolean;
};

const EXPOSURE_SHADOW_DEFAULT: ExposureShadowSlice = {
  hasPlayedAudio: false,
  hasSpoken: false,
};

function mergeExposureShadow(
  prev: Record<string, ExposureShadowSlice>,
  key: string,
  patch: Partial<ExposureShadowSlice>
): Record<string, ExposureShadowSlice> {
  const cur = prev[key] ?? { ...EXPOSURE_SHADOW_DEFAULT };
  return { ...prev, [key]: { ...cur, ...patch } };
}

/** EASY: recognition + translation→chunk; MEDIUM: contextual fill-in; HARD: full sentence production. */
function activeRecallDifficultyTier(type: ActiveRecallExerciseType): 0 | 1 | 2 {
  if (type === "chunk-to-meaning" || type === "meaning-to-chunk") {
    return 0;
  }
  if (type === "contextual-fill-in") {
    return 1;
  }
  return 2;
}

function repetitionPrioritySortValue(p: LessonRepetitionPriority): number {
  if (p === "high") return 0;
  if (p === "medium") return 1;
  return 2;
}

/**
 * Ordinal frequency proxy: earlier entries in starter core vocab = lower rank = more common = easier.
 * Words absent from the list sort last within the same repetition tier.
 */
function buildCoreVocabularyFrequencyRankMap(language: LessonLanguage): Map<string, number> {
  const map = new Map<string, number>();
  let rank = 0;
  for (const entry of starterCoreVocabulary) {
    if (entry.language !== language) continue;
    const key = normalizeText(entry.baseForm);
    if (!map.has(key)) {
      map.set(key, rank);
      rank += 1;
    }
  }
  return map;
}

function wordFrequencyRank(rankMap: Map<string, number>, word: LessonWord): number {
  return rankMap.get(normalizeText(word.text)) ?? Number.MAX_SAFE_INTEGER;
}

type ActiveRecallExerciseStable = {
  exercise: ActiveRecallExercise;
  stableIndex: number;
};

function compareWithStableIndex(
  a: ActiveRecallExerciseStable,
  b: ActiveRecallExerciseStable,
  cmp: number
): number {
  if (cmp !== 0) return cmp;
  return a.stableIndex - b.stableIndex;
}

function expectedBlankTokenCount(exercise: ActiveRecallExercise): number {
  const joined = exercise.expectedParts.join(" ").trim();
  if (!joined) return 0;
  return tokenizeText(joined).length;
}

function recallSentenceWordCount(exercise: ActiveRecallExercise): number {
  const source = exercise.sentenceText?.trim() ? exercise.sentenceText : exercise.prompt;
  if (!source.trim()) return 0;
  return tokenizeText(source).length;
}

function sortEasyTier(
  items: ActiveRecallExerciseStable[],
  rankMap: Map<string, number>
): ActiveRecallExercise[] {
  return items
    .slice()
    .sort((a, b) => {
      const wa = a.exercise.targetChunks[0];
      const wb = b.exercise.targetChunks[0];
      if (!wa && !wb) return a.stableIndex - b.stableIndex;
      if (!wa) return 1;
      if (!wb) return -1;
      let cmp =
        repetitionPrioritySortValue(wa.repetitionPriority) - repetitionPrioritySortValue(wb.repetitionPriority);
      if (cmp !== 0) return compareWithStableIndex(a, b, cmp);
      cmp = wordFrequencyRank(rankMap, wa) - wordFrequencyRank(rankMap, wb);
      return compareWithStableIndex(a, b, cmp);
    })
    .map((x) => x.exercise);
}

function sortMediumTier(
  items: ActiveRecallExerciseStable[],
  rankMap: Map<string, number>
): ActiveRecallExercise[] {
  return items
    .slice()
    .sort((a, b) => {
      const wa = a.exercise.targetChunks[0];
      const wb = b.exercise.targetChunks[0];
      if (!wa && !wb) return a.stableIndex - b.stableIndex;
      if (!wa) return 1;
      if (!wb) return -1;
      let cmp =
        repetitionPrioritySortValue(wa.repetitionPriority) - repetitionPrioritySortValue(wb.repetitionPriority);
      if (cmp !== 0) return compareWithStableIndex(a, b, cmp);
      cmp = wordFrequencyRank(rankMap, wa) - wordFrequencyRank(rankMap, wb);
      if (cmp !== 0) return compareWithStableIndex(a, b, cmp);
      cmp = expectedBlankTokenCount(a.exercise) - expectedBlankTokenCount(b.exercise);
      return compareWithStableIndex(a, b, cmp);
    })
    .map((x) => x.exercise);
}

function sortHardTier(
  items: ActiveRecallExerciseStable[],
  rankMap: Map<string, number>
): ActiveRecallExercise[] {
  return items
    .slice()
    .sort((a, b) => {
      let cmp = recallSentenceWordCount(a.exercise) - recallSentenceWordCount(b.exercise);
      if (cmp !== 0) return compareWithStableIndex(a, b, cmp);
      const wordsA = a.exercise.targetChunks;
      const wordsB = b.exercise.targetChunks;
      if (wordsA.length === 0 && wordsB.length === 0) return a.stableIndex - b.stableIndex;
      if (wordsA.length === 0) return 1;
      if (wordsB.length === 0) return -1;
      const minRepA = Math.min(...wordsA.map((w) => repetitionPrioritySortValue(w.repetitionPriority)));
      const minRepB = Math.min(...wordsB.map((w) => repetitionPrioritySortValue(w.repetitionPriority)));
      cmp = minRepA - minRepB;
      if (cmp !== 0) return compareWithStableIndex(a, b, cmp);
      const maxFreqA = Math.max(...wordsA.map((w) => wordFrequencyRank(rankMap, w)));
      const maxFreqB = Math.max(...wordsB.map((w) => wordFrequencyRank(rankMap, w)));
      cmp = maxFreqA - maxFreqB;
      return compareWithStableIndex(a, b, cmp);
    })
    .map((x) => x.exercise);
}

/** EASY → MEDIUM → HARD; within each tier easier → harder; ties use original seed order. */
function orderActiveRecallExercisesByDifficulty(
  exercises: ActiveRecallExercise[],
  lessonLanguage: LessonLanguage
): ActiveRecallExercise[] {
  const rankMap = buildCoreVocabularyFrequencyRankMap(lessonLanguage);
  const withStable: ActiveRecallExerciseStable[] = exercises.map((exercise, stableIndex) => ({
    exercise,
    stableIndex,
  }));
  const easy = withStable.filter((x) => activeRecallDifficultyTier(x.exercise.type) === 0);
  const medium = withStable.filter((x) => activeRecallDifficultyTier(x.exercise.type) === 1);
  const hard = withStable.filter((x) => activeRecallDifficultyTier(x.exercise.type) === 2);
  return [...sortEasyTier(easy, rankMap), ...sortMediumTier(medium, rankMap), ...sortHardTier(hard, rankMap)];
}

type ActiveRecallResult = {
  status: "correct" | "partial" | "incorrect";
  correctParts: string[];
  missingParts: string[];
  extraParts: string[];
  tryText: string;
  alsoCorrect?: string[];
  formalityGuidance?: string;
};

type ExposureTypingFeedback = {
  status: "correct" | "incorrect";
};

type PronunciationPracticeChunk = {
  id: string;
  text: string;
  phonetic?: string;
};

type WeakReason = "incorrect" | "help" | "speech";

type SessionWeakChunk = {
  text: string;
  translation: string;
  reasons: Record<WeakReason, number>;
  count: number;
};

type ReinforcementTarget = {
  text: string;
  translation: string;
  contextLabel?: string;
  expectedParts: string[];
  isCore: boolean;
  repeatCount: number;
};

const VOCAB_SAVED_WORDS_STORAGE_KEY = "lenguariver_vocab_saved_words_v1";

function loadSavedVocabularyWordKeys(): Record<string, boolean> {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(VOCAB_SAVED_WORDS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function normalizeAnswer(value: string): string {
  return normalizeForSpeechCompare(value);
}

function tokenize(value: string): string[] {
  return normalizeAnswer(value).split(/\s+/).filter(Boolean);
}

function normalizeRussianPhoneticLatin(value: string): string {
  const normalized = normalizeAnswer(value);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const canonicalized = tokens.map((token) => {
    if (token === "priviet" || token === "privyet") {
      return "privet";
    }
    if (token === "ia") {
      return "ya";
    }
    if (token === "jo") {
      return "yo";
    }
    return token;
  });
  return canonicalized.join(" ").trim();
}

function tokenizeWithNormalizer(value: string, normalizeValue: (input: string) => string): string[] {
  const normalized = normalizeValue(value);
  return normalized.split(/\s+/).filter(Boolean);
}

function evaluatePartsWithNormalizer(
  userAnswer: string,
  expectedParts: string[],
  normalizeValue: (input: string) => string
): ActiveRecallResult {
  const normalizedInput = normalizeValue(userAnswer);
  const correctParts = expectedParts.filter((part) => normalizedInput.includes(normalizeValue(part)));
  const missingParts = expectedParts.filter((part) => !correctParts.includes(part));
  const inputTokens = tokenizeWithNormalizer(userAnswer, normalizeValue);
  const expectedTokens = expectedParts.flatMap((part) => tokenizeWithNormalizer(part, normalizeValue));
  const extraParts = inputTokens.filter((token) => !expectedTokens.includes(token));

  if (missingParts.length === 0 && correctParts.length > 0) {
    return {
      status: "correct",
      correctParts,
      missingParts: [],
      extraParts,
      tryText: expectedParts[0] ?? "",
    };
  }
  if (correctParts.length > 0) {
    return {
      status: "partial",
      correctParts,
      missingParts,
      extraParts,
      tryText: missingParts[0] ?? expectedParts[0] ?? "",
    };
  }
  return {
    status: "incorrect",
    correctParts: [],
    missingParts: expectedParts,
    extraParts,
    tryText: expectedParts[0] ?? "",
  };
}

function buildFillInPrompt(sentenceText: string, chunkText: string): string {
  const sentenceLower = sentenceText.toLowerCase();
  const chunkLower = chunkText.toLowerCase();
  const start = sentenceLower.indexOf(chunkLower);
  if (start === -1) {
    return sentenceText;
  }
  const end = start + chunkText.length;
  return `${sentenceText.slice(0, start)}____${sentenceText.slice(end)}`;
}

function isLikelyPersonName(word: LessonWord, normalizedCategory?: string): boolean {
  if (word.type === "person-name") {
    return true;
  }
  if (normalizedCategory === "places") {
    return false;
  }
  const normalizedText = normalizeAnswer(word.text);
  if (!normalizedText || tokenize(word.text).length !== 1) {
    return false;
  }
  const normalizedTranslation = normalizeAnswer(word.translation);
  const textHasUppercase = /\p{Lu}/u.test(word.text);
  const translationHasUppercase = /\p{Lu}/u.test(word.translation);
  const translationMatchesText = normalizedTranslation === normalizedText;
  const hasNameLikeTranslation =
    translationHasUppercase && tokenize(word.translation).length <= 2 && word.partOfSpeech === "noun";

  return textHasUppercase && (translationMatchesText || hasNameLikeTranslation);
}

function splitSentenceIntoPronunciationPhrases(sentenceText: string): string[] {
  const tokens = tokenize(sentenceText);
  if (tokens.length === 0) {
    return [];
  }
  if (tokens.length <= 3) {
    return [tokens.join(" ")];
  }
  const chunkSize = tokens.length <= 8 ? 2 : 3;
  const phrases: string[] = [];
  for (let index = 0; index < tokens.length; index += chunkSize) {
    const phrase = tokens.slice(index, index + chunkSize).join(" ").trim();
    if (phrase) {
      phrases.push(phrase);
    }
  }
  if (phrases.length >= 2 && tokenize(phrases[phrases.length - 1] ?? "").length === 1) {
    const last = phrases.pop();
    if (last) {
      const prev = phrases.pop() ?? "";
      phrases.push(`${prev} ${last}`.trim());
    }
  }
  return phrases;
}

function buildPronunciationPracticeChunks(sentence: LessonSentence): PronunciationPracticeChunk[] {
  const fromWords: PronunciationPracticeChunk[] = [];
  sentence.words.forEach((word, index) => {
    if (isLikelyPersonName(word)) {
      return;
    }
    const exerciseText = getExerciseSurfaceText(word).trim();
    const anchorText = word.exerciseAnchorText?.trim();
    const text = (anchorText || exerciseText).trim();
    if (!text || text.includes("___")) {
      return;
    }
    fromWords.push({
      id: `w-${index}-${normalizeAnswer(text)}`,
      text,
      phonetic: word.phonetic,
    });
  });

  const deduped = fromWords.filter((chunk, index, all) => {
    const key = normalizeAnswer(chunk.text);
    return all.findIndex((item) => normalizeAnswer(item.text) === key) === index;
  });
  if (deduped.length > 0) {
    return deduped;
  }

  const fallbackPhrases = splitSentenceIntoPronunciationPhrases(sentence.text);
  if (fallbackPhrases.length > 0) {
    return fallbackPhrases.map((text, index) => ({
      id: `p-${index}-${normalizeAnswer(text)}`,
      text,
    }));
  }

  return [
    {
      id: "fallback-full-sentence",
      text: sentence.text,
    },
  ];
}

function getFillCandidateScore(
  word: LessonWord,
  isWeakChunk: boolean,
  helpCount: number
): number {
  const repetitionScore =
    word.repetitionPriority === "high" ? 300 : word.repetitionPriority === "medium" ? 200 : 100;
  const weakScore = isWeakChunk ? 80 : 0;
  const helpScore = Math.min(helpCount, 8) * 10;
  const fillerPenalty =
    word.partOfSpeech === "other" || word.partOfSpeech === "preposition" || word.partOfSpeech === "pronoun"
      ? 40
      : 0;
  const veryShortPenalty = normalizeAnswer(word.text).length <= 2 ? 25 : 0;
  const phraseBonus = word.partOfSpeech === "phrase" || tokenize(word.text).length > 1 ? 35 : 0;
  return repetitionScore + weakScore + helpScore + phraseBonus - fillerPenalty - veryShortPenalty;
}

function isWeakFillCandidate(word: LessonWord): boolean {
  return (
    word.partOfSpeech === "pronoun" ||
    word.partOfSpeech === "preposition" ||
    word.partOfSpeech === "other"
  );
}

function isStrongFillCandidate(word: LessonWord): boolean {
  const isCorePhrase = word.partOfSpeech === "phrase" && word.type === "core";
  const isVerb = word.partOfSpeech === "verb";
  const isHighValue = word.repetitionPriority === "high";
  return isCorePhrase || isVerb || isHighValue;
}

function isNounOrPlaceCandidate(word: LessonWord, normalizedCategory?: string): boolean {
  return normalizedCategory === "places" || word.partOfSpeech === "noun";
}

function evaluateParts(userAnswer: string, expectedParts: string[]): ActiveRecallResult {
  return evaluatePartsWithNormalizer(userAnswer, expectedParts, normalizeAnswer);
}

function getReinforcementExpectedParts(chunkText: string): string[] {
  if (!chunkText.includes("___")) {
    return [chunkText];
  }
  const fixedSegments = chunkText
    .split("___")
    .map((segment) => segment.trim())
    .filter((segment) => normalizeAnswer(segment).length > 0);
  return fixedSegments.length > 0 ? fixedSegments : [chunkText.replace(/___/g, "").trim()].filter(Boolean);
}

function isNearSingleTokenAnswer(inputTokens: string[], acceptedMeanings: string[]): boolean {
  if (inputTokens.length !== 1 || inputTokens[0]!.length < 3) {
    return false;
  }
  const input = inputTokens[0]!;
  return acceptedMeanings.some((meaning) => {
    const expectedTokens = tokenize(meaning);
    if (expectedTokens.length !== 1) {
      return false;
    }
    const expected = expectedTokens[0]!;
    return expected.length > input.length && expected.startsWith(input);
  });
}

function evaluateAcceptedMeanings(userAnswer: string, acceptedMeanings: string[]): ActiveRecallResult {
  const normalizedInput = normalizeAnswer(userAnswer);
  const inputTokens = tokenize(userAnswer);
  const exactMatch = acceptedMeanings.find((meaning) => normalizeAnswer(meaning) === normalizedInput);

  if (exactMatch) {
    return {
      status: "correct",
      correctParts: [exactMatch],
      missingParts: [],
      extraParts: [],
      tryText: exactMatch,
      alsoCorrect: acceptedMeanings,
    };
  }

  function lcsLength(a: string[], b: string[]): number {
    const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 1; i <= a.length; i += 1) {
      for (let j = 1; j <= b.length; j += 1) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
    return dp[a.length][b.length];
  }

  const scoredAccepted = acceptedMeanings
    .map((meaning) => {
      const expectedTokens = tokenize(meaning);
      if (expectedTokens.length === 0 || inputTokens.length === 0) {
        return {
          meaning,
          score: 0,
          matchedTokens: [] as string[],
          missingTokens: expectedTokens,
          extraTokens: inputTokens,
        };
      }
      const matchedTokens = expectedTokens.filter((token) => inputTokens.includes(token));
      const missingTokens = expectedTokens.filter((token) => !inputTokens.includes(token));
      const extraTokens = inputTokens.filter((token) => !expectedTokens.includes(token));
      const matchRatio = matchedTokens.length / expectedTokens.length;
      const orderRatio = lcsLength(inputTokens, expectedTokens) / expectedTokens.length;

      const expectedContentTokens = getEnglishContentTokens(expectedTokens);
      const inputContentTokens = getEnglishContentTokens(inputTokens);
      const contentMatchRatio =
        expectedContentTokens.length > 0
          ? expectedContentTokens.filter((token) => inputContentTokens.includes(token)).length /
            expectedContentTokens.length
          : matchRatio;
      const effectiveMatchRatio =
        expectedContentTokens.length > 0 && inputContentTokens.length > 0
          ? Math.max(matchRatio, contentMatchRatio)
          : matchRatio;
      const rawScore = 0.8 * effectiveMatchRatio + 0.2 * orderRatio;
      const score = missingTokens.length > 0 ? Math.min(rawScore, 0.85) : rawScore;

      return { meaning, score, matchedTokens, missingTokens, extraTokens };
    })
    .sort((a, b) => b.score - a.score);

  const bestMatch = scoredAccepted[0];
  if (!bestMatch) {
    return {
      status: "incorrect",
      correctParts: [],
      missingParts: [acceptedMeanings[0] ?? ""],
      extraParts: [],
      tryText: acceptedMeanings[0] ?? "",
      alsoCorrect: acceptedMeanings,
    };
  }

  const status: ActiveRecallResult["status"] =
    bestMatch.score >= 0.5 || isNearSingleTokenAnswer(inputTokens, acceptedMeanings)
      ? "partial"
      : "incorrect";

  return {
    status,
    correctParts: bestMatch.matchedTokens,
    missingParts: bestMatch.missingTokens,
    extraParts: bestMatch.extraTokens,
    tryText: bestMatch.meaning || acceptedMeanings[0] || "",
    alsoCorrect: acceptedMeanings,
  };
}

function chunkAccuracy(timesSeen: number, timesCorrect: number): number {
  if (timesSeen === 0) {
    return 0;
  }
  return timesCorrect / timesSeen;
}

function priorityWeight(priority: "high" | "medium" | "low"): number {
  return priority === "high" ? 0 : priority === "medium" ? 1 : 2;
}

function getHelpCountForKey(
  helpUsage: Record<string, { translationReveals: number; phoneticReveals: number }>,
  key: string
): number {
  const usage = helpUsage[key.toLowerCase().trim()];
  if (!usage) {
    return 0;
  }
  return usage.translationReveals + usage.phoneticReveals;
}

function isPhaseName(value: string): value is LessonPhase {
  return (
    value === "Exposure" ||
    value === "Breakdown" ||
    value === "Active Recall" ||
    value === "Reinforcement"
  );
}

function getLanguageDisplayName(language: string): string {
  const names: Record<string, string> = {
    ar: "Arabic",
    de: "German",
    en: "English",
    es: "Spanish",
    fr: "French",
    it: "Italian",
    ru: "Russian",
  };
  return names[language] ?? language;
}

function detectInputScript(value: string): "phonetic" | "native" {
  const hasLatin = /[A-Za-z]/.test(value);
  const hasCyrillic = /[\u0400-\u04FF]/.test(value);
  if (hasLatin && !hasCyrillic) {
    return "phonetic";
  }
  return "native";
}

function uniqueOrderedStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  values.forEach((value) => {
    const normalized = normalizeAnswer(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    out.push(value);
  });
  return out;
}

function getFormalityLabel(
  formality: LessonWord["formality"] | LessonSentence["formality"]
): "Formal" | "Informal" | null {
  if (formality === "formal") {
    return "Formal";
  }
  if (formality === "informal") {
    return "Informal";
  }
  return null;
}

function getGenderLabel(gender?: LessonWord["gender"]): "M" | "F" | "N" | null {
  if (gender === "masculine") {
    return "M";
  }
  if (gender === "feminine") {
    return "F";
  }
  if (gender === "neuter") {
    return "N";
  }
  return null;
}

function getBreakdownChunkDisplayText(
  word: LessonWord,
  language: LessonLanguage,
  category?: string
): string {
  if (language !== "es") {
    return word.text;
  }
  if (word.partOfSpeech !== "noun") {
    return word.text;
  }
  const normalized = word.text.toLowerCase().trim();
  if (category === "places") {
    return word.text;
  }
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const hasMultipleWords = tokens.length !== 1;
  if (hasMultipleWords) {
    return word.text;
  }
  const noun = tokens[0] ?? "";
  if (!noun) {
    return word.text;
  }
  // Keep injection conservative: skip likely plural forms and uncertain cases.
  if (noun.endsWith("s")) {
    return word.text;
  }
  if (
    normalized.startsWith("el ") ||
    normalized.startsWith("la ") ||
    normalized.startsWith("los ") ||
    normalized.startsWith("las ") ||
    normalized.startsWith("un ") ||
    normalized.startsWith("una ")
  ) {
    return word.text;
  }
  if (word.gender === "feminine") {
    return `la ${word.text}`;
  }
  if (word.gender === "masculine") {
    return `el ${word.text}`;
  }
  return word.text;
}

function getFormalityTokens(language: LessonLanguage): { formal: string[]; informal: string[] } {
  if (language === "ru") {
    return { formal: ["вы"], informal: ["ты"] };
  }
  return { formal: ["usted", "y usted"], informal: ["tú", "tu", "y tu"] };
}

export function LessonRunner({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const { settings } = useAppSettings();
  const [selectedInterest] = useSelectedInterest();
  const lesson = lessons.find((oneLesson) => oneLesson.id === lessonId)!;
  const tierBaselineRate = lesson.tier
    ? lesson.tier === "easy"
      ? 0.85
      : lesson.tier === "medium"
        ? 0.95
        : 1.05
    : settings.ttsRate ?? 0.9;
  const normalTtsRate = clampTtsRate(tierBaselineRate);
  const slowTtsRate = clampTtsRate(normalTtsRate - 0.1);
  const repeatCount = clampRepeatCount(settings.repeatCount);
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- client mounted; first paint false matches SSR */
    setHasMounted(true);
  }, []);

  useEffect(() => {
    ensureTtsVoicesLoaded();
  }, []);
  const { optionalLanguageSpecific, progressionSequence, topicStatusById, topicCompletionById } =
    useLessonProgression(lesson.language);
  const { chunks, helpUsage, recordChunkAttempt, recordSpeechAttempt, recordWritingAttempt, recordHelpReveal } =
    useProgressStore();
  const { sessionWords, trackWordExposure, finalizeSession } = useVocabularySession(lessonId);
  const { getProgress, markPhaseComplete, recordActiveRecallAttempt } = useTopicProgressStore();
  const lessonsById = useMemo(() => new Map(lessons.map((l) => [l.id, l])), []);
  const continuationDirectUrlLock = useMemo(() => {
    if (!isContinuationTenseMode(normalizeTenseMode(lesson.tenseMode))) {
      return null;
    }
    const { prerequisite } = resolveEffectiveContinuationPrerequisite(lesson, lessonsById);
    const prerequisiteProgress = prerequisite ? getProgress(lesson.language, prerequisite.id) : undefined;
    const { unlocked, reason } = isContinuationLessonUnlocked({
      lesson,
      prerequisiteLesson: prerequisite ?? undefined,
      prerequisiteProgress,
    });
    if (unlocked) {
      return null;
    }
    return { reason };
  }, [getProgress, lesson, lessonsById]);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [showExposureTranslationBySentence, setShowExposureTranslationBySentence] = useState<
    Record<string, boolean>
  >({});
  const [confirmExposureTranslationBySentence, setConfirmExposureTranslationBySentence] = useState<
    Record<string, boolean>
  >({});
  const [showExposurePhoneticBySentence, setShowExposurePhoneticBySentence] = useState<
    Record<string, boolean>
  >({});
  const [confirmExposurePhoneticBySentence, setConfirmExposurePhoneticBySentence] = useState<
    Record<string, boolean>
  >({});
  const [showBreakdownPhoneticBySentence, setShowBreakdownPhoneticBySentence] = useState<
    Record<string, boolean>
  >({});
  const [showContextNoteBySentence, setShowContextNoteBySentence] = useState<Record<string, boolean>>(
    {}
  );
  const [confirmBreakdownPhoneticBySentence, setConfirmBreakdownPhoneticBySentence] = useState<
    Record<string, boolean>
  >({});
  const [activeRecallQueue, setActiveRecallQueue] = useState<ActiveRecallExercise[]>([]);
  const [activeRecallInputs, setActiveRecallInputs] = useState<Record<string, string>>({});
  const [activeRecallChecked, setActiveRecallChecked] = useState<Record<string, boolean>>({});
  const [activeRecallResults, setActiveRecallResults] = useState<Record<string, ActiveRecallResult>>({});
  const [activeRecallTypeFallbackVisible, setActiveRecallTypeFallbackVisible] = useState<
    Record<string, boolean>
  >({});
  const [activeRecallVoiceCorrect, setActiveRecallVoiceCorrect] = useState<Record<string, boolean>>({});
  const [sessionWeakChunks, setSessionWeakChunks] = useState<Record<string, SessionWeakChunk>>({});
  const [reinforcementTargets, setReinforcementTargets] = useState<ReinforcementTarget[]>([]);
  const [reinforcementUsesFallback, setReinforcementUsesFallback] = useState(false);
  const [reinforcementTargetIndex, setReinforcementTargetIndex] = useState(0);
  const [reinforcementInput, setReinforcementInput] = useState("");
  const [reinforcementResult, setReinforcementResult] = useState<ActiveRecallResult | null>(null);
  const [finishNavigationMessage, setFinishNavigationMessage] = useState<string | null>(null);
  const [selectedImageChunk, setSelectedImageChunk] = useState<LessonWord | null>(null);
  const [typingEnabledBySentence, setTypingEnabledBySentence] = useState<Record<string, boolean>>({});
  const [typedSentenceByKey, setTypedSentenceByKey] = useState<Record<string, string>>({});
  const [typingFeedbackBySentence, setTypingFeedbackBySentence] = useState<
    Record<string, ExposureTypingFeedback>
  >({});
  const [showChunkPracticeBySentence, setShowChunkPracticeBySentence] = useState<Record<string, boolean>>({});
  const [showChunkRecordingByKey, setShowChunkRecordingByKey] = useState<Record<string, boolean>>({});
  const [exposureShadowBySentence, setExposureShadowBySentence] = useState<
    Record<string, ExposureShadowSlice>
  >({});
  function buildSentenceHelpKey(sentenceText: string): string {
    return `${lesson.language}::sentence::${normalizeAnswer(sentenceText)}`;
  }

  function buildChunkHelpKey(chunkText: string): string {
    return `${lesson.language}::chunk::${normalizeAnswer(chunkText)}`;
  }

  const recordSessionWeakChunk = useCallback(
    (chunk: Pick<LessonWord, "text" | "translation">, reason: WeakReason) => {
      const key = normalizeAnswer(chunk.text);
      if (!key) {
        return;
      }
      setSessionWeakChunks((prev) => {
        const prevChunk = prev[key];
        const nextReasons: Record<WeakReason, number> = {
          incorrect: prevChunk?.reasons.incorrect ?? 0,
          help: prevChunk?.reasons.help ?? 0,
          speech: prevChunk?.reasons.speech ?? 0,
        };
        nextReasons[reason] += 1;
        return {
          ...prev,
          [key]: {
            text: chunk.text,
            translation: chunk.translation,
            reasons: nextReasons,
            count: nextReasons.incorrect + nextReasons.help + nextReasons.speech,
          },
        };
      });
    },
    []
  );

  const recordSpeechAttemptForChunks = useCallback(
    (targetChunks: LessonWord[], ok: boolean, matchPercent: number, contextSentence?: string) => {
      targetChunks.forEach((chunk) => {
        recordSpeechAttempt(chunk.text, chunk.type, ok, matchPercent);
      });
      window.setTimeout(() => {
        if (process.env.NODE_ENV === "development") {
          console.time("[speech check] vocab tracking");
        }
        targetChunks.forEach((chunk) => {
          trackWordExposure({
            text: chunk.text,
            language: lesson.language,
            lessonId: lesson.id,
            contextSentence,
            translation: chunk.translation,
          });
        });
        if (process.env.NODE_ENV === "development") {
          console.timeEnd("[speech check] vocab tracking");
        }
      }, 0);
    },
    [lesson.id, lesson.language, recordSpeechAttempt, trackWordExposure]
  );

  function recordSentenceHelp(sentence: LessonSentence, helpType: "translation" | "phonetic") {
    recordHelpReveal(buildSentenceHelpKey(sentence.text), helpType);
    sentence.words.forEach((word) => {
      if (word.type === "person-name") {
        return;
      }
      recordHelpReveal(buildChunkHelpKey(word.text), helpType);
      recordSessionWeakChunk(word, "help");
    });
  }

  const adaptiveLesson = useMemo(() => {
    const fallbackSentences = lesson.sentences.slice(0, 4);
    const lessonWords = lesson.sentences.flatMap((sentence) => sentence.words);
    const coreVocabularyForLanguage = starterCoreVocabulary.filter(
      (word) => word.language === lesson.language
    );
    const coreVocabularyByBase = new Map(
      coreVocabularyForLanguage.map((word) => [word.baseForm.toLowerCase(), word])
    );
    const lessonCoreCoverage = {
      covered: lessonWords.filter((word) => coreVocabularyByBase.has(word.text.toLowerCase())),
      uncovered: lessonWords.filter((word) => !coreVocabularyByBase.has(word.text.toLowerCase())),
    };

    if (!hasMounted) {
      return {
        weakChunks: [] as string[],
        newChunks: [] as string[],
        coreChunks: lesson.coreWords.slice(0, 2),
        strongChunks: [] as string[],
        sentences: fallbackSentences,
        coreCoverageRatio:
          lessonWords.length === 0
            ? 0
            : lessonCoreCoverage.covered.length / lessonWords.length,
      };
    }

    const uniqueLessonChunks = Array.from(
      new Set(lesson.sentences.flatMap((sentence) => sentence.words.map((word) => word.text)))
    );

    const lessonChunkSet = new Set(uniqueLessonChunks.map((text) => text.toLowerCase()));
    const chunkPriorityByText = new Map<string, "high" | "medium" | "low">();
    const chunkInCoreByText = new Map<string, boolean>();
    const chunkInterestTopicByText = new Map<string, string>();
    lesson.sentences.forEach((sentence) => {
      sentence.words.forEach((word) => {
        const key = word.text.toLowerCase();
        const coreMatch = coreVocabularyByBase.get(key);
        const effectivePriority = coreMatch?.repetitionPriority ?? word.repetitionPriority;
        if (!chunkPriorityByText.has(key)) {
          chunkPriorityByText.set(key, effectivePriority);
        }
        if (!chunkInCoreByText.has(key)) {
          chunkInCoreByText.set(key, coreVocabularyByBase.has(key));
        }
        if (word.type === "interest" && word.interestTopic && !chunkInterestTopicByText.has(key)) {
          chunkInterestTopicByText.set(key, word.interestTopic);
        }
      });
    });

    const lessonProgress = Object.values(chunks).filter((chunk) =>
      lessonChunkSet.has(chunk.text.toLowerCase())
    );

    const weakCandidates = lessonProgress
      .filter((chunk) => chunk.timesSeen > 0)
      .map((chunk) => ({
        text: chunk.text,
        accuracy: chunkAccuracy(chunk.timesSeen, chunk.timesCorrect),
        helpCount: getHelpCountForKey(helpUsage, `${lesson.language}::chunk::${normalizeAnswer(chunk.text)}`),
        repetitionPriority: chunkPriorityByText.get(chunk.text.toLowerCase()) ?? "medium",
        inCoreVocabulary: chunkInCoreByText.get(chunk.text.toLowerCase()) ?? false,
      }))
      .filter((chunk) => chunk.accuracy < 0.6 || chunk.helpCount >= 2)
      .sort((a, b) => {
        const aWeakness = a.accuracy - Math.min(a.helpCount * 0.08, 0.3);
        const bWeakness = b.accuracy - Math.min(b.helpCount * 0.08, 0.3);
        if (aWeakness !== bWeakness) {
          return aWeakness - bWeakness;
        }
        if (priorityWeight(a.repetitionPriority) !== priorityWeight(b.repetitionPriority)) {
          return priorityWeight(a.repetitionPriority) - priorityWeight(b.repetitionPriority);
        }
        if (a.inCoreVocabulary !== b.inCoreVocabulary) {
          return a.inCoreVocabulary ? -1 : 1;
        }
        return a.text.localeCompare(b.text);
      });

    // Keep low-priority weak chunks in rotation, but less often than high-priority weak chunks.
    const selectedWeakHighPriority = weakCandidates
      .filter((chunk) => chunk.repetitionPriority === "high")
      .slice(0, 1)
      .map((chunk) => chunk.text);
    const selectedWeakMixed = weakCandidates
      .filter((chunk) => !selectedWeakHighPriority.includes(chunk.text))
      .slice(0, 1)
      .map((chunk) => chunk.text);
    const selectedWeak = [...selectedWeakHighPriority, ...selectedWeakMixed];

    const strongChunkTexts = lessonProgress
      .filter((chunk) => chunk.timesSeen > 0)
      .map((chunk) => ({
        text: chunk.text,
        accuracy: chunkAccuracy(chunk.timesSeen, chunk.timesCorrect),
        helpCount: getHelpCountForKey(helpUsage, `${lesson.language}::chunk::${normalizeAnswer(chunk.text)}`),
      }))
      .filter((chunk) => chunk.accuracy >= 0.85 && chunk.helpCount < 2)
      .map((chunk) => chunk.text);

    const newChunkTexts = uniqueLessonChunks.filter((chunkText) => {
      const tracked = chunks[chunkText.toLowerCase()];
      return !tracked || tracked.timesSeen === 0;
    });
    const coreNewChunkTexts = newChunkTexts
      .filter((chunkText) => coreVocabularyByBase.has(chunkText.toLowerCase()))
      .sort(
        (a, b) =>
          getHelpCountForKey(helpUsage, `${lesson.language}::chunk::${normalizeAnswer(b)}`) -
          getHelpCountForKey(helpUsage, `${lesson.language}::chunk::${normalizeAnswer(a)}`)
      );
    const nonCoreNewChunkTexts = newChunkTexts
      .filter((chunkText) => !coreVocabularyByBase.has(chunkText.toLowerCase()))
      .sort(
        (a, b) =>
          getHelpCountForKey(helpUsage, `${lesson.language}::chunk::${normalizeAnswer(b)}`) -
          getHelpCountForKey(helpUsage, `${lesson.language}::chunk::${normalizeAnswer(a)}`)
      );

    const selectedNew = [...coreNewChunkTexts.slice(0, 1), ...nonCoreNewChunkTexts.slice(0, 1)];
    const highPriorityChunks = uniqueLessonChunks
      .filter((chunkText) => coreVocabularyByBase.has(chunkText.toLowerCase()))
      .filter((chunkText) =>
        lesson.sentences.some((sentence) =>
          sentence.words.some(
            (word) =>
              word.text === chunkText &&
              (coreVocabularyByBase.get(word.text.toLowerCase())?.repetitionPriority ?? word.repetitionPriority) ===
                "high" &&
              !strongChunkTexts.includes(chunkText)
          )
        )
      );
    const fallbackHighPriorityChunks = uniqueLessonChunks.filter((chunkText) =>
      lesson.sentences.some((sentence) =>
        sentence.words.some(
          (word) =>
            word.text === chunkText &&
            word.repetitionPriority === "high" &&
            !strongChunkTexts.includes(chunkText)
        )
      )
    );
    const selectedCoreFromNeeds = [...highPriorityChunks, ...fallbackHighPriorityChunks, ...lesson.coreWords]
      .filter((chunkText, index, arr) => arr.indexOf(chunkText) === index)
      .filter((chunkText) => !strongChunkTexts.includes(chunkText))
      .slice(0, 2);
    const selectedStrongKeepAlive = strongChunkTexts.slice(0, 1);
    const selectedCore = [...selectedCoreFromNeeds, ...selectedStrongKeepAlive].slice(0, 2);
    const selectedInterestMatch = uniqueLessonChunks
      .filter((chunkText) => {
        const chunkKey = chunkText.toLowerCase();
        return (
          chunkInterestTopicByText.get(chunkKey) === selectedInterest && !strongChunkTexts.includes(chunkText)
        );
      })
      .slice(0, 1);

    const targetChunks = new Set([
      ...selectedWeak,
      ...selectedNew,
      ...selectedCore,
      ...selectedInterestMatch,
    ]);
    const matchingEntries = lesson.sentences
      .map((sentence, index) => {
        const coreCount = sentence.words.filter((word) =>
          coreVocabularyByBase.has(word.text.toLowerCase())
        ).length;
        const nonCoreCount = sentence.words.length - coreCount;
        const hasTarget = sentence.words.some((word) => targetChunks.has(word.text));
        const hasHighPriorityCore = sentence.words.some((word) => {
          const coreWord = coreVocabularyByBase.get(word.text.toLowerCase());
          return coreWord?.repetitionPriority === "high";
        });
        const interestMatchCount = sentence.words.filter(
          (word) => word.type === "interest" && word.interestTopic === selectedInterest
        ).length;

        return {
        index,
          hasTarget,
          coreCount,
          nonCoreCount,
          hasHighPriorityCore,
          interestMatchCount,
        };
      })
      .filter((entry) => entry.hasTarget)
      .sort((a, b) => {
        if (a.hasHighPriorityCore !== b.hasHighPriorityCore) {
          return a.hasHighPriorityCore ? -1 : 1;
        }
        if (a.coreCount !== b.coreCount) {
          return b.coreCount - a.coreCount;
        }
        if (a.nonCoreCount !== b.nonCoreCount) {
          return a.nonCoreCount - b.nonCoreCount;
        }
        if (a.interestMatchCount !== b.interestMatchCount) {
          return b.interestMatchCount - a.interestMatchCount;
        }
        return a.index - b.index;
      });
    const matchingIndices = matchingEntries.map((entry) => entry.index);

    // Keep lesson coherence by taking a contiguous window around adaptive matches.
    const focusIndex = matchingIndices.length > 0 ? matchingIndices[0] : 0;
    const startIndex = Math.max(0, focusIndex - 1);
    const selectedSentences = lesson.sentences.slice(startIndex, startIndex + 4);

    return {
      weakChunks: selectedWeak,
      newChunks: selectedNew,
      coreChunks: selectedCore,
      strongChunks: strongChunkTexts,
      sentences: selectedSentences.length > 0 ? selectedSentences : lesson.sentences.slice(0, 4),
      coreCoverageRatio:
        lessonWords.length === 0 ? 0 : lessonCoreCoverage.covered.length / lessonWords.length,
    };
  }, [chunks, hasMounted, helpUsage, lesson, selectedInterest]);

  const chunkCategoryByText = useMemo(() => {
    const map = new Map<string, string>();
    starterCoreVocabulary
      .filter((entry) => entry.language === lesson.language)
      .forEach((entry) => {
        if (!map.has(entry.baseForm.toLowerCase())) {
          map.set(entry.baseForm.toLowerCase(), entry.categories[0] ?? "general");
        }
      });
    return map;
  }, [lesson.language]);

  const seededActiveRecallExercises = useMemo(() => {
    const weakSet = new Set(adaptiveLesson.weakChunks.map((chunk) => chunk.toLowerCase()));
    const scoredChunks = Array.from(
      new Map(
        adaptiveLesson.sentences
          .flatMap((sentence) => sentence.words)
          .filter((word) => !isLikelyPersonName(word, chunkCategoryByText.get(word.text.toLowerCase())))
          .map((word) => [word.text.toLowerCase(), word] as const)
      ).values()
    )
      .map((word) => ({
        word,
        score:
          (weakSet.has(word.text.toLowerCase()) ? 4 : 0) +
          (word.repetitionPriority === "high" ? 3 : word.repetitionPriority === "medium" ? 2 : 1) +
          (word.type === "interest" && word.interestTopic === selectedInterest ? 2 : 0),
      }))
      .sort((a, b) => b.score - a.score);

    const chunkToMeaning = scoredChunks.slice(0, 2).map((entry, index) => ({
      id: `chunk-meaning-${index}`,
      type: "chunk-to-meaning" as const,
      prompt: `${entry.word.text}`,
      expectedParts: tokenize(entry.word.translation),
      // Expand with known synonyms so evaluateAcceptedMeanings is always used
      // and common equivalents (e.g. "hi" for "hello") are accepted.
      targetChunks: [
        {
          ...entry.word,
          acceptedMeanings: getAcceptedMeanings(
            entry.word.translation,
            entry.word.acceptedMeanings
          ),
        },
      ],
    }));

    const meaningToChunk = scoredChunks.slice(2, 4).map((entry, index) => ({
      id: `meaning-chunk-${index}`,
      type: "meaning-to-chunk" as const,
      prompt: `${entry.word.translation}`,
      expectedParts: [getExerciseSurfaceText(entry.word)],
      expectedPhoneticParts: [entry.word.phonetic ?? ""].filter(Boolean),
      targetChunks: [entry.word],
      requiredFormality:
        entry.word.formality === "formal" || entry.word.formality === "informal"
          ? entry.word.formality
          : undefined,
      contextLabel: entry.word.contextLabel,
    }));

    const contextualFill: ActiveRecallExercise[] = [];
    adaptiveLesson.sentences.slice(0, 2).forEach((sentence, index) => {
      if (sentence.words.length <= 1) {
        return;
      }
      const analyzedCandidates = sentence.words
        .filter((word) => !isLikelyPersonName(word, chunkCategoryByText.get(word.text.toLowerCase())))
        .map((word) => {
          const normalizedCategory = chunkCategoryByText.get(word.text.toLowerCase());
          const normalizedKey = normalizeAnswer(word.text);
          const progress = chunks[normalizedKey];
          const accuracy =
            progress && progress.timesSeen > 0 ? progress.timesCorrect / progress.timesSeen : undefined;
          const isWeakChunk = adaptiveLesson.weakChunks.some(
            (weakChunk) => normalizeAnswer(weakChunk) === normalizedKey
          );
          const weakByAccuracy = accuracy !== undefined && accuracy < 0.7;
          const helpCount = getHelpCountForKey(
            helpUsage,
            `${lesson.language}::chunk::${normalizedKey}`
          );
          return {
            word,
            normalizedCategory,
            isWeak: isWeakFillCandidate(word),
            isStrong: isStrongFillCandidate(word),
            isNounOrPlace: isNounOrPlaceCandidate(word, normalizedCategory),
            score: getFillCandidateScore(word, isWeakChunk || weakByAccuracy, helpCount),
          };
        })
        .sort((a, b) => b.score - a.score);

      const strongCandidates = analyzedCandidates.filter((candidate) => candidate.isStrong);
      const nounOrPlaceCandidates = analyzedCandidates.filter(
        (candidate) => !candidate.isWeak && candidate.isNounOrPlace
      );
      const weakCandidates = analyzedCandidates.filter((candidate) => candidate.isWeak);
      const preferredOrder = [
        ...strongCandidates,
        ...nounOrPlaceCandidates.filter((c) => !strongCandidates.includes(c)),
        ...weakCandidates.filter(
          (c) => !strongCandidates.includes(c) && !nounOrPlaceCandidates.includes(c)
        ),
      ];
      let chosen: LessonWord | undefined;
      let fillPrompt: string | undefined;
      for (const candidate of preferredOrder) {
        const word = candidate.word;
        const surfaceText = getExerciseSurfaceText(word);
        // A chunk whose text contains a comma spans multiple independent clauses
        // (e.g. "más despacio, por favor"). Blanking it produces a compound expected answer
        // that does not fill a single grammatical slot in the prompt. Skip it and let the
        // loop fall through to a simpler chunk or the meaning-to-chunk fallback.
        if (surfaceText.includes(",")) {
          continue;
        }
        const prompt = buildFillInPrompt(sentence.text, surfaceText);
        if ((prompt.match(/____/g) ?? []).length !== 1) {
          continue;
        }
        if (!isFillInBlankContextValid(sentence.text, surfaceText, lesson.language)) {
          continue;
        }
        chosen = word;
        fillPrompt = prompt;
        break;
      }
      if (chosen && fillPrompt) {
        contextualFill.push({
          id: `context-fill-${index}`,
          type: "contextual-fill-in",
          prompt: fillPrompt,
          expectedParts: [getExerciseSurfaceText(chosen)],
          expectedPhoneticParts: [chosen.phonetic ?? ""].filter(Boolean),
          targetChunks: [chosen],
          sentenceText: sentence.text,
          requiredFormality:
            chosen.formality === "formal" || chosen.formality === "informal"
              ? chosen.formality
              : undefined,
          contextLabel: chosen.contextLabel ?? sentence.contextLabel,
        });
      } else {
        const fallbackWord = analyzedCandidates[0]?.word;
        if (fallbackWord) {
          contextualFill.push({
            id: `context-fill-${index}`,
            type: "meaning-to-chunk",
            prompt: `${fallbackWord.translation}`,
            expectedParts: [getExerciseSurfaceText(fallbackWord)],
            expectedPhoneticParts: [fallbackWord.phonetic ?? ""].filter(Boolean),
            targetChunks: [fallbackWord],
            sentenceText: sentence.text,
            requiredFormality:
              fallbackWord.formality === "formal" || fallbackWord.formality === "informal"
                ? fallbackWord.formality
                : undefined,
            contextLabel: fallbackWord.contextLabel ?? sentence.contextLabel,
          });
        }
      }
    });

    const sentenceRecallSource = adaptiveLesson.sentences[0];
    const fullSentenceRecall = sentenceRecallSource
      ? [
          {
            id: "full-sentence-0",
            type: "full-sentence-recall" as const,
            prompt: `${sentenceRecallSource.translation}`,
            expectedParts: uniqueOrderedStrings(
              sentenceRecallSource.words.map((word) => getExerciseSurfaceText(word))
            ),
            expectedPhoneticParts: uniqueOrderedStrings(
              sentenceRecallSource.phonetic
                ? [sentenceRecallSource.phonetic]
                : [
                    sentenceRecallSource.words
                      .map((word) => word.phonetic)
                      .filter((part): part is string => Boolean(part))
                      .join(" "),
                  ]
            ),
            targetChunks: sentenceRecallSource.words,
            sentenceText: sentenceRecallSource.text,
            requiredFormality:
              sentenceRecallSource.formality === "formal" ||
              sentenceRecallSource.formality === "informal"
                ? sentenceRecallSource.formality
                : undefined,
            contextLabel: sentenceRecallSource.contextLabel,
          },
        ]
      : [];

    const unordered = [...chunkToMeaning, ...meaningToChunk, ...contextualFill, ...fullSentenceRecall];
    return orderActiveRecallExercisesByDifficulty(unordered, lesson.language);
  }, [
    adaptiveLesson.sentences,
    adaptiveLesson.weakChunks,
    chunkCategoryByText,
    chunks,
    helpUsage,
    lesson.language,
    selectedInterest,
  ]);

  const repeatedCoreChunks = useMemo(() => {
    const counts = new Map<string, number>();

    adaptiveLesson.sentences.forEach((sentence) => {
      sentence.words.forEach((word) => {
        if (word.type === "core") {
          counts.set(word.text, (counts.get(word.text) ?? 0) + 1);
        }
      });
    });

    return Array.from(counts.entries()).filter(([, count]) => count > 1);
  }, [adaptiveLesson.sentences]);
  const lessonChunkMetaByKey = useMemo(() => {
    const map = new Map<
      string,
      {
        text: string;
        translation: string;
        contextLabel?: string;
        contextSentence?: string;
        isCore: boolean;
        repeatCount: number;
      }
    >();
    const counts = new Map<string, number>();
    lesson.sentences.forEach((sentence) => {
      sentence.words.forEach((word) => {
        const key = normalizeAnswer(word.text);
        if (!key) {
          return;
        }
        counts.set(key, (counts.get(key) ?? 0) + 1);
        if (!map.has(key)) {
          map.set(key, {
            text: word.text,
            translation: word.translation,
            contextLabel: word.contextLabel ?? sentence.contextLabel,
            contextSentence: sentence.text,
            isCore: word.type === "core",
            repeatCount: 0,
          });
        }
      });
    });
    counts.forEach((count, key) => {
      const entry = map.get(key);
      if (!entry) {
        return;
      }
      map.set(key, { ...entry, repeatCount: count });
    });
    lesson.coreWords.forEach((coreChunk) => {
      const key = normalizeAnswer(coreChunk);
      if (!key || map.has(key)) {
        return;
      }
      map.set(key, {
        text: coreChunk,
        translation: "",
        isCore: true,
        repeatCount: 0,
      });
    });
    return map;
  }, [lesson.coreWords, lesson.sentences]);
  const reinforcementTargetCandidates = useMemo(() => {
    const weakTargets = Object.values(sessionWeakChunks)
      .flatMap((weak) => {
        const key = normalizeAnswer(weak.text);
        const meta = lessonChunkMetaByKey.get(key);
        if (!meta) {
          return [];
        }
        return [
          {
            text: meta.text,
            translation: weak.translation || meta.translation,
            contextLabel: meta.contextLabel,
            expectedParts: getReinforcementExpectedParts(meta.text),
            isCore: meta.isCore,
            repeatCount: meta.repeatCount,
            count: weak.count,
          } satisfies ReinforcementTarget & { count: number },
        ];
      })
      .sort((a, b) => {
        if (b.count !== a.count) {
          return b.count - a.count;
        }
        if (a.isCore !== b.isCore) {
          return a.isCore ? -1 : 1;
        }
        if ((a.repeatCount > 1) !== (b.repeatCount > 1)) {
          return a.repeatCount > 1 ? -1 : 1;
        }
        return a.text.localeCompare(b.text);
      });
    if (weakTargets.length > 0) {
      return {
        targets: weakTargets.slice(0, 3).map((target) => ({
          text: target.text,
          translation: target.translation,
          contextLabel: target.contextLabel,
          expectedParts: target.expectedParts,
          isCore: target.isCore,
          repeatCount: target.repeatCount,
        })),
        fallback: false,
      };
    }
    const repeatedCoreTargets = repeatedCoreChunks
      .map(([chunk, count]) => {
        const key = normalizeAnswer(chunk);
        const meta = lessonChunkMetaByKey.get(key);
        return {
          text: chunk,
          translation: meta?.translation ?? "",
          contextLabel: meta?.contextLabel,
          expectedParts: getReinforcementExpectedParts(chunk),
          isCore: true,
          repeatCount: count,
        } satisfies ReinforcementTarget;
      })
      .slice(0, 3);
    if (repeatedCoreTargets.length > 0) {
      return { targets: repeatedCoreTargets, fallback: true };
    }
    const firstCoreTargets = Array.from(lessonChunkMetaByKey.values())
      .filter((chunk) => chunk.isCore)
      .slice(0, 3)
      .map(
        (chunk) =>
          ({
            text: chunk.text,
            translation: chunk.translation,
            contextLabel: chunk.contextLabel,
            expectedParts: getReinforcementExpectedParts(chunk.text),
            isCore: true,
            repeatCount: chunk.repeatCount,
          }) satisfies ReinforcementTarget
      );
    return { targets: firstCoreTargets, fallback: true };
  }, [lessonChunkMetaByKey, repeatedCoreChunks, sessionWeakChunks]);

  const currentPhase = phases[phaseIndex];
  const exposureSttSupported = hasMounted && isBrowserSpeechRecognitionSupported();
  const exposureShadowGateStats = useMemo(() => {
    const sentences = adaptiveLesson.sentences;
    const completedShadowCount = sentences.filter((s) => {
      const sh = exposureShadowBySentence[s.text] ?? EXPOSURE_SHADOW_DEFAULT;
      if (!exposureSttSupported) {
        return sh.hasPlayedAudio;
      }
      return sh.hasSpoken;
    }).length;
    return {
      sentenceCount: sentences.length,
      completedShadowCount,
      requiredShadowCount: sentences.length,
    };
  }, [adaptiveLesson.sentences, exposureShadowBySentence, exposureSttSupported]);
  const exposureShadowGateOk =
    exposureShadowGateStats.sentenceCount === 0 ||
    exposureShadowGateStats.completedShadowCount >= exposureShadowGateStats.requiredShadowCount;

  const exposureSentenceSignature = useMemo(
    () => adaptiveLesson.sentences.map((s) => s.text).join("\x1e"),
    [adaptiveLesson.sentences]
  );

  useEffect(() => {
    if (!hasMounted) {
      return;
    }
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- reset shadowing when adaptive exposure sentences change. */
    setExposureShadowBySentence({});
  }, [exposureSentenceSignature, hasMounted]);

  /* eslint-disable react-hooks/preserve-manual-memoization -- existing callback memoization intentionally scoped */
  const submitActiveRecallExerciseCheck = useCallback(
    (exercise: ActiveRecallExercise, userAnswer: string) => {
      // For chunk-to-meaning, always use evaluateAcceptedMeanings so that
      // synonym expansion (e.g. "hi" accepted for "hello") is applied.
      // Fall back to [translation] when no acceptedMeanings are set.
      const chunkAcceptedMeanings =
        exercise.type === "chunk-to-meaning"
          ? (exercise.targetChunks[0]?.acceptedMeanings?.length
              ? exercise.targetChunks[0].acceptedMeanings
              : exercise.targetChunks[0]
                ? [exercise.targetChunks[0].translation]
                : null)
          : null;
      let detail = chunkAcceptedMeanings
        ? evaluateAcceptedMeanings(userAnswer, chunkAcceptedMeanings)
        : evaluateParts(userAnswer, exercise.expectedParts);
      const normalizedInput = normalizeAnswer(userAnswer);
      const normalizedRussianPhoneticInput =
        lesson.language === "ru" ? normalizeRussianPhoneticLatin(userAnswer) : normalizedInput;
      if (exercise.type !== "chunk-to-meaning") {
        const exactNativePart = exercise.expectedParts.find((part) => {
          const normalizedPart = normalizeAnswer(part);
          return normalizedPart.length > 0 && normalizedPart === normalizedInput;
        });
        const phoneticCandidates = (exercise.expectedPhoneticParts ?? []).map((part) =>
          lesson.language === "ru" ? normalizeRussianPhoneticLatin(part) : normalizeAnswer(part)
        );
        const feedbackScript = detectInputScript(userAnswer);
        const exactNative = Boolean(exactNativePart);
        const exactPhonetic = phoneticCandidates.some(
          (part) => part.length > 0 && part === normalizedRussianPhoneticInput
        );

        if (exactNative || exactPhonetic) {
          detail = {
            status: "correct",
            correctParts: [exactNativePart ?? userAnswer],
            missingParts: [],
            extraParts: [],
            tryText: exactNativePart ?? exercise.expectedParts[0] ?? "",
          };
        } else if ((exercise.expectedPhoneticParts ?? []).length > 0) {
          const nativeDetail = evaluateParts(userAnswer, exercise.expectedParts);
          const phoneticDetail =
            lesson.language === "ru"
              ? evaluatePartsWithNormalizer(
                  userAnswer,
                  exercise.expectedPhoneticParts ?? [],
                  normalizeRussianPhoneticLatin
                )
              : evaluateParts(userAnswer, exercise.expectedPhoneticParts ?? []);
          const rank = { incorrect: 0, partial: 1, correct: 2 } as const;
          const validationDetail =
            rank[phoneticDetail.status] > rank[nativeDetail.status]
              ? phoneticDetail
              : rank[phoneticDetail.status] < rank[nativeDetail.status]
                ? nativeDetail
                : phoneticDetail.correctParts.length > nativeDetail.correctParts.length
                  ? phoneticDetail
                  : nativeDetail;
          const feedbackDetail = feedbackScript === "phonetic" ? phoneticDetail : nativeDetail;
          detail = {
            ...validationDetail,
            correctParts: feedbackDetail.correctParts,
            missingParts: feedbackDetail.missingParts,
            extraParts: feedbackDetail.extraParts,
            tryText: feedbackDetail.tryText,
          };
        }
      }
      if (exercise.requiredFormality) {
        const formalityTokens = getFormalityTokens(lesson.language);
        const hasFormal = formalityTokens.formal.some((token) =>
          normalizedInput.includes(normalizeAnswer(token))
        );
        const hasInformal = formalityTokens.informal.some((token) =>
          normalizedInput.includes(normalizeAnswer(token))
        );
        const wrongForContext =
          (exercise.requiredFormality === "formal" && hasInformal) ||
          (exercise.requiredFormality === "informal" && hasFormal);
        if (wrongForContext) {
          const formalityChunk = exercise.targetChunks.find((c) => c.formality === exercise.requiredFormality);
          const expectedForm =
            (formalityChunk ? getExerciseSurfaceText(formalityChunk) : null) ??
            exercise.expectedParts[0] ??
            "";
          detail = {
            ...detail,
            status: "incorrect",
            correctParts: [],
            missingParts: [expectedForm],
            formalityGuidance:
              exercise.requiredFormality === "formal"
                ? `Use formal here: ${expectedForm}`
                : `Use informal here: ${expectedForm}`,
            tryText: expectedForm,
          };
        }
      }
      const matchedChunks = new Set(
        exercise.targetChunks
          .filter((chunk) => {
            if (exercise.type === "chunk-to-meaning") {
              const accepted = chunk.acceptedMeanings?.length
                ? chunk.acceptedMeanings
                : [chunk.translation];
              const acceptedResult = evaluateAcceptedMeanings(userAnswer, accepted);
              return acceptedResult.status !== "incorrect";
            }
            return (
              normalizedInput.includes(normalizeAnswer(getExerciseSurfaceText(chunk))) ||
              normalizedInput.includes(normalizeAnswer(chunk.text)) ||
              (chunk.phonetic
                ? lesson.language === "ru"
                  ? normalizedRussianPhoneticInput.includes(normalizeRussianPhoneticLatin(chunk.phonetic))
                  : normalizedInput.includes(normalizeAnswer(chunk.phonetic))
                : false)
            );
          })
          .map((chunk) => chunk.text.toLowerCase())
      );

      exercise.targetChunks.forEach((chunk) => {
        const isChunkCorrect = matchedChunks.has(chunk.text.toLowerCase());
        recordChunkAttempt(chunk.text, chunk.type, isChunkCorrect);
        const chunkMeta = lessonChunkMetaByKey.get(normalizeAnswer(chunk.text));
        trackWordExposure({
          text: chunk.text,
          language: lesson.language,
          lessonId: lesson.id,
          contextSentence: exercise.sentenceText ?? chunkMeta?.contextSentence,
          translation: chunkMeta?.translation || chunk.translation,
        });
        const chunkMatchPercent = computeWeightedMatchPercent(
          getExerciseSurfaceText(chunk),
          userAnswer,
          lesson.language
        );
        recordWritingAttempt(chunk.text, chunk.type, detail.status === "correct", chunkMatchPercent);
      });
      if (detail.status === "incorrect") {
        exercise.targetChunks.forEach((chunk) => {
          recordSessionWeakChunk(chunk, "incorrect");
        });
      }
      recordActiveRecallAttempt(lesson.language, lesson.id, detail.status === "correct");
      setActiveRecallResults((prev) => ({
        ...prev,
        [exercise.id]: detail,
      }));
      setActiveRecallChecked((prev) => ({
        ...prev,
        [exercise.id]: true,
      }));
    },
    [
      lesson.language,
      lesson.id,
      recordChunkAttempt,
      recordWritingAttempt,
      recordActiveRecallAttempt,
      recordSessionWeakChunk,
      lessonChunkMetaByKey,
      trackWordExposure,
    ]
  );
  const previousPhaseRef = useRef<string | null>(null);
  /* eslint-enable react-hooks/preserve-manual-memoization */
  useEffect(() => {
    const enteringReinforcement = currentPhase === "Reinforcement" && previousPhaseRef.current !== "Reinforcement";
    if (enteringReinforcement) {
      setReinforcementTargets(reinforcementTargetCandidates.targets);
      setReinforcementUsesFallback(reinforcementTargetCandidates.fallback);
      setReinforcementTargetIndex(0);
      setReinforcementInput("");
      setReinforcementResult(null);
    }
    previousPhaseRef.current = currentPhase;
  }, [currentPhase, reinforcementTargetCandidates]);
  /* eslint-disable react-hooks/preserve-manual-memoization -- existing callback memoization intentionally scoped */
  const submitReinforcementTargetCheck = useCallback(() => {
    const currentTarget = reinforcementTargets[reinforcementTargetIndex];
    const input = reinforcementInput.trim();
    if (!currentTarget || !input) {
      return;
    }
    const detail = evaluateParts(input, currentTarget.expectedParts);
    setReinforcementResult(detail);
    const chunkType = currentTarget.isCore ? "core" : "interest";
    const expectedText = currentTarget.expectedParts.join(" ").trim();
    const reinforcementMatchPercent = computeWeightedMatchPercent(
      expectedText || currentTarget.text,
      input,
      lesson.language
    );
    recordWritingAttempt(
      currentTarget.text,
      chunkType,
      detail.status === "correct",
      reinforcementMatchPercent
    );
    trackWordExposure({
      text: currentTarget.text,
      language: lesson.language,
      lessonId: lesson.id,
      contextSentence: currentTarget.contextLabel,
      translation: currentTarget.translation,
    });
    if (detail.status === "correct") {
      setReinforcementTargetIndex((prev) => prev + 1);
      setReinforcementInput("");
      return;
    }
    recordSessionWeakChunk(
      {
        text: currentTarget.text,
        translation: currentTarget.translation,
      },
      "incorrect"
    );
  }, [
    lesson.language,
    lesson.id,
    recordSessionWeakChunk,
    recordWritingAttempt,
    reinforcementInput,
    reinforcementTargetIndex,
    reinforcementTargets,
    trackWordExposure,
  ]);
  /* eslint-enable react-hooks/preserve-manual-memoization */

function isTargetLanguageTranslationExercise(type: ActiveRecallExerciseType): boolean {
  return type === "meaning-to-chunk" || type === "full-sentence-recall";
}

function getActiveRecallMainInstruction(
  type: ActiveRecallExerciseType,
  language: LessonLanguage
): string {
  const languageName = getLanguageDisplayName(language);
  if (type === "contextual-fill-in") {
    return "Fill in the blank";
  }
  if (type === "chunk-to-meaning") {
    return "Type the English translation.";
  }
  return `Translate this into ${languageName}.`;
}

function getActiveRecallTypingInstruction(
  type: ActiveRecallExerciseType,
  language: LessonLanguage
): string {
  if (isTargetLanguageTranslationExercise(type)) {
    return `Type the ${getLanguageDisplayName(language)} translation.`;
  }
  return "Now type it to lock it in";
}

function getActiveRecallTypedPlaceholder(
  type: ActiveRecallExerciseType,
  language: LessonLanguage
): string {
  if (isTargetLanguageTranslationExercise(type)) {
    return `Type the ${getLanguageDisplayName(language)} translation`;
  }
  if (type === "chunk-to-meaning") {
    return "Type the English translation";
  }
  return "Type your answer";
}

function getActiveRecallSpeakingInstruction(
  type: ActiveRecallExerciseType,
  language: LessonLanguage
): string {
  if (isTargetLanguageTranslationExercise(type)) {
    return `Say the ${getLanguageDisplayName(language)} translation out loud.`;
  }
  if (type === "chunk-to-meaning") {
    return "Say the English meaning out loud.";
  }
  return "Speak your answer out loud, then stop or press Check.";
}
  const activeRecallCorrectCount = useMemo(
    () =>
      activeRecallQueue.filter(
        (exercise) =>
          activeRecallVoiceCorrect[exercise.id] === true &&
          activeRecallResults[exercise.id]?.status === "correct"
      ).length,
    [activeRecallResults, activeRecallQueue, activeRecallVoiceCorrect]
  );
  const activeRecallCompleted =
    activeRecallQueue.length === 0 || activeRecallCorrectCount === activeRecallQueue.length;
  const reinforcementWriteGateOk =
    reinforcementTargets.length === 0 || reinforcementTargetIndex >= reinforcementTargets.length;
  const activeRecallSummary = useMemo(() => {
    const values = Object.values(activeRecallResults);
    return values.reduce(
      (acc, result) => {
        if (result.status === "partial") {
          acc.partial += 1;
        }
        if (result.correctParts.length > 0) {
          acc.correct.push(...result.correctParts);
        }
        if (result.missingParts.length > 0) {
          acc.missed.push(...result.missingParts);
        }
        return acc;
      },
      { correct: [] as string[], missed: [] as string[], partial: 0 }
    );
  }, [activeRecallResults]);
  const currentReinforcementTarget = reinforcementTargets[reinforcementTargetIndex] ?? null;
  const selectedTopicProgress = getProgress(lesson.language, lesson.id);
  const selectedTopicCompletion = topicCompletionById.get(lesson.id) ?? {
    isCompleted: false,
    accuracy: 0,
    phasesDone: 0,
    completion: getLessonCompletionStatus(lesson, selectedTopicProgress),
    masteryScore: 0,
    masteryTier: "Untrained",
    masteryBreakdown: {
      speaking: { value: 0 as const, source: "fallback" as const },
      recall: { value: 0 as const, source: "exact" as const },
      writing: { value: 0 as const, source: "approx" as const },
      consistency: { value: 0 as const, source: "approx" as const },
    },
  };
  const selectedTopicStatus = topicStatusById.get(lesson.id) ?? "Not started";
  const showHydratedProgress = hasMounted;
  const currentPhaseMarkedComplete =
    showHydratedProgress &&
    isPhaseName(currentPhase) &&
    selectedTopicProgress.completedPhases[currentPhase] === true;
  const currentPhaseLocalGateOk =
    currentPhase === "Active Recall"
      ? activeRecallCompleted
      : currentPhase === "Exposure"
        ? exposureShadowGateOk
        : currentPhase === "Reinforcement"
          ? reinforcementWriteGateOk
          : true;
  const canAdvanceCurrentPhase = currentPhaseMarkedComplete || currentPhaseLocalGateOk;
  const isFinalPhase = phaseIndex === phases.length - 1;
  const [savedVocabWordKeys, setSavedVocabWordKeys] = useState<Record<string, boolean>>(
    () => loadSavedVocabularyWordKeys()
  );
  const sessionNewWords = useMemo(
    () => sessionWords.filter((word) => word.seenCount === 1).slice(0, 10),
    [sessionWords]
  );
  const sessionRepeatedWords = useMemo(
    () => sessionWords.filter((word) => word.seenCount > 1).slice(0, 10),
    [sessionWords]
  );

  const navigationOrder = useMemo(
    () => [...progressionSequence, ...optionalLanguageSpecific],
    [progressionSequence, optionalLanguageSpecific]
  );

  const nextUnlockedLessonId = useMemo(() => {
    const idx = navigationOrder.findIndex((topic) => topic.id === lesson.id);
    if (idx === -1) {
      return null;
    }
    for (let i = idx + 1; i < navigationOrder.length; i++) {
      const topic = navigationOrder[i]!;
      if (topicStatusById.get(topic.id) !== "Locked") {
        return topic.id;
      }
    }
    return null;
  }, [lesson.id, navigationOrder, topicStatusById]);

  const rememberLessonVisit = useCallback((nextLessonId: string) => {
    try {
      sessionStorage.setItem(LAST_LESSON_STORAGE_KEY, nextLessonId);
    } catch {
      /* ignore */
    }
  }, []);

  const continueToNextLesson = useCallback(() => {
    if (!nextUnlockedLessonId) {
      setFinishNavigationMessage("No next lesson unlocked yet.");
      return;
    }
    rememberLessonVisit(nextUnlockedLessonId);
    setFinishNavigationMessage(null);
    router.push(`/lesson/${nextUnlockedLessonId}`);
  }, [nextUnlockedLessonId, rememberLessonVisit, router, setFinishNavigationMessage]);

  const scenarioContextNote = lesson.sentences.find((s) => s.contextNote)?.contextNote;

  useEffect(() => {
    if (continuationDirectUrlLock) {
      return;
    }
    rememberLessonVisit(lessonId);
  }, [continuationDirectUrlLock, lessonId, rememberLessonVisit]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [lessonId]);

  /* Lesson boundary: reset UI + phase only when navigating to a different lesson.
     Do NOT key this off `hasMounted`: when hydration flips hasMounted false→true, re-running
     would call setPhaseIndex(0) again and undo any "Next" the learner already pressed. */
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- sync reset on lesson route id change. */
    setShowExposureTranslationBySentence({});
    setConfirmExposureTranslationBySentence({});
    setShowExposurePhoneticBySentence({});
    setConfirmExposurePhoneticBySentence({});
    setShowBreakdownPhoneticBySentence({});
    setShowContextNoteBySentence({});
    setConfirmBreakdownPhoneticBySentence({});
    setShowChunkPracticeBySentence({});
    setShowChunkRecordingByKey({});
    setActiveRecallQueue(seededActiveRecallExercises);
    setActiveRecallInputs({});
    setActiveRecallChecked({});
    setActiveRecallResults({});
    setActiveRecallTypeFallbackVisible({});
    setActiveRecallVoiceCorrect({});
    setSessionWeakChunks({});
    setReinforcementTargets([]);
    setReinforcementUsesFallback(false);
    setReinforcementTargetIndex(0);
    setReinforcementInput("");
    setReinforcementResult(null);
    setExposureShadowBySentence({});
    previousPhaseRef.current = null;
    setPhaseIndex(0);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seededActiveRecallExercises must not be a dep (new ref every chunk/help update).
  }, [lessonId]);

  /* After client hydration, refresh recall queue from full adaptive seed without touching phaseIndex.
     `seededActiveRecallExercises` is intentionally omitted from deps (see lesson effect above). */
  useEffect(() => {
    if (!hasMounted) {
      return;
    }
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- post-hydration recall seed only; must not reset phaseIndex */
    setActiveRecallQueue(seededActiveRecallExercises);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-seed when hydration boundary changes; do not tie to seeded identity.
  }, [hasMounted]);

  useEffect(() => {
    if (!selectedTopicCompletion.isCompleted) {
      return;
    }
    finalizeSession();
  }, [finalizeSession, selectedTopicCompletion.isCompleted]);

  const saveSessionWord = useCallback(
    (word: { text: string; language: string; normalizedText: string; translation?: string; contextSentences: string[] }) => {
      if (typeof window === "undefined") {
        return;
      }
      const key = `${word.language}::${word.normalizedText}`;
      setSavedVocabWordKeys((prev) => {
        if (prev[key]) {
          return prev;
        }
        const next = { ...prev, [key]: true };
        try {
          const raw = window.localStorage.getItem(VOCAB_SAVED_WORDS_STORAGE_KEY);
          const existing = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
          window.localStorage.setItem(
            VOCAB_SAVED_WORDS_STORAGE_KEY,
            JSON.stringify({ ...existing, [key]: true })
          );
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    []
  );

  return (
    <AppShell>
    <div className="page">
      {continuationDirectUrlLock ? (
        <>
          <p className="muted" style={{ marginBottom: "0.75rem" }}>
            <Link href="/lesson" className="button" style={{ display: "inline-block" }}>
              ← Back to lessons
            </Link>
          </p>
          <section className="card">
            <p>
              <strong>🔒 This lesson is locked</strong>
            </p>
            {continuationDirectUrlLock.reason ? (
              <p className="muted lr-tier-lock-message">{continuationDirectUrlLock.reason}</p>
            ) : null}
            <p style={{ marginTop: "0.75rem", marginBottom: 0 }}>
              <Link href="/lesson" className="button" style={{ display: "inline-block" }}>
                Back to lessons
              </Link>
            </p>
          </section>
        </>
      ) : (
        <>
      <p className="muted" style={{ marginBottom: "0.75rem" }}>
        <Link href="/lesson" className="button" style={{ display: "inline-block" }}>
          ← Back to lessons
        </Link>
      </p>
      <header className="card" style={{ marginBottom: "1rem", borderStyle: "solid" }}>
        <p className="muted" style={{ marginTop: 0 }}>
          <strong>Module:</strong> {lesson.topic}
        </p>
        <h1 style={{ margin: "0.25rem 0 0.5rem" }}>{lesson.title}</h1>
        <p className="muted" style={{ marginBottom: scenarioContextNote ? "0.5rem" : 0 }}>
          <strong>Objective:</strong> {lesson.objective}
        </p>
        {scenarioContextNote ? (
          <p className="muted" style={{ marginBottom: 0, fontStyle: "italic" }}>
            {scenarioContextNote}
          </p>
        ) : null}
      </header>
      <section className="card">
        <h2>30-Minute Session Flow</h2>
        <p className="muted">Move through each phase in order.</p>
        <p className="muted">
          <strong>Adaptive weak focus:</strong>{" "}
          {adaptiveLesson.weakChunks.length > 0 ? adaptiveLesson.weakChunks.join(", ") : "None yet"}
        </p>
        <p className="muted">
          <strong>Adaptive new focus:</strong>{" "}
          {adaptiveLesson.newChunks.length > 0 ? adaptiveLesson.newChunks.join(", ") : "None"}
        </p>
        <p className="muted">
          <strong>Core repetition:</strong>{" "}
          {adaptiveLesson.coreChunks.length > 0 ? adaptiveLesson.coreChunks.join(", ") : "None"}
        </p>
        <div className="phase-row">
          {phases.map((phase, index) => (
            <span
              key={phase}
              className={`phase-pill ${index === phaseIndex ? "active" : ""}`}
            >
              {showHydratedProgress && selectedTopicProgress.completedPhases[phase as LessonPhase]
                ? "✓ "
                : ""}
              {index + 1}. {phase}
            </span>
          ))}
        </div>
        <p className="muted">
          <strong>Topic status:</strong> {showHydratedProgress ? selectedTopicStatus : "Not started"}
        </p>
        <p className="muted">
          <strong>Active Recall accuracy:</strong>{" "}
          {showHydratedProgress ? selectedTopicCompletion.accuracy : 0}% (target:{" "}
          {ACTIVE_RECALL_TARGET_PERCENT}%)
        </p>
      </section>

      {currentPhase === "Exposure" && (
        <section className="card">
          <h2>Exposure</h2>
          <p className="muted">
            Listen and read first. Use translation only when needed.
          </p>
          <p className="muted">Listen and repeat before continuing.</p>
          <ul className="sentence-list lesson-list">
            {adaptiveLesson.sentences.map((sentence) => {
              const pronunciationChunks = buildPronunciationPracticeChunks(sentence);
              return (
              <li key={sentence.text}>
                <p>
                  <strong>{sentence.text}</strong>
                </p>
                {(getFormalityLabel(sentence.formality) || sentence.contextLabel) && (
                  <p className="muted">
                    {getFormalityLabel(sentence.formality) ? (
                      <span className="track-badge">{getFormalityLabel(sentence.formality)}</span>
                    ) : null}
                    {sentence.contextLabel ? ` ${sentence.contextLabel}` : ""}
                  </p>
                )}
                {sentence.phonetic && showExposurePhoneticBySentence[sentence.text] && (
                  <p className="muted">{sentence.phonetic}</p>
                )}
                <p>
                  <strong>Audio:</strong> {sentence.audioPlaceholder}
                </p>
                <div
                  className="lr-tts-controls"
                  style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginBottom: "0.5rem" }}
                >
                  <span className="muted">Listen (TTS):</span>
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      speakText(sentence.text, lesson.language, normalTtsRate);
                      setExposureShadowBySentence((prev) =>
                        mergeExposureShadow(prev, sentence.text, { hasPlayedAudio: true })
                      );
                    }}
                    aria-label="Play sentence with text to speech"
                  >
                    🔊 Play
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      speakText(sentence.text, lesson.language, slowTtsRate);
                      setExposureShadowBySentence((prev) =>
                        mergeExposureShadow(prev, sentence.text, { hasPlayedAudio: true })
                      );
                    }}
                    aria-label="Play sentence slowly with text to speech"
                  >
                    🐢 Slow
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      speakRepeat(sentence.text, lesson.language, repeatCount, normalTtsRate);
                      setExposureShadowBySentence((prev) =>
                        mergeExposureShadow(prev, sentence.text, { hasPlayedAudio: true })
                      );
                    }}
                    aria-label="Repeat sentence based on settings"
                  >
                    🔁 Repeat
                  </button>
                  <span className="muted">Repeats based on your settings</span>
                </div>
                {hasMounted && !exposureSttSupported ? (
                  <p className="muted" style={{ marginTop: "0.5rem" }}>
                    Speaking not supported on this device. Listen to each sentence to continue.
                  </p>
                ) : null}
                {hasMounted && exposureSttSupported ? (
                  <RecordingPanel
                    key={sentence.text}
                    expectedText={sentence.text}
                    language={lesson.language}
                    mode="shadow"
                    complete={(exposureShadowBySentence[sentence.text] ?? EXPOSURE_SHADOW_DEFAULT).hasSpoken}
                    notifyOnFailure
                    onResult={(ok, _transcript, details) => {
                      recordSpeechAttemptForChunks(
                        sentence.words,
                        ok,
                        details?.matchPercent ?? 0,
                        sentence.text
                      );
                      if (ok) {
                        setExposureShadowBySentence((prev) =>
                          mergeExposureShadow(prev, sentence.text, { hasSpoken: true })
                        );
                        return;
                      }
                      sentence.words.forEach((word) => {
                        recordSessionWeakChunk(word, "speech");
                      });
                    }}
                  />
                ) : null}
                <div style={{ marginTop: "0.5rem" }}>
                  <button
                    type="button"
                    className="button"
                    onClick={() =>
                      setShowChunkPracticeBySentence((prev) => ({
                        ...prev,
                        [sentence.text]: !prev[sentence.text],
                      }))
                    }
                    aria-expanded={Boolean(showChunkPracticeBySentence[sentence.text])}
                  >
                    {showChunkPracticeBySentence[sentence.text]
                      ? "Hide chunk pronunciation practice"
                      : "Practice pronunciation by chunks"}
                  </button>
                  {showChunkPracticeBySentence[sentence.text] ? (
                    <div style={{ marginTop: "0.5rem" }}>
                      <p className="muted" style={{ marginBottom: "0.35rem" }}>
                        Pronunciation practice
                      </p>
                      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                        <button
                          type="button"
                          className="button"
                          onClick={() => speakText(sentence.text, lesson.language, normalTtsRate)}
                        >
                          🔊 Play sentence
                        </button>
                      </div>
                      <ul className="sentence-list" style={{ marginTop: 0 }}>
                        {pronunciationChunks.map((chunk) => {
                          const chunkRecordKey = `${sentence.text}::${chunk.id}`;
                          const showRecorder = Boolean(showChunkRecordingByKey[chunkRecordKey]);
                          return (
                            <li key={chunkRecordKey}>
                              <p style={{ marginBottom: "0.25rem" }}>
                                <strong>{chunk.text}</strong>
                                {chunk.phonetic ? (
                                  <span className="muted" style={{ marginLeft: "0.5rem" }}>
                                    ({chunk.phonetic})
                                  </span>
                                ) : null}
                              </p>
                              <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  className="button"
                                  onClick={() => speakText(chunk.text, lesson.language, normalTtsRate)}
                                >
                                  Play chunk
                                </button>
                                <button
                                  type="button"
                                  className="button"
                                  onClick={() => speakText(chunk.text, lesson.language, slowTtsRate)}
                                >
                                  Slow chunk
                                </button>
                                <button
                                  type="button"
                                  className="button"
                                  onClick={() => speakRepeat(chunk.text, lesson.language, repeatCount, normalTtsRate)}
                                >
                                  Repeat chunk
                                </button>
                                <button
                                  type="button"
                                  className="button"
                                  onClick={() =>
                                    setShowChunkRecordingByKey((prev) => ({
                                      ...prev,
                                      [chunkRecordKey]: !prev[chunkRecordKey],
                                    }))
                                  }
                                >
                                  {showRecorder ? "Hide recorder" : "Record chunk"}
                                </button>
                              </div>
                              {showRecorder ? (
                                <RecordingPanel
                                  expectedText={chunk.text}
                                  language={lesson.language}
                                  mode="shadow"
                                  suppressProgressionCallbacks
                                />
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="button"
                          onClick={() => speakText(sentence.text, lesson.language, normalTtsRate)}
                        >
                          🔊 Play sentence again
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="typing-controls">
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      if (showExposureTranslationBySentence[sentence.text]) {
                        setShowExposureTranslationBySentence((prev) => ({
                          ...prev,
                          [sentence.text]: false,
                        }));
                        return;
                      }
                      setConfirmExposureTranslationBySentence((prev) => ({
                        ...prev,
                        [sentence.text]: true,
                      }));
                    }}
                  >
                    {showExposureTranslationBySentence[sentence.text]
                      ? "Hide translation"
                      : "Show translation"}
                  </button>
                  {confirmExposureTranslationBySentence[sentence.text] &&
                    !showExposureTranslationBySentence[sentence.text] && (
                      <p className="muted">
                        Try once first?{" "}
                        <button
                          type="button"
                          className="button"
                          onClick={() => {
                            setShowExposureTranslationBySentence((prev) => ({
                              ...prev,
                              [sentence.text]: true,
                            }));
                            setConfirmExposureTranslationBySentence((prev) => ({
                              ...prev,
                              [sentence.text]: false,
                            }));
                            recordSentenceHelp(sentence, "translation");
                          }}
                        >
                          Reveal anyway
                        </button>{" "}
                        <button
                          type="button"
                          className="button"
                          onClick={() =>
                            setConfirmExposureTranslationBySentence((prev) => ({
                              ...prev,
                              [sentence.text]: false,
                            }))
                          }
                        >
                          Cancel
                        </button>
                      </p>
                    )}
                  {sentence.phonetic && (
                    <button
                      type="button"
                      className="button"
                      onClick={() => {
                        if (showExposurePhoneticBySentence[sentence.text]) {
                          setShowExposurePhoneticBySentence((prev) => ({
                            ...prev,
                            [sentence.text]: false,
                          }));
                          return;
                        }
                        setConfirmExposurePhoneticBySentence((prev) => ({
                          ...prev,
                          [sentence.text]: true,
                        }));
                      }}
                    >
                      {showExposurePhoneticBySentence[sentence.text]
                        ? "Hide phonetic"
                        : "Show phonetic"}
                    </button>
                  )}
                  {sentence.phonetic &&
                    confirmExposurePhoneticBySentence[sentence.text] &&
                    !showExposurePhoneticBySentence[sentence.text] && (
                      <p className="muted">
                        Try once first?{" "}
                        <button
                          type="button"
                          className="button"
                          onClick={() => {
                            setShowExposurePhoneticBySentence((prev) => ({
                              ...prev,
                              [sentence.text]: true,
                            }));
                            setConfirmExposurePhoneticBySentence((prev) => ({
                              ...prev,
                              [sentence.text]: false,
                            }));
                            recordSentenceHelp(sentence, "phonetic");
                          }}
                        >
                          Reveal anyway
                        </button>{" "}
                        <button
                          type="button"
                          className="button"
                          onClick={() =>
                            setConfirmExposurePhoneticBySentence((prev) => ({
                              ...prev,
                              [sentence.text]: false,
                            }))
                          }
                        >
                          Cancel
                        </button>
                      </p>
                    )}
                  <button
                    type="button"
                    className="button"
                    onClick={() =>
                      setTypingEnabledBySentence((prev) => ({
                        ...prev,
                        [sentence.text]: !prev[sentence.text],
                      }))
                    }
                  >
                    {typingEnabledBySentence[sentence.text]
                      ? "Hide typing"
                      : "Practice typing"}
                  </button>
                  {typingEnabledBySentence[sentence.text] && (
                    <>
                      <p className="muted" style={{ marginTop: "0.35rem", marginBottom: "0.25rem", fontSize: "0.9em" }}>
                        Typing here is optional. Writing is required later.
                      </p>
                      <input
                        className="text-input"
                        type="text"
                        value={typedSentenceByKey[sentence.text] ?? ""}
                        onChange={(event) =>
                          setTypedSentenceByKey((prev) => ({
                            ...prev,
                            [sentence.text]: event.target.value,
                          }))
                        }
                        placeholder="Type the sentence"
                      />
                      <button
                        type="button"
                        className="button"
                        onClick={() => {
                          const typed = normalizeAnswer(typedSentenceByKey[sentence.text] ?? "");
                          const nativeMatch = typed === normalizeAnswer(sentence.text);
                          const phoneticMatch = sentence.phonetic
                            ? typed === normalizeAnswer(sentence.phonetic)
                            : false;
                          const isCorrect = nativeMatch || phoneticMatch;
                          setTypingFeedbackBySentence((prev) => ({
                            ...prev,
                            [sentence.text]: { status: isCorrect ? "correct" : "incorrect" },
                          }));
                        }}
                        disabled={!typedSentenceByKey[sentence.text]?.trim()}
                      >
                        Check
                      </button>
                      {typingFeedbackBySentence[sentence.text] && (
                        <p
                          className={
                            typingFeedbackBySentence[sentence.text].status === "correct"
                              ? "feedback-correct"
                              : "feedback-incorrect"
                          }
                        >
                          {typingFeedbackBySentence[sentence.text].status === "correct"
                            ? "Correct"
                            : "Try again"}
                        </p>
                      )}
                      {typingFeedbackBySentence[sentence.text]?.status === "incorrect" && (
                        <p className="feedback-correction">
                          Correct sentence:{" "}
                          <span className="feedback-highlight">{sentence.text}</span>
                          {sentence.phonetic ? ` (${sentence.phonetic})` : ""}
                        </p>
                      )}
                    </>
                  )}
                </div>
                {showExposureTranslationBySentence[sentence.text] && (
                  <p className="muted">
                    <strong>Translation:</strong> {sentence.translation}
                  </p>
                )}
              </li>
            );})}
          </ul>
        </section>
      )}

      {currentPhase === "Breakdown" && (
        <section className="card">
          <h2>Breakdown</h2>
          <ul className="sentence-list lesson-list">
            {adaptiveLesson.sentences.map((sentence) => (
              <li key={sentence.text}>
                <p>
                  <strong>Text:</strong> {sentence.text}
                </p>
                {(getFormalityLabel(sentence.formality) || sentence.contextLabel) && (
                  <p className="muted">
                    {getFormalityLabel(sentence.formality) ? (
                      <span className="track-badge">{getFormalityLabel(sentence.formality)}</span>
                    ) : null}
                    {sentence.contextLabel ? ` ${sentence.contextLabel}` : ""}
                  </p>
                )}
                {(sentence.contextNote || sentence.contextLabel) && (
                  <>
                    <button
                      type="button"
                      className="button"
                      onClick={() =>
                        setShowContextNoteBySentence((prev) => ({
                          ...prev,
                          [sentence.text]: !prev[sentence.text],
                        }))
                      }
                    >
                      {showContextNoteBySentence[sentence.text] ? "Hide context note" : "Show context note"}
                    </button>
                    {showContextNoteBySentence[sentence.text] && sentence.contextNote && (
                      <p className="muted">{sentence.contextNote}</p>
                    )}
                  </>
                )}
                {sentence.phonetic && (
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      if (showBreakdownPhoneticBySentence[sentence.text]) {
                        setShowBreakdownPhoneticBySentence((prev) => ({
                          ...prev,
                          [sentence.text]: false,
                        }));
                        return;
                      }
                      setConfirmBreakdownPhoneticBySentence((prev) => ({
                        ...prev,
                        [sentence.text]: true,
                      }));
                    }}
                  >
                    {showBreakdownPhoneticBySentence[sentence.text]
                      ? "Hide phonetic"
                      : "Show phonetic"}
                  </button>
                )}
                {sentence.phonetic &&
                  confirmBreakdownPhoneticBySentence[sentence.text] &&
                  !showBreakdownPhoneticBySentence[sentence.text] && (
                    <p className="muted">
                      Try once first?{" "}
                      <button
                        type="button"
                        className="button"
                        onClick={() => {
                          setShowBreakdownPhoneticBySentence((prev) => ({
                            ...prev,
                            [sentence.text]: true,
                          }));
                          setConfirmBreakdownPhoneticBySentence((prev) => ({
                            ...prev,
                            [sentence.text]: false,
                          }));
                          recordSentenceHelp(sentence, "phonetic");
                        }}
                      >
                        Reveal anyway
                      </button>{" "}
                      <button
                        type="button"
                        className="button"
                        onClick={() =>
                          setConfirmBreakdownPhoneticBySentence((prev) => ({
                            ...prev,
                            [sentence.text]: false,
                          }))
                        }
                      >
                        Cancel
                      </button>
                    </p>
                  )}
                {showBreakdownPhoneticBySentence[sentence.text] && sentence.phonetic && (
                  <p className="muted">
                    <strong>Phonetic:</strong> {sentence.phonetic}
                  </p>
                )}
                <p>
                  <strong>Translation:</strong> {sentence.translation}
                </p>
                <p>
                  <strong>Words/Chunks:</strong>
                </p>
                <ul className="word-list">
                  {sentence.words.map((word) => (
                    <li key={`${sentence.text}-${word.text}`}>
                      {(() => {
                        const displayText = getBreakdownChunkDisplayText(
                          word,
                          lesson.language,
                          chunkCategoryByText.get(word.text.toLowerCase())
                        );
                        return word.image && word.imageability !== "low" ? (
                          <button
                            type="button"
                            className="chunk-link"
                            onClick={() => setSelectedImageChunk(word)}
                          >
                            {displayText}
                          </button>
                        ) : (
                          <span>{displayText}</span>
                        );
                      })()}{" "}
                      {showBreakdownPhoneticBySentence[sentence.text] && word.phonetic
                        ? `(${word.phonetic}) `
                        : ""}
                      {getFormalityLabel(word.formality) ? (
                        <span className="track-badge">{getFormalityLabel(word.formality)}</span>
                      ) : null}{" "}
                      {getGenderLabel(word.gender) ? (
                        <span className="track-badge">{getGenderLabel(word.gender)}</span>
                      ) : null}{" "}
                      {word.contextLabel ? <span className="muted">{word.contextLabel} </span> : null}
                      - {word.translation} (
                      {chunkCategoryByText.get(word.text.toLowerCase()) ?? word.type})
                      {word.genderNote ? <span className="muted"> - {word.genderNote}</span> : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      {currentPhase === "Active Recall" && (
        <section className="card">
          <h2>Active Recall</h2>
          <p className="muted">Complete the voice answer and typed answer to lock each exercise in.</p>
          <p className="muted">
            To complete this exercise, say the answer out loud and type it correctly.
          </p>
          <p className="muted">
            Exercises complete (spoken and typed correctly): {activeRecallCorrectCount} /{" "}
            {activeRecallQueue.length}
          </p>
          <div className="exercise-block">
            {activeRecallQueue.length === 0 ? (
              <p className="muted">No Active Recall exercises available for this topic yet.</p>
            ) : (
              activeRecallQueue.map((exercise, index) => {
                const result = activeRecallResults[exercise.id];
                const isChecked = activeRecallChecked[exercise.id] === true;
                const voiceOk = activeRecallVoiceCorrect[exercise.id] === true;
                const fallbackTyping = activeRecallTypeFallbackVisible[exercise.id] === true;
                const typedSuccess = result?.status === "correct";
                const answerLanguage = getActiveRecallAnswerLanguage(exercise, lesson.language);
                return (
                  <div key={exercise.id} className="exercise-item">
                    <p className="muted">
                      Exercise {index + 1} of {activeRecallQueue.length}
                    </p>
                    <p>
                      <strong>{exercise.prompt}</strong>
                    </p>
                    {exercise.contextLabel && <p className="muted">Context: {exercise.contextLabel}</p>}
                    <p className="muted">
                      {getActiveRecallMainInstruction(exercise.type, lesson.language)}
                    </p>
                    {exercise.type === "chunk-to-meaning" ? (
                      <p className="muted">Say the English meaning out loud, then type it.</p>
                    ) : null}
                    <RecordingPanel
                      key={`${exercise.id}-voice`}
                      expectedText={getExpectedSpeechText(exercise)}
                      acceptedSpokenTexts={
                        exercise.type === "chunk-to-meaning"
                          ? (exercise.targetChunks[0]?.acceptedMeanings ?? undefined)
                          : undefined
                      }
                      language={answerLanguage}
                      mode="answer"
                      answerInstruction={getActiveRecallSpeakingInstruction(exercise.type, lesson.language)}
                      notifyOnFailure
                      suppressProgressionCallbacks={voiceOk}
                      onTypingFallbackNeeded={() =>
                        setActiveRecallTypeFallbackVisible((prev) => ({
                          ...prev,
                          [exercise.id]: true,
                        }))
                      }
                      onResult={(ok, _transcript, details) => {
                        recordSpeechAttemptForChunks(
                          exercise.targetChunks,
                          ok,
                          details?.matchPercent ?? 0,
                          exercise.sentenceText
                        );
                        if (!ok) {
                          exercise.targetChunks.forEach((chunk) => {
                            recordSessionWeakChunk(chunk, "speech");
                          });
                          return;
                        }
                        setActiveRecallVoiceCorrect((prev) => ({ ...prev, [exercise.id]: true }));
                        setActiveRecallInputs((prev) => ({ ...prev, [exercise.id]: "" }));
                      }}
                    />
                    <div className="muted" style={{ marginTop: "0.5rem" }}>
                      <span>Speaking: {voiceOk ? "complete" : "not complete"}</span>
                      <span style={{ marginLeft: "0.75rem" }}>
                        Typing: {typedSuccess ? "complete" : "not complete"}
                      </span>
                    </div>
                    {voiceOk && !fallbackTyping && !typedSuccess ? (
                      <p className="feedback-correct" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
                        Correct — now type it
                      </p>
                    ) : null}
                    <div style={{ marginTop: "0.5rem" }}>
                        <label className="muted" htmlFor={`ar-type-${exercise.id}`}>
                          {getActiveRecallTypingInstruction(exercise.type, lesson.language)}
                        </label>
                        <input
                          id={`ar-type-${exercise.id}`}
                          className="text-input"
                          type="text"
                          autoComplete="off"
                          style={{ marginTop: "0.35rem", display: "block", maxWidth: "100%" }}
                          value={activeRecallInputs[exercise.id] ?? ""}
                          onChange={(event) =>
                            setActiveRecallInputs((prev) => ({
                              ...prev,
                              [exercise.id]: event.target.value,
                            }))
                          }
                          placeholder={getActiveRecallTypedPlaceholder(exercise.type, lesson.language)}
                          disabled={isChecked}
                        />
                        <div style={{ marginTop: "0.35rem" }}>
                          <button
                            type="button"
                            className="button"
                            disabled={isChecked || !(activeRecallInputs[exercise.id] ?? "").trim()}
                            onClick={() => {
                              submitActiveRecallExerciseCheck(exercise, activeRecallInputs[exercise.id] ?? "");
                            }}
                          >
                            Check
                          </button>
                        </div>
                    </div>
                    {isChecked && (
                      <button
                        type="button"
                        className="button"
                        style={{ marginTop: "0.5rem" }}
                        onClick={() => {
                          setActiveRecallChecked((prev) => ({
                            ...prev,
                            [exercise.id]: false,
                          }));
                          setActiveRecallResults((prev) => {
                            const next = { ...prev };
                            delete next[exercise.id];
                            return next;
                          });
                          setActiveRecallVoiceCorrect((prev) => ({
                            ...prev,
                            [exercise.id]: false,
                          }));
                          setActiveRecallTypeFallbackVisible((prev) => ({
                            ...prev,
                            [exercise.id]: false,
                          }));
                          setActiveRecallInputs((prev) => ({ ...prev, [exercise.id]: "" }));
                        }}
                      >
                        Retry
                      </button>
                    )}
                    {result && (
                      <>
                        <p
                          className={
                            result.status === "correct"
                              ? "feedback-correct"
                              : result.status === "partial"
                                ? "feedback-correction"
                                : "feedback-incorrect"
                          }
                        >
                          {result.status === "correct"
                            ? "Correct"
                            : result.status === "partial"
                              ? "Partially correct"
                              : "Try again"}
                        </p>
                        {result.correctParts.length > 0 && (
                          <p className="feedback-correction">
                            Matched:{" "}
                            <span className="feedback-highlight">{result.correctParts.join(", ")}</span>
                          </p>
                        )}
                        {result.missingParts.length > 0 && (
                          <p className="feedback-correction">
                            Missing:{" "}
                            <span className="feedback-highlight">{result.missingParts.join(", ")}</span>
                          </p>
                        )}
                        {result.extraParts.length > 0 && (
                          <p className="feedback-correction">
                            Extra: <span className="feedback-highlight">{result.extraParts.join(", ")}</span>
                          </p>
                        )}
                        {result.status !== "correct" && (
                          <p className="feedback-correction">
                            Try: <span className="feedback-highlight">{result.tryText}</span>
                          </p>
                        )}
                        {result.formalityGuidance && (
                          <p className="feedback-correction">
                            <span className="feedback-highlight">{result.formalityGuidance}</span>
                          </p>
                        )}
                        {result.alsoCorrect && result.alsoCorrect.length > 1 && (
                          <p className="feedback-correction">
                            Also correct:{" "}
                            <span className="feedback-highlight">{result.alsoCorrect.join(" | ")}</span>
                          </p>
                        )}
                      </>
                    )}
                  </div>
                );
              })
            )}
            <div className="exercise-item">
              <p>
                <strong>Active Recall summary</strong>
              </p>
              <p className="muted">Correct chunks: {activeRecallSummary.correct.join(", ") || "None yet"}</p>
              <p className="muted">Missed chunks: {activeRecallSummary.missed.join(", ") || "None"}</p>
              <p className="muted">Partial answers: {activeRecallSummary.partial}</p>
            </div>
          </div>
        </section>
      )}

      {currentPhase === "Reinforcement" && (
        <section className="card">
          <h2>Reinforcement</h2>
          <p className="muted">Review the chunks that need the most work.</p>
          {reinforcementUsesFallback ? (
            <p className="muted">No weak chunks found. Reviewing key lesson chunks.</p>
          ) : null}
          {reinforcementTargets.length === 0 ? (
            <p className="muted">No reinforcement targets available for this lesson.</p>
          ) : currentReinforcementTarget ? (
            <div className="exercise-item">
              <p className="muted">
                Target {Math.min(reinforcementTargetIndex + 1, reinforcementTargets.length)} /{" "}
                {reinforcementTargets.length}
              </p>
              <p style={{ marginBottom: "0.25rem" }}>
                <strong>Translate this into {getLanguageDisplayName(lesson.language)}.</strong>
              </p>
              <p className="muted" style={{ marginTop: 0 }}>
                {currentReinforcementTarget.translation
                  ? `Prompt: ${currentReinforcementTarget.translation}`
                  : currentReinforcementTarget.contextLabel
                    ? `Context: ${currentReinforcementTarget.contextLabel}`
                    : `Type the ${getLanguageDisplayName(lesson.language)} translation.`}
              </p>
              <input
                className="text-input"
                type="text"
                autoComplete="off"
                value={reinforcementInput}
                onChange={(event) => setReinforcementInput(event.target.value)}
                placeholder={`Type the ${getLanguageDisplayName(lesson.language)} translation`}
                style={{ maxWidth: "100%" }}
                disabled={reinforcementWriteGateOk}
              />
              <div style={{ marginTop: "0.35rem" }}>
                <button
                  type="button"
                  className="button"
                  disabled={reinforcementWriteGateOk || !reinforcementInput.trim()}
                  onClick={submitReinforcementTargetCheck}
                >
                  Check
                </button>
              </div>
              {reinforcementResult ? (
                <>
                  <p
                    className={
                      reinforcementResult.status === "correct"
                        ? "feedback-correct"
                        : reinforcementResult.status === "partial"
                          ? "feedback-correction"
                          : "feedback-incorrect"
                    }
                  >
                    {reinforcementResult.status === "correct"
                      ? reinforcementWriteGateOk
                        ? "Great work — reinforcement complete."
                        : "Correct — next target unlocked."
                      : reinforcementResult.status === "partial"
                        ? "Close — keep going."
                        : "Try again"}
                  </p>
                  {reinforcementResult.missingParts.length > 0 ? (
                    <p className="feedback-correction">
                      Missing:{" "}
                      <span className="feedback-highlight">
                        {reinforcementResult.missingParts.join(", ")}
                      </span>
                    </p>
                  ) : null}
                  {reinforcementResult.extraParts.length > 0 ? (
                    <p className="feedback-correction">
                      Extra:{" "}
                      <span className="feedback-highlight">{reinforcementResult.extraParts.join(", ")}</span>
                    </p>
                  ) : null}
                  {reinforcementResult.status !== "correct" ? (
                    <p className="feedback-correction">
                      Try: <span className="feedback-highlight">{reinforcementResult.tryText}</span>
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </section>
      )}

      <div className="lr-lesson-phase-bar">
        <section className="phase-controls" aria-label="Lesson phase navigation">
          <button
            type="button"
            className="button"
            onClick={() => setPhaseIndex((prev) => prev - 1)}
            disabled={phaseIndex === 0}
          >
            Previous
          </button>
          <button
            type="button"
            className="button"
            onClick={() => {
              setFinishNavigationMessage(null);
              const phaseName = phases[phaseIndex];
              if (isPhaseName(phaseName)) {
                markPhaseComplete(lesson.language, lesson.id, phaseName);
              }
              if (!isFinalPhase) {
                setPhaseIndex((prev) => prev + 1);
              }
            }}
            disabled={!canAdvanceCurrentPhase}
          >
            {!canAdvanceCurrentPhase && currentPhase === "Active Recall"
              ? "Complete exercises first"
              : !canAdvanceCurrentPhase && currentPhase === "Exposure"
                ? "Listen and shadow each sentence first"
                : !canAdvanceCurrentPhase && currentPhase === "Reinforcement"
                  ? "Finish reinforcement targets first"
                  : isFinalPhase
                    ? "Finish"
                : "Next"}
          </button>
          {finishNavigationMessage ? (
            <p className="muted" style={{ marginBottom: 0 }}>
              {finishNavigationMessage}
            </p>
          ) : null}
        </section>
      </div>

      {showHydratedProgress && selectedTopicCompletion.isCompleted ? (
        <section className="card">
          <h2>Lesson complete</h2>
          <p className="muted">Continue when you are ready; you will see the next lesson context on the next page.</p>
          <div style={{ marginBottom: "0.75rem" }}>
            <h3>New words from this session</h3>
            <h4 style={{ marginBottom: "0.4rem" }}>New words</h4>
            {sessionNewWords.length === 0 ? (
              <p className="muted">No new words captured yet.</p>
            ) : (
              <ul className="sentence-list">
                {sessionNewWords.map((word) => {
                  const key = `${word.language}::${word.normalizedText}`;
                  const isSaved = Boolean(savedVocabWordKeys[key]);
                  return (
                    <li key={`new-${key}`}>
                      <p style={{ marginBottom: "0.25rem" }}>
                        <strong>{word.text}</strong>
                        {word.translation ? <span className="muted"> - {word.translation}</span> : null}
                      </p>
                      {word.contextSentences[0] ? (
                        <p className="muted" style={{ marginBottom: "0.35rem" }}>
                          Context: {word.contextSentences[0]}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        className="button"
                        onClick={() => saveSessionWord(word)}
                        disabled={isSaved}
                      >
                        {isSaved ? "Saved" : "Save"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <h4 style={{ marginTop: "0.75rem", marginBottom: "0.4rem" }}>Seen again</h4>
            {sessionRepeatedWords.length === 0 ? (
              <p className="muted">No repeated words in this session.</p>
            ) : (
              <ul className="sentence-list">
                {sessionRepeatedWords.map((word) => {
                  const key = `${word.language}::${word.normalizedText}`;
                  const isSaved = Boolean(savedVocabWordKeys[key]);
                  return (
                    <li key={`repeat-${key}`}>
                      <p style={{ marginBottom: "0.25rem" }}>
                        <strong>{word.text}</strong>
                        {word.translation ? <span className="muted"> - {word.translation}</span> : null}
                      </p>
                      {word.contextSentences[0] ? (
                        <p className="muted" style={{ marginBottom: "0.35rem" }}>
                          Context: {word.contextSentences[0]}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        className="button"
                        onClick={() => saveSessionWord(word)}
                        disabled={isSaved}
                      >
                        {isSaved ? "Saved" : "Save"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {nextUnlockedLessonId ? (
            <button
              type="button"
              className="button"
              onClick={continueToNextLesson}
            >
              Continue to next lesson
            </button>
          ) : (
            <p className="muted" style={{ marginBottom: 0 }}>
              No next lesson unlocked yet.
            </p>
          )}
        </section>
      ) : null}

      {selectedImageChunk && (
        <div className="modal-backdrop" onClick={() => setSelectedImageChunk(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>{selectedImageChunk.text}</h3>
            <p className="muted">
              <strong>Translation:</strong> {selectedImageChunk.translation}
            </p>
            <p className="muted">
              <strong>Type:</strong> {selectedImageChunk.type}
            </p>
            <Image
              src={selectedImageChunk.image ?? ""}
              alt={selectedImageChunk.text}
              className="chunk-image"
              width={380}
              height={220}
            />
            <button type="button" className="button" onClick={() => setSelectedImageChunk(null)}>
              Close
            </button>
          </div>
        </div>
      )}
        </>
      )}
    </div>
    </AppShell>
  );
}
