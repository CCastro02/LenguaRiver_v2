/**
 * Shared shapes for chrome.storage.local (sync-ready; no network).
 * Aligned with LenguaRiver `UserWildWord` (`lib/explore-content.ts`).
 *
 * Field glossary: `LenguaRiver/lib/wild-word-schema.ts` (`language`, `targetLanguage`, `lexemeKey`, provenance).
 */

export type SyncStatus = "local" | "pending_upload" | "synced" | "conflict";

/** Extension-side superset for saved selections (web origin). */
export type ExtensionWildWord = {
  id: string;
  /** BCP-47-ish tag: language of the saved selection (source / highlighted text). */
  language: string;
  /** Canonical identity (`lr:v1|…`). Omitted on legacy rows. */
  lexemeKey?: string;
  /** Explanation/translation language from save settings (gloss language; not `language`). */
  targetLanguage?: string;
  text: string;
  sourceItemId: string;
  sourceTitle: string;
  contextSentence?: string;
  translation?: string;
  pronunciation?: string;
  savedAt: string;
  /** Extension metadata */
  sourceKind: "web";
  sourceUrl: string;
  sourceDomain: string;
  clientGeneratedId: string;
  updatedAt: string;
  syncStatus: SyncStatus;
  /** Auto-detected language of the selection (may differ from `language` when confidence was low). */
  detectedLanguage?: string;
  detectedLanguageConfidence?: "high" | "medium" | "low";
  detectedLanguageReason?: string;
};

export type LrMeta = {
  schemaVersion: number;
  extensionVersion: string;
};

export type LrSettings = {
  /** Language to translate/explain saved words into (e.g. English meanings for Spanish words). */
  targetLanguage: string;
  /** 0.5 — 2.0; speech rate for pronounce. */
  ttsRate: number;
  /**
   * Fallback language for highlighted text when detection confidence is low.
   * High/medium-confidence saves use detected language instead.
   */
  sourceLanguage: string;
};

export type LrStorageSnapshot = {
  lr_meta: LrMeta;
  lr_settings: LrSettings;
  lr_wild_words: ExtensionWildWord[];
};
