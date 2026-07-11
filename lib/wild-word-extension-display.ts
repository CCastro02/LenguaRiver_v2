import type { UserWildWord } from "@/lib/explore-content";
import { EXTENSION_LEGACY_DEFAULT_TARGET_LANGUAGE } from "@/lib/wild-word-schema";

/** Labels what we show/read for language (display + speech); stored `language` is never rewritten. */
export type WildWordLanguagePresentation = {
  displayCode: string;
  speechCode: string;
  note: string | null;
};

/**
 * Printed ASCII heuristic: extension rows mislabeled as `es` before sourceLanguage reliably reflected English highlights.
 */
function wildWordTextLooksAsciiOnlyWithLatinLetters(text: string): boolean {
  const t = text.trim();
  if (!t) {
    return false;
  }
  for (let i = 0; i < t.length; i += 1) {
    const c = t.charCodeAt(i);
    if (c < 32 || c > 126) {
      return false;
    }
  }
  return /[A-Za-z]/.test(t);
}

/**
 * Extension captures always persist `sourceUrl` (page URL). Explore-only saves in the web app do not, so this safely
 * distinguishes imported extension rows without relying on `sourceKind` (often absent on older exports).
 */
function rawRecordLooksLikeExtensionWebCapture(rawRecord: Record<string, unknown>): boolean {
  const sourceKind =
    typeof rawRecord.sourceKind === "string" ? rawRecord.sourceKind.trim().toLowerCase() : "";
  if (sourceKind && sourceKind !== "web") {
    return false;
  }
  const sourceUrl = typeof rawRecord.sourceUrl === "string" ? rawRecord.sourceUrl.trim() : "";
  const sourceItemId = typeof rawRecord.sourceItemId === "string" ? rawRecord.sourceItemId.trim() : "";
  const candidateUrl =
    sourceUrl.length > 0
      ? sourceUrl
      : sourceItemId.startsWith("http://") || sourceItemId.startsWith("https://")
        ? sourceItemId
        : "";
  if (candidateUrl.length > 0) {
    try {
      const u = new URL(candidateUrl);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return sourceKind === "web";
    }
  }
  return sourceKind === "web";
}

/**
 * Read-only language display for extension-originated rows: if the word is clearly ASCII/English-looking but was stored
 * as Spanish while the learner target is Spanish, show/TTS as English (does not change `word.language` in storage).
 */
export function buildWildWordLanguagePresentation(
  rawRecord: Record<string, unknown>,
  word: Pick<UserWildWord, "language" | "text">
): WildWordLanguagePresentation {
  const extensionWeb = rawRecordLooksLikeExtensionWebCapture(rawRecord);
  let targetLanguage =
    typeof rawRecord.targetLanguage === "string" ? rawRecord.targetLanguage.trim().toLowerCase() : "";
  /* Legacy extension JSON omitted `targetLanguage`; see wild-word-schema.ts */
  if (extensionWeb && targetLanguage === "") {
    targetLanguage = EXTENSION_LEGACY_DEFAULT_TARGET_LANGUAGE;
  }
  const storedLang = word.language.trim().toLowerCase();

  if (
    extensionWeb &&
    targetLanguage === "es" &&
    storedLang === "es" &&
    wildWordTextLooksAsciiOnlyWithLatinLetters(word.text)
  ) {
    return {
      displayCode: "en",
      speechCode: "en",
      note: null,
    };
  }
  return {
    displayCode: word.language.trim() || word.language,
    speechCode: word.language.trim() || word.language,
    note: null,
  };
}
