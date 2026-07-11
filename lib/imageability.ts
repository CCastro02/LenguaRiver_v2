/**
 * Classify whether a wild word can receive a meaningful image lookup and build visual search queries.
 */

import { foldSpanishAccents } from "@/lib/wild-word-curated-images";
import {
  buildSpanishCorpusLookupNeedles,
  stripLeadingSpanishArticles,
} from "@/lib/lesson-chunk-corpus-lookup";
import { isCommonConcreteNoun } from "@/lib/wikimedia-image";
import { shouldAcceptConceptIcon } from "@/lib/image-memory-quality";
import { lookupConceptWordImage } from "@/lib/wild-word-concept-images";

export type ImageabilityKind =
  | "concrete"
  | "action"
  | "concept"
  | "abstract"
  | "not-imageable";

export type ImageabilityConfidence = "high" | "medium" | "low";

export type ImageabilityInput = {
  text: string;
  language: string;
  translation?: string;
  definition?: string;
  explanation?: string;
  partOfSpeech?: string;
};

export type ProviderSearchQueries = {
  pexels?: string;
  pixabay?: string;
  wikimedia?: string;
};

export type ImageabilityResult = {
  imageability: ImageabilityKind;
  confidence: ImageabilityConfidence;
  searchQuery: string;
  providerSearchQueries: ProviderSearchQueries;
  reason: string;
};

const KNOWN_CONCRETE_NOUNS = new Set([
  "dog",
  "cat",
  "apple",
  "airport",
  "bicycle",
  "train",
  "passport",
  "office",
  "school",
  "coffee",
  "soup",
  "chicken",
  "table",
  "mesa",
  "menu",
  "cuenta",
  "agua",
  "arroz",
  "pollo",
  "pasaporte",
  "habitacion",
  "oficina",
  "escuela",
  "estacion",
  "cafe",
]);

const FUNCTION_WORD_BLOCKLIST = new Set([
  "perhaps",
  "maybe",
  "might",
  "would",
  "should",
  "could",
  "because",
  "although",
  "however",
  "therefore",
  "about",
  "almost",
  "always",
  "never",
  "often",
  "sometimes",
  "usually",
  "very",
  "really",
  "quite",
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "if",
  "when",
  "where",
  "who",
  "what",
  "how",
  "why",
]);

const NON_IMAGEABLE_POS = new Set([
  "adverb",
  "pronoun",
  "preposition",
  "conjunction",
  "determiner",
  "particle",
]);

const VERB_POS = new Set(["verb"]);

