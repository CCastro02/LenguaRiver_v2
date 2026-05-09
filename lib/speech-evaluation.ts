/**
 * Unified speech evaluation.
 *
 * One function — `evaluateSpeechAnswer` — produces every field the UI needs:
 * pass/fail, match percent, missing, extras, approx-mispronounced, and the
 * candidate text we scored against. There is intentionally NO separate
 * "scoring path" and "display path" — every consumer reads from the same
 * result object, so the percent and the missing/extra word lists can never
 * disagree at runtime.
 */
"use client";

const PASS_THRESHOLD = 70;

const isDev = process.env.NODE_ENV === "development";

export type TokenClass = "content" | "grammarCritical" | "filler";

export type SpeechEvaluationResult = {
  ok: boolean;
  matchPercent: number;
  bestExpectedText: string;
  transcriptNormalized: string;
  expectedTokens: string[];
  spokenTokens: string[];
  missingWords: string[];
  extraWords: string[];
  approxMispronounced: string[];
  feedbackHint: string | null;
  missingGrammarCritical: string[];
};

export type EvaluateSpeechAnswerInput = {
  expectedText: string;
  spokenText: string;
  language: string;
  acceptedSpokenTexts?: readonly string[];
};

/**
 * Strip diacritics + punctuation + the Unicode replacement character so we can
 * reliably compare ASR/Whisper output against the expected sentence. The
 * `\uFFFD` strip is critical: on Windows the Whisper subprocess sometimes
 * round-trips Spanish accents through cp1252, and the corrupted bytes arrive
 * here as U+FFFD ("�") which we want to ignore rather than treat as a token.
 */
export function normalizeForSpeechCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/\uFFFD/g, "")
    .replace(/[\u00BF\u00A1]/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿¡?.,!;:"'()[\]{}]/g, " ")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function repairSpanishToken(token: string, nextTokens: readonly string[]): string {
  if (token.includes("aqu")) {
    return "aqui";
  }
  // "¿Qué" corrupted via STT encoding: ¿ stripped → "qu\uFFFD" → "qu".
  // "qu" is never a valid standalone Spanish token, so always repair to "que".
  if (token === "qu") {
    return "que";
  }
  if ((token === "cmo" || token === "com") && nextTokens[0] === "te" && nextTokens[1] === "llamas") {
    return "como";
  }
  return token;
}

export function tokenizeAndRepair(text: string): string[] {
  const raw = normalizeForSpeechCompare(text);
  if (!raw) {
    return [];
  }
  const tokens = raw.split(/\s+/).filter(Boolean);
  return tokens.map((token, index) => repairSpanishToken(token, tokens.slice(index + 1)));
}

const ES_GRAMMAR_CRITICAL = new Set([
  "me",
  "te",
  "se",
  "lo",
  "la",
  "le",
  "nos",
  "los",
  "las",
  "a",
  "de",
  "en",
  "con",
  "sin",
  "no",
  "que",
  "como",
  "donde",
  "cuando",
  "quien",
  "cual",
  "cuanto",
]);
const ES_FILLER = new Set(["hola", "gracias", "por", "favor"]);

export function classifyToken(token: string, language: string): TokenClass {
  const t = token.toLowerCase();
  if (language === "es") {
    if (ES_FILLER.has(t)) return "filler";
    if (ES_GRAMMAR_CRITICAL.has(t)) return "grammarCritical";
    return "content";
  }
  return "content";
}

function tokenWeight(tokenClass: TokenClass): number {
  if (tokenClass === "filler") return 0.3;
  return 1;
}

function levenshteinDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0)
  );
  for (let i = 0; i <= a.length; i += 1) dp[i]![0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost
      );
    }
  }
  return dp[a.length]![b.length]!;
}

