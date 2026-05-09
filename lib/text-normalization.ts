export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeText(value: string): string[] {
  return normalizeText(value).split(/\s+/).filter(Boolean);
}

const ENGLISH_STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "to",
  "of",
  "in",
  "on",
  "at",
  "for",
  "from",
  "and",
  "or",
  "is",
  "are",
  "am",
  "be",
  "this",
  "that",
  "it",
  "you",
  "i",
  "we",
  "they",
  "he",
  "she",
]);

export function getEnglishContentTokens(tokens: string[]): string[] {
  return tokens.filter((token) => !ENGLISH_STOP_WORDS.has(token));
}
