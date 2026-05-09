/**
 * Chunk normalization for reusable pattern keys (MVP heuristics).
 * Future: language-specific rules, Leipzig/POS hooks via ChunkNormalizerOptions.
 */
import { starterCoreVocabulary } from "./core-vocabulary";

export type ChunkNormalizerLanguage = "es" | "ru" | "default";

export type ChunkNormalizerOptions = {
  /** Reserved for language-specific normalizers (e.g. Leipzig, POS). */
  language?: ChunkNormalizerLanguage;
};

const PERSON_NAME_EXAMPLES = new Set([
  "ana",
  "carlos",
  "maría",
  "maria",
  "анна",
  "иван",
  "мария",
]);

const ALLOWED_FIXED_PHRASES = new Set([
  "hola",
  "gracias",
  "no",
  "sí",
  "si",
  "por favor",
  "la cuenta",
  "aquí",
  "aqui",
  "cerca",
  "lejos",
  "para mí",
  "para mi",
]);

export type WithExerciseAnchor = {
  text: string;
  exerciseAnchorText?: string;
};

/** Literal substring in the sentence for fill-in / typing checks; falls back to canonical `text`. */
export function getExerciseSurfaceText(word: WithExerciseAnchor): string {
  return word.exerciseAnchorText ?? word.text;
}

function baseNormalize(text: string): string {
  return text.toLowerCase().trim();
}

function stripEdgePunctuation(text: string): string {
  return text.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "");
}

function hasUppercaseLetter(text: string): boolean {
  return /\p{Lu}/u.test(text);
}

function startsWithUppercaseLetter(text: string): boolean {
  const t = stripEdgePunctuation(text.trim());
  if (!t) {
    return false;
  }
  return /^\p{Lu}/u.test(t);
}

function tokenizeLoose(text: string): string[] {
  return stripEdgePunctuation(text)
    .split(/\s+/)
    .map((part) => stripEdgePunctuation(part))
    .filter(Boolean);
}

const CORE_VOCAB_BY_LANG: Record<ChunkNormalizerLanguage, Set<string>> = {
  default: new Set<string>(),
  es: new Set<string>(),
  ru: new Set<string>(),
};

starterCoreVocabulary.forEach((entry) => {
  const normalized = stripEdgePunctuation(baseNormalize(entry.baseForm));
  CORE_VOCAB_BY_LANG.default.add(normalized);
  CORE_VOCAB_BY_LANG[entry.language].add(normalized);
});

function wordCount(text: string): number {
  const t = text.trim();
  if (!t) {
    return 0;
  }
  return t.split(/\s+/).filter(Boolean).length;
}

/**
 * 1. Lowercase and trim.
 * 2. Preserve `con ___` / `sin ___` fragments as-is (after lowercasing).
 */
export function normalizeChunk(text: string, options?: ChunkNormalizerOptions): string {
  void options;
  const t = baseNormalize(text);
  if (/\bcon\s+___\b/.test(t) || /\bsin\s+___\b/.test(t)) {
    return t;
  }
  return t;
}

export function isKnownPersonNameText(text: string): boolean {
  const normalized = stripEdgePunctuation(baseNormalize(text));
  return PERSON_NAME_EXAMPLES.has(normalized);
}