/**
 * Eligibility test for fuzzy token matching.
 *
 * Two complementary cases — together they cover the encoding/STT artifacts
 * we see in the wild without accepting unrelated words:
 *
 *   (a) Long-word near-miss   – both ≥4 chars, lev ≤ 1.
 *                               (Real ASR mishears: salida↔salira.)
 *   (b) Pure-deletion artifact – spoken is strictly shorter than expected,
 *                                lenDiff ≤ 2, and lev === lenDiff
 *                                (i.e. spoken is obtained from expected by
 *                                deletions only — typical of accented vowels
 *                                that get dropped by faulty STT/encoding).
 *                                Examples: cómo→cmo, estás→ests, más→ms,
 *                                por→pr, estás→sts.
 *
 * NOTE: The previous implementation mis-defined "vowel-stripped" as
 * "spoken token contains zero a/e/i/o/u letters". That was wrong — "cmo"
 * still contains an 'o' and "ests" still contains an 'e', so neither was
 * recognised as a vowel-stripping artifact and "como"↔"cmo" never matched.
 * The fix here is to detect the artifact by SHAPE (pure deletions) rather
 * than by the presence of any vowel at all.
 */
function isFuzzyTokenMatch(expectedToken: string, spokenToken: string): boolean {
  if (expectedToken.length < 3 || spokenToken.length < 2) return false;
  const lenDiff = Math.abs(expectedToken.length - spokenToken.length);
  if (lenDiff > 2) return false;

  const dist = levenshteinDistance(expectedToken, spokenToken);

  // (a) Long-word near-miss.
  if (expectedToken.length >= 4 && spokenToken.length >= 4 && dist <= 1) {
    return true;
  }

  // (b) Pure-deletion artifact.
  if (spokenToken.length < expectedToken.length && dist === lenDiff) {
    return true;
  }

  return false;
}

function computeOrderPenaltyPercent(expectedTokens: string[], spokenTokens: string[]): number {
  const tokenToIndexes = new Map<string, number[]>();
  spokenTokens.forEach((token, idx) => {
    const list = tokenToIndexes.get(token) ?? [];
    list.push(idx);
    tokenToIndexes.set(token, list);
  });
  const matchedIndexes: number[] = [];
  expectedTokens.forEach((token) => {
    const list = tokenToIndexes.get(token);
    if (!list || list.length === 0) {
      return;
    }
    const next = list.shift();
    if (typeof next === "number") {
      matchedIndexes.push(next);
    }
  });
  if (matchedIndexes.length <= 1) {
    return 0;
  }
  let outOfOrderCount = 0;
  for (let i = 1; i < matchedIndexes.length; i += 1) {
    if (matchedIndexes[i]! < matchedIndexes[i - 1]!) {
      outOfOrderCount += 1;
    }
  }
  const severity = outOfOrderCount / (matchedIndexes.length - 1);
  return Math.min(20, Math.round(severity * 20));
}

type SingleCandidateMatch = {
  expectedTokens: string[];
  spokenTokens: string[];
  matchedExpected: boolean[];
  matchedSpoken: boolean[];
  matchedWeight: number;
  totalWeight: number;
  basePercent: number;
  orderPenalty: number;
  percent: number;
};

/**
 * Single-pass matching for one (expected, spoken) pair. Tracks per-position
 * matched flags so missing/extras can be derived from the SAME pass that
 * produced the percent — they cannot drift apart.
 */
