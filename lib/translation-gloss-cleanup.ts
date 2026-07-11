/**
 * Post-process Argos glosses for Spanish infinitives → English "to ___" forms.
 */

export type TranslationGlossCleanupInput = {
  sourceText: string;
  sourceLang: string;
  targetLang: string;
  translation: string;
  partOfSpeech?: string;
};

const SPANISH_INFINITIVE_RE = /(?:ar|er|ir)$/u;

/** Gerund/noun gloss → infinitive English (conservative map). */
const GERUND_GLOSS_TO_INFINITIVE: Readonly<Record<string, string>> = {
  learning: "to learn",
  studying: "to study",
  translating: "to translate",
  translation: "to translate",
  eating: "to eat",
  speaking: "to speak",
  talking: "to speak",
  drinking: "to drink",
  writing: "to write",
  reading: "to read",
  working: "to work",
  living: "to live",
  running: "to run",
  walking: "to walk",
  sleeping: "to sleep",
};

function normalizeLang(tag: string): string {
  return tag.trim().toLowerCase().split(/[-_]/u)[0] ?? "";
}

function normalizeGloss(gloss: string): string {
  return gloss.trim().replace(/\s+/gu, " ");
}

function glossKey(gloss: string): string {
  return gloss.toLowerCase().replace(/^to\s+/u, "");
}

/**
 * Fix stale Argos glosses like aprender → "Learning" to "to learn".
 * Conservative: only es→en, Spanish -ar/-er/-ir, known gerund/noun mappings or verb POS.
 */
export function cleanupTranslationGloss(input: TranslationGlossCleanupInput): string {
  const sourceLang = normalizeLang(input.sourceLang);
  const targetLang = normalizeLang(input.targetLang);
  if (sourceLang !== "es" || targetLang !== "en") {
    return input.translation;
  }

  const source = input.sourceText.trim().toLowerCase();
  const gloss = normalizeGloss(input.translation);
  if (!source || !gloss) {
    return input.translation;
  }

  if (!SPANISH_INFINITIVE_RE.test(source)) {
    return input.translation;
  }

  if (/^to\s+\w+/iu.test(gloss)) {
    return gloss;
  }

  const pos = (input.partOfSpeech ?? "").trim().toLowerCase();
  const key = glossKey(gloss);
  const mapped = GERUND_GLOSS_TO_INFINITIVE[key];
  if (!mapped) {
    return input.translation;
  }

  if (pos === "verb") {
    return mapped;
  }

  if (/^[A-Z]/.test(gloss)) {
    return mapped;
  }

  return input.translation;
}

/** Whether stored translation should be re-cleaned on refresh (safe, idempotent). */
export function translationGlossNeedsCleanup(input: TranslationGlossCleanupInput): boolean {
  const cleaned = cleanupTranslationGloss(input);
  return normalizeGloss(cleaned) !== normalizeGloss(input.translation);
}