/** Visual search queries for business / learning concepts (provider-tuned). */
const CONCEPT_VISUAL_QUERIES: Readonly<Record<string, ProviderSearchQueries>> = {
  revenue: {
    pexels: "revenue growth coins chart",
    pixabay: "revenue growth coins chart",
    wikimedia: "revenue",
  },
  income: {
    pexels: "revenue growth coins chart",
    pixabay: "revenue growth coins chart",
  },
  earnings: {
    pexels: "revenue growth coins chart",
    pixabay: "revenue growth coins chart",
  },
  profit: {
    pexels: "business profit growth chart",
    pixabay: "business profit growth chart",
  },
  ingresos: {
    pexels: "revenue growth coins chart",
    pixabay: "revenue growth coins chart",
  },
  venture: {
    pexels: "startup rocket business venture",
    pixabay: "startup rocket business venture",
  },
  ventures: {
    pexels: "startup rocket business venture",
    pixabay: "startup rocket business venture",
  },
  company: {
    pexels: "office building business",
    pixabay: "office building business",
  },
  business: {
    pexels: "office building business",
    pixabay: "office building business",
  },
  empresa: {
    pexels: "office building business",
    pixabay: "office building business",
  },
  empresas: {
    pexels: "office building business",
    pixabay: "office building business",
  },
  investment: {
    pexels: "investment growth coins",
    pixabay: "investment growth coins",
  },
  inversion: {
    pexels: "investment growth coins",
    pixabay: "investment growth coins",
  },
  inversión: {
    pexels: "investment growth coins",
    pixabay: "investment growth coins",
  },
  market: {
    pexels: "stock market chart",
    pixabay: "stock market chart",
  },
  stock: {
    pexels: "stock market chart",
    pixabay: "stock market chart",
  },
  mercado: {
    pexels: "stock market chart",
    pixabay: "stock market chart",
  },
  bolsa: {
    pexels: "stock market chart",
    pixabay: "stock market chart",
  },
  learning: {
    pexels: "student studying books learning",
    pixabay: "student studying books learning",
  },
  learn: {
    pexels: "student studying books learning",
    pixabay: "student studying books learning",
  },
  aprendizaje: {
    pexels: "student studying books learning",
    pixabay: "student studying books learning",
  },
  aprender: {
    pexels: "student studying books learning",
    pixabay: "student studying books learning",
  },
  estudiar: {
    pexels: "student studying books",
    pixabay: "student studying books",
  },
  traducir: {
    pexels: "translation language text",
    pixabay: "translation language text",
  },
  knowledge: {
    pexels: "knowledge books library",
    pixabay: "knowledge books library",
  },
  conocimiento: {
    pexels: "knowledge books library",
    pixabay: "knowledge books library",
  },
  translation: {
    pexels: "translation language speech bubbles",
    pixabay: "translation language speech bubbles",
  },
  translate: {
    pexels: "translation language speech bubbles",
    pixabay: "translation language speech bubbles",
  },
  traduccion: {
    pexels: "translation language speech bubbles",
    pixabay: "translation language speech bubbles",
  },
  traducción: {
    pexels: "translation language speech bubbles",
    pixabay: "translation language speech bubbles",
  },
  language: {
    pexels: "language learning globe books",
    pixabay: "language learning globe books",
  },
  idioma: {
    pexels: "language learning globe books",
    pixabay: "language learning globe books",
  },
  lengua: {
    pexels: "language learning globe books",
    pixabay: "language learning globe books",
  },
  dictionary: {
    pexels: "dictionary books reference education",
    pixabay: "dictionary books reference education",
  },
  frequency: {
    pexels: "sound wave frequency signal",
    pixabay: "sound wave frequency signal",
  },
  frecuencia: {
    pexels: "sound wave frequency signal",
    pixabay: "sound wave frequency signal",
  },
  momento: {
    pexels: "clock watch time",
    pixabay: "clock watch time",
    wikimedia: "clock",
  },
  momentos: {
    pexels: "clock watch time",
    pixabay: "clock watch time",
  },
  moment: {
    pexels: "clock watch time moment",
    pixabay: "clock watch time moment",
  },
  time: {
    pexels: "clock watch time",
    pixabay: "clock watch time",
    wikimedia: "clock",
  },
  tiempo: {
    pexels: "clock time watch",
    pixabay: "clock time watch",
    wikimedia: "clock",
  },
  seguridad: {
    pexels: "security lock shield",
    pixabay: "security lock shield",
  },
  conferencia: {
    pexels: "conference meeting audience",
    pixabay: "conference meeting audience",
  },
  uncertainty: {
    pexels: "uncertainty question crossroads decision",
    pixabay: "uncertainty question crossroads decision",
  },
  expectation: {
    pexels: "expectation target goal planning",
    pixabay: "expectation target goal planning",
  },
  expects: {
    pexels: "expectation target goal planning",
    pixabay: "expectation target goal planning",
  },
  expect: {
    pexels: "expectation target goal planning",
    pixabay: "expectation target goal planning",
  },
  disclose: {
    pexels: "document reveal information",
    pixabay: "document reveal information",
  },
};

const CONCRETE_PROVIDER_QUERIES: Readonly<Record<string, ProviderSearchQueries>> = {
  dog: {
    wikimedia: "dog",
    pexels: "dog animal",
    pixabay: "dog animal",
  },
  cat: {
    wikimedia: "cat",
    pexels: "cat animal",
    pixabay: "cat animal",
  },
};

const LOW_CONFIDENCE_CONCEPT_TERMS = new Set(["frequency"]);

function lessonLanguageBase(languageTag: string): string {
  return languageTag.trim().toLowerCase().split(/[-_]/u)[0] ?? "";
}

