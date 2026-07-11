import type { UserWildWord } from "@/lib/explore-content";
import { isMyWordsDebugEnabled } from "@/lib/debug-flags";
import { devLogMyWordsImagePipeline } from "@/lib/dev-my-words-image-pipeline";
import { hasUserWildWordImage } from "@/lib/wild-word-image-display";
import { lookupLessonChunkMetadata } from "@/lib/lesson-chunk-corpus-lookup";
import {
  planWildWordLanguageRepairForEnrichment,
  translationLooksLikeStaleIdentity,
} from "@/lib/wild-word-language-cleanup";
import { parseWildWordCoreFields } from "@/lib/wild-word-record";
import { buildLessonChunkMetadataMap, type LessonChunkMetadata } from "@/lib/review-queue";
import { resolveWildWordTranslationLanguages } from "@/lib/wild-word-translation-target";
import { lookupCuratedWordImage } from "@/lib/wild-word-curated-images";
import { lookupConceptWordImage } from "@/lib/wild-word-concept-images";
import {
  allowsConceptIconFallback,
  conceptIconConfidence,
} from "@/lib/imageability";
import { evaluateImageMemoryQuality } from "@/lib/image-memory-quality";
import {
  cleanupTranslationGloss,
  translationGlossNeedsCleanup,
} from "@/lib/translation-gloss-cleanup";
import type { ImageProviderResult } from "@/lib/image-providers/types";
import type { ImageSearchInput } from "@/lib/image-search";
import {
  isNonImageableLookupTerm,
  isSupportedWikimediaLanguage,
  type WikimediaImageLookupInput,
  type WikimediaImageResult,
} from "@/lib/wikimedia-image";
import { WILD_WORD_FIELD_CLEAR } from "@/lib/wild-word-image-patch";
import {
  isReplaceableImageSource,
  shouldApplyIncomingImageReplacement,
  shouldSkipBundledImageOnForceRefresh,
} from "@/lib/wild-word-image-replacement";

export {
  isReplaceableImageSource,
  isStaleImage,
  isUnknownLegacyImage,
  shouldApplyIncomingImageReplacement,
  shouldSkipBundledImageOnForceRefresh,
} from "@/lib/wild-word-image-replacement";
import {
  isRejectedDefinitionText,
  sanitizeDefinitionForStorage,
} from "@/lib/definition-text-cleanup";
import {
  cleanWildWordTextForDisplay,
  fixCommonMojibake,
  storedTextNeedsMojibakeRepair,
  textHasMojibakeMarkers,
  WILD_WORD_TEXT_ENCODING_FALLBACK,
} from "@/lib/fix-common-mojibake";
import { isSupportedWiktionaryLanguage } from "@/lib/wiktionary";

export {
  fallbackOppositeTarget,
  resolveEffectiveTranslationTarget,
  resolveEnrichmentLanguages,
  resolveWildWordTranslationLanguages,
  type EnrichmentLanguages,
  type WildWordTranslationLanguages,
} from "@/lib/wild-word-translation-target";

export const ENRICHMENT_VERSION = 1;

/** Client-side max wait for translation HTTP round-trip (Argos install can hang server-side). */
export const TRANSLATION_FETCH_TIMEOUT_MS = 10_000;

const TRANSLATION_STATUS_TIMEOUT_MS = 5_000;

export type EnrichmentSource =
  | "lesson"
  | "curated"
  | "concept"
  | "wikimedia"
  | "pexels"
  | "pixabay"
  | "wiktionary"
  | "argos"
  | "manual"
  | "user";

export type EnrichmentStatus = "complete" | "partial" | "failed";

export type EnrichmentNeeds = {
  translation: boolean;
  definition: boolean;
  explanation: boolean;
  phonetic: boolean;
  imageUrl: boolean;
};

export type EnrichmentErrors = {
  translation?: string;
  definition?: string;
  image?: string;
};

export type WildWordEnrichmentPatch = {
  language?: string;
  lexemeKey?: string;
  detectedLanguage?: string;
  detectedLanguageConfidence?: string;
  detectedLanguageReason?: string;
  translation?: string;
  definition?: string | null;
  /** ISO code for `definition` text (source language). Cleared with fake definitions. */
  definitionLanguage?: string | null;
  /** Learner-language gloss of `definition`; cleared when definition is invalid. */
  explanation?: string | null;
  explanationLanguage?: string | null;
  explanationSource?: EnrichmentSource | null;
  phonetic?: string;
  partOfSpeech?: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
  imageAttribution?: string | null;
  imageAttributionUrl?: string | null;
  imageLicense?: string | null;
  imageLicenseUrl?: string | null;
  imagePageUrl?: string | null;
  imageProvider?: "wikimedia" | "pexels" | "pixabay" | null;
  imageSearchQuery?: string | null;
  imageTags?: string | null;
  imageSearchProviderRank?: string | null;
  imageConfidence?: string | null;
  imageReason?: string | null;
  imageUpdatedAt?: string | null;
  wikidataEntityId?: string | null;
  wikidataEntityLabel?: string | null;
  commonsFileTitle?: string | null;
  enrichedAt?: string;
  enrichmentVersion?: number;
  enrichmentStatus?: EnrichmentStatus;
  translationSource?: EnrichmentSource;
  definitionSource?: EnrichmentSource | null;
  imageSource?: EnrichmentSource | null;
  wiktionaryLookupWord?: string;
  /** Actual gloss language used for the stored translation (may differ from `targetLanguage`). */
  translationTargetLanguage?: string;
  enrichmentErrors?: EnrichmentErrors;
};

