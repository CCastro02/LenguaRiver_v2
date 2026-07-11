import {
  definitionContainsRawMarkup,
  isRejectedDefinitionText,
  prepareDefinitionCandidate,
  sanitizeDefinitionForStorage,
} from "@/lib/definition-text-cleanup";
import {
  buildSpanishDefinitionWithFormNote,
  getSpanishDefinitionLookupCandidates,
} from "@/lib/spanish-definition-lookup";
import { pickBestRankedDefinition } from "@/lib/wiktionary-definition-ranking";

export type WiktionaryLookupResult = {
  word: string;
  lookupWord?: string;
  definition?: string;
  partOfSpeech?: string;
  pronunciation?: string;
  examples: string[];
  note?: string;
};

type WiktionaryLanguage = "es" | "en";

type WiktionaryParseResponse = {
  parse?: {
    wikitext?: string;
  };
};

const WIKTIONARY_API_URL: Record<WiktionaryLanguage, string> = {
  es: "https://es.wiktionary.org/w/api.php",
  en: "https://en.wiktionary.org/w/api.php",
};

const LANGUAGE_SECTION_NAME: Record<WiktionaryLanguage, string> = {
  es: "Spanish",
  en: "English",
};

function cleanText(value: string): string {
  return value
    .replace(/\{\{[^{}|]+\|([^{}|]+)(?:\|[^{}]*)?\}\}/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\{\{[^{}]*\}\}/g, " ")
    .replace(/''+/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Slice wikitext to one part-of-speech section (e.g. Noun) when present. */
function wikitextForPartOfSpeechSection(
  wikitext: string,
  language: WiktionaryLanguage,
  partOfSpeech: string
): string | null {
  const posLabel =
    partOfSpeech === "noun"
      ? language === "en"
        ? "Noun"
        : "Sustantivo"
      : null;
  if (!posLabel) {
    return null;
  }
  const lines = wikitext.split(/\r?\n/);
  const startRe = new RegExp(`^===+\\s*${posLabel}\\s*===+\\s*$`, "i");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (startRe.test(lines[i]?.trim() ?? "")) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) {
    return null;
  }
  const chunk: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (/^===+[^=].*===+\s*$/.test(trimmed)) {
      break;
    }
    chunk.push(line);
  }
  return chunk.length > 0 ? chunk.join("\n") : null;
}

function pickBestDefinition(
  definitions: string[],
  language: WiktionaryLanguage,
  word: string,
  partOfSpeech: string
): string {
  const cleaned = definitions
    .map((definition) => prepareDefinitionCandidate(definition))
    .filter((definition) => definition.length >= 8 && !isRejectedDefinitionText(definition));
  if (cleaned.length === 0) {
    return "";
  }
  if (language === "en") {
    return pickBestRankedDefinition(cleaned, { word, language, partOfSpeech });
  }
  return cleaned[0] ?? "";
}

type ParsedWiktionaryData = {
  definition: string;
  partOfSpeech: string;
  pronunciation?: string;
  examples: string[];
};

export function isSupportedWiktionaryLanguage(language: string): language is WiktionaryLanguage {
  const code = language.trim().toLowerCase();
  return code === "es" || code === "en";
}

/** Extract the language section from a multilingual Wiktionary page when present. */
export function wikitextForLanguage(wikitext: string, language: WiktionaryLanguage): string {
  const sectionName = LANGUAGE_SECTION_NAME[language];
  const lines = wikitext.split(/\r?\n/);
  const startRe = new RegExp(`^==\\s*${sectionName}\\s*==\\s*$`, "i");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (startRe.test(lines[i]?.trim() ?? "")) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) {
    return wikitext;
  }
  const chunk: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (/^==[^=].*==\s*$/.test(trimmed)) {
      break;
    }
    chunk.push(line);
  }
  return chunk.length > 0 ? chunk.join("\n") : wikitext;
}

function englishLemmaCandidates(word: string): string[] {
  const lower = word.toLowerCase();
  const candidates = new Set<string>();
  if (lower.endsWith("ing") && lower.length > 4) {
    candidates.add(lower.slice(0, -3));
    candidates.add(`${lower.slice(0, -3)}e`);
  }
  if (lower.endsWith("ed") && lower.length > 3) {
    candidates.add(lower.slice(0, -2));
    candidates.add(`${lower.slice(0, -2)}e`);
  }
  if (lower.endsWith("ies") && lower.length > 4) {
    candidates.add(`${lower.slice(0, -3)}y`);
  } else if (lower.endsWith("s") && lower.length > 2 && !lower.endsWith("ss")) {
    candidates.add(lower.slice(0, -1));
  }
  candidates.delete(lower);
  return Array.from(candidates);
}

