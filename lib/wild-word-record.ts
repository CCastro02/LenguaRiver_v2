/**
 * Safe coercion of wild-word rows from `localStorage` / extension JSON.
 *
 * Preserves unknown keys on `rawRecord`; only normalizes known fields for UI/enrichment.
 *
 * @see {@link ./wild-word-schema.ts} field glossary
 */

import type { UserWildWord } from "@/lib/explore-content";

/** Optional stored fields surfaced in My Words UI (beyond {@link UserWildWord}). */
export type WildWordStoredExtras = {
  definition?: string;
  /** ISO code for the language of `definition` (source-language dictionary gloss). */
  definitionLanguage?: string;
  /** Learner-language explanation of `definition` (not the short translation gloss). */
  explanation?: string;
  /** ISO code for the language of `explanation`. */
  explanationLanguage?: string;
  explanationSource?: string;
  phonetic?: string;
  partOfSpeech?: string;
  imageUrl?: string;
  translationTargetLanguage?: string;
  sourceDomain?: string;
  sourceUrl?: string;
  targetLanguage?: string;
  enrichmentVersion?: number;
  enrichmentStatus?: string;
  enrichmentErrors?: Record<string, unknown>;
  enrichedAt?: string;
  translationSource?: string;
  definitionSource?: string;
  imageSource?: string;
  imageAssetId?: string;
  imageAlt?: string;
  imageAttribution?: string;
  imageAttributionUrl?: string;
  imageLicense?: string;
  imageLicenseUrl?: string;
  imagePageUrl?: string;
  imageProvider?: string;
  imageSearchQuery?: string;
  imageTags?: string;
  imageSearchProviderRank?: string;
  imageConfidence?: string;
  imageReason?: string;
  imageUpdatedAt?: string;
  wikidataEntityId?: string;
  wikidataEntityLabel?: string;
  commonsFileTitle?: string;
  wiktionaryLookupWord?: string;
  sourceKind?: string;
  detectedLanguage?: string;
  detectedLanguageConfidence?: string;
  detectedLanguageReason?: string;
};

export type CoercedWildWordRow = {
  /** Shallow copy of the stored row; unknown keys preserved. */
  rawRecord: Record<string, unknown>;
  word: UserWildWord;
  extras: WildWordStoredExtras;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function trimString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalStringField(raw: Record<string, unknown>, key: string): string | undefined {
  return trimString(raw[key]);
}

/**
 * Minimal core fields required for enrichment / list display.
 * Returns null when `id`, `text`, or `language` are missing or invalid.
 */
export function parseWildWordCoreFields(rawRecord: Record<string, unknown>): UserWildWord | null {
  const id = optionalStringField(rawRecord, "id");
  const text = optionalStringField(rawRecord, "text");
  const language = optionalStringField(rawRecord, "language");
  if (!id || !text || !language) {
    return null;
  }
  return {
    id,
    text,
    language,
    lexemeKey: optionalStringField(rawRecord, "lexemeKey"),
    sourceItemId: optionalStringField(rawRecord, "sourceItemId") ?? "",
    sourceTitle: optionalStringField(rawRecord, "sourceTitle") ?? "",
    contextSentence: optionalStringField(rawRecord, "contextSentence"),
    translation: optionalStringField(rawRecord, "translation"),
    pronunciation: optionalStringField(rawRecord, "pronunciation"),
    savedAt: optionalStringField(rawRecord, "savedAt") ?? new Date().toISOString(),
  };
}

function buildStoredExtras(raw: Record<string, unknown>): WildWordStoredExtras {
  const extras: WildWordStoredExtras = {};
  const stringKeys = [
    "definition",
    "definitionLanguage",
    "explanation",
    "explanationLanguage",
    "explanationSource",
    "phonetic",
    "partOfSpeech",
    "imageUrl",
    "translationTargetLanguage",
    "sourceDomain",
    "sourceUrl",
    "targetLanguage",
    "enrichedAt",
    "translationSource",
    "definitionSource",
    "imageSource",
    "imageAssetId",
    "imageAlt",
    "imageAttribution",
    "imageAttributionUrl",
    "imageLicense",
    "imageLicenseUrl",
    "imagePageUrl",
    "imageProvider",
    "imageSearchQuery",
    "imageTags",
    "imageSearchProviderRank",
    "imageConfidence",
    "imageReason",
    "imageUpdatedAt",
    "wikidataEntityId",
    "wikidataEntityLabel",
    "commonsFileTitle",
    "wiktionaryLookupWord",
    "sourceKind",
    "detectedLanguage",
    "detectedLanguageReason",
    "detectedLanguageConfidence",
    "enrichmentStatus",
  ] as const;
  for (const key of stringKeys) {
    const value = optionalStringField(raw, key);
    if (value) {
      extras[key] = value;
    }
  }
  const version = raw.enrichmentVersion;
  if (typeof version === "number" && Number.isFinite(version)) {
    extras.enrichmentVersion = version;
  }
  if (isRecord(raw.enrichmentErrors)) {
    extras.enrichmentErrors = { ...raw.enrichmentErrors };
  }
  return extras;
}

/**
 * Coerce one raw storage row for My Words / import previews.
 * Returns null when required identity fields are absent.
 */
export function coerceWildWordRawRecord(raw: unknown): CoercedWildWordRow | null {
  if (!isRecord(raw)) {
    return null;
  }
  const rawRecord: Record<string, unknown> = { ...raw };
  const word = parseWildWordCoreFields(rawRecord);
  if (!word) {
    return null;
  }
  return {
    rawRecord,
    word,
    extras: buildStoredExtras(rawRecord),
  };
}
