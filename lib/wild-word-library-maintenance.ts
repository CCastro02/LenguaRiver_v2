/**
 * Local-only My Words library cleanup (no network). Safe to run on page load.
 */

import { evaluateImageMemoryQuality } from "@/lib/image-memory-quality";
import { hasUserWildWordImage } from "@/lib/wild-word-image-display";
import { WILD_WORD_FIELD_CLEAR } from "@/lib/wild-word-image-patch";
import { dedupeWildWordRows } from "@/lib/wild-word-import-dedupe";
import {
  appendFakeDefinitionCleanupPatch,
  appendMojibakeCleanupPatch,
  appendOrphanExplanationCleanupPatch,
  type WildWordEnrichmentPatch,
} from "@/lib/wild-word-enrichment";
import {
  planWildWordLanguageRepairForEnrichment,
} from "@/lib/wild-word-language-cleanup";
import { parseWildWordCoreFields } from "@/lib/wild-word-record";
import { migrateWildWordsRowsIfNeeded } from "@/lib/wild-word-storage-version";
import {
  cleanupTranslationGloss,
  translationGlossNeedsCleanup,
} from "@/lib/translation-gloss-cleanup";
import { resolveWildWordTranslationLanguages } from "@/lib/wild-word-translation-target";

export type WildWordLibraryMaintenanceSummary = {
  deduped: number;
  languageFixed: number;
  staleTranslationsCleared: number;
  mojibakeFixed: number;
  fakeDefinitionsCleared: number;
  orphanExplanationsCleared: number;
  rejectedImagesCleared: number;
  missingSchemaBackfilled: number;
};