function normalizePartOfSpeech(pos: string, language: WiktionaryLanguage): string {
  const normalized = cleanText(pos).toLowerCase();
  if (language === "en") {
    if (normalized.includes("noun")) {
      return "noun";
    }
    if (normalized.includes("verb")) {
      return "verb";
    }
    if (normalized.includes("adjective")) {
      return "adjective";
    }
    if (normalized.includes("adverb")) {
      return "adverb";
    }
    if (normalized.includes("pronoun")) {
      return "pronoun";
    }
    if (normalized.includes("preposition")) {
      return "preposition";
    }
    return cleanText(pos) || "unknown";
  }

  if (normalized.startsWith("sustantivo") || normalized.includes(" sustantivo")) {
    return "noun";
  }
  if (
    normalized.startsWith("verbo") ||
    normalized.startsWith("forma verbal") ||
    normalized.includes(" forma verbal")
  ) {
    return "verb";
  }
  if (normalized.startsWith("adjetivo")) {
    return "adjective";
  }
  if (normalized.startsWith("adverbio")) {
    return "adverb";
  }
  if (normalized.startsWith("pronombre")) {
    return "pronoun";
  }
  if (normalized.startsWith("preposición")) {
    return "preposition";
  }
  return cleanText(pos) || "desconocido";
}

function extractPartOfSpeech(wikitext: string, language: WiktionaryLanguage): string {
  const langTag = language === "es" ? "es" : "en";
  const templateCandidates = Array.from(
    wikitext.matchAll(
      new RegExp(`^===+\\s*\\{\\{([^|}]+)\\|${langTag}(?:\\|[^}]*)?\\}\\}\\s*===+\\s*$`, "gim")
    )
  ).map((match) => normalizePartOfSpeech(match[1] ?? "", language));
  const headingCandidates = Array.from(wikitext.matchAll(/^===+\s*([^=\n]+?)\s*===+\s*$/gm)).map(
    (match) => normalizePartOfSpeech(match[1] ?? "", language)
  );
  const allCandidates = [...templateCandidates, ...headingCandidates].filter(Boolean);
  const lexicalPos = allCandidates.find((candidate) =>
    ["noun", "verb", "adjective", "adverb", "pronoun", "preposition"].includes(candidate)
  );
  return lexicalPos ?? allCandidates[0] ?? (language === "en" ? "unknown" : "desconocido");
}

function isDefinitionWikitextLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith("#")) {
    return /^;?\d+\s*:/.test(trimmed);
  }
  if (trimmed.startsWith("#:") || trimmed.startsWith("#*")) {
    return false;
  }
  return /^#+/.test(trimmed);
}

function extractDefinitions(wikitext: string): string[] {
  const lines = wikitext
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => isDefinitionWikitextLine(line) && !definitionContainsRawMarkup(line));

  const numberedDefs = lines
    .filter((line) => /^;?\d+\s*:/.test(line))
    .map((line) => cleanText(line.replace(/^;?\d+\s*:\s*/, "")))
    .filter((line) => line.length >= 3 && !definitionContainsRawMarkup(line));
  if (numberedDefs.length > 0) {
    return numberedDefs;
  }
  return lines
    .filter((line) => line.startsWith("#"))
    .map((line) => cleanText(line.replace(/^#+\s*/, "")))
    .filter((line) => line.length >= 3 && !definitionContainsRawMarkup(line));
}

function extractExamples(wikitext: string): string[] {
  return wikitext
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("#:") || line.trim().startsWith("#*"))
    .map((line) => cleanText(line.replace(/^#[:*]\s*/, "")))
    .filter((line) => line.length >= 3)
    .map((line) => prepareDefinitionCandidate(line))
    .filter((line) => line.length >= 3 && !isRejectedDefinitionText(line))
    .slice(0, 3);
}

function extractPronunciation(wikitext: string, language: WiktionaryLanguage): string | undefined {
  if (language === "en") {
    const ipa = wikitext.match(/\{\{IPA\|en\|([^}|]+)(?:\|[^}]*)?\}\}/i)?.[1];
    const enPR = wikitext.match(/\{\{enPR\|([^}|]+)(?:\|[^}]*)?\}\}/i)?.[1];
    const value = cleanText(ipa ?? enPR ?? "");
    return value || undefined;
  }

  const pronGraf = wikitext.match(/\{\{pron-graf\|([^}]*)\}\}/i)?.[1];
  if (pronGraf) {
    const afi = pronGraf.match(/afi\d*\s*=\s*([^|]+)/i)?.[1];
    if (afi) {
      const cleanAfi = cleanText(afi);
      if (cleanAfi) {
        return cleanAfi;
      }
    }
    const audio = pronGraf.match(/audio\d*\s*=\s*([^|]+)/i)?.[1];
    if (audio) {
      const cleanAudio = cleanText(audio);
      if (cleanAudio) {
        return `audio: ${cleanAudio}`;
      }
    }
  }
  const ipa = wikitext.match(/\{\{(?:AFI|pronunciación)\|([^}|]+)(?:\|[^}]*)?\}\}/i)?.[1];
  const explicit = wikitext.match(/pronunciaci[oó]n\s*[:=]\s*([^\n]+)/i)?.[1];
  const value = cleanText(ipa ?? explicit ?? "");
  return value || undefined;
}

