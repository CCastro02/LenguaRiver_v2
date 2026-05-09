import type { ExtractedChunkCandidate } from "./sentence-ingestion";
import type { NormalizedVocabularyEntry, SourceName } from "./types";

export type SourcedChunkPriority = "high" | "medium" | "low";
export type SourcedChunkCategory = "general" | "places";

export type SourcedChunkCandidate = {
  language: NormalizedVocabularyEntry["language"];
  text: string;
  baseForm: string;
  variants: string[];
  translation?: string;
  partOfSpeech?: string;
  category?: SourcedChunkCategory;
  repetitionPriority: SourcedChunkPriority;
  frequencyRank?: number;
  exampleSentences: string[];
  sources: SourceName[];
};

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

const FUNCTION_WORDS = {
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

const CORE_STRUCTURE_TOKENS = {
  es: new Set<string>(["llamo", "llamar", "quiero", "trabajo", "trabajar", "soy", "vive", "vivir"]),
  ru: new Set<string>(["зовут", "быть", "хочу", "работаю", "работать", "живет", "жить"]),
} as const;

function getPriorityFromRank(frequencyRank: number): SourcedChunkPriority {
  if (frequencyRank <= 500) {
    return "high";
  }
  if (frequencyRank <= 1500) {
    return "medium";
  }
  return "low";
}

function inferCategory(baseForm: string, partOfSpeech?: string): SourcedChunkCategory | undefined {
  const normalizedBase = baseForm.toLowerCase().trim();
  const normalizedPos = (partOfSpeech ?? "").toLowerCase().trim();
  if (LOCATION_TERMS.has(normalizedBase)) {
    return "places";
  }
  if (normalizedPos === "verb" || normalizedPos === "pronoun" || normalizedPos === "connector") {
    return "general";
  }
  if (normalizedPos === "noun") {
    return "general";
  }
  return undefined;
}

function normalizeKey(language: string, baseForm: string): string {
  return `${language}::${baseForm.toLowerCase().trim()}`;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function uniqueSources(values: SourceName[]): SourceName[] {
  return Array.from(new Set(values));
}

function normalizeVariantKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mergeVariants(values: string[]): string[] {
  const seen = new Set<string>();
  const variants: string[] = [];
  values.forEach((value) => {
    const raw = value.trim();
    const normalized = normalizeVariantKey(raw);
    if (!raw || !normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    variants.push(raw);
  });
  return variants;
}

function looksVerbLikeToken(language: "es" | "ru", token: string): boolean {
  if (language === "es") {
    return /(ar|er|ir|o|as|a|amos|an|emos|en)$/u.test(token);
  }
  return /(ть|ет|ут|ют|ит|ат|ят|аю|яю|у|ю)$/u.test(token);
}

function getSentenceOnlyPriority(candidate: ExtractedChunkCandidate): SourcedChunkPriority {
  const tokenCount = candidate.tokenCount;
  if (tokenCount < 2 || tokenCount > 3) {
    return "low";
  }
  const tokens = candidate.text.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const functionWords = FUNCTION_WORDS[candidate.language];
  const hasContentToken = tokens.some((token) => !functionWords.has(token));
  const hasCoreStructureToken = tokens.some((token) => CORE_STRUCTURE_TOKENS[candidate.language].has(token));
  const hasVerbLikeToken = tokens.some((token) => looksVerbLikeToken(candidate.language, token));
  const isFunctionOnly = tokens.every((token) => functionWords.has(token));

  // Sentence-derived phrases may be promoted to avoid under-prioritization.
  if (!isFunctionOnly && hasContentToken && (hasCoreStructureToken || hasVerbLikeToken)) {
    return "medium";
  }
  return "low";
}

export function mergeChunkSources(
  frequencyEntries: NormalizedVocabularyEntry[],
  sentenceCandidates: ExtractedChunkCandidate[]
): SourcedChunkCandidate[] {
  const merged = new Map<string, SourcedChunkCandidate>();

  frequencyEntries.forEach((entry) => {
    const key = normalizeKey(entry.language, entry.baseForm);
    const baseForm = entry.baseForm.toLowerCase().trim();
    const existing = merged.get(key);
    const next: SourcedChunkCandidate = {
      language: entry.language,
      text: existing?.text ?? baseForm,
      baseForm,
      variants: mergeVariants([...(existing?.variants ?? []), entry.baseForm]),
      translation: entry.translation ?? existing?.translation,
      partOfSpeech: entry.partOfSpeech ?? existing?.partOfSpeech,
      category: inferCategory(baseForm, entry.partOfSpeech ?? existing?.partOfSpeech),
      repetitionPriority: getPriorityFromRank(entry.frequencyRank),
      frequencyRank: entry.frequencyRank,
      exampleSentences: uniqueStrings(existing?.exampleSentences ?? []),
      sources: uniqueSources([...(existing?.sources ?? []), entry.source]),
    };
    merged.set(key, next);
  });

  sentenceCandidates.forEach((candidate) => {
    const baseForm = (candidate.baseForm ?? candidate.text).toLowerCase().trim();
    const key = normalizeKey(candidate.language, baseForm);
    const existing = merged.get(key);
    const next: SourcedChunkCandidate = {
      language: candidate.language,
      text: existing?.text ?? candidate.text,
      baseForm,
      variants: mergeVariants([...(existing?.variants ?? []), candidate.text]),
      translation: existing?.translation,
      partOfSpeech: existing?.partOfSpeech,
      category: existing?.category ?? inferCategory(baseForm, existing?.partOfSpeech),
      repetitionPriority: existing?.repetitionPriority ?? getSentenceOnlyPriority(candidate),
      frequencyRank: existing?.frequencyRank,
      exampleSentences: uniqueStrings([...(existing?.exampleSentences ?? []), candidate.sourceSentence]),
      sources: uniqueSources([...(existing?.sources ?? []), candidate.source]),
    };
    merged.set(key, next);
  });

  return Array.from(merged.values()).sort((a, b) => {
    const rankA = a.frequencyRank ?? Number.MAX_SAFE_INTEGER;
    const rankB = b.frequencyRank ?? Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    if (a.language !== b.language) {
      return a.language.localeCompare(b.language);
    }
    return a.baseForm.localeCompare(b.baseForm);
  });
}