function normalizeTerm(text: string, language: string): string {
  const trimmed = text.normalize("NFC").trim().replace(/\s+/gu, " ").toLowerCase();
  const base = lessonLanguageBase(language);
  if (base === "es") {
    const needles = buildSpanishCorpusLookupNeedles(trimmed);
    const stripped = stripLeadingSpanishArticles(trimmed);
    const single = needles.find((n) => n.length >= 2 && !n.includes(" "));
    return foldSpanishAccents(single ?? (stripped || trimmed));
  }
  return foldSpanishAccents(trimmed);
}

function primaryToken(normalized: string): string {
  return normalized.split(/\s+/u).filter(Boolean)[0] ?? "";
}

function isKnownConcrete(normalized: string): boolean {
  const token = primaryToken(normalized);
  if (KNOWN_CONCRETE_NOUNS.has(token)) {
    return true;
  }
  return isCommonConcreteNoun(token);
}

function buildConcreteQueries(normalized: string): ProviderSearchQueries {
  const token = primaryToken(normalized) || normalized;
  if (CONCRETE_PROVIDER_QUERIES[normalized]) {
    return { ...CONCRETE_PROVIDER_QUERIES[normalized] };
  }
  if (CONCRETE_PROVIDER_QUERIES[token]) {
    return { ...CONCRETE_PROVIDER_QUERIES[token] };
  }
  return {
    wikimedia: token,
    pexels: token,
    pixabay: token,
  };
}

function defaultSearchQueryFromProviderQueries(queries: ProviderSearchQueries): string {
  return (
    queries.wikimedia?.trim() ||
    queries.pexels?.trim() ||
    queries.pixabay?.trim() ||
    ""
  );
}

function resolveConceptQueries(normalized: string): ProviderSearchQueries | undefined {
  if (CONCEPT_VISUAL_QUERIES[normalized]) {
    return { ...CONCEPT_VISUAL_QUERIES[normalized] };
  }
  const token = primaryToken(normalized);
  return token && CONCEPT_VISUAL_QUERIES[token]
    ? { ...CONCEPT_VISUAL_QUERIES[token] }
    : undefined;
}

/** Provider-specific visual search query (falls back to `searchQuery`). */
export function getProviderSearchQuery(
  classification: ImageabilityResult,
  provider: keyof ProviderSearchQueries
): string {
  const specific = classification.providerSearchQueries[provider]?.trim();
  if (specific) {
    return specific;
  }
  return classification.searchQuery.trim();
}

/** Whether a bundled concept icon may apply after external providers fail. */
export function allowsConceptIconFallback(input: ImageabilityInput): boolean {
  const normalized = normalizeTerm(input.text, input.language);
  if (!normalized) {
    return false;
  }
  const conceptHit = lookupConceptWordImage({
    language: input.language,
    text: input.text,
    partOfSpeech: input.partOfSpeech,
    definition: input.definition,
    translation: input.translation,
  });
  if (!conceptHit) {
    return false;
  }
  if (isKnownConcrete(normalized)) {
    return false;
  }
  return shouldAcceptConceptIcon({
    text: input.text,
    language: input.language,
    translation: input.translation,
    definition: input.definition,
    explanation: input.explanation,
    partOfSpeech: input.partOfSpeech,
    imageUrl: conceptHit.imageUrl,
    imageSource: conceptHit.imageSource,
    imageAlt: conceptHit.imageAlt,
  });
}

/** Concept icon confidence for explicit map entries (used when persisting concept fallback). */
export function conceptIconConfidence(input: ImageabilityInput): ImageabilityConfidence {
  const normalized = normalizeTerm(input.text, input.language);
  if (LOW_CONFIDENCE_CONCEPT_TERMS.has(normalized)) {
    return "low";
  }
  const conceptHit = lookupConceptWordImage({
    language: input.language,
    text: input.text,
    partOfSpeech: input.partOfSpeech,
    definition: input.definition,
    translation: input.translation,
  });
  if (!conceptHit) {
    return "medium";
  }
  if (
    !shouldAcceptConceptIcon({
      text: input.text,
      language: input.language,
      translation: input.translation,
      definition: input.definition,
      explanation: input.explanation,
      partOfSpeech: input.partOfSpeech,
      imageUrl: conceptHit.imageUrl,
      imageSource: conceptHit.imageSource,
      imageAlt: conceptHit.imageAlt,
    })
  ) {
    return "low";
  }
  return "high";
}

