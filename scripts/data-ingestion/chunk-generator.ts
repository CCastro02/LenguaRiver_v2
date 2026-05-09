import type { NormalizedVocabularyEntry } from "./types";

export type GeneratedChunkCategory = "general" | "places";
export type GeneratedChunkRepetitionPriority = "high" | "medium" | "low";

export type GeneratedChunk = {
  language: NormalizedVocabularyEntry["language"];
  text: string;
  translation?: string;
  partOfSpeech?: string;
  category?: GeneratedChunkCategory;
  repetitionPriority: GeneratedChunkRepetitionPriority;
};

const CONNECTOR_TERMS = new Set<string>([
  "and",
  "or",
  "but",
  "porque",
  "que",
  "y",
  "o",
  "pero",
  "и",
  "или",
  "но",
  "что",
  "а",
]);

const LOCATION_TERMS = new Set<string>([
  "chile",
  "españa",
  "espana",
  "madrid",
  "argentina",
  "mexico",
  "rusia",
  "rossiya",
  "россия",
  "москва",
  "москве",
  "петербург",
  "санктпетербург",
]);

const FUNCTION_WORD_POS = new Set<string>(["article", "preposition", "conjunction", "pronoun", "connector"]);

const FUNCTION_WORD_TERMS = {
  es: new Set<string>([
    "de",
    "la",
    "el",
    "los",
    "las",
    "que",
    "y",
    "o",
    "pero",
    "en",
    "a",
    "por",
    "para",
    "con",
    "del",
    "se",
    "no",
    "un",
    "una",
  ]),
  ru: new Set<string>([
    "и",
    "в",
    "не",
    "на",
    "с",
    "что",
    "или",
    "но",
    "а",
    "он",
    "она",
    "мы",
    "вы",
    "они",
  ]),
} as const;

const FUNCTION_WORD_WHITELIST = {
  es: new Set<string>(["yo"]),
  ru: new Set<string>(["я"]),
} as const;

function getRepetitionPriority(frequencyRank: number): GeneratedChunkRepetitionPriority {
  if (frequencyRank <= 500) {
    return "high";
  }
  if (frequencyRank <= 1500) {
    return "medium";
  }
  return "low";
}

function getChunkRepetitionPriority(entry: NormalizedVocabularyEntry): GeneratedChunkRepetitionPriority {
  const basePriority = getRepetitionPriority(entry.frequencyRank);
  const part = (entry.partOfSpeech ?? "").toLowerCase().trim();
  // Pronouns are allowed but capped to avoid over-prioritization.
  if (part === "pronoun" && basePriority === "high") {
    return "medium";
  }
  return basePriority;
}

function inferCategory(entry: NormalizedVocabularyEntry): GeneratedChunkCategory | undefined {
  const part = (entry.partOfSpeech ?? "").toLowerCase().trim();
  const base = entry.baseForm.toLowerCase().trim();

  if (LOCATION_TERMS.has(base)) {
    return "places";
  }
  if (part === "verb" || part === "pronoun") {
    return "general";
  }
  if (part === "connector" || CONNECTOR_TERMS.has(base)) {
    return "general";
  }
  if (part === "noun") {
    return "general";
  }
  return undefined;
}

function shouldFilterFunctionWord(entry: NormalizedVocabularyEntry): boolean {
  const language = entry.language;
  const base = entry.baseForm.toLowerCase().trim();
  if (FUNCTION_WORD_WHITELIST[language].has(base)) {
    return false;
  }
  const part = (entry.partOfSpeech ?? "").toLowerCase().trim();
  if (FUNCTION_WORD_POS.has(part)) {
    return true;
  }
  return FUNCTION_WORD_TERMS[language].has(base);
}

export function generateChunks(entries: NormalizedVocabularyEntry[]): GeneratedChunk[] {
  // High-frequency function words are filtered at chunk level to preserve learning value.
  return entries
    .filter((entry) => !shouldFilterFunctionWord(entry))
    .map((entry) => ({
      language: entry.language,
      text: entry.baseForm,
      translation: entry.translation,
      partOfSpeech: entry.partOfSpeech,
      category: inferCategory(entry),
      repetitionPriority: getChunkRepetitionPriority(entry),
    }));
}

