/** ISO 639-1 codes used in My Words labels. */
const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  it: "Italian",
};

/** Human-readable language name for card labels (e.g. "Definition (English)"). */
export function getLanguageDisplayName(languageCode: string): string {
  const code = languageCode.trim().toLowerCase();
  if (!code) {
    return languageCode;
  }
  return LANGUAGE_DISPLAY_NAMES[code] ?? code.toUpperCase();
}
