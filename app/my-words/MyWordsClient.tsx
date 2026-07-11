"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import Link from "next/link";
import type { LexemeWordEnrichment } from "@/components/WordCard";
import { WordCard } from "@/components/WordCard";
import { isMyWordsDebugEnabled } from "@/lib/debug-flags";
import { devLogMyWordsImagePipeline } from "@/lib/dev-my-words-image-pipeline";
import type { UserWildWord } from "@/lib/explore-content";
import {
  getWildWordsServerSnapshot,
  getWildWordsSync,
  importWildWordsFromExtensionJson,
  patchWildWordsById,
  persistWildWords,
  subscribeWildWords,
  WILD_WORDS_STORAGE_KEY,
} from "@/lib/wild-word-storage";
import { buildLessonChunkMetadataMap, type LessonChunkMetadata } from "@/lib/review-queue";
import { lookupLessonChunkMetadata } from "@/lib/lesson-chunk-corpus-lookup";
import { buildWildWordLanguagePresentation } from "@/lib/wild-word-extension-display";
import { ensureTtsVoicesLoaded } from "@/lib/tts-voice";
import { coerceWildWordRawRecord, type CoercedWildWordRow } from "@/lib/wild-word-record";
import { enrichWildWordRecord } from "@/lib/wild-word-enrichment";
import {
  formatWildWordLibraryMaintenanceStatus,
  runWildWordLocalMaintenance,
} from "@/lib/wild-word-library-maintenance";
import {
  planWildWordLibraryEnrichment,
  wildWordLibraryEnrichmentNeedsForce,
} from "@/lib/wild-word-library-enrichment-plan";
import {
  buildClearUserWildWordImagePatch,
  buildUserWildWordImagePatch,
} from "@/lib/wild-word-image-patch";
import {
  deleteWildWordImage,
  putWildWordImage,
  resizeImageFile,
} from "@/lib/wild-word-image-store";
import {
  formatWildWordLanguageCleanupSummary,
  planWildWordLanguageCleanup,
} from "@/lib/wild-word-language-cleanup";
import { downloadMyWordsExportInBrowser } from "@/lib/wild-word-export";
import { requestExtensionSync, subscribeToExtensionBridge } from "@/lib/extension-bridge";
import { buildPastedTextWildWordRows } from "@/lib/pasted-text-capture";

/** @see {@link CoercedWildWordRow} */
export type StoredWildWordEntry = CoercedWildWordRow;

const ENRICH_CONCURRENCY = 2;
const EXTENSION_SYNC_TIMEOUT_MS = 3000;