export function isLikelyPersonNameChunk(params: {
  text: string;
  translation?: string;
  sentenceText?: string;
  language?: ChunkNormalizerLanguage;
}): boolean {
  const textRaw = params.text.trim();
  if (!textRaw) {
    return false;
  }
  const textNorm = stripEdgePunctuation(baseNormalize(textRaw));
  if (!textNorm || textNorm.split(/\s+/).length !== 1) {
    return false;
  }

  if (isKnownPersonNameText(textNorm)) {
    return true;
  }

  const tokens = tokenizeLoose(textRaw);
  if (tokens.length === 0 || tokens.length > 2) {
    return false;
  }
  if (tokens.some((token) => token.length <= 1)) {
    return false;
  }

  const language = params.language ?? "default";
  const inKnownCoreVocabulary =
    CORE_VOCAB_BY_LANG[language]?.has(textNorm) ?? CORE_VOCAB_BY_LANG.default.has(textNorm);
  if (inKnownCoreVocabulary) {
    return false;
  }

  const translationRaw = (params.translation ?? "").trim();
  const translationNorm = stripEdgePunctuation(baseNormalize(translationRaw));
  const translationMatchesText = translationNorm.length > 0 && translationNorm === textNorm;
  const sentenceRaw = (params.sentenceText ?? "").trim();
  const nameIntroducerPattern =
    /\b(me llamo|soy|mi nombre es)\s+([^\s,.;:!?]+(?:\s+[^\s,.;:!?]+)?)\b/iu;
  const russianIntroducerPattern = /\b(меня зовут)\s+([^\s,.;:!?]+(?:\s+[^\s,.;:!?]+)?)\b/iu;
  const afterIntroducer = (pattern: RegExp): string => {
    const m = sentenceRaw.match(pattern);
    return m?.[2] ?? "";
  };
  const sentenceCandidateNames = [
    afterIntroducer(nameIntroducerPattern),
    afterIntroducer(russianIntroducerPattern),
  ]
    .map((candidate) => stripEdgePunctuation(baseNormalize(candidate)))
    .filter(Boolean);
  const appearsAfterNamePattern = sentenceCandidateNames.some((candidate) => candidate === textNorm);

  // Fallback: preserve previous behavior for explicit-uppercase mirror names even if context regex missed.
  const uppercaseNameSignal =
    hasUppercaseLetter(textRaw) && (translationMatchesText || hasUppercaseLetter(translationRaw));

  if (!startsWithUppercaseLetter(textRaw)) {
    return false;
  }

  return appearsAfterNamePattern || uppercaseNameSignal;
}

function sentencesEquivalent(a: string, b: string): boolean {
  return baseNormalize(a) === baseNormalize(b);
}

function chunkCoversFullSentence(sentenceText: string, chunk: string): boolean {
  return sentencesEquivalent(sentenceText, chunk);
}

/**
 * Validation for canonical chunk text relative to the (unchanged) sentence.
 */
export function validateChunk(sentenceText: string, chunk: string): boolean {
  const chunkTrim = chunk.trim();
  const sentTrim = sentenceText.trim();
  if (!chunkTrim || !sentTrim) {
    return false;
  }

  const sentHasPlaceholder = baseNormalize(sentTrim).includes("___");
  if (chunkCoversFullSentence(sentTrim, chunkTrim) && wordCount(sentTrim) > 2 && !sentHasPlaceholder) {
    return false;
  }

  const cLower = baseNormalize(chunkTrim);
  const hasPlaceholder = cLower.includes("___");
  const chunkInSentence =
    sentTrim.toLowerCase().includes(chunkTrim.toLowerCase()) || chunkCoversFullSentence(sentTrim, chunkTrim);

  if (!hasPlaceholder && !ALLOWED_FIXED_PHRASES.has(cLower)) {
    if (wordCount(chunkTrim) > 3) {
      return false;
    }
    if (wordCount(chunkTrim) > 2 && !chunkInSentence) {
      return false;
    }
  }

  if (sentTrim.length > 0 && chunkTrim.length / sentTrim.length > 0.6) {
    const wc = wordCount(chunkTrim);
    if (wc > 2 && !hasPlaceholder && !chunkCoversFullSentence(sentTrim, chunkTrim)) {
      return false;
    }
  }

  return true;
}

function sentenceHasDondeEsta(sentence: string): boolean {
  const s = baseNormalize(sentence);
  return /\b¿?d[oó]nde\s+est[aá]\b/.test(s);
}

function sentenceHasQuiero(sentence: string): boolean {
  const s = baseNormalize(sentence);
  return /\bquiero\b/.test(s);
}

function sentenceHasTiene(sentence: string): boolean {
  const s = baseNormalize(sentence);
  return /\b¿?\s*tiene\b/.test(s);
}