function matchOneCandidate(
  expectedTokens: string[],
  spokenTokens: string[],
  language: string
): SingleCandidateMatch {
  const matchedExpected = new Array<boolean>(expectedTokens.length).fill(false);
  const matchedSpoken = new Array<boolean>(spokenTokens.length).fill(false);

  // Exact pass: leftmost unmatched spoken token.
  expectedTokens.forEach((eToken, eIdx) => {
    if (matchedExpected[eIdx]) return;
    for (let sIdx = 0; sIdx < spokenTokens.length; sIdx += 1) {
      if (matchedSpoken[sIdx]) continue;
      if (spokenTokens[sIdx] === eToken) {
        matchedExpected[eIdx] = true;
        matchedSpoken[sIdx] = true;
        return;
      }
    }
  });

  // Fuzzy pass for any still-unmatched expected token.
  expectedTokens.forEach((eToken, eIdx) => {
    if (matchedExpected[eIdx]) return;
    for (let sIdx = 0; sIdx < spokenTokens.length; sIdx += 1) {
      if (matchedSpoken[sIdx]) continue;
      if (isFuzzyTokenMatch(eToken, spokenTokens[sIdx]!)) {
        matchedExpected[eIdx] = true;
        matchedSpoken[sIdx] = true;
        return;
      }
    }
  });

  let totalWeight = 0;
  let matchedWeight = 0;
  expectedTokens.forEach((token, idx) => {
    const w = tokenWeight(classifyToken(token, language));
    totalWeight += w;
    if (matchedExpected[idx]) matchedWeight += w;
  });

  const basePercent = totalWeight > 0 ? (matchedWeight / totalWeight) * 100 : 0;
  const orderPenalty = computeOrderPenaltyPercent(expectedTokens, spokenTokens);
  const percent = Math.max(0, Math.round(basePercent - orderPenalty));

  return {
    expectedTokens,
    spokenTokens,
    matchedExpected,
    matchedSpoken,
    matchedWeight,
    totalWeight,
    basePercent,
    orderPenalty,
    percent,
  };
}

