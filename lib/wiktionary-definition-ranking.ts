/**
 * Rank English (and shared) Wiktionary gloss candidates for My Words enrichment.
 */

export type DefinitionRankingInput = {
  word: string;
  language: string;
  partOfSpeech?: string;
};

/** Surface forms → tokens that indicate the everyday sense for concrete nouns. */
export const COMMON_CONCRETE_NOUN_HINTS: Readonly<Record<string, readonly string[]>> = {
  dog: ["domesticated", "mammal", "canine", "canis", "animal", "pet"],
  cat: ["domesticated", "mammal", "feline", "animal", "pet"],
  apple: ["fruit"],
  airport: ["aircraft", "passenger", "terminal"],
  bicycle: ["vehicle", "wheels", "pedal"],
};

const DEPRIORITIZE_MARKERS = [
  "mechanical device",
  "mechanical",
  "fastener",
  "clamp",
  "tool",
  "support",
  "slang",
  "derogatory",
  "pejorative",
  "obsolete",
  "archaic",
  "vulgar",
  "offensive",
  "rare",
  "dialectal",
  "historical",
  "synonym of",
  "form of",
  "abbreviation of",
];

const GENERAL_SENSE_MARKERS = [
  "animal",
  "mammal",
  "plant",
  "fruit",
  "food",
  "object",
  "person",
  "building",
  "vehicle",
  "device",
  "tool",
  "piece of",
  "type of",
  "species",
  "domesticated",
];

function normalizedWord(word: string): string {
  return word.normalize("NFC").trim().toLowerCase();
}

function concreteHintsForWord(word: string): readonly string[] | undefined {
  return COMMON_CONCRETE_NOUN_HINTS[normalizedWord(word)];
}

function definitionLooksFragment(value: string): boolean {
  const lower = value.toLowerCase();
  if (value.length < 18) {
    return true;
  }
  if (/^(o|u|y|e|de|del|la|el|los|las)\b/i.test(lower)) {
    return true;
  }
  const wordCount = lower.split(/\s+/).filter(Boolean).length;
  return wordCount < 4;
}

function definitionLooksTechnical(value: string): boolean {
  const lower = value.toLowerCase();
  return [
    "lingüística",
    "linguistics",
    "gramática",
    "grammar",
    "filosofía",
    "philosophy",
    "anatomía",
    "anatomy",
    "zoología",
    "zoology",
    "botánica",
    "botany",
    "química",
    "chemistry",
    "física",
    "physics",
    "matemática",
    "mathematics",
    "hipónimo de",
    "hyponym of",
    "obscene",
    "sexual",
    "coloquial",
    "colloquial",
    "despectivo",
  ].some((marker) => lower.includes(marker));
}

/**
 * Lower score is better. Used to pick the best gloss among cleaned candidates.
 */
export function rankDefinitionCandidate(definition: string, input: DefinitionRankingInput): number {
  const lower = definition.toLowerCase();
  let score = 0;

  if (definitionLooksFragment(definition)) {
    score += 200;
  }
  if (definitionLooksTechnical(definition)) {
    score += 80;
  }

  for (const marker of DEPRIORITIZE_MARKERS) {
    if (lower.includes(marker)) {
      score += marker === "support" && lower.includes("domesticated") ? 0 : 35;
    }
  }

  const hints = concreteHintsForWord(input.word);
  if (hints?.length) {
    const hintHits = hints.filter((hint) => lower.includes(hint.toLowerCase())).length;
    score -= hintHits * 45;
    if (hintHits === 0 && (lower.includes("mechanical") || lower.includes("device"))) {
      score += 90;
    }
  }

  for (const marker of GENERAL_SENSE_MARKERS) {
    if (lower.includes(marker)) {
      score -= 8;
    }
  }

  if (definition.length >= 24 && definition.length <= 220) {
    score -= 6;
  } else if (definition.length > 280) {
    score += 15;
  }

  const pos = (input.partOfSpeech ?? "").trim().toLowerCase();
  if (pos === "noun" && /\b(a|an|the)\s+[a-z]/i.test(definition)) {
    score -= 4;
  }

  return score;
}

export function pickBestRankedDefinition(
  definitions: string[],
  input: DefinitionRankingInput
): string {
  if (definitions.length === 0) {
    return "";
  }
  const scored = definitions
    .map((definition, index) => ({
      definition,
      index,
      rank: rankDefinitionCandidate(definition, input),
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index);
  return scored[0]?.definition ?? "";
}