function sentenceHasSoyDe(sentence: string): boolean {
  const s = baseNormalize(sentence);
  return /\bsoy\s+de\b/.test(s);
}

function sentenceHasDeDondeEres(sentence: string): boolean {
  const s = baseNormalize(sentence);
  return /\b¿?\s*de\s+d[oó]nde\s+eres\b/.test(s);
}

function sentenceHasNecesito(sentence: string): boolean {
  const s = baseNormalize(sentence);
  return /\bnecesito\b/.test(s);
}

function sentenceHasMeSiento(sentence: string): boolean {
  const s = baseNormalize(sentence);
  return /\bme\s+siento\b/.test(s);
}

function sentenceHasEstoy(sentence: string): boolean {
  const s = baseNormalize(sentence);
  return /\bestoy\b/.test(s);
}

function chunkMatchesDondeEstaPrefix(chunk: string): boolean {
  const c = baseNormalize(chunk);
  return /^¿?\s*d[oó]nde\s+est[aá]\b/.test(c);
}

function chunkMatchesQuieroPrefix(chunk: string): boolean {
  const c = baseNormalize(chunk);
  return /^quiero\b/.test(c);
}

function chunkMatchesTienePrefix(chunk: string): boolean {
  const c = baseNormalize(chunk);
  return /^¿?\s*tiene\b/.test(c);
}

function chunkMatchesSoyDePrefix(chunk: string): boolean {
  const c = baseNormalize(chunk);
  return /^soy\s+de\b/.test(c);
}

function chunkMatchesDeDondeEresPrefix(chunk: string): boolean {
  const c = baseNormalize(chunk);
  return /^¿?\s*de\s+d[oó]nde\s+eres\b/.test(c);
}

function chunkMatchesNecesitoPrefix(chunk: string): boolean {
  const c = baseNormalize(chunk);
  return /^necesito\b/.test(c);
}

function chunkMatchesMeSientoPrefix(chunk: string): boolean {
  const c = baseNormalize(chunk);
  return /^me\s+siento\b/.test(c);
}

function chunkMatchesEstoyPrefix(chunk: string): boolean {
  const c = baseNormalize(chunk);
  return /^estoy\b/.test(c);
}

function extractSpanFromSentence(sentenceText: string, chunk: string): string {
  const sent = sentenceText;
  const idx = sent.toLowerCase().indexOf(chunk.toLowerCase().trim());
  if (idx === -1) {
    return chunk.trim();
  }
  return sent.slice(idx, idx + chunk.trim().length);
}

export type AutoFixChunkResult = {
  text: string;
  exerciseAnchorText?: string;
  warning?: string;
};

/**
 * Safe auto-fix: prefer pattern rules; otherwise meaningful sub-phrase or warn.
 */
