import { browser } from "wxt/browser";

import {
  emergencySaveLanguageAfterDetectorFailure,
  resolveSaveLanguage,
  type LanguageDetectionResult,
} from "./language-detect";
import type { ExtensionWildWord, LrMeta, LrSettings } from "./types";
import { buildLexemeKey } from "./lexeme-key";

export const SCHEMA_VERSION = 1;
export const EXTENSION_VERSION = "0.1.0";

export const STORAGE_KEYS = Object.freeze({
  meta: "lr_meta",
  settings: "lr_settings",
  wildWords: "lr_wild_words",
} as const);

export const DEFAULT_SETTINGS: LrSettings = Object.freeze({
  /** Language of highlighted text (V1: user-chosen, default English). */
  sourceLanguage: "en",
  /** Language to translate/explain saved words into. */
  targetLanguage: "es",
  ttsRate: 1,
});

/** Legacy shape: `wordLanguage` was previously the only language field and was written to `record.language`. */
type RawStoredSettings = Partial<LrSettings & { wordLanguage?: string }>;

function normalizeLoadedSettings(raw: unknown): LrSettings {
  const s = raw as RawStoredSettings | undefined;
  const sourceLanguage =
    s?.sourceLanguage ?? s?.wordLanguage ?? DEFAULT_SETTINGS.sourceLanguage;
  const targetLanguage = s?.targetLanguage ?? DEFAULT_SETTINGS.targetLanguage;
  const ttsRate =
    s?.ttsRate != null ? clamp(s.ttsRate, 0.5, 2) : DEFAULT_SETTINGS.ttsRate;
  return {
    sourceLanguage,
    targetLanguage,
    ttsRate,
  };
}

export function defaultMeta(): LrMeta {
  return {
    schemaVersion: SCHEMA_VERSION,
    extensionVersion: EXTENSION_VERSION,
  };
}

const MAX_URL_LEN = 2048;

export function toSourceItemId(pageUrl: string): string {
  const trimmed = pageUrl.trim();
  if (trimmed.length <= MAX_URL_LEN) {
    return trimmed;
  }
  return trimmed.slice(0, MAX_URL_LEN);
}

export function domainFromUrl(pageUrl: string): string {
  try {
    return new URL(pageUrl).hostname;
  } catch {
    return "";
  }
}

export function normalizeDedupeText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function buildWildWordRecord(
  input: {
    text: string;
    contextSentence?: string;
    pageUrl: string;
    pageTitle: string;
    settings: LrSettings;
    saveLanguage: string;
    detectedLanguage?: string;
    detectedLanguageConfidence?: ExtensionWildWord["detectedLanguageConfidence"];
    detectedLanguageReason?: string;
  },
  id: string,
): ExtensionWildWord {
  const now = new Date().toISOString();
  const url = input.pageUrl;
  return {
    id,
    clientGeneratedId: id,
    language: input.saveLanguage,
    lexemeKey: buildLexemeKey(input.saveLanguage, input.text),
    targetLanguage: input.settings.targetLanguage,
    detectedLanguage: input.detectedLanguage,
    detectedLanguageConfidence: input.detectedLanguageConfidence,
    detectedLanguageReason: input.detectedLanguageReason,
    text: input.text,
    sourceItemId: toSourceItemId(url),
    sourceTitle: input.pageTitle || "(untitled)",
    contextSentence: input.contextSentence,
    pronunciation: undefined,
    translation: undefined,
    savedAt: now,
    updatedAt: now,
    sourceKind: "web",
    sourceUrl: url,
    sourceDomain: domainFromUrl(url),
    syncStatus: "local",
  };
}

export async function getWildWords(): Promise<ExtensionWildWord[]> {
  const res = await browser.storage.local.get(STORAGE_KEYS.wildWords);
  const raw = res[STORAGE_KEYS.wildWords];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw as ExtensionWildWord[];
}

/** Remove one saved word by `id`; returns whether a row was removed. Schema unchanged. */
export async function removeWildWordById(id: string): Promise<boolean> {
  const existing = await getWildWords();
  const next = existing.filter((w) => w.id !== id);
  if (next.length === existing.length) {
    return false;
  }
  await browser.storage.local.set({
    [STORAGE_KEYS.wildWords]: next,
  });
  return true;
}

export type UpsertOutcome = "saved" | "already_saved";

export async function upsertWildWord(input: {
  text: string;
  contextSentence?: string;
  pageUrl: string;
  pageTitle: string;
  settings: LrSettings;
}): Promise<{ outcome: UpsertOutcome; word: ExtensionWildWord }> {
  const text = input.text.replace(/\s+/g, " ").trim();
  if (!text) {
    throw new Error("Empty selection.");
  }
  const inputTrimmed = { ...input, text };

  let saveLanguage: string;
  let detection: LanguageDetectionResult;
  try {
    const resolved = resolveSaveLanguage(
      text,
      input.settings.sourceLanguage,
      input.contextSentence,
    );
    saveLanguage = resolved.saveLanguage;
    detection = resolved.detection;
  } catch (cause) {
    const recovered = emergencySaveLanguageAfterDetectorFailure(input.settings.sourceLanguage, cause);
    saveLanguage = recovered.saveLanguage;
    detection = recovered.detection;
  }

  const urlKey = toSourceItemId(input.pageUrl);
  const norm = normalizeDedupeText(text);

  const existing = await getWildWords();
  const idx = existing.findIndex(
    (w) =>
      normalizeDedupeText(w.text) === norm &&
      w.sourceItemId === urlKey &&
      w.language === saveLanguage,
  );

  const now = new Date().toISOString();
  const detectionFields = {
    detectedLanguage:
      detection.language !== "und" ? detection.language : saveLanguage,
    detectedLanguageConfidence: detection.confidence,
    detectedLanguageReason: detection.reason,
  };

  if (idx === -1) {
    const id = crypto.randomUUID();
    const record = buildWildWordRecord(
      { ...inputTrimmed, saveLanguage, ...detectionFields },
      id,
    );
    await browser.storage.local.set({
      [STORAGE_KEYS.wildWords]: [record, ...existing],
    });
    return { outcome: "saved", word: record };
  }

  const prev = existing[idx]!;
  const refreshedKey = buildLexemeKey(saveLanguage, inputTrimmed.text);
  const updated: ExtensionWildWord = {
    ...prev,
    updatedAt: now,
    targetLanguage: input.settings.targetLanguage,
    lexemeKey: refreshedKey,
    ...detectionFields,
    sourceTitle: input.pageTitle || prev.sourceTitle,
    sourceUrl: input.pageUrl,
    sourceDomain: domainFromUrl(input.pageUrl),
    contextSentence: input.contextSentence ?? prev.contextSentence,
  };

  const rest = existing.filter((_, i) => i !== idx);
  await browser.storage.local.set({
    [STORAGE_KEYS.wildWords]: [updated, ...rest],
  });

  return { outcome: "already_saved", word: updated };
}

export async function getSettings(): Promise<LrSettings> {
  const res = await browser.storage.local.get(STORAGE_KEYS.settings);
  return normalizeLoadedSettings(res[STORAGE_KEYS.settings]);
}

export async function setSettings(patch: Partial<LrSettings>): Promise<LrSettings> {
  const current = await getSettings();
  const next: LrSettings = {
    ...current,
    ...patch,
    ttsRate:
      patch.ttsRate != null ? clamp(patch.ttsRate, 0.5, 2) : clamp(current.ttsRate, 0.5, 2),
  };
  await browser.storage.local.set({ [STORAGE_KEYS.settings]: next });
  return next;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