export type EnrichmentOptions = {
  force?: boolean;
  corpusMap?: Map<string, LessonChunkMetadata>;
  lexemeLookup?: Map<string, LessonChunkMetadata>;
  /** Test hook: replace default `/api/image-search` fetch. */
  imageSearchLookup?: (input: ImageSearchInput) => Promise<ImageProviderResult | null>;
  /** @deprecated Use `imageSearchLookup`. */
  wikimediaImageLookup?: (
    input: WikimediaImageLookupInput
  ) => Promise<WikimediaImageResult | null>;
  skipWikimedia?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function storedEnrichmentVersion(rawRecord: Record<string, unknown>): number | undefined {
  const version = rawRecord.enrichmentVersion;
  return typeof version === "number" && Number.isFinite(version) ? version : undefined;
}

function isCachedAtCurrentVersion(rawRecord: Record<string, unknown>): boolean {
  return storedEnrichmentVersion(rawRecord) === ENRICHMENT_VERSION;
}

function fieldMissing(rawRecord: Record<string, unknown>, key: string, force: boolean): boolean {
  if (force) {
    return true;
  }
  if (isCachedAtCurrentVersion(rawRecord) && nonEmptyString(rawRecord[key])) {
    return false;
  }
  return !nonEmptyString(rawRecord[key]);
}

function wordFromRecord(rawRecord: Record<string, unknown>): UserWildWord | null {
  return parseWildWordCoreFields(rawRecord);
}

function buildLexemeLookup(map: Map<string, LessonChunkMetadata>): Map<string, LessonChunkMetadata> {
  const byLexeme = new Map<string, LessonChunkMetadata>();
  for (const meta of map.values()) {
    if (meta.lexemeKey && !byLexeme.has(meta.lexemeKey)) {
      byLexeme.set(meta.lexemeKey, meta);
    }
  }
  return byLexeme;
}

function resolveCorpusMaps(options?: EnrichmentOptions): {
  corpusMap: Map<string, LessonChunkMetadata>;
  lexemeLookup: Map<string, LessonChunkMetadata>;
} {
  const corpusMap = options?.corpusMap ?? buildLessonChunkMetadataMap();
  const lexemeLookup = options?.lexemeLookup ?? buildLexemeLookup(corpusMap);
  return { corpusMap, lexemeLookup };
}

function translationNeedsEnrichment(
  rawRecord: Record<string, unknown>,
  word: Pick<UserWildWord, "language" | "text">,
  force: boolean
): boolean {
  if (force) {
    return true;
  }

  const { sourceLang, effectiveTargetLang } = resolveWildWordTranslationLanguages(rawRecord, word);
  const storedTranslation = nonEmptyString(rawRecord.translation);
  if (!storedTranslation) {
    return true;
  }

  if (!isCachedAtCurrentVersion(rawRecord)) {
    return false;
  }

  const storedTranslationTarget = nonEmptyString(rawRecord.translationTargetLanguage)?.toLowerCase();
  if (storedTranslationTarget && storedTranslationTarget !== effectiveTargetLang) {
    return true;
  }

  if (!storedTranslationTarget) {
    const rawTarget = nonEmptyString(rawRecord.targetLanguage)?.toLowerCase() ?? "en";
    if (sourceLang === rawTarget) {
      return true;
    }
  }

  if (
    sourceLang !== effectiveTargetLang &&
    storedTranslation.toLowerCase() === word.text.trim().toLowerCase()
  ) {
    return true;
  }

  return false;
}

/** Which enrichment fields still need fetching. Respects cached v1 rows unless `force`. */
export function computeEnrichmentNeeds(
  rawRecord: Record<string, unknown>,
  options?: Pick<EnrichmentOptions, "force">
): EnrichmentNeeds {
  const force = Boolean(options?.force);
  const word = wordFromRecord(rawRecord);
  if (!force && isCachedAtCurrentVersion(rawRecord) && word) {
    const hasImage =
      hasUserWildWordImage(rawRecord) || nonEmptyString(rawRecord.imageUrl);
    const allPresent =
      nonEmptyString(rawRecord.translation) &&
      hasRealDefinition(rawRecord) &&
      hasStoredExplanation(rawRecord, word) &&
      nonEmptyString(rawRecord.phonetic) &&
      hasImage;
    if (allPresent && !translationNeedsEnrichment(rawRecord, word, false)) {
      return {
        translation: false,
        definition: false,
        explanation: false,
        phonetic: false,
        imageUrl: false,
      };
    }
  }
  return {
    translation: word
      ? translationNeedsEnrichment(rawRecord, word, force)
      : fieldMissing(rawRecord, "translation", force),
    definition: definitionNeedsEnrichment(rawRecord, force),
    explanation: word ? explanationNeedsEnrichment(rawRecord, word, force) : false,
    phonetic: fieldMissing(rawRecord, "phonetic", force),
    imageUrl: imageNeedsEnrichment(rawRecord, force),
  };
}

/** Legacy rows that copied translation into `definition` with source `translation-fallback`. */
const TRANSLATION_FALLBACK_DEFINITION_RE =
  /^Means\s+[“"].+[”"]\s+in\s+(?:Spanish|English|French|German|Portuguese|[A-Z]{2,}|[\w\s]+)\.\s*$/u;

export function isFakeTranslationDefinition(
  definition: string | undefined,
  definitionSource?: string
): boolean {
  if (definitionSource?.trim() === "translation-fallback") {
    return true;
  }
  const text = definition?.trim();
  if (!text) {
    return false;
  }
  return TRANSLATION_FALLBACK_DEFINITION_RE.test(text);
}

export function hasRealDefinition(rawRecord: Record<string, unknown>): boolean {
  const definition = nonEmptyString(rawRecord.definition);
  if (!definition) {
    return false;
  }
  if (isFakeTranslationDefinition(definition, nonEmptyString(rawRecord.definitionSource))) {
    return false;
  }
  return Boolean(sanitizeDefinitionForStorage(definition));
}

function cleanTextForStorage(text: string): string {
  return fixCommonMojibake(text.trim());
}

/** Store learner gloss only when mojibake repair succeeded. */
function explanationTextForStorage(text: string): string | undefined {
  const cleaned = cleanTextForStorage(text);
  if (!cleaned || textHasMojibakeMarkers(cleaned)) {
    return undefined;
  }
  return cleaned;
}

function isMojibakeRepairOfStored(existing: string, incoming: string): boolean {
  const trimmed = existing.trim();
  return incoming === cleanTextForStorage(trimmed) && incoming !== trimmed;
}

/** Definition text for My Words UI; excludes translation-as-definition fallbacks. */
export function resolveDisplayDefinition(
  definition: string | undefined,
  definitionSource?: string
): string | null {
  const text = definition?.trim();
  if (!text || isFakeTranslationDefinition(text, definitionSource)) {
    return null;
  }
  const cleaned = cleanWildWordTextForDisplay(text);
  if (!cleaned) {
    return null;
  }
  if (cleaned === WILD_WORD_TEXT_ENCODING_FALLBACK) {
    return cleaned;
  }
  return sanitizeDefinitionForStorage(cleaned);
}

/** Clear mojibake in stored text fields without re-fetching enrichment (exported for tests). */
export function appendMojibakeCleanupPatch(
  rawRecord: Record<string, unknown>,
  patch: WildWordEnrichmentPatch
): void {
  for (const key of ["translation", "definition", "explanation"] as const) {
    const stored = nonEmptyString(rawRecord[key]);
    if (!stored || !storedTextNeedsMojibakeRepair(stored)) {
      continue;
    }
    const cleaned = cleanTextForStorage(stored);
    if (key === "definition") {
      const sanitized = sanitizeDefinitionForStorage(cleaned);
      if (!sanitized) {
        continue;
      }
      patch.definition = sanitized;
      continue;
    }
    patch[key] = cleaned;
  }
}

function definitionNeedsEnrichment(rawRecord: Record<string, unknown>, force: boolean): boolean {
  if (force) {
    return true;
  }
  return !hasRealDefinition(rawRecord);
}

function hasStoredExplanation(
  rawRecord: Record<string, unknown>,
  word: Pick<UserWildWord, "language" | "text">
): boolean {
  if (!hasRealDefinition(rawRecord)) {
    return false;
  }
  const explanation = nonEmptyString(rawRecord.explanation);
  if (!explanation) {
    return false;
  }
  const { effectiveTargetLang } = resolveWildWordTranslationLanguages(rawRecord, word);
  const explanationLanguage = nonEmptyString(rawRecord.explanationLanguage)?.toLowerCase();
  return explanationLanguage === effectiveTargetLang;
}

/** True when a real definition exists but learner-language explanation is missing or stale. */
export function explanationNeedsEnrichment(
  rawRecord: Record<string, unknown>,
  word: Pick<UserWildWord, "language" | "text">,
  force: boolean
): boolean {
  if (!hasRealDefinition(rawRecord)) {
    return false;
  }
  if (force) {
    return true;
  }
  return !hasStoredExplanation(rawRecord, word);
}

export type ExplanationEnrichmentPlan = {
  definitionText: string;
  fromLang: string;
  toLang: string;
};

/** Plan Argos translation of definition into learner language (exported for tests). */
export function planExplanationEnrichment(
  rawRecord: Record<string, unknown>,
  word: Pick<UserWildWord, "language" | "text">,
  force: boolean
): ExplanationEnrichmentPlan | null {
  if (!explanationNeedsEnrichment(rawRecord, word, force)) {
    return null;
  }
  const definitionText = resolveDisplayDefinition(
    nonEmptyString(rawRecord.definition),
    nonEmptyString(rawRecord.definitionSource)
  );
  if (!definitionText) {
    return null;
  }
  const { sourceLang, effectiveTargetLang } = resolveWildWordTranslationLanguages(rawRecord, word);
  const fromLang =
    nonEmptyString(rawRecord.definitionLanguage)?.toLowerCase() ?? sourceLang;
  return { definitionText, fromLang, toLang: effectiveTargetLang };
}

function imageNeedsEnrichment(rawRecord: Record<string, unknown>, force: boolean): boolean {
  if (hasUserWildWordImage(rawRecord)) {
    return false;
  }
  if (!force) {
    return fieldMissing(rawRecord, "imageUrl", false);
  }
  if (!nonEmptyString(rawRecord.imageUrl)) {
    return true;
  }
  return isReplaceableImageSource(rawRecord, { force: true });
}

function finalizePatch(
  rawRecord: Record<string, unknown>,
  patch: WildWordEnrichmentPatch,
  force: boolean
): WildWordEnrichmentPatch {
  const out: WildWordEnrichmentPatch = {
    enrichmentVersion: patch.enrichmentVersion,
    enrichedAt: patch.enrichedAt,
    enrichmentStatus: patch.enrichmentStatus,
    enrichmentErrors: patch.enrichmentErrors,
    translationSource: patch.translationSource,
    definitionSource: patch.definitionSource,
    imageSource: patch.imageSource,
    imageAlt: patch.imageAlt,
    imageAttribution: patch.imageAttribution,
    imageAttributionUrl: patch.imageAttributionUrl,
    imageLicense: patch.imageLicense,
    imageLicenseUrl: patch.imageLicenseUrl,
    imagePageUrl: patch.imagePageUrl,
    imageProvider: patch.imageProvider,
    imageSearchQuery: patch.imageSearchQuery,
    imageTags: patch.imageTags,
    imageSearchProviderRank: patch.imageSearchProviderRank,
    imageConfidence: patch.imageConfidence,
    imageReason: patch.imageReason,
    imageUpdatedAt: patch.imageUpdatedAt,
    wikidataEntityId: patch.wikidataEntityId,
    wikidataEntityLabel: patch.wikidataEntityLabel,
    commonsFileTitle: patch.commonsFileTitle,
    wiktionaryLookupWord: patch.wiktionaryLookupWord,
    translationTargetLanguage: patch.translationTargetLanguage,
    definitionLanguage: patch.definitionLanguage,
  };

  const imageClearKeys = [
    "imageUrl",
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
    "imageSource",
  ] as const;
  for (const key of imageClearKeys) {
    if (patch[key] === WILD_WORD_FIELD_CLEAR) {
      Object.assign(out, { [key]: WILD_WORD_FIELD_CLEAR });
    }
  }

  for (const key of ["translation", "definition", "phonetic", "partOfSpeech", "imageUrl"] as const) {
    if (key === "definition" && patch.definition === WILD_WORD_FIELD_CLEAR) {
      out.definition = WILD_WORD_FIELD_CLEAR;
      continue;
    }
    if (key === "imageUrl" && patch.imageUrl === WILD_WORD_FIELD_CLEAR) {
      out.imageUrl = WILD_WORD_FIELD_CLEAR;
      continue;
    }
    const incoming = nonEmptyString(patch[key]);
    if (!incoming) {
      continue;
    }
    const stored = nonEmptyString(rawRecord[key]);
    if (!force && key === "definition" && hasRealDefinition(rawRecord)) {
      if (!(stored && incoming && isMojibakeRepairOfStored(stored, incoming))) {
        continue;
      }
    } else if (!force && stored) {
      if (!(incoming && isMojibakeRepairOfStored(stored, incoming))) {
        continue;
      }
    }
    if (key === "imageUrl" && hasUserWildWordImage(rawRecord)) {
      continue;
    }
    if (
      key === "imageUrl" &&
      stored &&
      !shouldApplyIncomingImageReplacement(rawRecord, patch, force)
    ) {
      continue;
    }
    out[key] = incoming;
  }

  if (patch.definitionSource === WILD_WORD_FIELD_CLEAR) {
    out.definitionSource = WILD_WORD_FIELD_CLEAR;
  }
  if (patch.definitionLanguage === WILD_WORD_FIELD_CLEAR) {
    out.definitionLanguage = WILD_WORD_FIELD_CLEAR;
  }
  if (patch.explanation === WILD_WORD_FIELD_CLEAR) {
    out.explanation = WILD_WORD_FIELD_CLEAR;
  }
  if (patch.explanationLanguage === WILD_WORD_FIELD_CLEAR) {
    out.explanationLanguage = WILD_WORD_FIELD_CLEAR;
  }
  if (patch.explanationSource === WILD_WORD_FIELD_CLEAR) {
    out.explanationSource = WILD_WORD_FIELD_CLEAR;
  }

  const incomingExplanation = nonEmptyString(patch.explanation);
  if (incomingExplanation) {
    const storedExplanation = nonEmptyString(rawRecord.explanation);
    if (
      force ||
      !storedExplanation ||
      isMojibakeRepairOfStored(storedExplanation, incomingExplanation)
    ) {
      out.explanation = incomingExplanation;
    }
  }
  const incomingExplanationLang = nonEmptyString(patch.explanationLanguage);
  if (incomingExplanationLang) {
    if (force || !nonEmptyString(rawRecord.explanationLanguage)) {
      out.explanationLanguage = incomingExplanationLang;
    }
  }
  const incomingExplanationSource = patch.explanationSource;
  if (
    incomingExplanationSource &&
    incomingExplanationSource !== WILD_WORD_FIELD_CLEAR &&
    (force || !nonEmptyString(rawRecord.explanationSource))
  ) {
    out.explanationSource = incomingExplanationSource;
  }

  const incomingAlt = nonEmptyString(patch.imageAlt);
  if (incomingAlt && !hasUserWildWordImage(rawRecord)) {
    if (force || !nonEmptyString(rawRecord.imageAlt)) {
      out.imageAlt = incomingAlt;
    }
  }

  if (!hasUserWildWordImage(rawRecord)) {
    const imageMetaKeys = [
      "imageAttribution",
      "imageAttributionUrl",
      "imageLicense",
      "imageLicenseUrl",
      "imagePageUrl",
      "imageProvider",
      "imageUpdatedAt",
      "wikidataEntityId",
      "wikidataEntityLabel",
      "commonsFileTitle",
    ] as const;
    for (const key of imageMetaKeys) {
      const incoming = nonEmptyString(patch[key as keyof WildWordEnrichmentPatch]);
      if (!incoming) {
        continue;
      }
      const stored = nonEmptyString(rawRecord[key]);
      if (
        force ||
        !stored ||
        patch.imageSource === "wikimedia" ||
        patch.imageSource === "pexels" ||
        patch.imageSource === "pixabay"
      ) {
        Object.assign(out, { [key]: incoming });
      }
    }
    for (const key of [
      "imageSearchQuery",
      "imageTags",
      "imageSearchProviderRank",
      "imageConfidence",
      "imageReason",
    ] as const) {
      const incoming = nonEmptyString(patch[key]);
      if (!incoming) {
        continue;
      }
      const stored = nonEmptyString(rawRecord[key]);
      if (
        force ||
        !stored ||
        patch.imageSource === "wikimedia" ||
        patch.imageSource === "pexels" ||
        patch.imageSource === "pixabay"
      ) {
        Object.assign(out, { [key]: incoming });
      }
    }
  }

  for (const key of [
    "language",
    "lexemeKey",
    "detectedLanguage",
    "detectedLanguageConfidence",
    "detectedLanguageReason",
  ] as const) {
    const incoming = nonEmptyString(patch[key]);
    if (incoming) {
      out[key] = incoming;
    }
  }

  return out;
}

function computeStatus(
  needs: EnrichmentNeeds,
  patch: WildWordEnrichmentPatch,
  errors: EnrichmentErrors
): EnrichmentStatus {
  const filled = {
    translation: Boolean(nonEmptyString(patch.translation)),
    definition: Boolean(nonEmptyString(patch.definition)),
    phonetic: Boolean(nonEmptyString(patch.phonetic)),
    imageUrl: Boolean(nonEmptyString(patch.imageUrl)),
  };
  const stillMissing =
    (needs.translation && !filled.translation) ||
    (needs.definition && !filled.definition) ||
    (needs.phonetic && !filled.phonetic) ||
    (needs.imageUrl && !filled.imageUrl);
  const hasErrors = Object.keys(errors).length > 0;
  const gainedSomething = filled.translation || filled.definition || filled.phonetic || filled.imageUrl;
  if (!stillMissing && !hasErrors) {
    return "complete";
  }
  if (gainedSomething) {
    return "partial";
  }
  return "failed";
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function formatTranslationPairError(fromLang: string, toLang: string, detail: string): string {
  const pair = `${fromLang} → ${toLang}`;
  const lower = detail.toLowerCase();
  if (lower.includes("timed out") || lower.includes("timeout")) {
    return `Translation timed out for ${pair}.`;
  }
  if (lower.includes("not installed") || lower.includes("translation is not installed")) {
    return `Translation model ${pair} not installed.`;
  }
  if (detail.trim()) {
    return detail.trim();
  }
  return "Translation unavailable.";
}

async function checkTranslationReady(fromLang: string, toLang: string): Promise<boolean> {
  try {
    const url = `/api/translate/status?from=${encodeURIComponent(fromLang)}&to=${encodeURIComponent(toLang)}`;
    const response = await fetchWithTimeout(url, { method: "GET", cache: "no-store" }, TRANSLATION_STATUS_TIMEOUT_MS);
    const payload = (await response.json()) as { ready?: unknown };
    return Boolean(payload.ready);
  } catch {
    return false;
  }
}

/** Whether external image-search may run after corpus and curated (exported for tests). */
export function shouldAttemptExternalImageSearch(params: {
  rawRecord: Record<string, unknown>;
  word: Pick<UserWildWord, "language" | "text">;
  needsImageUrl: boolean;
  working: Record<string, unknown>;
  skipImageSearch?: boolean;
  /** @deprecated Use `skipImageSearch`. */
  skipWikimedia?: boolean;
}): boolean {
  if ((params.skipImageSearch ?? params.skipWikimedia) || !params.needsImageUrl) {
    return false;
  }
  if (hasUserWildWordImage(params.rawRecord)) {
    return false;
  }
  if (!isSupportedWikimediaLanguage(params.word.language)) {
    return false;
  }
  const partOfSpeech =
    nonEmptyString(params.working.partOfSpeech) ?? nonEmptyString(params.rawRecord.partOfSpeech);
  if (isNonImageableLookupTerm(params.word.text, partOfSpeech)) {
    return false;
  }
  return true;
}

/** @deprecated Use `shouldAttemptExternalImageSearch`. */
export const shouldAttemptWikimediaImageEnrichment = shouldAttemptExternalImageSearch;

/** Clear auto image fields when a stored concept icon fails memory-quality (exported for tests). */
export function appendRejectedConceptImageCleanupPatch(
  rawRecord: Record<string, unknown>,
  word: Pick<UserWildWord, "language" | "text">,
  patch: WildWordEnrichmentPatch,
  force: boolean
): void {
  if (!force || hasUserWildWordImage(rawRecord)) {
    return;
  }
  const storedSource = nonEmptyString(rawRecord.imageSource)?.toLowerCase();
  if (storedSource !== "concept" || !nonEmptyString(rawRecord.imageUrl)) {
    return;
  }
  const quality = evaluateImageMemoryQuality({
    text: word.text,
    language: word.language,
    translation: nonEmptyString(rawRecord.translation),
    definition: nonEmptyString(rawRecord.definition),
    explanation: nonEmptyString(rawRecord.explanation),
    partOfSpeech: nonEmptyString(rawRecord.partOfSpeech),
    imageUrl: nonEmptyString(rawRecord.imageUrl),
    imageSource: "concept",
    imageAlt: nonEmptyString(rawRecord.imageAlt),
  });
  if (quality.accepted) {
    return;
  }
  patch.imageUrl = WILD_WORD_FIELD_CLEAR;
  patch.imageSource = WILD_WORD_FIELD_CLEAR;
  patch.imageAlt = WILD_WORD_FIELD_CLEAR;
  patch.imageProvider = WILD_WORD_FIELD_CLEAR;
  patch.imageAttribution = WILD_WORD_FIELD_CLEAR;
  patch.imageAttributionUrl = WILD_WORD_FIELD_CLEAR;
  patch.imageLicense = WILD_WORD_FIELD_CLEAR;
  patch.imageLicenseUrl = WILD_WORD_FIELD_CLEAR;
  patch.imagePageUrl = WILD_WORD_FIELD_CLEAR;
  patch.imageSearchQuery = WILD_WORD_FIELD_CLEAR;
  patch.imageTags = WILD_WORD_FIELD_CLEAR;
  patch.imageSearchProviderRank = WILD_WORD_FIELD_CLEAR;
  patch.imageConfidence = WILD_WORD_FIELD_CLEAR;
  patch.imageReason = WILD_WORD_FIELD_CLEAR;
  patch.imageUpdatedAt = WILD_WORD_FIELD_CLEAR;
  patch.wikidataEntityId = WILD_WORD_FIELD_CLEAR;
  patch.wikidataEntityLabel = WILD_WORD_FIELD_CLEAR;
  patch.commonsFileTitle = WILD_WORD_FIELD_CLEAR;
}

function applyTranslationGlossCleanupToPatch(
  word: Pick<UserWildWord, "language" | "text">,
  working: Record<string, unknown>,
  patch: WildWordEnrichmentPatch,
  rawRecord: Record<string, unknown>,
  force: boolean
): void {
  const { sourceLang, effectiveTargetLang } = resolveWildWordTranslationLanguages(working, word);
  const stored = nonEmptyString(working.translation) ?? nonEmptyString(rawRecord.translation);
  if (!stored) {
    return;
  }
  const partOfSpeech =
    nonEmptyString(working.partOfSpeech) ?? nonEmptyString(rawRecord.partOfSpeech);
  const input = {
    sourceText: word.text,
    sourceLang,
    targetLang: effectiveTargetLang,
    translation: stored,
    partOfSpeech,
  };
  if (!force && !translationGlossNeedsCleanup(input)) {
    return;
  }
  const cleaned = cleanupTranslationGloss(input);
  if (cleaned === stored) {
    return;
  }
  patch.translation = cleaned;
  patch.translationSource =
    (nonEmptyString(patch.translationSource) ??
      nonEmptyString(working.translationSource) ??
      nonEmptyString(rawRecord.translationSource) ??
      "argos") as EnrichmentSource;
  working.translation = cleaned;
}

/** Apply a concept icon lookup result onto an enrichment patch (exported for tests). */
export function applyConceptImageResultToPatch(
  patch: WildWordEnrichmentPatch,
  result: { imageUrl: string; imageSource: "concept"; imageAlt: string },
  setWorking?: (key: string, value: string) => void
): void {
  const updatedAt = new Date().toISOString();
  patch.imageUrl = result.imageUrl;
  patch.imageSource = result.imageSource;
  patch.imageAlt = result.imageAlt;
  patch.imageUpdatedAt = updatedAt;
  if (!setWorking) {
    return;
  }
  setWorking("imageUrl", patch.imageUrl);
  setWorking("imageSource", patch.imageSource);
  if (patch.imageAlt) {
    setWorking("imageAlt", patch.imageAlt);
  }
  if (patch.imageUpdatedAt) {
    setWorking("imageUpdatedAt", patch.imageUpdatedAt);
  }
}

/** Apply licensed provider result onto an enrichment patch (exported for tests). */
export function applyImageSearchResultToPatch(
  patch: WildWordEnrichmentPatch,
  result: ImageProviderResult,
  setWorking?: (key: string, value: string) => void
): void {
  const updatedAt = new Date().toISOString();
  patch.imageUrl = result.imageUrl;
  patch.imageSource = result.imageSource as EnrichmentSource;
  patch.imageProvider = result.imageProvider;
  patch.imageAlt = result.imageAlt;
  patch.imageAttribution = result.imageAttribution;
  patch.imageAttributionUrl = result.imageAttributionUrl;
  patch.imageLicense = result.imageLicense;
  patch.imageLicenseUrl = result.imageLicenseUrl;
  patch.imagePageUrl = result.imagePageUrl;
  patch.imageSearchQuery = result.imageSearchQuery;
  patch.imageTags = result.imageTags;
  patch.imageSearchProviderRank = result.imageSearchProviderRank;
  patch.imageConfidence = result.confidence;
  patch.imageReason = result.reason;
  patch.imageUpdatedAt = updatedAt;
  if (result.wikidataEntityId) {
    patch.wikidataEntityId = result.wikidataEntityId;
  }
  if (result.wikidataEntityLabel) {
    patch.wikidataEntityLabel = result.wikidataEntityLabel;
  }
  if (result.commonsFileTitle) {
    patch.commonsFileTitle = result.commonsFileTitle;
  }
  if (!setWorking) {
    return;
  }
  setWorking("imageUrl", patch.imageUrl);
  setWorking("imageSource", patch.imageSource!);
  if (patch.imageAlt) {
    setWorking("imageAlt", patch.imageAlt);
  }
  if (patch.imageProvider) {
    setWorking("imageProvider", patch.imageProvider);
  }
  if (patch.imageSearchQuery) {
    setWorking("imageSearchQuery", patch.imageSearchQuery);
  }
  if (patch.imageTags) {
    setWorking("imageTags", patch.imageTags);
  }
  if (patch.imageSearchProviderRank) {
    setWorking("imageSearchProviderRank", patch.imageSearchProviderRank);
  }
  if (patch.imageConfidence) {
    setWorking("imageConfidence", patch.imageConfidence);
  }
  if (patch.imageReason) {
    setWorking("imageReason", patch.imageReason);
  }
  if (patch.imageUpdatedAt) {
    setWorking("imageUpdatedAt", patch.imageUpdatedAt);
  }
}

/** Apply a Wikimedia lookup result onto an enrichment patch (exported for tests). */
export function applyWikimediaImageResultToPatch(
  patch: WildWordEnrichmentPatch,
  result: WikimediaImageResult,
  setWorking?: (key: string, value: string) => void
): void {
  applyImageSearchResultToPatch(
    patch,
    {
      ...result,
      confidence: "high",
      reason: "Wikimedia Commons entity image (P18).",
    },
    setWorking
  );
}

async function tryImageSearchEnrichment(params: {
  rawRecord: Record<string, unknown>;
  word: UserWildWord;
  needsImageUrl: boolean;
  working: Record<string, unknown>;
  patch: WildWordEnrichmentPatch;
  errors: EnrichmentErrors;
  options?: EnrichmentOptions;
  setWorking: (key: string, value: string) => void;
}): Promise<void> {
  if (
    !shouldAttemptExternalImageSearch({
      rawRecord: params.rawRecord,
      word: params.word,
      needsImageUrl: params.needsImageUrl,
      working: params.working,
      skipImageSearch: params.options?.skipWikimedia,
    })
  ) {
    return;
  }
  const searchInput: ImageSearchInput = {
    text: params.word.text.trim(),
    language: params.word.language,
    translation:
      nonEmptyString(params.working.translation) ?? nonEmptyString(params.rawRecord.translation),
    definition:
      nonEmptyString(params.working.definition) ?? nonEmptyString(params.patch.definition),
    explanation:
      nonEmptyString(params.working.explanation) ?? nonEmptyString(params.rawRecord.explanation),
    partOfSpeech:
      nonEmptyString(params.working.partOfSpeech) ?? nonEmptyString(params.patch.partOfSpeech),
  };
  let imageError: string | undefined;
  try {
    let result: ImageProviderResult | null = null;
    if (params.options?.imageSearchLookup) {
      result = await params.options.imageSearchLookup(searchInput);
    } else if (params.options?.wikimediaImageLookup) {
      const wiki = await params.options.wikimediaImageLookup({
        text: searchInput.text,
        language: searchInput.language,
        definition: searchInput.definition,
        partOfSpeech: searchInput.partOfSpeech,
      });
      if (wiki) {
        result = {
          ...wiki,
          confidence: "high",
          reason: "Wikimedia Commons entity image (P18).",
        };
      }
    } else {
      const apiResult = await fetchImageSearchFromApi(searchInput);
      if (apiResult.ok) {
        result = apiResult.result;
      } else if (apiResult.status && apiResult.status >= 500) {
        imageError = apiResult.error;
      }
    }
    if (
      result &&
      (result.confidence === "high" || result.confidence === "medium")
    ) {
      const memoryQuality = evaluateImageMemoryQuality({
        text: params.word.text,
        language: params.word.language,
        translation: searchInput.translation,
        definition: searchInput.definition,
        explanation: searchInput.explanation,
        partOfSpeech: searchInput.partOfSpeech,
        imageUrl: result.imageUrl,
        imageSource: result.imageSource,
        imageProvider: result.imageProvider,
        imageAlt: result.imageAlt,
        imageSearchQuery: result.imageSearchQuery,
        imageReason: result.reason,
      });
      if (memoryQuality.accepted) {
        applyImageSearchResultToPatch(params.patch, result, params.setWorking);
        params.patch.imageConfidence = memoryQuality.score;
        params.patch.imageReason = memoryQuality.reason;
        params.setWorking("imageConfidence", params.patch.imageConfidence);
        params.setWorking("imageReason", params.patch.imageReason);
      }
    }
  } catch (error) {
    imageError = error instanceof Error ? error.message : "Image search failed.";
  }
  if (imageError) {
    params.errors.image = imageError;
  }
}

async function fetchImageSearchFromApi(
  input: ImageSearchInput
): Promise<
  | { ok: true; result: ImageProviderResult }
  | { ok: false; error: string; status?: number }
> {
  try {
    const response = await fetchWithTimeout(
      "/api/image-search",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
      TRANSLATION_FETCH_TIMEOUT_MS
    );
    const payload = (await response.json()) as
      | { ok: true; result: ImageProviderResult }
      | { ok: false; error?: string };
    if (!response.ok || !payload.ok) {
      return {
        ok: false,
        status: response.status,
        error: (!payload.ok && payload.error) || "Image search failed.",
      };
    }
    if (!nonEmptyString(payload.result?.imageUrl)) {
      return { ok: false, error: "Image search returned no URL." };
    }
    return { ok: true, result: payload.result };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Image search failed.",
    };
  }
}

function tryConceptIconFallback(params: {
  rawRecord: Record<string, unknown>;
  word: UserWildWord;
  needsImageUrl: boolean;
  working: Record<string, unknown>;
  patch: WildWordEnrichmentPatch;
  setWorking: (key: string, value: string) => void;
}): void {
  if (!params.needsImageUrl || hasUserWildWordImage(params.rawRecord)) {
    return;
  }
  const resolvedSource =
    nonEmptyString(params.patch.imageSource) ?? nonEmptyString(params.working.imageSource);
  if (
    resolvedSource === "wikimedia" ||
    resolvedSource === "pexels" ||
    resolvedSource === "pixabay"
  ) {
    return;
  }
  const conceptInput = {
    language: params.word.language,
    text: params.word.text,
    lexemeKey: params.word.lexemeKey,
    partOfSpeech:
      nonEmptyString(params.working.partOfSpeech) ?? nonEmptyString(params.patch.partOfSpeech),
    definition:
      nonEmptyString(params.working.definition) ?? nonEmptyString(params.patch.definition),
    translation:
      nonEmptyString(params.working.translation) ?? nonEmptyString(params.rawRecord.translation),
  };
  if (!allowsConceptIconFallback(conceptInput)) {
    return;
  }
  if (conceptIconConfidence(conceptInput) === "low") {
    return;
  }
  const concept = lookupConceptWordImage(conceptInput);
  if (!concept) {
    return;
  }
  const memoryQuality = evaluateImageMemoryQuality({
    text: params.word.text,
    language: params.word.language,
    translation: conceptInput.translation,
    definition: conceptInput.definition,
    partOfSpeech: conceptInput.partOfSpeech,
    imageUrl: concept.imageUrl,
    imageSource: concept.imageSource,
    imageAlt: concept.imageAlt,
  });
  if (!memoryQuality.accepted) {
    return;
  }
  applyConceptImageResultToPatch(params.patch, concept, params.setWorking);
  params.patch.imageConfidence = memoryQuality.score;
  params.patch.imageReason = memoryQuality.reason;
  params.setWorking("imageConfidence", params.patch.imageConfidence);
  params.setWorking("imageReason", params.patch.imageReason);
}

async function fetchWiktionary(
  language: string,
  word: string
): Promise<
  | { ok: true; definition?: string; phonetic?: string; partOfSpeech?: string; lookupWord?: string }
  | { ok: false; error: string }
> {
  try {
    const response = await fetchWithTimeout(
      "/api/wiktionary",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, word }),
      },
      TRANSLATION_FETCH_TIMEOUT_MS
    );
    const payload = (await response.json()) as
      | {
          ok: true;
          definition?: string;
          pronunciation?: string;
          partOfSpeech?: string;
          lookupWord?: string;
        }
      | { ok: false; error?: string };
    if (!response.ok || !payload.ok) {
      return {
        ok: false,
        error: (!payload.ok && payload.error) || "Wiktionary lookup failed.",
      };
    }
    const definition = nonEmptyString(payload.definition);
    const phonetic = nonEmptyString(payload.pronunciation);
    const partOfSpeech = nonEmptyString(payload.partOfSpeech);
    const lookupWord = nonEmptyString(payload.lookupWord);
    if (!definition && !phonetic && !partOfSpeech) {
      return { ok: false, error: "No Wiktionary data found." };
    }
    return { ok: true, definition, phonetic, partOfSpeech, lookupWord };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Wiktionary lookup failed.",
    };
  }
}

