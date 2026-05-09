import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SourceName, SupportedLanguage } from "./types";

export type RawSentenceEntry = {
  language: SupportedLanguage;
  text: string;
  translation?: string;
  source: SourceName;
  sourceUrl?: string;
};

export type NormalizedSentenceEntry = {
  language: SupportedLanguage;
  text: string;
  normalizedText: string;
  translation?: string;
  source: SourceName;
};

export type ExtractedChunkCandidate = {
  language: SupportedLanguage;
  text: string;
  baseForm?: string;
  tokenCount: number;
  sourceSentence: string;
  source: SourceName;
};

type SentenceImportOptions = {
  language: SupportedLanguage;
  source?: SourceName;
  sourceUrl?: string;
  delimiter?: "\t" | "," | ";";
  maxSentenceLength?: number;
};

type SentenceValidationResult = {
  rows: NormalizedSentenceEntry[];
  warnings: string[];
};

const DEFAULT_MAX_SENTENCE_LENGTH = 140;

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

const RUSSIAN_BASE_FORM_MAP: Record<string, string> = {
  москве: "москва",
  россии: "россия",
};

function normalizeSentenceText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSpanishTokenToBaseForm(token: string): string {
  if (token.endsWith("o") && token.length > 3) {
    const stem = token.slice(0, -1);
    if (stem.endsWith("aj")) {
      return `${stem}ar`;
    }
    if (stem.endsWith("bl")) {
      return `${stem}ar`;
    }
    if (stem.endsWith("com")) {
      return `${stem}er`;
    }
  }
  return token;
}

export function normalizeTokenToBaseForm(language: SupportedLanguage, token: string): string {
  const normalizedToken = normalizeSentenceText(token);
  if (!normalizedToken) {
    return token;
  }
  if (language === "ru") {
    return RUSSIAN_BASE_FORM_MAP[normalizedToken] ?? normalizedToken;
  }
  if (language === "es") {
    return normalizeSpanishTokenToBaseForm(normalizedToken);
  }
  return normalizedToken;
}

export function normalizeChunkTextToBaseForm(language: SupportedLanguage, text: string): string {
  const tokens = normalizeSentenceText(text).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return text;
  }
  return tokens.map((token) => normalizeTokenToBaseForm(language, token)).join(" ");
}

function inferDelimiter(contents: string): "\t" | "," | ";" {
  if (contents.includes("\t")) {
    return "\t";
  }
  if (contents.includes(";")) {
    return ";";
  }
  return ",";
}

function stripHeader(lines: string[]): string[] {
  if (lines.length === 0) {
    return [];
  }
  const first = lines[0].toLowerCase();
  if (first.includes("text") || first.includes("translation") || first.includes("sentence")) {
    return lines.slice(1);
  }
  return lines;
}

export function parseLocalSentenceFile(filePath: string, options: SentenceImportOptions): RawSentenceEntry[] {
  const resolvedPath = resolve(filePath);
  const contents = readFileSync(resolvedPath, "utf-8").trim();
  const delimiter = options.delimiter ?? inferDelimiter(contents);
  const lines = stripHeader(
    contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );
  const source: SourceName = options.source ?? "manual";

  return lines.map((line) => {
    const cols = line.split(delimiter).map((col) => col.trim());
    return {
      language: options.language,
      text: cols[0] ?? "",
      translation: cols[1] || undefined,
      source,
      sourceUrl: options.sourceUrl,
    };
  });
}

