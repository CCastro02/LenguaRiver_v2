/**
 * Shared relevance gate for licensed image provider results (Pexels, Pixabay).
 */

import type { ImageConfidence } from "@/lib/image-providers/types";

export type RelevanceInput = {
  queryTerms: string[];
  word: string;
  translation?: string;
  definition?: string;
  explanation?: string;
  alt?: string;
  tags?: string[];
  title?: string;
};

export type RelevanceResult = {
  accepted: boolean;
  confidence: ImageConfidence;
  reason: string;
};

/** Generic provider/stock terms — never count as query hits. */
export const RELEVANCE_META_TERMS = new Set([
  "illustration",
  "photo",
  "image",
  "picture",
  "background",
  "decorative",
  "design",
  "art",
  "concept",
  "abstract",
]);

const PEOPLE_HEAVY =
  /\b(portrait|headshot|model|fashion|wedding|bride|groom|selfie|face|smiling person|man in suit|woman in)\b/i;

const PEOPLE_ALLOWED_QUERY =
  /\b(student|students|learning|classroom|teacher|education|team meeting|office worker|studying|study|conference|meeting|audience)\b/i;

const UNRELATED_DOMINANT =
  /\b(sunset|sunrise|beach|ocean|waves|mountain|landscape|forest|flowers|sky|clouds|nature scenery)\b/i;

const BUSINESS_QUERY =
  /\b(revenue|income|profit|earnings|investment|market|stock|business|venture|startup|finance|chart|coins|money|growth|ingresos)\b/i;

const BUSINESS_SIGNAL =
  /\b(revenue|income|profit|finance|chart|coins|money|growth|startup|business|stock|market|investment|venture)\b/i;

const LEARNING_QUERY = /\b(learning|learn|student|studying|study|education|books|classroom|aprendizaje|aprender)\b/i;

const LEARNING_SIGNAL =
  /\b(student|students|studying|study|books|book|education|classroom|learning|school)\b/i;

const LAPTOP_ONLY = /\b(laptop|computer|keyboard|monitor|desk setup)\b/i;

const KNOWLEDGE_QUERY = /\b(knowledge|conocimiento|library|books|education)\b/i;

const KNOWLEDGE_SIGNAL =
  /\b(knowledge|books|book|library|education|learning|study|encyclopedia|student)\b/i;

const LIGHTBULB_ONLY = /\b(lightbulb|light bulb|idea bulb)\b/i;

const TRANSLATION_QUERY =
  /\b(translation|translate|language|idioma|lengua|speech|traduccion|traducción)\b/i;

const TRANSLATION_SIGNAL =
  /\b(translation|translate|language|languages|bilingual|text|dictionary|speech bubble|speech bubbles|words)\b/i;

const GENERIC_SPEECH_PERSON = /\b(person talking|people talking|conversation portrait)\b/i;

const TIME_QUERY =
  /\b(momento|momentos|moment|time|tiempo|clock|watch|hour|minute|calendar|timer)\b/i;

const TIME_STRONG =
  /\b(clock|watch|time|calendar|hour|minute|timer|stopwatch)\b/i;

const TIME_NEGATIVE =
  /\b(gift|gifts|box|boxes|rug|rugs|decorative|present|presents|wedding|ribbon|packaging|package)\b/i;

const SECURITY_QUERY = /\b(security|seguridad|lock|shield|safe)\b/i;

const SECURITY_SIGNAL = /\b(security|lock|shield|safe|padlock|protection)\b/i;

const FREQUENCY_QUERY = /\b(frequency|frecuencia|signal|wave)\b/i;

const FREQUENCY_SIGNAL = /\b(frequency|signal|wave|soundwave|oscilloscope|spectrum)\b/i;

export function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/u)
    .filter((t) => t.length >= 2);
}

/** Drop stock/meta tokens before scoring query overlap. */
export function filterRelevanceQueryTerms(terms: string[]): string[] {
  return terms.filter((t) => !RELEVANCE_META_TERMS.has(t.toLowerCase()));
}

function normalizedWord(word: string): string {
  return word.trim().toLowerCase();
}

/** Alt, tags, and title only — used for domain gates (not learner gloss). */
function providerMetadataText(input: RelevanceInput): string {
  const parts = [input.alt ?? "", input.title ?? "", (input.tags ?? []).join(" ")];
  return parts.join(" ").toLowerCase();
}

function combinedText(input: RelevanceInput): string {
  const parts = [
    providerMetadataText(input),
    input.translation ?? "",
    input.definition ?? "",
    input.explanation ?? "",
  ];
  return parts.join(" ").toLowerCase();
}

function queryJoin(input: RelevanceInput): string {
  return input.queryTerms.join(" ").toLowerCase();
}

function countQueryHits(queryTerms: string[], haystack: string): number {
  const meaningfulTerms = filterRelevanceQueryTerms(queryTerms);
  if (meaningfulTerms.length === 0) {
    return 0;
  }
  const tokens = new Set(tokenize(haystack));
  let hits = 0;
  for (const q of meaningfulTerms) {
    if (tokens.has(q)) {
      hits += 1;
      continue;
    }
    for (const t of tokens) {
      if (t.startsWith(q) || q.startsWith(t)) {
        hits += 0.5;
        break;
      }
    }
  }
  return hits;
}

