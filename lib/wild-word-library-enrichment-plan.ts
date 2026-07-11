/**
 * Decide which My Words rows need API enrichment after local maintenance.
 */

import { isNonImageableLookupTerm } from "@/lib/wikimedia-image";
import { evaluateImageMemoryQuality } from "@/lib/image-memory-quality";
import { hasUserWildWordImage } from "@/lib/wild-word-image-display";
import {
  computeEnrichmentNeeds,
  explanationNeedsEnrichment,
  hasRealDefinition,
} from "@/lib/wild-word-enrichment";
import {
  isReplaceableImageSource,
  isStaleImage,
  isUnknownLegacyImage,
} from "@/lib/wild-word-image-replacement";
import { storedTextNeedsMojibakeRepair } from "@/lib/fix-common-mojibake";
import { parseWildWordCoreFields } from "@/lib/wild-word-record";
import {
  translationLooksLikeStaleIdentity,
} from "@/lib/wild-word-language-cleanup";
import {
  translationGlossNeedsCleanup,
} from "@/lib/translation-gloss-cleanup";
import { resolveWildWordTranslationLanguages } from "@/lib/wild-word-translation-target";

export type WildWordLibraryEnrichmentReason =
  | "missing_translation"
  | "missing_definition"
  | "missing_explanation"
  | "missing_image"
  | "stale_translation"
  | "stale_concept_image"
  | "rejected_image"
  | "mojibake_storage_repair"
  | "fake_definition_cleanup";

export type WildWordLibraryEnrichmentPlan = {
  rowsToEnrich: Record<string, unknown>[];
  reasonsById: Record<string, WildWordLibraryEnrichmentReason[]>;
};

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function rowHasMojibakeRepairNeed(rawRecord: Record<string, unknown>): boolean {
  for (const key of ["translation", "definition", "explanation"] as const) {
    const stored = nonEmptyString(rawRecord[key]);
    if (stored && storedTextNeedsMojibakeRepair(stored)) {
      return true;
    }
  }
  return false;
}

function rowHasFakeDefinitionCleanupNeed(rawRecord: Record<string, unknown>): boolean {
  const definition = nonEmptyString(rawRecord.definition);
  if (!definition) {
    return false;
  }
  return !hasRealDefinition(rawRecord);
}

function rowHasRejectedConceptImage(
  rawRecord: Record<string, unknown>,
  word: { language: string; text: string }
): boolean {
  if (hasUserWildWordImage(rawRecord)) {
    return false;
  }
  const source = nonEmptyString(rawRecord.imageSource)?.toLowerCase();
  if (source !== "concept" || !nonEmptyString(rawRecord.imageUrl)) {
    return false;
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
  return !quality.accepted;
}

function rowHasStaleConceptImage(rawRecord: Record<string, unknown>): boolean {
  if (hasUserWildWordImage(rawRecord)) {
    return false;
  }
  const source = nonEmptyString(rawRecord.imageSource)?.toLowerCase();
  if (source === "lesson" || source === "user") {
    return false;
  }
  if (!nonEmptyString(rawRecord.imageUrl)) {
    return false;
  }
  if (source === "concept" || source === "curated") {
    return isStaleImage(rawRecord);
  }
  if (source === "wikimedia" || source === "pexels" || source === "pixabay") {
    return isStaleImage(rawRecord);
  }
  return isUnknownLegacyImage(rawRecord);
}

function rowMissingImage(
  rawRecord: Record<string, unknown>,
  word: { language: string; text: string }
): boolean {
  if (hasUserWildWordImage(rawRecord)) {
    return false;
  }
  if (nonEmptyString(rawRecord.imageUrl)) {
    return false;
  }
  const partOfSpeech = nonEmptyString(rawRecord.partOfSpeech);
  if (isNonImageableLookupTerm(word.text, partOfSpeech)) {
    return false;
  }
  return true;
}

function rowHasStaleTranslation(
  rawRecord: Record<string, unknown>,
  word: { language: string; text: string }
): boolean {
  const stored = nonEmptyString(rawRecord.translation);
  if (!stored) {
    return false;
  }
  const { sourceLang, effectiveTargetLang } = resolveWildWordTranslationLanguages(rawRecord, word);
  if (translationLooksLikeStaleIdentity(word.text, stored)) {
    return true;
  }
  return translationGlossNeedsCleanup({
    sourceText: word.text,
    sourceLang,
    targetLang: effectiveTargetLang,
    translation: stored,
    partOfSpeech: nonEmptyString(rawRecord.partOfSpeech),
  });
}

/** Whether bulk enrichment should pass `force: true` for this row. */
export function wildWordLibraryEnrichmentNeedsForce(
  reasons: WildWordLibraryEnrichmentReason[]
): boolean {
  return reasons.some((reason) =>
    reason === "stale_concept_image" ||
    reason === "rejected_image" ||
    reason === "missing_image" ||
    reason === "stale_translation" ||
    reason === "fake_definition_cleanup"
  );
}

/**
 * Rows that still need network enrichment after {@link runWildWordLocalMaintenance}.
 */
export function planWildWordLibraryEnrichment(rows: unknown[]): WildWordLibraryEnrichmentPlan {
  const rowsToEnrich: Record<string, unknown>[] = [];
  const reasonsById: Record<string, WildWordLibraryEnrichmentReason[]> = {};

  for (const item of rows) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const rawRecord = item as Record<string, unknown>;
    const id = nonEmptyString(rawRecord.id);
    const word = parseWildWordCoreFields(rawRecord);
    if (!id || !word) {
      continue;
    }

    const reasons: WildWordLibraryEnrichmentReason[] = [];
    const needs = computeEnrichmentNeeds(rawRecord, { force: false });

    if (needs.translation) {
      reasons.push("missing_translation");
    }
    if (needs.definition) {
      reasons.push("missing_definition");
    }
    if (explanationNeedsEnrichment(rawRecord, word, false)) {
      reasons.push("missing_explanation");
    }
    if (rowMissingImage(rawRecord, word)) {
      reasons.push("missing_image");
    }
    if (rowHasStaleTranslation(rawRecord, word)) {
      reasons.push("stale_translation");
    }
    if (rowHasMojibakeRepairNeed(rawRecord)) {
      reasons.push("mojibake_storage_repair");
    }
    if (rowHasFakeDefinitionCleanupNeed(rawRecord)) {
      reasons.push("fake_definition_cleanup");
    }
    if (rowHasRejectedConceptImage(rawRecord, word)) {
      reasons.push("rejected_image");
    } else if (rowHasStaleConceptImage(rawRecord)) {
      reasons.push("stale_concept_image");
    }

    if (
      !reasons.includes("missing_image") &&
      !reasons.includes("rejected_image") &&
      !reasons.includes("stale_concept_image") &&
      needs.imageUrl &&
      isReplaceableImageSource(rawRecord, { force: true })
    ) {
      if (rowHasStaleConceptImage(rawRecord)) {
        reasons.push("stale_concept_image");
      } else {
        reasons.push("missing_image");
      }
    }

    if (reasons.length === 0) {
      continue;
    }

    rowsToEnrich.push(rawRecord);
    reasonsById[id] = reasons;
  }

  return { rowsToEnrich, reasonsById };
}