export type WildWordLibraryMaintenanceResult = {
  rows: Record<string, unknown>[];
  changed: boolean;
  summary: WildWordLibraryMaintenanceSummary;
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

function emptySummary(): WildWordLibraryMaintenanceSummary {
  return {
    deduped: 0,
    languageFixed: 0,
    staleTranslationsCleared: 0,
    mojibakeFixed: 0,
    fakeDefinitionsCleared: 0,
    orphanExplanationsCleared: 0,
    rejectedImagesCleared: 0,
    missingSchemaBackfilled: 0,
  };
}

function applyPatchToRow(
  row: Record<string, unknown>,
  patch: WildWordEnrichmentPatch
): Record<string, unknown> {
  const merged = { ...row };
  for (const [key, value] of Object.entries(patch)) {
    if (value === WILD_WORD_FIELD_CLEAR) {
      delete merged[key];
    } else if (value !== undefined) {
      merged[key] = value;
    }
  }
  return merged;
}

function patchClearsFakeDefinition(patch: WildWordEnrichmentPatch): boolean {
  return patch.definition === WILD_WORD_FIELD_CLEAR;
}

function patchClearsOrphanExplanation(patch: WildWordEnrichmentPatch): boolean {
  return patch.explanation === WILD_WORD_FIELD_CLEAR;
}

function patchClearsRejectedImage(patch: WildWordEnrichmentPatch): boolean {
  return patch.imageUrl === WILD_WORD_FIELD_CLEAR;
}

function patchFixesMojibake(before: Record<string, unknown>, patch: WildWordEnrichmentPatch): boolean {
  for (const key of ["translation", "definition", "explanation"] as const) {
    const incoming = nonEmptyString(patch[key]);
    const stored = nonEmptyString(before[key]);
    if (incoming && stored && incoming !== stored) {
      return true;
    }
  }
  return false;
}

function appendRejectedConceptImageMaintenancePatch(
  rawRecord: Record<string, unknown>,
  word: { language: string; text: string },
  patch: WildWordEnrichmentPatch
): void {
  if (hasUserWildWordImage(rawRecord)) {
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

function maintainWildWordRow(
  rawRecord: Record<string, unknown>,
  summary: WildWordLibraryMaintenanceSummary
): Record<string, unknown> {
  if (!isRecord(rawRecord)) {
    return rawRecord;
  }

  const beforeLexeme = nonEmptyString(rawRecord.lexemeKey);
  let row = { ...rawRecord };
  const patch: WildWordEnrichmentPatch = {};
  const working = { ...row };

  const word = parseWildWordCoreFields(row);
  if (word) {
    const repair = planWildWordLanguageRepairForEnrichment(row);
    if (repair?.patch) {
      for (const [key, value] of Object.entries(repair.patch)) {
        if (value === WILD_WORD_FIELD_CLEAR) {
          delete row[key];
          delete working[key];
        } else if (value !== undefined) {
          row[key] = value;
          working[key] = value;
        }
      }
      summary.languageFixed += 1;
      const hadTranslation = Boolean(nonEmptyString(rawRecord.translation));
      if (hadTranslation && !nonEmptyString(row.translation)) {
        summary.staleTranslationsCleared += 1;
      }
    }

    appendMojibakeCleanupPatch(row, patch);
    appendFakeDefinitionCleanupPatch(row, working, patch);
    appendOrphanExplanationCleanupPatch(row, patch);
    appendRejectedConceptImageMaintenancePatch(row, word, patch);

    const { sourceLang, effectiveTargetLang } = resolveWildWordTranslationLanguages(row, word);
    const storedTranslation = nonEmptyString(row.translation);
    if (
      storedTranslation &&
      translationGlossNeedsCleanup({
        sourceText: word.text,
        sourceLang,
        targetLang: effectiveTargetLang,
        translation: storedTranslation,
        partOfSpeech: nonEmptyString(row.partOfSpeech),
      })
    ) {
      const cleaned = cleanupTranslationGloss({
        sourceText: word.text,
        sourceLang,
        targetLang: effectiveTargetLang,
        translation: storedTranslation,
        partOfSpeech: nonEmptyString(row.partOfSpeech),
      });
      if (cleaned !== storedTranslation) {
        patch.translation = cleaned;
        working.translation = cleaned;
      }
    }
  } else {
    appendMojibakeCleanupPatch(row, patch);
    appendFakeDefinitionCleanupPatch(row, working, patch);
    appendOrphanExplanationCleanupPatch(row, patch);
  }

  if (patchFixesMojibake(row, patch)) {
    summary.mojibakeFixed += 1;
  }
  if (patchClearsFakeDefinition(patch)) {
    summary.fakeDefinitionsCleared += 1;
  }
  if (patchClearsOrphanExplanation(patch)) {
    summary.orphanExplanationsCleared += 1;
  }
  if (patchClearsRejectedImage(patch)) {
    summary.rejectedImagesCleared += 1;
  }

  const hasPatch = Object.keys(patch).length > 0;
  if (hasPatch) {
    row = applyPatchToRow(row, patch);
  }

  const afterLexeme = nonEmptyString(row.lexemeKey);
  if (!beforeLexeme && afterLexeme) {
    summary.missingSchemaBackfilled += 1;
  }

  return row;
}

/** Format a short status line for the My Words toolbar. */
export function formatWildWordLibraryMaintenanceStatus(
  summary: WildWordLibraryMaintenanceSummary
): string | null {
  const parts: string[] = [];
  if (summary.deduped > 0) {
    parts.push(`${summary.deduped} duplicate${summary.deduped === 1 ? "" : "s"} merged`);
  }
  const cleaned =
    summary.mojibakeFixed +
    summary.fakeDefinitionsCleared +
    summary.orphanExplanationsCleared +
    summary.rejectedImagesCleared +
    summary.staleTranslationsCleared;
  if (cleaned > 0) {
    parts.push(`${cleaned} stale field${cleaned === 1 ? "" : "s"} cleaned`);
  }
  if (summary.languageFixed > 0) {
    parts.push(`${summary.languageFixed} language${summary.languageFixed === 1 ? "" : "s"} repaired`);
  }
  if (summary.missingSchemaBackfilled > 0) {
    parts.push(`${summary.missingSchemaBackfilled} key${summary.missingSchemaBackfilled === 1 ? "" : "s"} backfilled`);
  }
  if (parts.length === 0) {
    return null;
  }
  if (parts.length === 1) {
    const only = parts[0]!;
    return only.includes("duplicate") ? `Library cleaned (${only}).` : `Cleaned ${only}.`;
  }
  return `Library cleaned (${parts.join(", ")}).`;
}

/**
 * Run local maintenance on all rows: dedupe, schema backfill, text/image cleanup.
 * Does not call external APIs.
 */
export function runWildWordLocalMaintenance(rows: unknown[]): WildWordLibraryMaintenanceResult {
  const input = rows.filter(isRecord).map((row) => ({ ...row }));
  const summary = emptySummary();

  const { rows: migrated, changed: lexemeBatchChanged } = migrateWildWordsRowsIfNeeded(input);
  const { rows: deduped, mergedDuplicates } = dedupeWildWordRows(migrated);
  summary.deduped = mergedDuplicates;

  let changed = lexemeBatchChanged || mergedDuplicates > 0;
  const maintained = deduped.map((row) => {
    const beforeJson = JSON.stringify(row);
    const next = maintainWildWordRow(row, summary);
    if (JSON.stringify(next) !== beforeJson) {
      changed = true;
    }
    return next;
  });

  return {
    rows: maintained,
    changed,
    summary,
  };
}