function hasPeopleHeavySignals(text: string, query: string): boolean {
  if (PEOPLE_ALLOWED_QUERY.test(query)) {
    return false;
  }
  return PEOPLE_HEAVY.test(text);
}

function domainRejectReason(
  metadataText: string,
  fullText: string,
  query: string,
  word: string
): string | null {
  const w = normalizedWord(word);

  if (TIME_QUERY.test(query) || w === "momento" || w === "momentos" || w === "moment" || w === "time" || w === "tiempo") {
    if (TIME_NEGATIVE.test(metadataText) && !TIME_STRONG.test(metadataText)) {
      return "Time/moment query matched unrelated gift/decorative image without clock/time signals.";
    }
    if (!TIME_STRONG.test(metadataText)) {
      return "Time/moment query requires clock, watch, time, or calendar in alt/tags.";
    }
  }

  if (
    UNRELATED_DOMINANT.test(metadataText) &&
    !BUSINESS_SIGNAL.test(metadataText) &&
    BUSINESS_QUERY.test(query)
  ) {
    return "Unrelated scenic tags dominate over business/finance query.";
  }
  if (BUSINESS_QUERY.test(query) && !BUSINESS_SIGNAL.test(metadataText)) {
    if (
      /\b(gift|gifts|present|presents|decorative|ribbon|wedding|box|boxes)\b/i.test(metadataText) &&
      !BUSINESS_SIGNAL.test(metadataText)
    ) {
      return "Business query matched gift/decorative image without finance signals.";
    }
    if (
      /\b(building|office|person|people|portrait)\b/i.test(metadataText) &&
      !BUSINESS_SIGNAL.test(metadataText)
    ) {
      return "Business term matched generic building/person without finance signals.";
    }
    if (UNRELATED_DOMINANT.test(metadataText)) {
      return "Business query matched scenic/landscape image without finance signals.";
    }
  }
  if (LEARNING_QUERY.test(query)) {
    if (LAPTOP_ONLY.test(metadataText) && !LEARNING_SIGNAL.test(metadataText)) {
      return "Learning query matched generic laptop-only image without study/education tags.";
    }
    if (!LEARNING_SIGNAL.test(metadataText)) {
      return "Learning query requires student, study, books, or education in alt/tags.";
    }
  }
  if (KNOWLEDGE_QUERY.test(query)) {
    if (LIGHTBULB_ONLY.test(metadataText) && !KNOWLEDGE_SIGNAL.test(metadataText)) {
      return "Knowledge query matched lightbulb-only image without books/library/education.";
    }
    if (!KNOWLEDGE_SIGNAL.test(metadataText)) {
      return "Knowledge query requires books, library, student, or education in alt/tags.";
    }
  }
  if (TRANSLATION_QUERY.test(query)) {
    if (GENERIC_SPEECH_PERSON.test(metadataText) && !TRANSLATION_SIGNAL.test(metadataText)) {
      return "Translation query matched generic person/speech without language/translation terms.";
    }
    if (!TRANSLATION_SIGNAL.test(metadataText)) {
      return "Translation query requires language, text, translation, or dictionary in alt/tags.";
    }
  }
  if (SECURITY_QUERY.test(query) && !SECURITY_SIGNAL.test(metadataText)) {
    return "Security query requires lock, shield, or security in alt/tags.";
  }
  if (FREQUENCY_QUERY.test(query) && !FREQUENCY_SIGNAL.test(metadataText)) {
    return "Frequency query requires wave, signal, or frequency in alt/tags.";
  }
  if (w && !PEOPLE_ALLOWED_QUERY.test(query) && hasPeopleHeavySignals(fullText, query)) {
    return "People-heavy image for non-human concept.";
  }
  return null;
}

/**
 * Score provider metadata against the visual search query and word context.
 */
export function assessImageRelevance(input: RelevanceInput): RelevanceResult {
  const queryTerms = filterRelevanceQueryTerms(input.queryTerms.filter(Boolean));
  const query = queryJoin({ ...input, queryTerms });
  const metadataText = providerMetadataText(input);
  const text = combinedText(input);
  const word = normalizedWord(input.word);

  if (queryTerms.length === 0) {
    return { accepted: false, confidence: "low", reason: "Empty search query." };
  }

  const reject = domainRejectReason(metadataText, text, query, word);
  if (reject) {
    return { accepted: false, confidence: "low", reason: reject };
  }

  const haystack = `${text} ${query}`;
  const hits = countQueryHits(queryTerms, haystack);
  const ratio = hits / queryTerms.length;

  const wordInText =
    word.length >= 3 &&
    new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);

  if (wordInText || ratio >= 0.5) {
    return {
      accepted: true,
      confidence: wordInText || ratio >= 0.65 ? "high" : "medium",
      reason: wordInText
        ? "Exact word or strong concept terms in alt/tags."
        : "Several query terms match alt/tags.",
    };
  }

  if (ratio >= 0.28) {
    return {
      accepted: true,
      confidence: "medium",
      reason: "Partial query term overlap in alt/tags.",
    };
  }

  if (ratio >= 0.12) {
    return {
      accepted: false,
      confidence: "low",
      reason: "Weak relevance — insufficient query term overlap.",
    };
  }

  return {
    accepted: false,
    confidence: "low",
    reason: "Unrelated tags/alt dominate over search query.",
  };
}
