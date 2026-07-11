/**
 * Human-readable dictionary definitions for My Words (Wiktionary + stored rows).
 */

/** Minimum length for a normal multi-word definition. */
export const MIN_DEFINITION_CHARS = 12;

const RAW_MARKUP_MARKERS: RegExp[] = [
  /quote-journal/i,
  /quote-book/i,
  /quote-web/i,
  /\bcite-web\b/i,
  /\bcite-book\b/i,
  /\bcite-journal\b/i,
  /\{\{/,
  /\}\}/,
  /\|author\s*=/i,
  /\|date\s*=/i,
  /\|journal\s*=/i,
  /\|title\s*=/i,
  /\|publisher\s*=/i,
  /\|url\s*=/i,
  /\[\[Category:/i,
  /\bFile:/i,
  /\bthumb\|/i,
  /<table\b/i,
  /<\/table>/i,
  /<html/i,
  /<div\b/i,
];

const LANGUAGE_PREFIX_RE =
  /^(?:(?:en|es|fr|de|pt)\s+(?=[A-ZÀ-ÿ"“])|(?:English|Spanish|French|German|Portuguese)\s*:)\s*/i;

/** True when text still contains Wiktionary template/citation/table markup. */
export function definitionContainsRawMarkup(text: string): boolean {
  const sample = text.trim();
  if (!sample) {
    return false;
  }
  return RAW_MARKUP_MARKERS.some((re) => re.test(sample));
}

/** Remove leading list markers and language labels (e.g. `en To predict…`). */
export function stripDefinitionLanguagePrefix(text: string): string {
  let out = text.trim().replace(/^[*•●◦▪·]+\s*/u, "").replace(/^[-–—]+\s+/u, "");
  for (let i = 0; i < 3; i++) {
    const next = out.replace(LANGUAGE_PREFIX_RE, "").trim();
    if (next === out) {
      break;
    }
    out = next;
  }
  return out.trim();
}

/** Normalize whitespace and stray punctuation from a gloss line. */
export function normalizeDefinitionGloss(raw: string): string {
  return raw
    .replace(/\{\{[^{}|]+\|([^{}|]+)(?:\|[^{}]*)?\}\}/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\{\{[^{}]*\}\}/g, " ")
    .replace(/''+/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/[\[\]\(\)\{\}]/g, " ")
    .replace(/\s*[,;:]\s*/g, ", ")
    .replace(/^[-,.;:)\]}]+/g, "")
    .replace(/(?<![.!?])[,;:)\]}]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function trimToTwoSentences(value: string): string {
  const normalized = normalizeDefinitionGloss(value);
  if (!normalized) {
    return "";
  }
  const parts = normalized.match(/[^.!?]+[.!?]?/g)?.map((part) => part.trim()).filter(Boolean) ?? [];
  if (parts.length === 0) {
    return normalized;
  }
  return parts.slice(0, 2).join(" ").trim();
}

function definitionMostlyMetadata(text: string): boolean {
  const pipes = (text.match(/\|/g) ?? []).length;
  if (pipes >= 3) {
    return true;
  }
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  const digits = (text.match(/\d/g) ?? []).length;
  const total = text.length;
  if (total === 0) {
    return true;
  }
  if (letters / total < 0.45 && digits > 2) {
    return true;
  }
  if (letters < 8) {
    return true;
  }
  return false;
}

function isAcceptableDefinitionLength(text: string): boolean {
  if (text.length >= MIN_DEFINITION_CHARS) {
    return true;
  }
  const words = text.split(/\s+/).filter(Boolean);
  return words.length >= 2 && text.length >= 8 && !definitionContainsRawMarkup(text);
}

/**
 * Prepare a single candidate gloss from Wiktionary wikitext (before ranking).
 */
export function prepareDefinitionCandidate(raw: string): string {
  const trimmed = stripDefinitionLanguagePrefix(normalizeDefinitionGloss(raw));
  return trimToTwoSentences(trimmed);
}

/** Reject unusable dictionary text (templates, citations, metadata-heavy). */
export function isRejectedDefinitionText(text: string | undefined): boolean {
  const sample = text?.trim();
  if (!sample) {
    return true;
  }
  if (definitionContainsRawMarkup(sample)) {
    return true;
  }
  const cleaned = stripDefinitionLanguagePrefix(normalizeDefinitionGloss(sample));
  if (!cleaned || definitionContainsRawMarkup(cleaned)) {
    return true;
  }
  if (!isAcceptableDefinitionLength(cleaned)) {
    return true;
  }
  return definitionMostlyMetadata(cleaned);
}

/**
 * Final definition for storage/display: cleaned, prefix-stripped, or null if unusable.
 */
export function sanitizeDefinitionForStorage(text: string | undefined): string | null {
  if (!text?.trim()) {
    return null;
  }
  if (isRejectedDefinitionText(text)) {
    return null;
  }
  const cleaned = stripDefinitionLanguagePrefix(normalizeDefinitionGloss(text.trim()));
  if (!cleaned || isRejectedDefinitionText(cleaned)) {
    return null;
  }
  return trimToTwoSentences(cleaned) || cleaned;
}
