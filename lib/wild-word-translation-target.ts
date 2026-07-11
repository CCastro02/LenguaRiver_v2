/**
 * Single source of truth for wild-word translation direction (enrichment + Argos).
 *
 * Uses **presentation** `sourceLang` (display/TTS-adjusted) vs stored **`targetLanguage`** vs
 * **`effectiveTargetLang`** after same-language conflict resolution.
 */

import { buildWildWordLanguagePresentation } from "@/lib/wild-word-extension-display";
import { DEFAULT_EXPLANATION_TARGET_LANGUAGE } from "@/lib/wild-word-schema";

export type WildWordTranslationLanguages = {
  /** Language of the saved word for translation requests (after extension display fixes). */
  sourceLang: string;
  /** Stored learner gloss language from the row (`targetLanguage` or product default). */
  targetLang: string;
  /** Language used for translation after same-language conflict resolution. */
  effectiveTargetLang: string;
  /** TTS / speech code from presentation layer. */
  speechLang: string;
};

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * When source and stored target collide, pick a useful opposite gloss language.
 *
 * Rules: `en` → `es`, `es` → `en`, all other → `en`.
 */
export function fallbackOppositeTarget(sourceLang: string): string {
  const source = sourceLang.trim().toLowerCase();
  if (source === "en") {
    return "es";
  }
  if (source === "es") {
    return "en";
  }
  return "en";
}

/** Resolve gloss language for Argos when `targetLanguage` matches `sourceLang`. */
export function resolveEffectiveTranslationTarget(sourceLang: string, targetLang: string): string {
  const source = sourceLang.trim().toLowerCase();
  const target = targetLang.trim().toLowerCase();
  if (source === target) {
    return fallbackOppositeTarget(source);
  }
  return target;
}

/** Stored `targetLanguage` or {@link DEFAULT_EXPLANATION_TARGET_LANGUAGE} (enrichment default; not extension legacy). */
export function resolveStoredTargetLanguage(rawRecord: Record<string, unknown>): string {
  return nonEmptyString(rawRecord.targetLanguage)?.toLowerCase() ?? DEFAULT_EXPLANATION_TARGET_LANGUAGE;
}

/** Resolve source/target languages for enrichment, TTS, and translation status checks. */
export function resolveWildWordTranslationLanguages(
  rawRecord: Record<string, unknown>,
  word: { language: string; text: string }
): WildWordTranslationLanguages {
  const presentation = buildWildWordLanguagePresentation(rawRecord, word);
  const sourceLang = presentation.speechCode.trim().toLowerCase() || word.language.trim().toLowerCase();
  const targetLang = resolveStoredTargetLanguage(rawRecord);
  const effectiveTargetLang = resolveEffectiveTranslationTarget(sourceLang, targetLang);
  return {
    sourceLang,
    targetLang,
    effectiveTargetLang,
    speechLang: presentation.speechCode.trim().toLowerCase() || sourceLang,
  };
}

/** @deprecated Use {@link resolveWildWordTranslationLanguages}. */
export const resolveEnrichmentLanguages = resolveWildWordTranslationLanguages;

/** @deprecated Use {@link WildWordTranslationLanguages}. */
export type EnrichmentLanguages = WildWordTranslationLanguages;
