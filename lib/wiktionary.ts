export type WiktionaryLookupResult = {
  word: string;
  lookupWord?: string;
  definition: string;
  partOfSpeech: string;
  pronunciation?: string;
  examples: string[];
  note?: string;
};

type WiktionaryParseResponse = {
  parse?: {
    wikitext?: string;
  };
};

const API_URL = "https://es.wiktionary.org/w/api.php";

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

function cleanDefinitionText(value: string): string {
  return cleanText(value)
    .replace(/[\[\]\(\)\{\}]/g, " ")
    .replace(/\s*[,;:]\s*/g, ", ")
    .replace(/^[-,.;:)\]}]+/g, "")
    .replace(/[,.;:)\]}]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function trimToTwoSentences(value: string): string {
  const normalized = cleanDefinitionText(value);
  if (!normalized) {
    return "";
  }
  const parts = normalized.match(/[^.!?]+[.!?]?/g)?.map((part) => part.trim()).filter(Boolean) ?? [];
  if (parts.length === 0) {
    return normalized;
  }
  return parts.slice(0, 2).join(" ").trim();
}

function definitionLooksTechnical(value: string): boolean {
  const lower = value.toLowerCase();
  return [
    "lingüística",
    "gramática",
    "filosofía",
    "anatomía",
    "zoología",
    "botánica",
    "química",
    "física",
    "matemática",
    "sinónimo de",
    "hipónimo de",
    "forma de ",
    "vulgar",
    "obsceno",
    "sexual",
    "coloquial",
    "despectivo",
    "peyorativo",
  ].some((marker) => lower.includes(marker));
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

function pickBestDefinition(definitions: string[]): string {
  const cleaned = definitions
    .map((definition, index) => ({
      definition: trimToTwoSentences(definition),
      index,
    }))
    .filter((entry) => entry.definition.length >= 8);
  if (cleaned.length === 0) {
    return "";
  }
  const scored = cleaned
    .map((entry) => ({
      definition: entry.definition,
      score:
        entry.index * 40 +
        entry.definition.length +
        (definitionLooksTechnical(entry.definition) ? 80 : 0) +
        (definitionLooksFragment(entry.definition) ? 120 : 0),
    }))
    .sort((a, b) => a.score - b.score);
  const nonFragment = scored.filter((entry) => !definitionLooksFragment(entry.definition));
  if (nonFragment.length > 0) {
    return nonFragment[0]?.definition ?? cleaned[0]?.definition ?? "";
  }
  return scored[0]?.definition ?? cleaned[0]?.definition ?? "";
}

function fallbackResult(word: string): WiktionaryLookupResult {
  return {
    word,
    lookupWord: word,
    definition: "No clear definition found. Try another form of the word.",
    partOfSpeech: "desconocido",
    pronunciation: undefined,
    examples: [],
  };
}

type ParsedWiktionaryData = {
  definition: string;
  partOfSpeech: string;
  pronunciation?: string;
  examples: string[];
};

function spanishLemmaCandidates(word: string): string[] {
  const lower = word.toLowerCase();
  const candidates = new Set<string>();
  if (lower.endsWith("a") && lower.length > 1) {
    candidates.add(`${lower.slice(0, -1)}ar`);
  } else if (lower.endsWith("e") && lower.length > 1) {
    candidates.add(`${lower.slice(0, -1)}er`);
    candidates.add(`${lower.slice(0, -1)}ir`);
  } else if (lower.endsWith("o") && lower.length > 1) {
    candidates.add(`${lower.slice(0, -1)}ar`);
    candidates.add(`${lower.slice(0, -1)}er`);
    candidates.add(`${lower.slice(0, -1)}ir`);
  }
  candidates.delete(lower);
  return Array.from(candidates);
}

async function lookupSpanishWiktionaryEntry(word: string): Promise<ParsedWiktionaryData | null> {
  const url = new URL(API_URL);
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

  const definitions = extractDefinitions(wikitext);
  const definition = pickBestDefinition(definitions);
  if (!definition) {
    return null;
  }

  return {
    definition,
    partOfSpeech: extractPartOfSpeech(wikitext),
    pronunciation: extractPronunciation(wikitext),
    examples: extractExamples(wikitext),
  };
}

function normalizePartOfSpeech(pos: string): string {
  const normalized = cleanText(pos).toLowerCase();
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

function extractPartOfSpeech(wikitext: string): string {
  const templateCandidates = Array.from(
    wikitext.matchAll(/^===+\s*\{\{([^|}]+)\|es(?:\|[^}]*)?\}\}\s*===+\s*$/gim)
  ).map((match) => normalizePartOfSpeech(match[1] ?? ""));
  const headingCandidates = Array.from(wikitext.matchAll(/^===+\s*([^=\n]+?)\s*===+\s*$/gm)).map((match) =>
    normalizePartOfSpeech(match[1] ?? "")
  );
  const allCandidates = [...templateCandidates, ...headingCandidates].filter(Boolean);
  const lexicalPos = allCandidates.find((candidate) =>
    ["noun", "verb", "adjective", "adverb", "pronoun", "preposition"].includes(candidate)
  );
  return lexicalPos ?? allCandidates[0] ?? "desconocido";
}

function extractDefinitions(wikitext: string): string[] {
  const numberedDefs = wikitext
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^;?\d+\s*:/.test(line))
    .map((line) => cleanText(line.replace(/^;?\d+\s*:\s*/, "")))
    .filter((line) => line.length >= 3);
  if (numberedDefs.length > 0) {
    return numberedDefs;
  }
  return wikitext
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("#"))
    .map((line) => cleanText(line.replace(/^#+\s*/, "")))
    .filter((line) => line.length >= 3);
}

function extractExamples(wikitext: string): string[] {
  return wikitext
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("#:") || line.trim().startsWith("#*"))
    .map((line) => cleanText(line.replace(/^#[:*]\s*/, "")))
    .filter((line) => line.length >= 3)
    .map((line) => trimToTwoSentences(line))
    .slice(0, 3);
}

function extractPronunciation(wikitext: string): string | undefined {
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

export async function lookupWord(language: string, word: string): Promise<WiktionaryLookupResult> {
  const safeLanguage = language.trim().toLowerCase() || "es";
  const safeWord = word.trim();
  if (!safeWord) {
    return fallbackResult("(palabra vacía)");
  }
  if (safeLanguage !== "es") {
    return fallbackResult(safeWord);
  }

  try {
    const directEntry = await lookupSpanishWiktionaryEntry(safeWord);
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

    for (const lemmaCandidate of spanishLemmaCandidates(safeWord)) {
      const lemmaEntry = await lookupSpanishWiktionaryEntry(lemmaCandidate);
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

    return {
      ...fallbackResult(safeWord),
      lookupWord: safeWord,
    };
  } catch {
    return fallbackResult(safeWord);
  }
}