async function fetchTranslation(
  text: string,
  fromLang: string,
  toLang: string
): Promise<{ ok: true; translation: string } | { ok: false; error: string }> {
  const ready = await checkTranslationReady(fromLang, toLang);
  if (!ready) {
    return {
      ok: false,
      error: formatTranslationPairError(fromLang, toLang, "not installed"),
    };
  }

  try {
    const response = await fetchWithTimeout(
      "/api/translate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, from: fromLang, to: toLang }),
      },
      TRANSLATION_FETCH_TIMEOUT_MS
    );
    const payload = (await response.json()) as
      | { ok: true; translation: string }
      | { ok: false; error?: string };
    if (response.ok && payload.ok && nonEmptyString(payload.translation)) {
      return { ok: true, translation: cleanTextForStorage(payload.translation) };
    }
    const rawError = !payload.ok && payload.error ? payload.error : "Translation unavailable.";
    return {
      ok: false,
      error: formatTranslationPairError(fromLang, toLang, rawError),
    };
  } catch (error) {
    return {
      ok: false,
      error: formatTranslationPairError(
        fromLang,
        toLang,
        error instanceof Error ? error.message : "Translation unavailable."
      ),
    };
  }
}

function isFallbackDefinition(definition: string): boolean {
  return definition.toLowerCase().includes("no clear definition found");
}

