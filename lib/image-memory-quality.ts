/**
 * Gate whether a wild-word image helps memory encoding (vs vague/misleading icons).
 */

import { foldSpanishAccents } from "@/lib/wild-word-curated-images";
import {
  buildSpanishCorpusLookupNeedles,
  stripLeadingSpanishArticles,
} from "@/lib/lesson-chunk-corpus-lookup";
import { isCommonConcreteNoun } from "@/lib/wikimedia-image";

export type ImageMemoryQualityInput = {
  text: string;
  language: string;
  translation?: string;
  definition?: string;
  explanation?: string;
  partOfSpeech?: string;
  imageUrl?: string;
  imageSource?: string;
  imageProvider?: string;
  imageAlt?: string;
  imageSearchQuery?: string;
  imageReason?: string;
};

export type ImageMemoryQualityResult = {
  accepted: boolean;
  score: "high" | "medium" | "low";
  reason: string;
};

const KNOWN_CONCRETE = new Set([
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

/** Weak abstract/function words — never use bundled concept icons. */
const CONCEPT_ICON_REJECT = new Set([
  "perhaps",
  "maybe",
  "might",
  "expects",
  "expect",
  "expected",
  "expecting",
  "espera",
  "esperar",
  "quizas",
  "quizás",
  "disclose",
  "discloses",
  "disclosing",
  "divulgar",
  "reveal",
  "revelar",
  "opportunity",
  "oportunidad",
]);

/** Strong bundled concept icons (mnemonic enough for fallback). */
const CONCEPT_ICON_ACCEPT = new Set([
  "frequency",
  "frecuencia",
  "revenue",
  "income",
  "earnings",
  "profit",
  "ingresos",
  "venture",
  "ventures",
  "company",
  "business",
  "empresa",
  "empresas",
  "investment",
  "inversion",
  "inversión",
  "market",
  "stock",
  "mercado",
  "bolsa",
  "translation",
  "translate",
  "traduccion",
  "traducción",
  "traducir",
  "language",
  "idioma",
  "lengua",
  "dictionary",
  "definicion",
  "definición",
  "definition",
  "diccionario",
  "knowledge",
  "conocimiento",
]);

/** Prefer licensed photos; bundled learning icon is weak for these. */
const CONCEPT_LEARNING_REJECT = new Set([
  "aprender",
  "learn",
  "estudiar",
  "study",
]);

const STRONG_VISUAL_CONCEPT = new Set([
  ...CONCEPT_ICON_ACCEPT,
  "learning",
  "aprendizaje",
  "security",
  "seguridad",
  "conference",
  "conferencia",
]);

const AMBIGUOUS_TIME = new Set(["time", "tiempo", "momento", "momentos", "moment"]);

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
  return KNOWN_CONCRETE.has(token) || isCommonConcreteNoun(token);
}

function conceptIconPathFromUrl(imageUrl: string | undefined): string {
  const url = (imageUrl ?? "").trim().toLowerCase();
  const match = url.match(/\/images\/concepts\/([^./]+)\./u);
  return match?.[1] ?? "";
}

function queryMatchesStrongVisual(query: string, normalized: string): boolean {
  const q = query.toLowerCase();
  if (/\b(student|studying|study|books|classroom|education|learning)\b/u.test(q)) {
    return CONCEPT_LEARNING_REJECT.has(normalized) || normalized === "learning" || normalized === "aprendizaje";
  }
  if (/\b(revenue|income|profit|chart|coins|finance|growth)\b/u.test(q)) {
    return ["revenue", "income", "earnings", "profit", "ingresos"].includes(normalized);
  }
  if (/\b(translation|language|speech|bilingual|traduccion|traducción)\b/u.test(q)) {
    return ["translation", "translate", "traduccion", "traducción", "traducir", "language", "idioma", "lengua"].includes(
      normalized
    );
  }
  if (/\b(frequency|wave|signal|sound)\b/u.test(q)) {
    return normalized === "frequency" || normalized === "frecuencia";
  }
  if (/\b(conference|meeting|audience)\b/u.test(q)) {
    return normalized === "conference" || normalized === "conferencia";
  }
  if (/\b(security|lock|shield)\b/u.test(q)) {
    return normalized === "security" || normalized === "seguridad";
  }
  return false;
}

function evaluateConceptIcon(input: ImageMemoryQualityInput, normalized: string): ImageMemoryQualityResult {
  const token = primaryToken(normalized);
  const term = normalized || token;

  if (CONCEPT_ICON_REJECT.has(term) || CONCEPT_ICON_REJECT.has(token)) {
    return {
      accepted: false,
      score: "low",
      reason: "Weak abstract/function word — vague concept icon does not aid recall.",
    };
  }

  if (CONCEPT_LEARNING_REJECT.has(term) || CONCEPT_LEARNING_REJECT.has(token)) {
    return {
      accepted: false,
      score: "low",
      reason: "Learning verb — prefer studying/books photo over generic learning icon.",
    };
  }

  const iconSlug = conceptIconPathFromUrl(input.imageUrl);

  if (iconSlug === "uncertainty" || iconSlug === "expectation" || iconSlug === "disclose") {
    return {
      accepted: false,
      score: "low",
      reason: `Bundled "${iconSlug}" icon is too abstract for this word.`,
    };
  }

  if (iconSlug === "learning" && (term === "aprender" || token === "aprender")) {
    return {
      accepted: false,
      score: "low",
      reason: "Bundled learning icon is weak for Spanish infinitive aprender.",
    };
  }

  if (CONCEPT_ICON_ACCEPT.has(term) || CONCEPT_ICON_ACCEPT.has(token)) {
    return {
      accepted: true,
      score: iconSlug === "frequency" ? "medium" : "high",
      reason: "Strong mnemonic concept icon for this term.",
    };
  }

  if (term === "learning" || term === "aprendizaje") {
    if (iconSlug === "learning") {
      return {
        accepted: true,
        score: "medium",
        reason: "Learning noun — books/study concept icon is acceptable fallback.",
      };
    }
    return {
      accepted: false,
      score: "low",
      reason: "Learning term without a clear study/books visual.",
    };
  }

  if (AMBIGUOUS_TIME.has(term) || AMBIGUOUS_TIME.has(token)) {
    return {
      accepted: false,
      score: "low",
      reason: "Ambiguous time word — clock icon may mislead.",
    };
  }

  return {
    accepted: false,
    score: "low",
    reason: "Concept icon not on high-confidence mnemonic allowlist.",
  };
}

function evaluateExternalImage(
  input: ImageMemoryQualityInput,
  normalized: string
): ImageMemoryQualityResult {
  const query = (input.imageSearchQuery ?? "").trim();
  const alt = (input.imageAlt ?? "").trim();

  if (query && queryMatchesStrongVisual(query, normalized)) {
    return {
      accepted: true,
      score: "high",
      reason: "External image query strongly matches visual concept.",
    };
  }

  if (isKnownConcrete(normalized)) {
    return {
      accepted: true,
      score: "high",
      reason: "Concrete noun — photo aids recall.",
    };
  }

  if (STRONG_VISUAL_CONCEPT.has(normalized) || STRONG_VISUAL_CONCEPT.has(primaryToken(normalized))) {
    if (query || alt) {
      const combined = `${query} ${alt}`.toLowerCase();
      if (queryMatchesStrongVisual(combined, normalized) || combined.includes(normalized)) {
        return {
          accepted: true,
          score: "high",
          reason: "Licensed image metadata aligns with visual concept.",
        };
      }
    }
    return {
      accepted: false,
      score: "low",
      reason: "Visual concept term but weak provider match.",
    };
  }

  if (CONCEPT_ICON_REJECT.has(normalized) || CONCEPT_ICON_REJECT.has(primaryToken(normalized))) {
    return {
      accepted: false,
      score: "low",
      reason: "Abstract/function word — external image unlikely to help.",
    };
  }

  if (input.imageProvider && (query || alt)) {
    return {
      accepted: true,
      score: "medium",
      reason: "Licensed provider image with search metadata.",
    };
  }

  return {
    accepted: false,
    score: "low",
    reason: "No strong visual alignment for memory encoding.",
  };
}

/**
 * Whether an image (concept, curated, or licensed) should be shown on the card.
 */
export function evaluateImageMemoryQuality(input: ImageMemoryQualityInput): ImageMemoryQualityResult {
  const trimmed = input.text.trim();
  if (!trimmed) {
    return { accepted: false, score: "low", reason: "Empty term." };
  }

  const normalized = normalizeTerm(trimmed, input.language);
  const source = (input.imageSource ?? "").trim().toLowerCase();

  if (source === "user") {
    return { accepted: true, score: "high", reason: "User-chosen image." };
  }

  if (!source && !input.imageAlt) {
    return { accepted: false, score: "low", reason: "No image." };
  }

  if (isKnownConcrete(normalized)) {
    return {
      accepted: true,
      score: "high",
      reason: "Concrete noun — image supports recall.",
    };
  }

  if (source === "concept" || source === "curated") {
    return evaluateConceptIcon(input, normalized);
  }

  if (source === "lesson") {
    return {
      accepted: true,
      score: "high",
      reason: "Lesson corpus image.",
    };
  }

  if (source === "wikimedia" || source === "pexels" || source === "pixabay") {
    return evaluateExternalImage(input, normalized);
  }

  return evaluateExternalImage(input, normalized);
}

/** Shorthand for gating bundled concept icon application during enrichment. */
export function shouldAcceptConceptIcon(input: ImageMemoryQualityInput): boolean {
  const conceptResult = evaluateImageMemoryQuality({
    ...input,
    imageSource: "concept",
  });
  return conceptResult.accepted;
}