/**
 * Classify image lookup suitability and build a visual search query for Pexels.
 */
export function classifyImageability(input: ImageabilityInput): ImageabilityResult {
  const trimmed = input.text.trim();
  if (!trimmed || trimmed.length < 2) {
    return {
      imageability: "not-imageable",
      confidence: "high",
      searchQuery: "",
      providerSearchQueries: {},
      reason: "Term too short for image lookup.",
    };
  }

  const normalized = normalizeTerm(trimmed, input.language);
  const token = primaryToken(normalized);
  const pos = (input.partOfSpeech ?? "").trim().toLowerCase();

  if (!normalized) {
    return {
      imageability: "not-imageable",
      confidence: "high",
      searchQuery: "",
      providerSearchQueries: {},
      reason: "Empty normalized term.",
    };
  }

  if (FUNCTION_WORD_BLOCKLIST.has(normalized) || FUNCTION_WORD_BLOCKLIST.has(token)) {
    return {
      imageability: "abstract",
      confidence: "high",
      searchQuery: "",
      providerSearchQueries: {},
      reason: "Function word — skip external image search.",
    };
  }

  if (pos && NON_IMAGEABLE_POS.has(pos)) {
    return {
      imageability: "abstract",
      confidence: "high",
      searchQuery: "",
      providerSearchQueries: {},
      reason: `Part of speech "${pos}" is not imageable.`,
    };
  }

  if (isKnownConcrete(normalized)) {
    const providerSearchQueries = buildConcreteQueries(normalized);
    return {
      imageability: "concrete",
      confidence: "high",
      searchQuery: defaultSearchQueryFromProviderQueries(providerSearchQueries),
      providerSearchQueries,
      reason: "Concrete noun with clear visual referent.",
    };
  }

  const conceptQueries = resolveConceptQueries(normalized);
  if (conceptQueries) {
    const conf: ImageabilityConfidence = LOW_CONFIDENCE_CONCEPT_TERMS.has(normalized)
      ? "low"
      : "medium";
    return {
      imageability: "concept",
      confidence: conf,
      searchQuery: defaultSearchQueryFromProviderQueries(conceptQueries),
      providerSearchQueries: conceptQueries,
      reason: "Business or learning concept — visual search query.",
    };
  }

  if (pos && VERB_POS.has(pos)) {
    return {
      imageability: "abstract",
      confidence: "low",
      searchQuery: "",
      providerSearchQueries: {},
      reason: "Verb without explicit visual mapping.",
    };
  }

  if (lookupConceptWordImage({ language: input.language, text: input.text })) {
    const fallbackQuery = token ? `${token} visual symbol` : "";
    return {
      imageability: "concept",
      confidence: "medium",
      searchQuery: fallbackQuery,
      providerSearchQueries: fallbackQuery
        ? {
            pexels: fallbackQuery,
            pixabay: fallbackQuery,
          }
        : {},
      reason: "Explicit concept map without dedicated visual query.",
    };
  }

  if (!input.definition?.trim() && !input.translation?.trim() && trimmed.split(/\s+/u).length === 1) {
    return {
      imageability: "abstract",
      confidence: "low",
      searchQuery: "",
      providerSearchQueries: {},
      reason: "Ambiguous single word without definition context.",
    };
  }

  return {
    imageability: "abstract",
    confidence: "low",
    searchQuery: "",
    providerSearchQueries: {},
    reason: "No strong visual category — skip external search.",
  };
}

/** Whether external image-search (Wikimedia / Pexels) should run. */
export function isExternalImageSearchAllowed(classification: ImageabilityResult): boolean {
  if (classification.imageability === "not-imageable") {
    return false;
  }
  if (classification.imageability === "abstract" && classification.confidence === "high") {
    return false;
  }
  if (!classification.searchQuery.trim() && classification.imageability !== "concrete") {
    return false;
  }
  return true;
}