function definitionLanguageForSource(sourceLang: string): string | undefined {
  const normalized = sourceLang.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

/** Infer `definitionLanguage` for rows that have a real definition but omit the field. */
export function buildDefinitionLanguageInferencePatch(
  rawRecord: Record<string, unknown>,
  word: UserWildWord
): Pick<WildWordEnrichmentPatch, "definitionLanguage"> | null {
  if (!hasRealDefinition(rawRecord)) {
    return null;
  }
  if (nonEmptyString(rawRecord.definitionLanguage)) {
    return null;
  }
  const { sourceLang } = resolveWildWordTranslationLanguages(rawRecord, word);
  const definitionLanguage = definitionLanguageForSource(sourceLang);
  return definitionLanguage ? { definitionLanguage } : null;
}

function appendDefinitionLanguageInference(
  rawRecord: Record<string, unknown>,
  working: Record<string, unknown>,
  word: UserWildWord,
  patch: WildWordEnrichmentPatch
): void {
  if (nonEmptyString(working.definitionLanguage) || nonEmptyString(rawRecord.definitionLanguage)) {
    return;
  }
  const recordForCheck = hasRealDefinition(working) ? working : rawRecord;
  if (!hasRealDefinition(recordForCheck)) {
    return;
  }
  const { sourceLang } = resolveWildWordTranslationLanguages(working, word);
  const definitionLanguage = definitionLanguageForSource(sourceLang);
  if (!definitionLanguage) {
    return;
  }
  patch.definitionLanguage = definitionLanguage;
  working.definitionLanguage = definitionLanguage;
}

function definitionFromCorpusMeanings(meta: LessonChunkMetadata): string | undefined {
  const meanings = meta.acceptedMeanings?.map((m) => m.trim()).filter(Boolean) ?? [];
  if (meanings.length === 0) {
    return undefined;
  }
  const joined = meanings.slice(0, 3).join("; ");
  return sanitizeDefinitionForStorage(joined) ?? undefined;
}

function storedDefinitionIsUnusable(definition: string | undefined, source: string | undefined): boolean {
  if (!definition?.trim()) {
    return false;
  }
  if (isFakeTranslationDefinition(definition, source)) {
    return true;
  }
  return isRejectedDefinitionText(definition) || !sanitizeDefinitionForStorage(definition);
}

function stripInvalidDefinitionInPlace(record: Record<string, unknown>): void {
  const definition = nonEmptyString(record.definition);
  const source = nonEmptyString(record.definitionSource);
  if (!storedDefinitionIsUnusable(definition, source)) {
    return;
  }
  delete record.definition;
  delete record.definitionSource;
  delete record.definitionLanguage;
  delete record.explanation;
  delete record.explanationLanguage;
  delete record.explanationSource;
}

/** Exported for unit tests: clears fake or raw-markup definitions on refresh. */
export function appendFakeDefinitionCleanupPatch(
  rawRecord: Record<string, unknown>,
  working: Record<string, unknown>,
  patch: WildWordEnrichmentPatch
): void {
  const rawDefinition = nonEmptyString(rawRecord.definition);
  const rawSource = nonEmptyString(rawRecord.definitionSource);
  if (!storedDefinitionIsUnusable(rawDefinition, rawSource)) {
    return;
  }
  if (hasRealDefinition(working) || nonEmptyString(patch.definition)) {
    return;
  }
  patch.definition = WILD_WORD_FIELD_CLEAR;
  patch.definitionSource = WILD_WORD_FIELD_CLEAR;
  patch.definitionLanguage = WILD_WORD_FIELD_CLEAR;
  patch.explanation = WILD_WORD_FIELD_CLEAR;
  patch.explanationLanguage = WILD_WORD_FIELD_CLEAR;
  patch.explanationSource = WILD_WORD_FIELD_CLEAR;
}

/** Clear orphan explanations when there is no real definition (exported for tests). */
export function appendOrphanExplanationCleanupPatch(
  rawRecord: Record<string, unknown>,
  patch: WildWordEnrichmentPatch
): void {
  if (hasRealDefinition(rawRecord)) {
    return;
  }
  const hasExplanation =
    nonEmptyString(rawRecord.explanation) ||
    nonEmptyString(rawRecord.explanationLanguage) ||
    nonEmptyString(rawRecord.explanationSource);
  if (!hasExplanation) {
    return;
  }
  patch.explanation = WILD_WORD_FIELD_CLEAR;
  patch.explanationLanguage = WILD_WORD_FIELD_CLEAR;
  patch.explanationSource = WILD_WORD_FIELD_CLEAR;
}

async function applyExplanationEnrichment(
  rawRecord: Record<string, unknown>,
  working: Record<string, unknown>,
  word: UserWildWord,
  patch: WildWordEnrichmentPatch,
  force: boolean
): Promise<void> {
  appendOrphanExplanationCleanupPatch(working, patch);
  if (patch.explanation === WILD_WORD_FIELD_CLEAR) {
    delete working.explanation;
    delete working.explanationLanguage;
    delete working.explanationSource;
  }

  const plan = planExplanationEnrichment(working, word, force);
  if (!plan) {
    return;
  }

  if (plan.fromLang === plan.toLang) {
    const explanation = explanationTextForStorage(plan.definitionText);
    if (!explanation) {
      return;
    }
    patch.explanation = explanation;
    patch.explanationLanguage = plan.toLang;
    const defSource = nonEmptyString(working.definitionSource) ?? nonEmptyString(rawRecord.definitionSource);
    patch.explanationSource = (defSource as EnrichmentSource | undefined) ?? "argos";
    working.explanation = explanation;
    working.explanationLanguage = plan.toLang;
    working.explanationSource = patch.explanationSource;
    return;
  }

  const translated = await fetchTranslation(plan.definitionText, plan.fromLang, plan.toLang);
  if (translated.ok) {
    const explanation = explanationTextForStorage(translated.translation);
    if (!explanation) {
      return;
    }
    patch.explanation = explanation;
    patch.explanationLanguage = plan.toLang;
    patch.explanationSource = "argos";
    working.explanation = patch.explanation;
    working.explanationLanguage = plan.toLang;
    working.explanationSource = "argos";
  }
}

function devLogLanguageRepair(
  repair: ReturnType<typeof planWildWordLanguageRepairForEnrichment>,
  wordText: string
): void {
  if (!isMyWordsDebugEnabled() || !repair) {
    return;
  }
  console.info("[LR][language repair]", {
    word: wordText,
    previousLanguage: repair.previousLanguage,
    repairedLanguage: repair.repairedLanguage,
    reason: repair.reason,
    contextUsed: repair.contextUsed,
    contextScore: repair.contextScore,
  });
}

function applyLanguageRepairToWorkingRecord(
  rawRecord: Record<string, unknown>,
  working: Record<string, unknown>,
  word: UserWildWord
): {
  word: UserWildWord;
  repairPatch: WildWordEnrichmentPatch;
} | null {
  const repair = planWildWordLanguageRepairForEnrichment(rawRecord);
  if (!repair) {
    return null;
  }

  Object.assign(working, repair.patch);
  const repairedWord: UserWildWord = {
    ...word,
    language: repair.repairedLanguage,
    lexemeKey: nonEmptyString(repair.patch.lexemeKey) ?? word.lexemeKey,
  };

  delete working.translationTargetLanguage;

  const storedTranslation = nonEmptyString(working.translation);
  if (storedTranslation && translationLooksLikeStaleIdentity(repairedWord.text, storedTranslation)) {
    delete working.translation;
  }

  devLogLanguageRepair(repair, word.text);

  return {
    word: repairedWord,
    repairPatch: {
      language: repair.repairedLanguage,
      lexemeKey: nonEmptyString(repair.patch.lexemeKey),
      detectedLanguage: nonEmptyString(repair.patch.detectedLanguage),
      detectedLanguageConfidence: nonEmptyString(repair.patch.detectedLanguageConfidence),
      detectedLanguageReason: nonEmptyString(repair.patch.detectedLanguageReason),
    },
  };
}

/**
 * Enrich one wild-word raw record. Never throws; returns a patch to merge into storage.
 */
export async function enrichWildWordRecord(
  rawRecord: Record<string, unknown>,
  options?: EnrichmentOptions
): Promise<WildWordEnrichmentPatch> {
  if (!isRecord(rawRecord)) {
    return {
      enrichmentStatus: "failed",
      enrichmentVersion: ENRICHMENT_VERSION,
      enrichmentErrors: { translation: "Invalid record." },
    };
  }

  const force = Boolean(options?.force);
  const word = wordFromRecord(rawRecord);
  if (!word) {
    return {
      enrichmentStatus: "failed",
      enrichmentVersion: ENRICHMENT_VERSION,
      enrichmentErrors: { translation: "Missing id, text, or language." },
    };
  }

  const working: Record<string, unknown> = { ...rawRecord };
  stripInvalidDefinitionInPlace(working);
  const languageRepair = applyLanguageRepairToWorkingRecord(rawRecord, working, word);
  const enrichedWord = languageRepair?.word ?? word;

  const needs = computeEnrichmentNeeds(working, { force });
  if (!needs.translation && !needs.definition && !needs.phonetic && !needs.imageUrl) {
    const definitionLanguagePatch = buildDefinitionLanguageInferencePatch(working, enrichedWord);
    const explanationOnlyPatch: WildWordEnrichmentPatch = {
      enrichmentVersion: ENRICHMENT_VERSION,
      enrichedAt: new Date().toISOString(),
      translationTargetLanguage: resolveWildWordTranslationLanguages(working, enrichedWord).effectiveTargetLang,
      ...definitionLanguagePatch,
      ...(languageRepair?.repairPatch ?? {}),
    };
    appendOrphanExplanationCleanupPatch(working, explanationOnlyPatch);
    appendMojibakeCleanupPatch(working, explanationOnlyPatch);
    if (needs.explanation) {
      await applyExplanationEnrichment(rawRecord, working, enrichedWord, explanationOnlyPatch, force);
    }
    const hasMojibakePatch =
      explanationOnlyPatch.translation !== undefined ||
      explanationOnlyPatch.definition !== undefined ||
      (explanationOnlyPatch.explanation !== undefined &&
        explanationOnlyPatch.explanation !== WILD_WORD_FIELD_CLEAR);
    const hasExplanationPatch =
      nonEmptyString(explanationOnlyPatch.explanation) ||
      explanationOnlyPatch.explanation === WILD_WORD_FIELD_CLEAR;
    if (languageRepair || definitionLanguagePatch || hasExplanationPatch || hasMojibakePatch) {
      const finalized = finalizePatch(rawRecord, explanationOnlyPatch, force);
      finalized.enrichmentStatus = "complete";
      finalized.enrichmentErrors = {};
      return finalized;
    }
    return {
      enrichmentStatus: "complete",
      enrichmentVersion: ENRICHMENT_VERSION,
      enrichedAt: nonEmptyString(rawRecord.enrichedAt) ?? new Date().toISOString(),
      enrichmentErrors: {},
    };
  }

  try {
    return await enrichWildWordRecordInner(
      rawRecord,
      enrichedWord,
      working,
      needs,
      force,
      options,
      languageRepair?.repairPatch
    );
  } catch (error) {
    const { effectiveTargetLang } = resolveWildWordTranslationLanguages(working, enrichedWord);
    return {
      ...(languageRepair?.repairPatch ?? {}),
      enrichmentStatus: "failed",
      enrichmentVersion: ENRICHMENT_VERSION,
      enrichedAt: new Date().toISOString(),
      translationTargetLanguage: effectiveTargetLang,
      enrichmentErrors: {
        translation: error instanceof Error ? error.message : "Enrichment failed.",
      },
    };
  }
}

async function enrichWildWordRecordInner(
  rawRecord: Record<string, unknown>,
  word: UserWildWord,
  working: Record<string, unknown>,
  needs: EnrichmentNeeds,
  force: boolean,
  options?: EnrichmentOptions,
  languageRepairPatch?: WildWordEnrichmentPatch
): Promise<WildWordEnrichmentPatch> {
  const { effectiveTargetLang } = resolveWildWordTranslationLanguages(working, word);
  const { corpusMap, lexemeLookup } = resolveCorpusMaps(options);
  const errors: EnrichmentErrors = {};

  const patch: WildWordEnrichmentPatch = {
    enrichmentVersion: ENRICHMENT_VERSION,
    enrichedAt: new Date().toISOString(),
    translationTargetLanguage: effectiveTargetLang,
    ...languageRepairPatch,
  };

  function setWorking(key: string, value: string): void {
    working[key] = value;
  }

  // A. Lesson corpus
  const corpusLookup = lookupLessonChunkMetadata({ rawRecord: working, word, corpusMap, lexemeLookup });
  const corpusMeta = corpusLookup.meta;

  if (corpusMeta) {
    const corpusTranslation = nonEmptyString(corpusMeta.translation);
    if (needs.translation && corpusTranslation) {
      patch.translation = corpusTranslation;
      patch.translationSource = "lesson";
      setWorking("translation", patch.translation);
    }
    const corpusPhonetic = nonEmptyString(corpusMeta.phonetic);
    if (needs.phonetic && corpusPhonetic) {
      patch.phonetic = corpusPhonetic;
      setWorking("phonetic", patch.phonetic);
    }
    const corpusImage = nonEmptyString(corpusMeta.image);
    if (needs.imageUrl && corpusImage && !hasUserWildWordImage(rawRecord)) {
      patch.imageUrl = corpusImage;
      patch.imageSource = "lesson";
      setWorking("imageUrl", patch.imageUrl);
    }
    const corpusPos = nonEmptyString(corpusMeta.partOfSpeech);
    if (corpusPos) {
      patch.partOfSpeech = corpusPos;
      setWorking("partOfSpeech", patch.partOfSpeech);
    }
    const corpusDefinition = definitionFromCorpusMeanings(corpusMeta);
    if (needs.definition && corpusDefinition) {
      const corpusSourceLang = resolveWildWordTranslationLanguages(working, word).sourceLang;
      patch.definition = corpusDefinition;
      patch.definitionSource = "lesson";
      patch.definitionLanguage = definitionLanguageForSource(corpusSourceLang);
      setWorking("definition", patch.definition);
      setWorking("definitionSource", patch.definitionSource);
      if (patch.definitionLanguage) {
        setWorking("definitionLanguage", patch.definitionLanguage);
      }
    }
  }

  const postCorpusImageNeeds = computeEnrichmentNeeds(working, { force });
  const storedImageSource = nonEmptyString(rawRecord.imageSource);
  appendRejectedConceptImageCleanupPatch(rawRecord, word, patch, force);
  if (patch.imageUrl === WILD_WORD_FIELD_CLEAR) {
    for (const key of [
      "imageUrl",
      "imageSource",
      "imageAlt",
      "imageProvider",
      "imageConfidence",
      "imageReason",
      "imageSearchQuery",
      "imageAttribution",
      "imageAttributionUrl",
      "imageLicense",
      "imageLicenseUrl",
      "imagePageUrl",
      "imageTags",
      "imageSearchProviderRank",
      "imageUpdatedAt",
      "wikidataEntityId",
      "wikidataEntityLabel",
      "commonsFileTitle",
    ] as const) {
      delete working[key];
    }
  }
  const skipBundledOnForce = shouldSkipBundledImageOnForceRefresh(rawRecord, force);
  if (skipBundledOnForce) {
    delete working.imageUrl;
    delete working.imageSource;
    delete working.imageAlt;
    delete working.imageProvider;
    delete working.imageConfidence;
    delete working.imageReason;
    delete working.imageSearchQuery;
  }
  if (
    postCorpusImageNeeds.imageUrl &&
    !hasUserWildWordImage(rawRecord) &&
    storedImageSource !== "user" &&
    !skipBundledOnForce
  ) {
    const curated = lookupCuratedWordImage({
      language: word.language,
      text: word.text,
      lexemeKey: word.lexemeKey,
      partOfSpeech: nonEmptyString(working.partOfSpeech) ?? nonEmptyString(patch.partOfSpeech),
    });
    if (curated) {
      patch.imageUrl = curated.imageUrl;
      patch.imageSource = curated.imageSource;
      patch.imageAlt = curated.imageAlt;
      setWorking("imageUrl", patch.imageUrl);
      setWorking("imageSource", patch.imageSource);
      setWorking("imageAlt", patch.imageAlt);
    }
  }

  const postCuratedImageNeeds = computeEnrichmentNeeds(working, { force });
  await tryImageSearchEnrichment({
    rawRecord,
    word,
    needsImageUrl: postCuratedImageNeeds.imageUrl,
    working,
    patch,
    errors,
    options,
    setWorking,
  });

  const postExternalImageNeeds = computeEnrichmentNeeds(working, { force });
  if (
    postExternalImageNeeds.imageUrl &&
    !hasUserWildWordImage(rawRecord) &&
    storedImageSource !== "user"
  ) {
    tryConceptIconFallback({
      rawRecord,
      word,
      needsImageUrl: postExternalImageNeeds.imageUrl,
      working,
      patch,
      setWorking,
    });
  }

  const refreshedNeeds = computeEnrichmentNeeds(working, { force });

  // B. Wiktionary (Spanish or English source)
  const postRepairSourceLang = resolveWildWordTranslationLanguages(working, word).sourceLang;
  if (refreshedNeeds.definition && isSupportedWiktionaryLanguage(postRepairSourceLang)) {
    const wiki = await fetchWiktionary(postRepairSourceLang, word.text.trim());
    if (wiki.ok) {
      const wikiDefinition = sanitizeDefinitionForStorage(wiki.definition);
      if (wikiDefinition && !isFallbackDefinition(wikiDefinition)) {
        if (refreshedNeeds.definition) {
          patch.definition = wikiDefinition;
          patch.definitionSource = "wiktionary";
          patch.definitionLanguage = definitionLanguageForSource(postRepairSourceLang);
          setWorking("definition", patch.definition);
          setWorking("definitionSource", patch.definitionSource);
          if (patch.definitionLanguage) {
            setWorking("definitionLanguage", patch.definitionLanguage);
          }
        }
      }
      if (refreshedNeeds.phonetic && wiki.phonetic) {
        patch.phonetic = wiki.phonetic;
        setWorking("phonetic", patch.phonetic);
      }
      if (wiki.partOfSpeech) {
        patch.partOfSpeech = wiki.partOfSpeech;
        setWorking("partOfSpeech", patch.partOfSpeech);
      }
      if (wiki.lookupWord) {
        patch.wiktionaryLookupWord = wiki.lookupWord;
      }
    } else if (refreshedNeeds.definition) {
      errors.definition = wiki.error;
    }
  }

  const postWikiNeeds = computeEnrichmentNeeds(working, { force });
  const { sourceLang: translateFrom, effectiveTargetLang: translateTo } =
    resolveWildWordTranslationLanguages(working, word);

  // C. Argos translate
  if (postWikiNeeds.translation) {
    const translated = await fetchTranslation(word.text.trim(), translateFrom, translateTo);
    if (translated.ok) {
      patch.translation = cleanupTranslationGloss({
        sourceText: word.text,
        sourceLang: translateFrom,
        targetLang: translateTo,
        translation: translated.translation,
        partOfSpeech:
          nonEmptyString(working.partOfSpeech) ?? nonEmptyString(patch.partOfSpeech),
      });
      patch.translationSource = "argos";
      setWorking("translation", patch.translation);
    } else {
      errors.translation = translated.error;
    }
  }

  applyTranslationGlossCleanupToPatch(word, working, patch, rawRecord, force);

  appendFakeDefinitionCleanupPatch(rawRecord, working, patch);
  appendDefinitionLanguageInference(rawRecord, working, word, patch);
  appendOrphanExplanationCleanupPatch(working, patch);
  appendMojibakeCleanupPatch(working, patch);
  await applyExplanationEnrichment(rawRecord, working, word, patch, force);

  const finalPatch = finalizePatch(rawRecord, patch, force);
  finalPatch.enrichmentStatus = computeStatus(needs, finalPatch, errors);
  const resolvedErrors: EnrichmentErrors = { ...errors };
  if (nonEmptyString(finalPatch.translation)) {
    delete resolvedErrors.translation;
  }
  if (nonEmptyString(finalPatch.definition)) {
    delete resolvedErrors.definition;
  }
  if (nonEmptyString(finalPatch.imageUrl)) {
    delete resolvedErrors.image;
  }
  finalPatch.enrichmentErrors =
    finalPatch.enrichmentStatus === "complete" ? {} : resolvedErrors;
  finalPatch.enrichmentVersion = ENRICHMENT_VERSION;
  finalPatch.enrichedAt = new Date().toISOString();
  finalPatch.translationTargetLanguage =
    resolveWildWordTranslationLanguages(working, word).effectiveTargetLang;

  if (needs.imageUrl) {
    devLogMyWordsImagePipeline("enrich", {
      text: word.text,
      language: word.language,
      lexemeKey: word.lexemeKey ?? null,
      corpusLookupAttempts: corpusLookup.diag.attemptedLookupKeys,
      corpusMatchFound: Boolean(corpusLookup.meta),
      corpusMetaImage: corpusLookup.meta?.image ?? null,
      patchImageUrlPreFinalize: patch.imageUrl ?? null,
      finalPatchImageUrl: finalPatch.imageUrl ?? null,
      patchWildWordRecordsByIdCalledHere: false,
      note: "Persistence runs in the caller (e.g. MyWordsClient) after this promise resolves.",
    });
  }

  return finalPatch;
}