function parseWiktionaryEntry(
  wikitext: string,
  language: WiktionaryLanguage,
  word: string
): ParsedWiktionaryData | null {
  const scoped = wikitextForLanguage(wikitext, language);
  const partOfSpeech = extractPartOfSpeech(scoped, language);
  const nounSection =
    language === "en" ? wikitextForPartOfSpeechSection(scoped, language, "noun") : null;
  const definitionSource = nounSection ?? scoped;
  const definitions = extractDefinitions(definitionSource);
  const definition = sanitizeDefinitionForStorage(
    pickBestDefinition(definitions, language, word, partOfSpeech)
  );
  if (!definition) {
    return null;
  }

  return {
    definition,
    partOfSpeech,
    pronunciation: extractPronunciation(scoped, language),
    examples: extractExamples(scoped),
  };
}

async function lookupWiktionaryEntry(
  language: WiktionaryLanguage,
  word: string
): Promise<ParsedWiktionaryData | null> {
  const url = new URL(WIKTIONARY_API_URL[language]);
  url.searchParams.set("action", "parse");
  url.searchParams.set("page", word);
  url.searchParams.set("prop", "wikitext");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");

  const response = await fetch(url.toString(), {
    headers: {
      "user-agent": "LenguaRiverWiktionaryLookup/1.0",
    },
  });
  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as WiktionaryParseResponse;
  const wikitext = json.parse?.wikitext ?? "";
  if (!wikitext.trim()) {
    return null;
  }

  return parseWiktionaryEntry(wikitext, language, word);
}

function lemmaCandidates(language: WiktionaryLanguage, word: string): string[] {
  return language === "es" ? [] : englishLemmaCandidates(word);
}

function emptyLookupResult(word: string): WiktionaryLookupResult {
  return {
    word,
    lookupWord: word,
    examples: [],
  };
}

/** Parse stored wikitext without a network call (tests / diagnostics). */
export function parseWiktionaryWikitext(
  wikitext: string,
  language: WiktionaryLanguage,
  word = ""
): ParsedWiktionaryData | null {
  return parseWiktionaryEntry(wikitext, language, word);
}

export async function lookupWord(language: string, word: string): Promise<WiktionaryLookupResult> {
  const safeWord = word.trim();
  if (!safeWord) {
    return emptyLookupResult("(empty)");
  }
  if (!isSupportedWiktionaryLanguage(language)) {
    return emptyLookupResult(safeWord);
  }

  const lang = language.trim().toLowerCase() as WiktionaryLanguage;

  try {
    if (lang === "es") {
      const candidates = getSpanishDefinitionLookupCandidates(safeWord);
      for (const candidate of candidates) {
        const entry = await lookupWiktionaryEntry(lang, candidate);
        if (!entry?.definition) {
          continue;
        }
        const definition = buildSpanishDefinitionWithFormNote(safeWord, candidate, entry.definition);
        const usedLemma =
          candidate.normalize("NFC").trim().toLowerCase() !== safeWord.normalize("NFC").trim().toLowerCase();
        return {
          word: safeWord,
          lookupWord: candidate,
          definition,
          partOfSpeech: entry.partOfSpeech,
          pronunciation: entry.pronunciation,
          examples: entry.examples,
          ...(usedLemma ? { note: `Looked up base form: ${candidate}` } : {}),
        };
      }
      return emptyLookupResult(safeWord);
    }

    const directEntry = await lookupWiktionaryEntry(lang, safeWord);
    if (directEntry) {
      return {
        word: safeWord,
        lookupWord: safeWord,
        definition: directEntry.definition,
        partOfSpeech: directEntry.partOfSpeech,
        pronunciation: directEntry.pronunciation,
        examples: directEntry.examples,
      };
    }

    for (const lemmaCandidate of lemmaCandidates(lang, safeWord)) {
      const lemmaEntry = await lookupWiktionaryEntry(lang, lemmaCandidate);
      if (!lemmaEntry) {
        continue;
      }
      return {
        word: safeWord,
        lookupWord: lemmaCandidate,
        definition: lemmaEntry.definition,
        partOfSpeech: lemmaEntry.partOfSpeech,
        pronunciation: lemmaEntry.pronunciation,
        examples: lemmaEntry.examples,
        note: `Looked up base form: ${lemmaCandidate}`,
      };
    }

    return emptyLookupResult(safeWord);
  } catch {
    return emptyLookupResult(safeWord);
  }
}