export function evaluateSpeechAnswer(input: EvaluateSpeechAnswerInput): SpeechEvaluationResult {
  const { expectedText, spokenText, language, acceptedSpokenTexts } = input;

  const candidates: string[] =
    acceptedSpokenTexts && acceptedSpokenTexts.length > 0
      ? Array.from(new Set([...acceptedSpokenTexts, expectedText]))
      : [expectedText];

  const spokenTokens = tokenizeAndRepair(spokenText);
  const transcriptNormalized = normalizeForSpeechCompare(spokenText);

  let bestMatch: SingleCandidateMatch | null = null;
  let bestExpectedText = expectedText;

  for (const candidate of candidates) {
    const expectedTokens = tokenizeAndRepair(candidate);
    if (expectedTokens.length === 0 || spokenTokens.length === 0) {
      continue;
    }
    const match = matchOneCandidate(expectedTokens, spokenTokens, language);
    if (!bestMatch || match.percent > bestMatch.percent) {
      bestMatch = match;
      bestExpectedText = candidate;
    }
  }

  if (!bestMatch) {
    // Empty expected or empty spoken — return a zero-score shell that's still
    // safe for downstream display.
    const fallbackExpectedTokens = tokenizeAndRepair(expectedText);
    return {
      ok: false,
      matchPercent: 0,
      bestExpectedText: expectedText,
      transcriptNormalized,
      expectedTokens: fallbackExpectedTokens,
      spokenTokens,
      missingWords: fallbackExpectedTokens,
      extraWords: spokenTokens,
      approxMispronounced: [],
      feedbackHint: spokenTokens.length === 0 ? null : "Good pronunciation, fix grammar",
      missingGrammarCritical: fallbackExpectedTokens.filter(
        (token) => classifyToken(token, language) === "grammarCritical"
      ),
    };
  }

  const expectedTokens = bestMatch.expectedTokens;
  const spokenTokensFinal = bestMatch.spokenTokens;
  const missingWords = expectedTokens.filter((_, idx) => !bestMatch!.matchedExpected[idx]);
  const extraWords = spokenTokensFinal.filter((_, idx) => !bestMatch!.matchedSpoken[idx]);

  const approxMispronounced: string[] =
    missingWords.length === 0 || extraWords.length === 0
      ? []
      : missingWords.filter((miss) =>
          extraWords.some((added) => {
            const maxLen = Math.max(miss.length, added.length);
            if (maxLen === 0) return false;
            const dist = levenshteinDistance(miss, added);
            return dist <= 2 && dist < maxLen;
          })
        );

  const ok = bestMatch.percent >= PASS_THRESHOLD;

  // When the answer passes, we suppress "approx mispronounced" entries from
  // the missing display so the user isn't told to repair words that were
  // already counted as a fuzzy hit.
  const displayMissing = ok
    ? missingWords.filter((w) => !approxMispronounced.includes(w))
    : missingWords;
  const missingGrammarCritical = displayMissing.filter(
    (token) => classifyToken(token, language) === "grammarCritical"
  );

  let feedbackHint: string | null = null;
  if (ok && approxMispronounced.length > 0) {
    feedbackHint = "Good pronunciation — small variation detected";
  } else if (ok && bestMatch.percent >= 90) {
    feedbackHint = "Good pronunciation and structure";
  } else if (missingGrammarCritical.length > 0) {
    feedbackHint = "Missing key structure";
  } else if (bestMatch.percent >= 60) {
    feedbackHint = "Almost there";
  } else {
    feedbackHint = "Good pronunciation, fix grammar";
  }

  if (isDev) {
    console.groupCollapsed(
      `[SpeechEval] "${spokenText}" vs "${bestExpectedText}" → ${bestMatch.percent}% (${ok ? "PASS" : "FAIL"})`
    );
    console.log("  rawSpoken            :", JSON.stringify(spokenText));
    console.log("  rawExpected          :", JSON.stringify(bestExpectedText));
    console.log("  spokenCharCodes      :", charCodeSummary(spokenText));
    console.log("  transcriptNormalized :", JSON.stringify(transcriptNormalized));
    console.log("  expectedNormalized   :", JSON.stringify(normalizeForSpeechCompare(bestExpectedText)));
    console.log("  expectedTokens       :", expectedTokens);
    console.log("  spokenTokens         :", spokenTokensFinal);
    console.log("  matchedExpected      :", bestMatch.matchedExpected);
    console.log("  matchedSpoken        :", bestMatch.matchedSpoken);
    console.log("  missingWords         :", missingWords);
    console.log("  extraWords           :", extraWords);
    console.log("  approxMispronounced  :", approxMispronounced);
    console.log(
      `  weights              : matched=${bestMatch.matchedWeight} total=${bestMatch.totalWeight} base=${bestMatch.basePercent.toFixed(1)}% orderPenalty=${bestMatch.orderPenalty}`
    );
    console.groupEnd();
  }

  return {
    ok,
    matchPercent: bestMatch.percent,
    bestExpectedText,
    transcriptNormalized,
    expectedTokens,
    spokenTokens: spokenTokensFinal,
    missingWords: displayMissing,
    extraWords,
    approxMispronounced,
    feedbackHint,
    missingGrammarCritical,
  };
}

function charCodeSummary(text: string): string {
  return Array.from(text)
    .slice(0, 30)
    .map((c) => `${c}(U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")})`)
    .join(" ");
}

/** Backwards-compat: callers in LessonRunner only need the percent. */
export function computeWeightedMatchPercent(expected: string, spoken: string, language: string): number {
  return evaluateSpeechAnswer({ expectedText: expected, spokenText: spoken, language }).matchPercent;
}

/** Backwards-compat: speaking pass/fail still based on the >=70 threshold. */
export function isSpeechMatch(expected: string, spoken: string, language = "es"): boolean {
  return evaluateSpeechAnswer({ expectedText: expected, spokenText: spoken, language }).ok;
}