const PASTE_TARGET_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function coerceStoredRow(raw: unknown): StoredWildWordEntry | null {
  const coerced = coerceWildWordRawRecord(raw);
  if (!coerced) {
    return null;
  }
  return {
    rawRecord: coerced.rawRecord,
    word: coerced.word,
    extras: coerced.extras,
  };
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

function lessonHintsFor(
  rawRecord: Record<string, unknown>,
  word: UserWildWord,
  corpus: Map<string, LessonChunkMetadata>,
  byLexeme: Map<string, LessonChunkMetadata>
): LexemeWordEnrichment | null {
  const { meta } = lookupLessonChunkMetadata({
    rawRecord,
    word,
    corpusMap: corpus,
    lexemeLookup: byLexeme,
  });
  if (!meta) {
    return null;
  }
  return {
    translation: meta.translation,
    context: meta.context,
    phonetic: meta.phonetic,
  };
}


function formatEnrichmentError(rawRecord: Record<string, unknown>): string | null {
  const errors = rawRecord.enrichmentErrors;
  if (!isRecord(errors)) {
    return null;
  }
  const hasStoredTranslation =
    typeof rawRecord.translation === "string" && rawRecord.translation.trim().length > 0;
  const translationError =
    typeof errors.translation === "string" && errors.translation.trim().length > 0
      ? errors.translation.trim()
      : null;
  if (translationError && !hasStoredTranslation) {
    return translationError;
  }
  const parts = [errors.definition, errors.image].filter(
    (part): part is string => typeof part === "string" && part.trim().length > 0
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

function rowMatchesQuery(entry: StoredWildWordEntry, lowered: string): boolean {
  if (!lowered) {
    return true;
  }
  const { word, extras } = entry;
  const langPres = buildWildWordLanguagePresentation(entry.rawRecord, word);
  const blobs = [
    word.text,
    word.language,
    langPres.displayCode,
    langPres.note,
    langPres.speechCode,
    word.translation,
    word.contextSentence,
    word.sourceTitle,
    word.sourceItemId,
    word.lexemeKey,
    word.pronunciation,
    word.savedAt,
    extras.definition,
    extras.phonetic,
    extras.partOfSpeech,
    extras.sourceDomain,
    extras.sourceUrl,
  ].filter((s): s is string => typeof s === "string" && s.trim().length > 0);
  return blobs.some((chunk) => chunk.toLowerCase().includes(lowered));
}

export default function MyWordsClient() {
  const rawRows = useSyncExternalStore(
    subscribeWildWords,
    getWildWordsSync,
    getWildWordsServerSnapshot
  );

  const importFileInputRef = useRef<HTMLInputElement>(null);
  const enrichRunRef = useRef(0);
  const extensionSyncTimeoutRef = useRef<number | null>(null);
  const [query, setQuery] = useState("");
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [extensionSyncSummary, setExtensionSyncSummary] = useState<string | null>(null);
  const [enrichSummary, setEnrichSummary] = useState<string | null>(null);
  const [maintenanceSummary, setMaintenanceSummary] = useState<string | null>(null);
  const [languageCleanupSummary, setLanguageCleanupSummary] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [pasteTargetLanguage, setPasteTargetLanguage] = useState("en");
  const [pasteSummary, setPasteSummary] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [errorById, setErrorById] = useState<Record<string, string>>({});


  const corpusMap = useMemo(() => buildLessonChunkMetadataMap(), []);
  const lexemeLookup = useMemo(() => buildLexemeLookup(corpusMap), [corpusMap]);

  useEffect(() => {
    ensureTtsVoicesLoaded();
  }, []);

  useEffect(() => {
    if (rawRows.length === 0) {
      return;
    }
    const result = runWildWordLocalMaintenance(rawRows);
    if (!result.changed) {
      return;
    }
    persistWildWords(result.rows);
    const status = formatWildWordLibraryMaintenanceStatus(result.summary);
    if (status) {
      const timer = window.setTimeout(() => {
        setMaintenanceSummary(status);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [rawRows]);

  const formatExtensionImportSummary = useCallback((result: ReturnType<typeof importWildWordsFromExtensionJson>) => {
    if (result.imported === 0 && result.mergedDuplicates === 0 && result.skippedDuplicates === 0) {
      return "Extension sync complete";
    }
    let msg = `Synced ${result.imported} extension word${result.imported === 1 ? "" : "s"}`;
    if (result.mergedDuplicates > 0) {
      msg += `, merged ${result.mergedDuplicates} duplicate${result.mergedDuplicates === 1 ? "" : "s"}`;
    }
    if (result.skippedDuplicates > 0) {
      msg += `, skipped ${result.skippedDuplicates} duplicate${result.skippedDuplicates === 1 ? "" : "s"}`;
    }
    if (result.invalidRows > 0) {
      msg += ` (${result.invalidRows} row${result.invalidRows === 1 ? "" : "s"} ignored — missing text)`;
    }
    return msg;
  }, []);

  const handleExtensionWords = useCallback(
    (words: Record<string, unknown>[]) => {
      if (extensionSyncTimeoutRef.current != null) {
        window.clearTimeout(extensionSyncTimeoutRef.current);
        extensionSyncTimeoutRef.current = null;
      }
      if (words.length === 0) {
        setExtensionSyncSummary("Extension sync complete");
        return;
      }
      try {
        const result = importWildWordsFromExtensionJson(words);
        setExtensionSyncSummary(formatExtensionImportSummary(result));
      } catch {
        setExtensionSyncSummary("Extension sync failed");
      }
    },
    [formatExtensionImportSummary]
  );

  useEffect(() => {
    const unsubscribe = subscribeToExtensionBridge({
      onWords: (words) => {
        handleExtensionWords(words);
      },
    });
    requestExtensionSync();
    return unsubscribe;
  }, [handleExtensionWords]);

  useEffect(() => {
    return () => {
      if (extensionSyncTimeoutRef.current != null) {
        window.clearTimeout(extensionSyncTimeoutRef.current);
      }
    };
  }, []);

  function requestManualExtensionSync() {
    if (extensionSyncTimeoutRef.current != null) {
      window.clearTimeout(extensionSyncTimeoutRef.current);
    }
    setExtensionSyncSummary("Requesting extension sync...");
    requestExtensionSync();
    extensionSyncTimeoutRef.current = window.setTimeout(() => {
      extensionSyncTimeoutRef.current = null;
      setExtensionSyncSummary((prev) =>
        prev === "Requesting extension sync..."
          ? "Extension not connected. Use Import JSON if needed."
          : prev
      );
    }, EXTENSION_SYNC_TIMEOUT_MS);
  }

  const entries = useMemo(() => {
    const out: StoredWildWordEntry[] = [];
    rawRows.forEach((row) => {
      const entry = coerceStoredRow(row);
      if (entry) {
        out.push(entry);
      }
    });
    return out;
  }, [rawRows]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => entries.filter((row) => rowMatchesQuery(row, q)), [entries, q]);

  const pipelineRowDebugFingerprint = useMemo(
    () =>
      filtered
        .map(
          ({ rawRecord, extras, word }) =>
            `${word.id}|${typeof rawRecord.imageUrl === "string" ? rawRecord.imageUrl : ""}|${extras.imageUrl ?? ""}`
        )
        .join(";;"),
    [filtered]
  );

  useEffect(() => {
    if (!isMyWordsDebugEnabled()) {
      return;
    }
    for (const { rawRecord, extras, word } of filtered) {
      devLogMyWordsImagePipeline("MyWordsClient.list-coercion", {
        wordText: word.text,
        rawRecordImageUrl: typeof rawRecord.imageUrl === "string" ? rawRecord.imageUrl.trim() || null : null,
        extrasImageUrl: extras.imageUrl?.trim() || null,
      });
    }
  }, [filtered, pipelineRowDebugFingerprint]);

  const libraryEnrichmentPlan = useMemo(
    () => planWildWordLibraryEnrichment(rawRows),
    [rawRows]
  );

  const missingEnrichmentCount = useMemo(() => {
    const visibleIds = new Set(filtered.map(({ word }) => word.id));
    return libraryEnrichmentPlan.rowsToEnrich.filter((row) => {
      const id = typeof row.id === "string" ? row.id : "";
      return visibleIds.has(id);
    }).length;
  }, [filtered, libraryEnrichmentPlan]);

  const enrichRows = useCallback(
    async (
      targets: StoredWildWordEntry[],
      {
        force = false,
        forceById,
      }: { force?: boolean; forceById?: Record<string, boolean> } = {}
    ) => {
      const runId = enrichRunRef.current + 1;
      enrichRunRef.current = runId;
      const queue = targets.filter(({ word }) => {
        if (force) {
          return true;
        }
        if (forceById?.[word.id]) {
          return true;
        }
        return Boolean(libraryEnrichmentPlan.reasonsById[word.id]?.length);
      });
      if (queue.length === 0) {
        setEnrichSummary("Library is up to date.");
        return;
      }

      const queueIds = queue.map(({ word }) => word.id);

      setEnrichSummary(`Enriching 0/${queue.length}…`);
      setPendingIds((prev) => {
        const next = new Set(prev);
        queueIds.forEach((id) => next.add(id));
        return next;
      });
      setErrorById((prev) => {
        const next = { ...prev };
        queueIds.forEach((id) => {
          delete next[id];
        });
        return next;
      });

      let completed = 0;
      let cursor = 0;

      async function worker(): Promise<void> {
        while (cursor < queue.length) {
          if (enrichRunRef.current !== runId) {
            return;
          }
          const index = cursor;
          cursor += 1;
          const { rawRecord, word } = queue[index]!;
          const rowForce = force || Boolean(forceById?.[word.id]);
          try {
            const patch = await enrichWildWordRecord(rawRecord, {
              force: rowForce,
              corpusMap,
              lexemeLookup,
            });
            const patches = new Map<string, Record<string, unknown>>();
            patches.set(word.id, patch as Record<string, unknown>);
            patchWildWordsById(patches);
            if (isMyWordsDebugEnabled() && (rowForce || "imageUrl" in patch || "imageSource" in patch)) {
              devLogMyWordsImagePipeline("MyWordsClient.persist-bridge", {
                rowId: word.id,
                wordText: word.text,
                enrichmentForceUsed: rowForce,
                patchWildWordsByIdInvoked: true,
                patchedImageUrl: typeof patch.imageUrl === "string" ? patch.imageUrl : null,
              });
            }

            const errorParts = patch.enrichmentErrors
              ? [patch.enrichmentErrors.translation, patch.enrichmentErrors.definition, patch.enrichmentErrors.image]
                  .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
                  .join(" · ")
              : "";
            if (errorParts) {
              setErrorById((prev) => ({ ...prev, [word.id]: errorParts }));
            } else {
              setErrorById((prev) => {
                if (!prev[word.id]) {
                  return prev;
                }
                const next = { ...prev };
                delete next[word.id];
                return next;
              });
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : "Enrichment failed.";
            setErrorById((prev) => ({ ...prev, [word.id]: message }));
            const patches = new Map<string, Record<string, unknown>>();
            patches.set(word.id, {
              enrichmentStatus: "failed",
              enrichmentVersion: 1,
              enrichedAt: new Date().toISOString(),
              enrichmentErrors: { translation: message },
            });
            patchWildWordsById(patches);
          } finally {
            completed += 1;
            if (enrichRunRef.current === runId) {
              setEnrichSummary(`Enriching ${completed}/${queue.length}…`);
              setPendingIds((prev) => {
                const next = new Set(prev);
                next.delete(word.id);
                return next;
              });
            }
          }
        }
      }

      try {
        const workers = Array.from({ length: Math.min(ENRICH_CONCURRENCY, queue.length) }, () => worker());
        await Promise.all(workers);
        if (enrichRunRef.current === runId) {
          const totalRows = getWildWordsSync().length;
          const skipped = Math.max(0, totalRows - queue.length);
          if (skipped > 0) {
            setEnrichSummary(
              `Updated ${queue.length} card${queue.length === 1 ? "" : "s"}, skipped ${skipped} complete card${skipped === 1 ? "" : "s"}.`
            );
          } else {
            setEnrichSummary(`Finished enriching ${queue.length} word${queue.length === 1 ? "" : "s"}.`);
          }
        }
      } finally {
        if (enrichRunRef.current === runId) {
          setPendingIds((prev) => {
            const next = new Set(prev);
            queueIds.forEach((id) => next.delete(id));
            return next;
          });
        }
      }
    },
    [corpusMap, lexemeLookup, libraryEnrichmentPlan]
  );

  const cleanAndEnrichLibrary = useCallback(async () => {
    const rows = getWildWordsSync();
    const maintenance = runWildWordLocalMaintenance(rows);
    if (maintenance.changed) {
      persistWildWords(maintenance.rows);
      const cleanStatus = formatWildWordLibraryMaintenanceStatus(maintenance.summary);
      if (cleanStatus) {
        setMaintenanceSummary(cleanStatus);
      }
    }

    const freshRows = getWildWordsSync();
    const plan = planWildWordLibraryEnrichment(freshRows);
    const targets: StoredWildWordEntry[] = [];
    const forceById: Record<string, boolean> = {};

    for (const row of plan.rowsToEnrich) {
      const entry = coerceStoredRow(row);
      if (!entry) {
        continue;
      }
      targets.push(entry);
      const id = entry.word.id;
      const reasons = plan.reasonsById[id] ?? [];
      if (wildWordLibraryEnrichmentNeedsForce(reasons)) {
        forceById[id] = true;
      }
    }

    if (targets.length === 0) {
      setEnrichSummary(
        maintenance.changed
          ? formatWildWordLibraryMaintenanceStatus(maintenance.summary) ?? "Library is up to date."
          : "Library is up to date."
      );
      return;
    }

    setEnrichSummary(`Enriching ${targets.length} card${targets.length === 1 ? "" : "s"}…`);
    await enrichRows(targets, { forceById });
  }, [enrichRows]);

  const uploadWordImage = useCallback(async (wordId: string, file: File, imageAlt: string) => {
    const current = getWildWordsSync();
    const row = current.find((r) => typeof r.id === "string" && r.id === wordId);
    const previousAssetId =
      typeof row?.imageAssetId === "string" && row.imageAssetId.trim()
        ? row.imageAssetId.trim()
        : null;

    const assetId = crypto.randomUUID();
    const blob = await resizeImageFile(file);
    await putWildWordImage(assetId, blob, { wordId, mimeType: blob.type });

    if (previousAssetId && previousAssetId !== assetId) {
      await deleteWildWordImage(previousAssetId);
    }

    const patches = new Map<string, Record<string, unknown>>();
    patches.set(
      wordId,
      buildUserWildWordImagePatch({
        imageAssetId: assetId,
        imageAlt,
      })
    );
    patchWildWordsById(patches);
  }, []);

  const removeCustomWordImage = useCallback(async (wordId: string) => {
    const current = getWildWordsSync();
    const row = current.find((r) => typeof r.id === "string" && r.id === wordId);
    const assetId =
      typeof row?.imageAssetId === "string" && row.imageAssetId.trim()
        ? row.imageAssetId.trim()
        : null;
    if (assetId) {
      await deleteWildWordImage(assetId);
    }
    const patches = new Map<string, Record<string, unknown>>();
    patches.set(wordId, buildClearUserWildWordImagePatch());
    patchWildWordsById(patches);
  }, []);

  const remove = useCallback(async (id: string) => {
    const current = getWildWordsSync();
    const row = current.find((r) => typeof r.id === "string" && r.id === id);
    const assetId =
      typeof row?.imageAssetId === "string" && row.imageAssetId.trim()
        ? row.imageAssetId.trim()
        : null;
    if (assetId) {
      try {
        await deleteWildWordImage(assetId);
      } catch {
        /* row removal proceeds even if blob delete fails */
      }
    }
    const next = current.filter((r) => {
      const pk = typeof r.id === "string" ? r.id : null;
      return pk !== id;
    });
    persistWildWords(next);
  }, []);

  function fixDetectedLanguages() {
    const rows = getWildWordsSync();
    const { patches, summary } = planWildWordLanguageCleanup(rows);
    if (patches.size > 0) {
      patchWildWordsById(patches);
    }
    setLanguageCleanupSummary(formatWildWordLanguageCleanupSummary(summary));
  }

  function exportWildWordsJson() {
    const rows = getWildWordsSync();
    if (rows.length === 0) {
      return;
    }
    downloadMyWordsExportInBrowser(rows);
  }

  function onImportWildWordsFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed: unknown = JSON.parse(String(reader.result));
        if (!Array.isArray(parsed)) {
          setImportSummary("That file is not a JSON array. Export again from the extension popup.");
          return;
        }
        const result = importWildWordsFromExtensionJson(parsed);
        let msg = `Imported ${result.imported}, merged ${result.mergedDuplicates} duplicates, skipped ${result.skippedDuplicates}`;
        if (result.invalidRows > 0) {
          msg += ` (${result.invalidRows} row${result.invalidRows === 1 ? "" : "s"} ignored — missing text)`;
        }
        setImportSummary(msg);
      } catch {
        setImportSummary("Could not parse that file as JSON.");
      }
    };
    reader.onerror = () => {
      setImportSummary("Could not read that file.");
    };
    reader.readAsText(file);
  }

  function savePastedTextWords() {
    const source = pasteText.trim();
    if (!source) {
      setPasteSummary("Paste text first, then save detected words.");
      return;
    }
    const nowIso = new Date().toISOString();
    const idPrefix = `paste-${Date.now()}`;
    const rows = buildPastedTextWildWordRows(source, {
      idPrefix,
      nowIso,
      targetLanguage: pasteTargetLanguage,
      sourceTitle: "Pasted text",
      sourceItemId: idPrefix,
      maxCandidates: 24,
    });
    if (rows.length === 0) {
      setPasteSummary("No clear vocabulary candidates found yet. Try a longer passage.");
      return;
    }
    const result = importWildWordsFromExtensionJson(rows);
    setPasteSummary(
      `Saved ${result.imported} detected word${result.imported === 1 ? "" : "s"}, merged ${result.mergedDuplicates} duplicate${result.mergedDuplicates === 1 ? "" : "s"}.`
    );
  }

  const totalRecords = rawRows.length;

  return (
    <div className="page lr-my-words">
      <section className="card">
        <div className="lr-my-words-header">
          <div>
            <h1>My Words</h1>
            <p className="muted">
              Words saved <strong>inside this web app</strong> (for example from Explore) are stored under{" "}
              <code className="lr-my-words-inline-code">{WILD_WORDS_STORAGE_KEY}</code> in this browser&apos;s regular site
              storage. The LenguaRiver browser extension saves to{" "}
              <code className="lr-my-words-inline-code">chrome.storage.local</code> under{" "}
              <code className="lr-my-words-inline-code">lr_wild_words</code>. When the extension and this page are open in
              the same Chrome profile, words can sync automatically; use <strong>Export JSON</strong> /{" "}
              <strong>Import JSON</strong> as a manual backup.
            </p>
            <p className="muted lr-my-words-export-image-note">
              Custom uploaded images are stored on this device and are not included in JSON export yet.
            </p>
            <p className="muted lr-my-words-enrichment-footnote">
              The library cleans stale text and icons automatically on load. Use <strong>Clean &amp; enrich library</strong> to
              run that cleanup again and fill missing translation, definition, phonetic, and images from the bundled corpus,
              Wiktionary (Spanish), and local Argos translate when installed. Use <strong>Fix detected languages</strong> to
              repair legacy imported rows with wrong stored language codes.
            </p>
          </div>
          <div className="lr-my-words-links">
            <Link href="/explore" className="button lr-my-words-pill-link">
              Explore
            </Link>
            <Link href="/progress" className="button lr-my-words-pill-link">
              Progress
            </Link>
            <input
              ref={importFileInputRef}
              id="lr-my-words-import-file"
              type="file"
              accept="application/json,.json"
              className="lr-my-words-import-file"
              onChange={onImportWildWordsFile}
            />
            <span
              className="lr-my-words-export-wrap"
              title={totalRecords === 0 ? "No words to export yet." : undefined}
            >
              <button
                type="button"
                className="button lr-my-words-pill-link"
                disabled={totalRecords === 0}
                onClick={exportWildWordsJson}
              >
                Export JSON
              </button>
            </span>
            <button
              type="button"
              className="button lr-my-words-pill-link"
              onClick={() => importFileInputRef.current?.click()}
            >
              Import JSON
            </button>
            <button
              type="button"
              className="button lr-my-words-pill-link"
              onClick={requestManualExtensionSync}
            >
              Sync extension words
            </button>
          </div>
        </div>
      </section>

      <section className="card lr-my-words-paste-card">
        <div className="lr-my-words-paste-head">
          <div>
            <h2>Paste text → save vocabulary</h2>
            <p className="muted">
              Paste an article, sentence, or paragraph. LenguaRiver detects likely vocabulary, routes each word to its
              source-language list, and saves it here for review.
            </p>
          </div>
          <label className="lr-my-words-target-label muted" htmlFor="paste-target-language">
            Explanation language
            <select
              id="paste-target-language"
              className="text-input lr-my-words-target-select"
              value={pasteTargetLanguage}
              onChange={(event) => setPasteTargetLanguage(event.target.value)}
            >
              {PASTE_TARGET_LANGUAGES.map((language) => (
                <option key={language.value} value={language.value}>
                  {language.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <textarea
          className="text-input lr-my-words-paste-input"
          value={pasteText}
          onChange={(event) => setPasteText(event.target.value)}
          placeholder="Paste text here, for example: Disculpe, mañana quiero café. I am learning web development."
          rows={5}
        />
        <div className="lr-my-words-paste-actions">
          <button type="button" className="button lr-my-words-pill-link" onClick={savePastedTextWords}>
            Save detected words
          </button>
          <button
            type="button"
            className="button lr-my-words-pill-link"
            disabled={!pasteText.trim()}
            onClick={() => {
              setPasteText("");
              setPasteSummary(null);
            }}
          >
            Clear
          </button>
        </div>
        {pasteSummary ? (
          <p className="lr-my-words-import-result muted" role="status" aria-live="polite">
            {pasteSummary}
          </p>
        ) : null}
      </section>

      <section className="card">
        {importSummary ? (
          <p className="lr-my-words-import-result muted" role="status" aria-live="polite">
            {importSummary}
          </p>
        ) : null}
        {extensionSyncSummary ? (
          <p className="lr-my-words-import-result muted" role="status" aria-live="polite">
            {extensionSyncSummary}
          </p>
        ) : null}
        {maintenanceSummary ? (
          <p className="lr-my-words-import-result muted" role="status" aria-live="polite">
            {maintenanceSummary}
          </p>
        ) : null}
        {enrichSummary ? (
          <p className="lr-my-words-import-result muted" role="status" aria-live="polite">
            {enrichSummary}
          </p>
        ) : null}
        {languageCleanupSummary ? (
          <p className="lr-my-words-import-result muted" role="status" aria-live="polite">
            {languageCleanupSummary}
          </p>
        ) : null}
        <label className="lr-my-search-label muted" htmlFor="my-words-query">
          Search
        </label>
        <input
          id="my-words-query"
          type="search"
          className="text-input lr-my-search-input"
          placeholder="Filter by wording, translation, language, domain…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        <div className="lr-my-words-toolbar">
          <p className="muted lr-my-count" aria-live="polite">
            Showing {filtered.length}
            {entries.length !== filtered.length ? <> of {entries.length}</> : entries.length !== totalRecords ? (
              <>
                {" "}
                readable ({totalRecords} in storage)
              </>
            ) : null}{" "}
            saved
            {missingEnrichmentCount > 0 ? (
              <>
                {" "}
                · {missingEnrichmentCount} missing enrichment
              </>
            ) : null}
          </p>
          {filtered.length > 0 ? (
            <div className="lr-my-words-toolbar-actions">
              <button
                type="button"
                className="button lr-my-words-pill-link"
                disabled={totalRecords === 0}
                onClick={fixDetectedLanguages}
              >
                Fix detected languages
              </button>
              <button
                type="button"
                className="button lr-my-words-pill-link"
                disabled={pendingIds.size > 0}
                onClick={() => {
                  void cleanAndEnrichLibrary();
                }}
              >
                Clean &amp; enrich library
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {!totalRecords ? (
        <section className="card lr-my-words-empty" role="status">
          <p>No saved words in this web app yet.</p>
          <p className="muted lr-my-words-empty-gap">
            <strong>
              Use Import JSON (above) with a file from the extension popup (Export JSON), or save words from Explore.
            </strong>
          </p>
          <p className="muted">Explore saves and imports are both kept in the same list.</p>
          <div className="lr-my-words-empty-actions">
            <Link href="/explore" className="button lr-my-words-pill-link">
              Open Explore
            </Link>
            <button
              type="button"
              className="button lr-my-words-pill-link"
              onClick={() => importFileInputRef.current?.click()}
            >
              Import JSON
            </button>
          </div>
        </section>
      ) : entries.length === 0 ? (
        <section className="card lr-my-words-empty" role="status">
          <p>{totalRecords} row{totalRecords === 1 ? "" : "s"} in storage couldn&apos;t be read. Refresh or inspect localStorage.</p>
        </section>
      ) : filtered.length === 0 ? (
        <section className="card lr-my-words-empty" role="status">
          <p>No entries match &ldquo;{query}&rdquo;. Try another search.</p>
        </section>
      ) : (
        <ul className="lr-word-list">
          {filtered.map(({ rawRecord, word, extras }) => {
            const lessonHints = lessonHintsFor(rawRecord, word, corpusMap, lexemeLookup);
            const languagePresentation = buildWildWordLanguagePresentation(rawRecord, word);
            const isPending = pendingIds.has(word.id);
            const enrichmentError = errorById[word.id] ?? formatEnrichmentError(rawRecord);
            return (
              <li key={word.id}>
                <WordCard
                  wildWord={word}
                  rawRecord={rawRecord}
                  extras={extras}
                  lexemeHints={lessonHints}
                  languagePresentation={languagePresentation}
                  enrichmentPending={isPending}
                  enrichmentError={enrichmentError}
                  canDelete
                  onDelete={() => {
                    void remove(word.id);
                  }}
                  onRefreshEnrichment={() => {
                    void enrichRows([{ rawRecord, word, extras }], { force: true });
                  }}
                  onUploadImage={(file) => uploadWordImage(word.id, file, word.text)}
                  onRemoveCustomImage={() => removeCustomWordImage(word.id)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