export function autoFixChunk(
  sentenceText: string,
  chunk: string,
  options?: ChunkNormalizerOptions & { lessonId?: string }
): AutoFixChunkResult {
  const lang = options?.language ?? "default";

  const text = normalizeChunk(chunk, options);

  const sent = sentenceText.trim();
  const rawChunk = chunk.trim();

  if (/\bcon\s+___\b/i.test(rawChunk) || /\bsin\s+___\b/i.test(rawChunk)) {
    return { text, exerciseAnchorText: undefined };
  }

  if (lang === "es" || lang === "default") {
    if (sentenceHasDondeEsta(sent) && chunkMatchesDondeEstaPrefix(rawChunk)) {
      const anchor = extractSpanFromSentence(sent, rawChunk);
      const chunkLooksLikeQuestion =
        rawChunk.includes("?") || rawChunk.includes("___") || wordCount(rawChunk) >= 3;
      const rewriteWhereIs =
        chunkLooksLikeQuestion || chunkCoversFullSentence(sent, rawChunk);
      if (rewriteWhereIs && (wordCount(sent) > 2 || rawChunk.includes("___"))) {
        const pattern = "¿dónde está ___?";
        const anchorNorm = baseNormalize(anchor);
        return {
          text: pattern,
          exerciseAnchorText: anchorNorm === baseNormalize(pattern) ? undefined : anchor,
        };
      }
    }
    if (sentenceHasQuiero(sent) && chunkMatchesQuieroPrefix(rawChunk) && wordCount(rawChunk) > 2) {
      const anchor = extractSpanFromSentence(sent, rawChunk);
      const pattern = "quiero ___";
      const anchorNorm = baseNormalize(anchor);
      return {
        text: pattern,
        exerciseAnchorText: anchorNorm === baseNormalize(pattern) ? undefined : anchor,
      };
    }
    if (sentenceHasTiene(sent) && chunkMatchesTienePrefix(rawChunk) && wordCount(rawChunk) > 1) {
      const anchor = extractSpanFromSentence(sent, rawChunk);
      const pattern = "¿tiene ___?";
      const anchorNorm = baseNormalize(anchor);
      return {
        text: pattern,
        exerciseAnchorText: anchorNorm === baseNormalize(pattern) ? undefined : anchor,
      };
    }
    if (sentenceHasSoyDe(sent) && chunkMatchesSoyDePrefix(rawChunk) && wordCount(rawChunk) > 2) {
      const anchor = extractSpanFromSentence(sent, rawChunk);
      const pattern = "soy de ___";
      const anchorNorm = baseNormalize(anchor);
      return {
        text: pattern,
        exerciseAnchorText: anchorNorm === baseNormalize(pattern) ? undefined : anchor,
      };
    }
    if (sentenceHasDeDondeEres(sent) && chunkMatchesDeDondeEresPrefix(rawChunk) && wordCount(rawChunk) > 3) {
      const anchor = extractSpanFromSentence(sent, rawChunk);
      const pattern = "¿de dónde eres?";
      const anchorNorm = baseNormalize(anchor);
      return {
        text: pattern,
        exerciseAnchorText: anchorNorm === baseNormalize(pattern) ? undefined : anchor,
      };
    }
    if (sentenceHasNecesito(sent) && chunkMatchesNecesitoPrefix(rawChunk) && wordCount(rawChunk) > 1) {
      const anchor = extractSpanFromSentence(sent, rawChunk);
      const pattern = "necesito ___";
      const anchorNorm = baseNormalize(anchor);
      return {
        text: pattern,
        exerciseAnchorText: anchorNorm === baseNormalize(pattern) ? undefined : anchor,
      };
    }
    if (sentenceHasMeSiento(sent) && chunkMatchesMeSientoPrefix(rawChunk) && wordCount(rawChunk) > 2) {
      const anchor = extractSpanFromSentence(sent, rawChunk);
      const pattern = "me siento ___";
      const anchorNorm = baseNormalize(anchor);
      return {
        text: pattern,
        exerciseAnchorText: anchorNorm === baseNormalize(pattern) ? undefined : anchor,
      };
    }
    if (sentenceHasEstoy(sent) && chunkMatchesEstoyPrefix(rawChunk) && wordCount(rawChunk) > 1) {
      const anchor = extractSpanFromSentence(sent, rawChunk);
      const pattern = "estoy ___";
      const anchorNorm = baseNormalize(anchor);
      return {
        text: pattern,
        exerciseAnchorText: anchorNorm === baseNormalize(pattern) ? undefined : anchor,
      };
    }
  }

  if (!validateChunk(sent, text) && chunkCoversFullSentence(sent, rawChunk) && wordCount(sent) > 2) {
    const tokens = sent.split(/\s+/).filter(Boolean);
    const sub = tokens.slice(0, Math.min(3, tokens.length)).join(" ");
    const anchor = extractSpanFromSentence(sent, sub);
    const warning = `fallback sub-phrase from full-sentence chunk${options?.lessonId ? ` (${options.lessonId})` : ""}`;
    return { text: normalizeChunk(sub), exerciseAnchorText: anchor, warning };
  }

  if (!validateChunk(sent, text)) {
    return {
      text,
      exerciseAnchorText: extractSpanFromSentence(sent, rawChunk),
      warning: `chunk still failed validation after auto-fix${options?.lessonId ? ` (${options.lessonId})` : ""}`,
    };
  }

  return { text, exerciseAnchorText: undefined };
}