export function validateAndNormalizeSentences(
  entries: RawSentenceEntry[],
  maxSentenceLength = DEFAULT_MAX_SENTENCE_LENGTH
): SentenceValidationResult {
  const warnings: string[] = [];
  const rows: NormalizedSentenceEntry[] = [];
  const seen = new Set<string>();

  entries.forEach((entry, index) => {
    const rowLabel = `row ${index + 1}`;
    if (!entry.language) {
      warnings.push(`${rowLabel}: missing language`);
      return;
    }
    if (!entry.text || entry.text.trim().length === 0) {
      warnings.push(`${rowLabel}: missing text`);
      return;
    }
    if (!entry.source) {
      warnings.push(`${rowLabel}: missing source`);
      return;
    }
    const text = entry.text.trim();
    if (text.length === 0) {
      warnings.push(`${rowLabel}: empty sentence rejected`);
      return;
    }
    if (text.length > maxSentenceLength) {
      warnings.push(`${rowLabel}: sentence too long for MVP (>${maxSentenceLength})`);
      return;
    }

    const normalizedText = normalizeSentenceText(text);
    if (!normalizedText) {
      warnings.push(`${rowLabel}: sentence becomes empty after normalization`);
      return;
    }

    const key = `${entry.language}::${normalizedText}`;
    if (seen.has(key)) {
      warnings.push(`${rowLabel}: duplicate sentence dropped`);
      return;
    }
    seen.add(key);

    rows.push({
      language: entry.language,
      text,
      normalizedText,
      translation: entry.translation?.trim() || undefined,
      source: entry.source,
    });
  });

  return { rows, warnings };
}

export function extractChunkCandidates(entries: NormalizedSentenceEntry[]): ExtractedChunkCandidate[] {
  const out: ExtractedChunkCandidate[] = [];
  const seen = new Set<string>();

  entries.forEach((entry) => {
    const tokens = entry.normalizedText.split(/\s+/).filter(Boolean);
    const functionWords = FUNCTION_WORDS[entry.language];
    const usefulTokenIndexes = tokens
      .map((token, index) => ({ token, index }))
      .filter(({ token }) => !functionWords.has(token));

    usefulTokenIndexes.forEach(({ token, index }) => {
      const unigramKey = `${entry.language}::${token}`;
      if (!seen.has(unigramKey)) {
        seen.add(unigramKey);
        out.push({
          language: entry.language,
          text: token,
          baseForm: normalizeChunkTextToBaseForm(entry.language, token),
          tokenCount: 1,
          sourceSentence: entry.text,
          source: entry.source,
        });
      }

      const twoTokens = tokens.slice(index, index + 2);
      if (
        twoTokens.length === 2 &&
        !functionWords.has(twoTokens[0]) &&
        !functionWords.has(twoTokens[1])
      ) {
        const phrase = twoTokens.join(" ");
        const bigramKey = `${entry.language}::${phrase}`;
        if (!seen.has(bigramKey)) {
          seen.add(bigramKey);
          out.push({
            language: entry.language,
            text: phrase,
            baseForm: normalizeChunkTextToBaseForm(entry.language, phrase),
            tokenCount: 2,
            sourceSentence: entry.text,
            source: entry.source,
          });
        }
      }

      const threeTokens = tokens.slice(index, index + 3);
      if (
        threeTokens.length === 3 &&
        !functionWords.has(threeTokens[0]) &&
        !functionWords.has(threeTokens[1]) &&
        !functionWords.has(threeTokens[2])
      ) {
        const phrase = threeTokens.join(" ");
        const trigramKey = `${entry.language}::${phrase}`;
        if (!seen.has(trigramKey)) {
          seen.add(trigramKey);
          out.push({
            language: entry.language,
            text: phrase,
            baseForm: normalizeChunkTextToBaseForm(entry.language, phrase),
            tokenCount: 3,
            sourceSentence: entry.text,
            source: entry.source,
          });
        }
      }
    });
  });

  return out;
}

export function ingestSentenceCandidates(filePath: string, options: SentenceImportOptions): {
  normalizedSentences: NormalizedSentenceEntry[];
  candidates: ExtractedChunkCandidate[];
  warnings: string[];
} {
  const raw = parseLocalSentenceFile(filePath, options);
  const { rows, warnings } = validateAndNormalizeSentences(raw, options.maxSentenceLength);
  const candidates = extractChunkCandidates(rows);
  return {
    normalizedSentences: rows,
    candidates,
    warnings,
  };
}