function runSpeechNormalizationDevChecks(): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }
  const checks: Array<{
    expected: string;
    transcript: string;
    shouldPass: boolean;
    accepted?: readonly string[];
  }> = [
    { expected: "¿Juegas aquí?", transcript: "Juegas aqu\uFFFD", shouldPass: true },
    { expected: "¿Cómo te llamas?", transcript: "C\uFFFDmo te llamas?", shouldPass: true },
    { expected: "¿Juegas aquí?", transcript: "Juegas", shouldPass: false },
    { expected: "¿Cómo te llamas?", transcript: "te llamas", shouldPass: false },
    // Phonetic near-miss tolerance
    { expected: "que significa salida", transcript: "que significa salida", shouldPass: true },
    { expected: "que significa salida", transcript: "que significa salira", shouldPass: true },
    { expected: "que significa salida", transcript: "que significa", shouldPass: false },
    { expected: "que significa salida", transcript: "hola", shouldPass: false },
    // Corrupted "qué" transcript: ¿Qu\uFFFD → "qu" after normalization → repaired to "que"
    { expected: "¿Qué significa salida?", transcript: "Qu significa salida", shouldPass: true },
    { expected: "¿Qué significa salida?", transcript: "que significa salida", shouldPass: true },
    { expected: "¿Qué significa salida?", transcript: "significa salida", shouldPass: false },
    { expected: "¿Qué significa salida?", transcript: "hola", shouldPass: false },
    // Vowel-stripped artifact recovery: "más" → "ms"
    { expected: "más despacio por favor", transcript: "más despacio por favor", shouldPass: true },
    { expected: "más despacio por favor", transcript: "mas despacio por favor", shouldPass: true },
    { expected: "más despacio por favor", transcript: "ms despacio por favor", shouldPass: true },
    { expected: "más despacio por favor", transcript: "despacio por favor", shouldPass: false },
    { expected: "más despacio por favor", transcript: "hola", shouldPass: false },
    // Multi-word vowel-stripped artifacts: cómo↔cmo AND estás↔ests in one transcript
    { expected: "¿Cómo estás?", transcript: "cómo estás", shouldPass: true },
    { expected: "¿Cómo estás?", transcript: "como estas", shouldPass: true },
    { expected: "¿Cómo estás?", transcript: "cmo ests", shouldPass: true },
    { expected: "¿Cómo estás?", transcript: "cmo estas", shouldPass: true },
    { expected: "¿Cómo estás?", transcript: "estas", shouldPass: false },
    { expected: "¿Cómo estás?", transcript: "hola", shouldPass: false },
    // Two-vowel-stripped artifact: "estás" → "sts" (edit distance 2)
    { expected: "¿Cómo estás?", transcript: "cmo sts", shouldPass: true },
    // Real-world bug case: Whisper on Windows returns U+FFFD for ¿/ó/á.
    { expected: "¿cómo estás?", transcript: "\uFFFDC\uFFFDmo est\uFFFDs?", shouldPass: true },
    // acceptedSpokenTexts (translation/meaning exercises) — any synonym must pass.
    {
      expected: "hola",
      accepted: ["hello", "hi", "hey"],
      transcript: "hello",
      shouldPass: true,
    },
    {
      expected: "hola",
      accepted: ["hello", "hi", "hey"],
      transcript: "hi",
      shouldPass: true,
    },
    {
      expected: "hola",
      accepted: ["hello", "hi", "hey"],
      transcript: "hey",
      shouldPass: true,
    },
    {
      expected: "hola",
      accepted: ["hello", "hi", "hey"],
      transcript: "goodbye",
      shouldPass: false,
    },
  ];
  checks.forEach((check) => {
    const result = evaluateSpeechAnswer({
      expectedText: check.expected,
      spokenText: check.transcript,
      language: "es",
      acceptedSpokenTexts: check.accepted,
    });
    if (result.ok !== check.shouldPass) {
      console.warn("[speech normalize check] unexpected result", {
        expected: check.expected,
        transcript: check.transcript,
        accepted: check.accepted,
        shouldPass: check.shouldPass,
        actual: result.ok,
        percent: result.matchPercent,
        missing: result.missingWords,
        extra: result.extraWords,
      });
    }
  });
}
runSpeechNormalizationDevChecks();
