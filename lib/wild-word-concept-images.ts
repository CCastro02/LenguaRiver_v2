/**
 * Phase 3 local concept icons for abstract / business / learning terms.
 * Bundled assets only — no remote URLs.
 */

import {
  buildSpanishCorpusLookupNeedles,
  stripLeadingSpanishArticles,
} from "@/lib/lesson-chunk-corpus-lookup";
import { foldSpanishAccents } from "@/lib/wild-word-curated-images";

export type ConceptWordImageInput = {
  language: string;
  text: string;
  lexemeKey?: string;
  partOfSpeech?: string;
  definition?: string;
  translation?: string;
};

export type ConceptWordImageResult = {
  imageUrl: string;
  imageSource: "concept";
  imageAlt: string;
};

type ConceptAssetEntry = {
  imageUrl: string;
  imageAlt: string;
  phrases: string[];
};

const CONCEPT_BASE = "/images/concepts";

const CONCEPT_ASSETS: ConceptAssetEntry[] = [
  {
    imageUrl: `${CONCEPT_BASE}/revenue.png`,
    imageAlt: "Revenue",
    phrases: ["revenue", "income", "earnings", "profit", "ingresos"],
  },
  {
    imageUrl: `${CONCEPT_BASE}/venture.png`,
    imageAlt: "Venture",
    phrases: ["venture", "ventures"],
  },
  {
    imageUrl: `${CONCEPT_BASE}/company.png`,
    imageAlt: "Company",
    phrases: ["company", "business", "empresa", "empresas"],
  },
  {
    imageUrl: `${CONCEPT_BASE}/investment.png`,
    imageAlt: "Investment",
    phrases: ["investment", "inversion", "inversión"],
  },
  {
    imageUrl: `${CONCEPT_BASE}/market.png`,
    imageAlt: "Market",
    phrases: ["market", "stock", "mercado", "bolsa"],
  },
  {
    imageUrl: `${CONCEPT_BASE}/learning.png`,
    imageAlt: "Learning",
    phrases: ["learning", "aprendizaje"],
  },
  {
    imageUrl: `${CONCEPT_BASE}/translation.png`,
    imageAlt: "Translation",
    phrases: ["translation", "translate", "traduccion", "traducción"],
  },
  {
    imageUrl: `${CONCEPT_BASE}/language.png`,
    imageAlt: "Language",
    phrases: ["language", "idioma", "lengua"],
  },
  {
    imageUrl: `${CONCEPT_BASE}/knowledge.png`,
    imageAlt: "Knowledge",
    phrases: ["knowledge", "conocimiento"],
  },
  {
    imageUrl: `${CONCEPT_BASE}/dictionary.png`,
    imageAlt: "Dictionary",
    phrases: ["definition", "definicion", "definición", "dictionary", "diccionario"],
  },
  {
    imageUrl: `${CONCEPT_BASE}/frequency.png`,
    imageAlt: "Frequency",
    phrases: ["frequency", "frecuencia"],
  },
];

const CONCEPT_LOOKUP = new Map<string, ConceptWordImageResult>();

for (const asset of CONCEPT_ASSETS) {
  const result: ConceptWordImageResult = {
    imageUrl: asset.imageUrl,
    imageSource: "concept",
    imageAlt: asset.imageAlt,
  };
  for (const phrase of asset.phrases) {
    const key = normalizeConceptLookupKey(phrase);
    if (key && !CONCEPT_LOOKUP.has(key)) {
      CONCEPT_LOOKUP.set(key, result);
    }
    for (const needle of buildSpanishCorpusLookupNeedles(phrase)) {
      const needleKey = normalizeConceptLookupKey(needle);
      if (needleKey && !CONCEPT_LOOKUP.has(needleKey)) {
        CONCEPT_LOOKUP.set(needleKey, result);
      }
    }
  }
}

/** All bundled concept image paths (for verification scripts). */
export function listConceptImageUrls(): string[] {
  return CONCEPT_ASSETS.map((a) => a.imageUrl);
}

function lessonLanguageBase(languageTag: string): string {
  return languageTag.trim().toLowerCase().split(/[-_]/u)[0] ?? "";
}

const SUPPORTED_CONCEPT_LANGUAGES = new Set(["en", "es"]);

function normalizeConceptLookupKey(phrase: string): string {
  const lowered = phrase.normalize("NFC").trim().toLowerCase().replace(/\s+/gu, " ");
  const stripped = stripLeadingSpanishArticles(lowered);
  return foldSpanishAccents(stripped);
}

function surfaceFromLexemeKey(lexemeKey: string | undefined): string | undefined {
  if (!lexemeKey?.trim()) {
    return undefined;
  }
  const parts = lexemeKey.split("|");
  const tail = parts[parts.length - 1]?.trim();
  return tail || undefined;
}

function englishLemmaVariants(surface: string): string[] {
  const lower = surface.trim().toLowerCase();
  const variants = new Set<string>([lower]);
  if (lower.endsWith("ies") && lower.length > 4) {
    variants.add(`${lower.slice(0, -3)}y`);
  } else if (lower.endsWith("s") && lower.length > 2 && !lower.endsWith("ss")) {
    variants.add(lower.slice(0, -1));
  }
  return [...variants];
}

function buildConceptLookupNeedles(input: ConceptWordImageInput): string[] {
  const surfaces = new Set<string>();
  const trimmed = input.text.trim();
  if (trimmed) {
    surfaces.add(trimmed);
    for (const variant of englishLemmaVariants(trimmed)) {
      surfaces.add(variant);
    }
  }
  const fromLexeme = surfaceFromLexemeKey(input.lexemeKey);
  if (fromLexeme) {
    surfaces.add(fromLexeme);
    for (const variant of englishLemmaVariants(fromLexeme)) {
      surfaces.add(variant);
    }
  }

  const needles = new Set<string>();
  for (const surface of surfaces) {
    for (const needle of buildSpanishCorpusLookupNeedles(surface)) {
      needles.add(normalizeConceptLookupKey(needle));
    }
  }
  return [...needles].filter(Boolean);
}

/**
 * Resolve a bundled concept icon for abstract / business / learning wild words.
 * Returns null for concrete nouns (e.g. dog) so Wikimedia or curated concrete paths apply.
 */
export function lookupConceptWordImage(input: ConceptWordImageInput): ConceptWordImageResult | null {
  if (!SUPPORTED_CONCEPT_LANGUAGES.has(lessonLanguageBase(input.language))) {
    return null;
  }

  for (const key of buildConceptLookupNeedles(input)) {
    const hit = CONCEPT_LOOKUP.get(key);
    if (hit) {
      return hit;
    }
  }
  return null;
}
