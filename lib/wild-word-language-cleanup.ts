import { buildLexemeKey } from "@/lib/lexeme-key";
import {
  isUsableDetection,
  resolveContextSentenceLanguage,
  resolveSelectedTextLanguage,
  resolveWildWordDetectLanguage,
} from "@/lib/language-detect";
import { WILD_WORD_FIELD_CLEAR } from "@/lib/wild-word-image-patch";

export type WildWordLanguageCleanupOutcome = "updated" | "unchanged" | "skipped_low_confidence" | "invalid";

export type WildWordLanguageCleanupSummary = {
  updated: number;
  unchanged: number;
  skippedLowConfidence: number;
  invalid: number;
};

export type WildWordLanguageCleanupRowResult = {
  id: string;
  outcome: WildWordLanguageCleanupOutcome;
  patch?: Record<string, unknown>;
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

const STALE_ENRICHMENT_KEYS_ON_LANGUAGE_CHANGE = [
  "translation",
  "translationSource",
  "translationTargetLanguage",
  "enrichedAt",
  "enrichmentStatus",
  "definition",
  "definitionSource",
  "definitionLanguage",
  "explanation",
  "explanationLanguage",
  "explanationSource",
] as const;

/**
 * Patch fragment that clears enrichment fields tied to the previous source language.
 * Uses {@link WILD_WORD_FIELD_CLEAR} so {@link patchWildWordRecordsById} deletes keys.
 */
export function buildStaleEnrichmentClearOnLanguageChangePatch(
  rawRecord: Record<string, unknown>
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  for (const key of STALE_ENRICHMENT_KEYS_ON_LANGUAGE_CHANGE) {
    if (key in rawRecord) {
      patch[key] = WILD_WORD_FIELD_CLEAR;
    }
  }

  if (isRecord(rawRecord.enrichmentErrors)) {
    const errors = { ...rawRecord.enrichmentErrors };
    delete errors.translation;
    if (Object.keys(errors).length === 0) {
      patch.enrichmentErrors = WILD_WORD_FIELD_CLEAR;
    } else {
      patch.enrichmentErrors = errors;
    }
  }

  return patch;
}

function detectionFieldsMatch(
  rawRecord: Record<string, unknown>,
  language: string,
  confidence: string,
  reason: string
): boolean {
  const storedLang = nonEmptyString(rawRecord.language)?.toLowerCase();
  const storedDetected = nonEmptyString(rawRecord.detectedLanguage)?.toLowerCase();
  const storedConfidence = nonEmptyString(rawRecord.detectedLanguageConfidence);
  const storedReason = nonEmptyString(rawRecord.detectedLanguageReason);
  return (
    storedLang === language.toLowerCase() &&
    storedDetected === language.toLowerCase() &&
    storedConfidence === confidence &&
    storedReason === reason
  );
}

/**
 * Build a language cleanup patch for one wild-word row.
 * Does not mutate the input record.
 */
export function buildWildWordLanguageCleanupPatch(
  rawRecord: Record<string, unknown>
): WildWordLanguageCleanupRowResult {
  if (!isRecord(rawRecord)) {
    return { id: "", outcome: "invalid" };
  }

  const id = nonEmptyString(rawRecord.id);
  const text = nonEmptyString(rawRecord.text);
  if (!id || !text) {
    return { id: id ?? "", outcome: "invalid" };
  }

  const contextSentence = nonEmptyString(rawRecord.contextSentence);
  const detection = resolveWildWordDetectLanguage(text, contextSentence);
  if (!detection) {
    return { id, outcome: "skipped_low_confidence" };
  }

  const language = detection.language;
  const lexemeKey = buildLexemeKey(language, text);
  const detectedLanguage = language;
  const detectedLanguageConfidence = detection.confidence;
  const detectedLanguageReason = detection.reason;

  const storedLexemeKey = nonEmptyString(rawRecord.lexemeKey);
  const languageChanged = nonEmptyString(rawRecord.language)?.toLowerCase() !== language.toLowerCase();
  const lexemeChanged = storedLexemeKey !== lexemeKey;
  const metadataChanged = !detectionFieldsMatch(
    rawRecord,
    language,
    detectedLanguageConfidence,
    detectedLanguageReason
  );

  if (!languageChanged && !lexemeChanged && !metadataChanged) {
    return { id, outcome: "unchanged" };
  }

  const patch: Record<string, unknown> = {
    language,
    lexemeKey,
    detectedLanguage,
    detectedLanguageConfidence,
    detectedLanguageReason,
  };

  if (languageChanged) {
    Object.assign(patch, buildStaleEnrichmentClearOnLanguageChangePatch(rawRecord));
  }

  return {
    id,
    outcome: "updated",
    patch,
  };
}

/** Run cleanup across all stored rows; returns patches and summary counts. */
export function planWildWordLanguageCleanup(
  rows: Record<string, unknown>[]
): { patches: Map<string, Record<string, unknown>>; summary: WildWordLanguageCleanupSummary } {
  const patches = new Map<string, Record<string, unknown>>();
  const summary: WildWordLanguageCleanupSummary = {
    updated: 0,
    unchanged: 0,
    skippedLowConfidence: 0,
    invalid: 0,
  };

  for (const row of rows) {
    const result = buildWildWordLanguageCleanupPatch(row);
    if (result.outcome === "updated" && result.patch) {
      patches.set(result.id, result.patch);
      summary.updated += 1;
    } else if (result.outcome === "unchanged") {
      summary.unchanged += 1;
    } else if (result.outcome === "skipped_low_confidence") {
      summary.skippedLowConfidence += 1;
    } else {
      summary.invalid += 1;
    }
  }

  return { patches, summary };
}

export function formatWildWordLanguageCleanupSummary(summary: WildWordLanguageCleanupSummary): string {
  return `Updated ${summary.updated}, skipped ${summary.skippedLowConfidence} low-confidence.`;
}

export type WildWordLanguageRepairPlan = {
  patch: Record<string, unknown>;
  previousLanguage: string;
  repairedLanguage: string;
  reason: string;
  contextUsed: boolean;
  contextScore: string | null;
};

/**
 * Medium-or-high-confidence detection that disagrees with stored `language`.
 * Used by My Words enrichment before translation.
 */
export function planWildWordLanguageRepairForEnrichment(
  rawRecord: Record<string, unknown>
): WildWordLanguageRepairPlan | null {
  const result = buildWildWordLanguageCleanupPatch(rawRecord);
  if (result.outcome !== "updated" || !result.patch) {
    return null;
  }

  const previousLanguage = nonEmptyString(rawRecord.language) ?? "";
  const repairedLanguage = String(result.patch.language);
  if (previousLanguage.toLowerCase() === repairedLanguage.toLowerCase()) {
    return null;
  }

  const text = nonEmptyString(rawRecord.text);
  const contextSentence = nonEmptyString(rawRecord.contextSentence);
  const tokenDetection = text ? resolveSelectedTextLanguage(text) : null;
  const contextDetection = contextSentence ? resolveContextSentenceLanguage(contextSentence) : null;
  const contextUsed = Boolean(
    tokenDetection &&
      !isUsableDetection(tokenDetection) &&
      contextDetection &&
      isUsableDetection(contextDetection)
  );

  return {
    patch: result.patch,
    previousLanguage,
    repairedLanguage,
    reason: String(result.patch.detectedLanguageReason ?? ""),
    contextUsed,
    contextScore: contextDetection?.reason ?? null,
  };
}

export function translationLooksLikeStaleIdentity(sourceText: string, translation: string): boolean {
  return translation.trim().toLowerCase() === sourceText.trim().toLowerCase();
}
