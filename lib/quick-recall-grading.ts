/**
 * Quick Recall grading helpers (LessonRunner-aligned normalization via
 * normalizeForSpeechCompare — accent-insensitive Spanish typing).
 */

import type { LessonLanguage } from "@/lib/lesson-data";
import { getEnglishContentTokens } from "@/lib/text-normalization";
import { normalizeForSpeechCompare } from "@/lib/speech-evaluation";
import { getAcceptedMeanings } from "@/lib/translation-synonyms";

export type GradingStatus = "correct" | "partial" | "incorrect";

export type GradingResult = {
  status: GradingStatus;
  /** LessonRunner-aligned: meaning exercises accept partial; chunk streak uses substring match for typing-to-target. */
  chunkAttemptPositive: boolean;
  writingAccuracyPositive: boolean;
};

/** English meaning typing normalization. */
function normalizeMeaningTyping(value: string): string {
  return normalizeForSpeechCompare(value);
}

function tokenizeMeaningTyping(value: string): string[] {
  return normalizeMeaningTyping(value).split(/\s+/).filter(Boolean);
}

function evaluatePartsWithNormalizer(
  userAnswer: string,
  expectedParts: string[],
  normalizeValue: (input: string) => string
): { status: GradingStatus; tryText: string } {
  const normalizedInput = normalizeValue(userAnswer);
  const correctParts = expectedParts.filter((part) => normalizedInput.includes(normalizeValue(part)));
  const missingParts = expectedParts.filter((part) => !correctParts.includes(part));
  const inputTok = normalizeValue(userAnswer).split(/\s+/).filter(Boolean);
  const expectedTokens = expectedParts.flatMap((part) =>
    normalizeValue(part)
      .split(/\s+/)
      .filter(Boolean)
  );
  const extraParts = inputTok.filter((token) => !expectedTokens.includes(token));
  void extraParts;

  const safeTry = expectedParts[0] ?? "";

  if (missingParts.length === 0 && correctParts.length > 0) {
    return { status: "correct", tryText: safeTry };
  }
  if (correctParts.length > 0) {
    return { status: "partial", tryText: missingParts[0] ?? safeTry };
  }
  return {
    status: "incorrect",
    tryText: safeTry,
  };
}

/** Russian latinization helper (minimal copy of LessonRunner heuristics). */
function normalizeRussianPhoneticLatin(value: string): string {
  const normalized = normalizeForSpeechCompare(value);
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

export function evaluateMeaningTyping(userAnswer: string, acceptedMeanings: string[]): GradingResult {
  const normalizedInput = normalizeMeaningTyping(userAnswer);
  const exactMatch = acceptedMeanings.find((meaning) => normalizeMeaningTyping(meaning) === normalizedInput);

  if (exactMatch) {
    return {
      status: "correct",
      chunkAttemptPositive: true,
      writingAccuracyPositive: true,
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

  function isNearSingleTokenAnswer(inputTokens: string[], meanings: string[]): boolean {
    if (inputTokens.length !== 1 || inputTokens[0]!.length < 3) {
      return false;
    }
    const input = inputTokens[0]!;
    return meanings.some((meaning) => {
      const expectedTokens = tokenizeMeaningTyping(meaning);
      if (expectedTokens.length !== 1) {
        return false;
      }
      const expected = expectedTokens[0]!;
      return expected.length > input.length && expected.startsWith(input);
    });
  }

  const inputTokens = tokenizeMeaningTyping(userAnswer);

  const scoredAccepted = acceptedMeanings
    .map((meaning) => {
      const expectedTokens = tokenizeMeaningTyping(meaning);
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
      const missingTokens = expectedTokens.filter((token) => !matchedTokens.includes(token));
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
    return { status: "incorrect", chunkAttemptPositive: false, writingAccuracyPositive: false };
  }

  const status: GradingStatus =
    bestMatch.score >= 0.5 || isNearSingleTokenAnswer(inputTokens, acceptedMeanings)
      ? "partial"
      : "incorrect";

  const chunkAttemptPositive = status !== "incorrect";
  const writingAccuracyPositive = false;

  return {
    status,
    chunkAttemptPositive,
    writingAccuracyPositive,
  };
}

function pickBetterDetail(a: GradingStatus, b: GradingStatus): GradingStatus {
  const rank = { incorrect: 0, partial: 1, correct: 2 } as const;
  return rank[b] > rank[a] ? b : a;
}

/** Meaning-to-target(L2): substring + phonetic pass matches LessonRunner `matchedChunks`; writing uses granular detail. */
function gradeMeaningToL2Typing(
  trimmed: string,
  item: {
    surfaceText: string;
    text: string;
    phonetic?: string;
  },
  language: LessonLanguage
): GradingResult {
  const normalizedInput = normalizeForSpeechCompare(trimmed);

  const normSurface = normalizeForSpeechCompare(item.surfaceText);
  const normText = normalizeForSpeechCompare(item.text);

  const phoneticMatched = Boolean(item.phonetic)
    ? language === "ru"
      ? normalizeRussianPhoneticLatin(trimmed).includes(normalizeRussianPhoneticLatin(item.phonetic ?? ""))
      : normalizedInput.includes(normalizeForSpeechCompare(item.phonetic ?? ""))
    : false;

  const chunkAttemptPositive =
    (normSurface.length > 0 && normalizedInput.includes(normSurface)) ||
    (normText.length > 0 && normalizedInput.includes(normText)) ||
    phoneticMatched;

  let detailCombined = evaluatePartsWithNormalizer(trimmed, [item.surfaceText], normalizeForSpeechCompare).status;
  if (item.phonetic) {
    const phonDetail = evaluatePartsWithNormalizer(
      trimmed,
      [item.phonetic],
      language === "ru" ? normalizeRussianPhoneticLatin : normalizeForSpeechCompare
    ).status;
    detailCombined = pickBetterDetail(detailCombined, phonDetail);
  }

  const writingAccuracyPositive = detailCombined === "correct";

  let uiStatus: GradingStatus;
  if (!chunkAttemptPositive) {
    uiStatus = "incorrect";
  } else if (detailCombined === "correct") {
    uiStatus = "correct";
  } else {
    uiStatus = "partial";
  }

  return {
    status: uiStatus,
    chunkAttemptPositive,
    writingAccuracyPositive,
  };
}

export function gradeRecallAnswer(
  item: {
    mode: "l2-to-meaning" | "meaning-to-l2";
    text: string;
    surfaceText: string;
    translation: string;
    phonetic?: string;
    acceptedMeanings?: string[];
  },
  userAnswerRaw: string,
  language: LessonLanguage
): GradingResult {
  const trimmed = userAnswerRaw.trim();
  if (!trimmed) {
    return {
      status: "incorrect",
      chunkAttemptPositive: false,
      writingAccuracyPositive: false,
    };
  }

  if (item.mode === "l2-to-meaning") {
    const accepted = getAcceptedMeanings(item.translation, item.acceptedMeanings);
    return evaluateMeaningTyping(trimmed, accepted);
  }

  return gradeMeaningToL2Typing(trimmed, item, language);
}
