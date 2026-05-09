import type { LessonLanguage } from "@/lib/lesson-data";

/**
 * Word-like tokens for fill-in-blank *context* checks (remainder after blanking).
 */
function tokenizeContextWords(fragment: string): string[] {
  const matches = fragment.normalize("NFC").match(/\p{L}[\p{L}\p{M}]*/gu);
  return matches ?? [];
}

function letterCount(s: string): number {
  return (s.match(/\p{L}/gu) ?? []).length;
}

function findChunkBoundsInSentence(sentenceText: string, chunkText: string): { start: number; end: number } | null {
  const sentenceLower = sentenceText.toLowerCase();
  const chunkLower = chunkText.toLowerCase();
  const start = sentenceLower.indexOf(chunkLower);
  if (start === -1) {
    return null;
  }
  return { start, end: start + chunkText.length };
}

const SPANISH_DEMONSTRATIVES = new Set([
  "esto",
  "eso",
  "aquel",
  "aquella",
  "aquello",
  "esta",
  "este",
  "ese",
  "esa",
  "this",
  "that",
  "these",
  "those",
  "it",
]);

const SPANISH_FUNCTION_TOKENS = new Set([
  "qué",
  "que",
  "quién",
  "quien",
  "cuál",
  "cual",
  "dónde",
  "donde",
  "cuándo",
  "cuando",
  "cómo",
  "como",
  "por",
  "para",
  "y",
  "o",
  "a",
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "de",
  "del",
  "al",
  "en",
  "con",
  "sin",
  "mi",
  "mis",
  "tu",
  "tus",
  "su",
  "sus",
  "the",
  "a",
  "an",
  "is",
  "are",
  "do",
  "does",
]);

const SPANISH_VERB_LIKE = /^(soy|eres|es|somos|sois|son|estoy|estás|está|estamos|estáis|están|voy|vas|va|vamos|vais|van|doy|das|da|damos|dais|dan|he|has|ha|hemos|habéis|han|hay|sé|sabes|sabe|sabemos|sabéis|saben|puedo|puedes|puede|podemos|podéis|pueden|quiero|quieres|quiere|queremos|queréis|quieren|doy|das|da|dice|digo|hago|tengo|tiene|tienes|tienen)$/i;

const SPANISH_VERB_SUFFIX = /(ar|er|ir|arse|erse|irse|ando|iendo|ado|ido|amos|imos|áis|éis|aban|ían|aré|eré|iré|ería|iría|aría|aste|iste|ó|ió|ieron|imos|isteis|aron)$/i;

const SPANISH_WH = new Set(["qué", "quién", "cuál", "dónde", "cuándo", "cómo", "cuánto", "cuánta"]);

const RU_WH = new Set(["что", "как", "где", "когда", "кто", "почему", "зачем", "сколько", "чей", "какой", "какая", "какие", "какое"]);

function isVerbLikeSpanish(token: string): boolean {
  const t = token.toLowerCase();
  if (t.length < 2) {
    return false;
  }
  if (SPANISH_VERB_LIKE.test(t)) {
    return true;
  }
  if (t.length >= 4 && SPANISH_VERB_SUFFIX.test(t) && !SPANISH_DEMONSTRATIVES.has(t)) {
    return true;
  }
  if (t.length >= 5 && /[aeiouáéíóú]/i.test(t) && !SPANISH_DEMONSTRATIVES.has(t)) {
    if (/(o|as|a|amos|án|en|es|ís|imos|iste|ió|ieron|aba|ía|ará|eré|isteis|imos)$/i.test(t)) {
      return true;
    }
  }
  return false;
}

const RU_DEMONSTRATIVES = new Set([
  "это",
  "то",
  "этот",
  "эта",
  "эти",
  "тот",
  "та",
  "те",
  "такой",
  "такая",
  "такие",
]);