export function logChunkNormalizationDev(params: {
  lessonId: string;
  sentence: string;
  originalChunk: string;
  normalizedChunk: string;
  exerciseAnchorText?: string;
}): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }
  const { lessonId, sentence, originalChunk, normalizedChunk, exerciseAnchorText } = params;
  if (baseNormalize(originalChunk) === baseNormalize(normalizedChunk) && !exerciseAnchorText) {
    return;
  }
  const anchorPart =
    exerciseAnchorText !== undefined ? ` exerciseAnchor: "${exerciseAnchorText}"` : "";
  console.warn(
    `[chunk warning] lessonId=${lessonId} sentence: "${sentence}" original chunk: "${originalChunk}" normalized chunk: "${normalizedChunk}"${anchorPart}`
  );
}

/** Normalize `coreWords` / similar lists to canonical pattern strings (no sentence context). */
export function normalizeStandaloneCoreWord(text: string, options?: ChunkNormalizerOptions): string {
  const t = text.trim();
  const lower = baseNormalize(t);
  if (/\bcon\s+___\b/.test(lower) || /\bsin\s+___\b/.test(lower)) {
    return lower;
  }
  const lang = options?.language ?? "default";
  if (lang === "es" || lang === "default") {
    if (/^¿?\s*d[oó]nde\s+est[aá]\s+.+\?$/iu.test(t)) {
      return "¿dónde está ___?";
    }
    if (/^¿?\s*tiene\s+.+\?$/iu.test(t)) {
      return "¿tiene ___?";
    }
    if (/^quiero\s+\S+/iu.test(t)) {
      return "quiero ___";
    }
    if (/^soy\s+de\s+\S+/iu.test(t)) {
      return "soy de ___";
    }
    if (/^¿?\s*de\s+d[oó]nde\s+eres\??$/iu.test(t)) {
      return "¿de dónde eres?";
    }
    if (/^necesito\s+\S+/iu.test(t)) {
      return "necesito ___";
    }
    if (/^me\s+siento\s+\S+/iu.test(t)) {
      return "me siento ___";
    }
    if (/^estoy\s+\S+/iu.test(t)) {
      return "estoy ___";
    }
  }
  return normalizeChunk(t, options);
}

export function normalizeCoreWordsList(
  coreWords: string[],
  options?: ChunkNormalizerOptions
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const cw of coreWords) {
    const n = normalizeStandaloneCoreWord(cw, options);
    const k = baseNormalize(n);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(n);
    }
  }
  return out;
}

/**
 * Apply normalization before `enrichWord` / exercises. Does not mutate `sentenceText`.
 */
export function processLessonWordChunk(
  sentenceText: string,
  word: { text: string },
  lessonMeta: { id: string; language: ChunkNormalizerLanguage }
): { text: string; exerciseAnchorText?: string } {
  const original = word.text;
  const fix = autoFixChunk(sentenceText, original, {
    language: lessonMeta.language === "ru" ? "ru" : "es",
    lessonId: lessonMeta.id,
  });
  const nextText = fix.text;
  const anchor =
    fix.exerciseAnchorText && baseNormalize(fix.exerciseAnchorText) !== baseNormalize(nextText)
      ? fix.exerciseAnchorText
      : undefined;

  logChunkNormalizationDev({
    lessonId: lessonMeta.id,
    sentence: sentenceText,
    originalChunk: original,
    normalizedChunk: nextText,
    exerciseAnchorText: anchor,
  });

  if (fix.warning && process.env.NODE_ENV === "development") {
    console.warn("[chunk warning]", fix.warning, { lessonId: lessonMeta.id, sentence: sentenceText, chunk: original });
  }

  return {
    text: nextText,
    exerciseAnchorText: anchor,
  };
}