const RU_FUNCTION = new Set([
  "и",
  "в",
  "во",
  "не",
  "на",
  "я",
  "ты",
  "он",
  "она",
  "оно",
  "мы",
  "вы",
  "они",
  "с",
  "со",
  "к",
  "ко",
  "у",
  "о",
  "об",
  "а",
  "но",
  "да",
  "как",
  "что",
  "где",
  "когда",
  "кто",
  "почему",
  "зачем",
]);

/** Rough finite / infinitive shape for Russian (remainder anchor). */
function isVerbLikeRussian(token: string): boolean {
  const t = token.toLowerCase();
  if (t.length < 3) {
    return false;
  }
  if (RU_DEMONSTRATIVES.has(t) || RU_FUNCTION.has(t)) {
    return false;
  }
  if (/ть(ся)?$|ться$|ишь$|ите$|ишьте$|ет$|ут$|ют$|ат$|ят$|ем$|ём$|им$|ете$|ёте$|ишь$|ла$|ло$|ли$|й$|ь$|у$|ю$|ешь$|ёшь$/i.test(t)) {
    return true;
  }
  return t.length >= 5 && /[аеёиоуыэюя]/i.test(t);
}

function remainderHasAnchor(tokens: string[], language: LessonLanguage): boolean {
  if (tokens.length === 0) {
    return false;
  }
  const lower = tokens.map((t) => t.toLowerCase());

  if (language === "es") {
    if (lower.length >= 2 && SPANISH_WH.has(lower[0]) && SPANISH_DEMONSTRATIVES.has(lower[1])) {
      return true;
    }
    if (tokens.some((tok) => isVerbLikeSpanish(tok))) {
      return true;
    }
    if (
      lower.some((t) => !SPANISH_FUNCTION_TOKENS.has(t) && !SPANISH_DEMONSTRATIVES.has(t) && !SPANISH_WH.has(t) && t.length >= 2)
    ) {
      return true;
    }
    if (lower.length === 1) {
      const t = lower[0];
      if (SPANISH_DEMONSTRATIVES.has(t) || SPANISH_FUNCTION_TOKENS.has(t) || SPANISH_WH.has(t)) {
        return false;
      }
      return isVerbLikeSpanish(tokens[0]);
    }
    return false;
  }

  if (lower.length >= 2 && RU_WH.has(lower[0]) && RU_DEMONSTRATIVES.has(lower[1])) {
    return true;
  }
  if (tokens.some((tok) => isVerbLikeRussian(tok))) {
    return true;
  }
  if (lower.some((t) => !RU_FUNCTION.has(t) && !RU_DEMONSTRATIVES.has(t) && !RU_WH.has(t) && t.length >= 2)) {
    return true;
  }
  if (lower.length === 1) {
    const t = lower[0];
    if (RU_DEMONSTRATIVES.has(t) || RU_FUNCTION.has(t) || RU_WH.has(t)) {
      return false;
    }
    return isVerbLikeRussian(tokens[0]);
  }
  return false;
}

/**
 * True when removing this chunk leaves enough structure to infer one answer
 * (subject / verb / phrase anchor, not e.g. "____ esto?").
 */
export function isFillInBlankContextValid(
  sentenceText: string,
  chunkText: string,
  language: LessonLanguage
): boolean {
  const bounds = findChunkBoundsInSentence(sentenceText, chunkText);
  if (!bounds) {
    return false;
  }
  const { start, end } = bounds;
  const before = sentenceText.slice(0, start);
  const after = sentenceText.slice(end);
  const beforeTokens = tokenizeContextWords(before);
  const afterTokens = tokenizeContextWords(after);
  const visible = [...beforeTokens, ...afterTokens];

  const totalLetters = letterCount(sentenceText);
  const removedLetters = letterCount(chunkText);
  if (totalLetters > 0 && removedLetters / totalLetters > 0.62) {
    return false;
  }

  if (visible.length === 0) {
    return false;
  }

  return remainderHasAnchor(visible, language);
}
