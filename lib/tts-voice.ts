"use client";

/**
 * System TTS voice selection. Browsers load voices asynchronously (`voiceschanged`).
 *
 * If Spanish still sounds wrong, install a Spanish system voice:
 * - iPhone: Settings → Accessibility → Spoken Content → Voices → Spanish → download a voice
 * - Windows: Settings → Time & Language → Speech → add a Spanish voice
 * - macOS: System Settings → Accessibility → Spoken Content → System Voice → Manage Voices
 */

const LANGUAGE_PREFERENCES: Record<string, { locales: string[]; base: string; fallbackLocale: string }> = {
  es: {
    locales: ["es-ES", "es-MX", "es-US", "es-419"],
    base: "es",
    fallbackLocale: "es-ES",
  },
  fr: { locales: ["fr-FR"], base: "fr", fallbackLocale: "fr-FR" },
  de: { locales: ["de-DE"], base: "de", fallbackLocale: "de-DE" },
  it: { locales: ["it-IT"], base: "it", fallbackLocale: "it-IT" },
  ru: { locales: ["ru-RU"], base: "ru", fallbackLocale: "ru-RU" },
  ar: { locales: ["ar-SA"], base: "ar", fallbackLocale: "ar-SA" },
  en: { locales: ["en-US", "en-GB"], base: "en", fallbackLocale: "en-US" },
};

const SPANISH_NAME_HINTS = [
  "spanish",
  "español",
  "espanol",
  "mexico",
  "méxico",
  "spain",
  "españa",
  "espana",
];

const selectedVoiceByLanguage = new Map<string, { name: string; lang: string }>();
const missingVoiceWarningByLanguage = new Set<string>();
let voiceInventory: SpeechSynthesisVoice[] = [];
let voiceListenerRegistered = false;

function getLanguageKey(language: string): string {
  const normalized = language.trim().toLowerCase();
  if (!normalized) {
    return "en";
  }
  const base = normalized.split("-")[0] ?? "en";
  return LANGUAGE_PREFERENCES[base] ? base : "en";
}

/** BCP-47 tags sometimes use underscores (e.g. es_ES) in the Web Speech API. */
function normalizeVoiceLangTag(lang: string): string {
  return lang.trim().replace(/_/g, "-").toLowerCase();
}

function getSpeechSynthesisHandle(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return null;
  }
  return window.speechSynthesis;
}

function refreshVoices(): SpeechSynthesisVoice[] {
  const synth = getSpeechSynthesisHandle();
  if (!synth) {
    voiceInventory = [];
    return [];
  }
  voiceInventory = synth.getVoices();
  return voiceInventory;
}

function ensureVoiceInventoryReady(): SpeechSynthesisVoice[] {
  const synth = getSpeechSynthesisHandle();
  if (!synth) {
    return [];
  }
  if (!voiceListenerRegistered) {
    synth.addEventListener("voiceschanged", refreshVoices);
    voiceListenerRegistered = true;
  }
  if (voiceInventory.length === 0) {
    refreshVoices();
  }
  return voiceInventory;
}

function findVoiceByIdentity(
  voices: SpeechSynthesisVoice[],
  identity: { name: string; lang: string }
): SpeechSynthesisVoice | null {
  return voices.find((voice) => voice.name === identity.name && voice.lang === identity.lang) ?? null;
}

function voiceMatchesLanguageBase(voice: SpeechSynthesisVoice, base: string): boolean {
  const langNorm = normalizeVoiceLangTag(voice.lang);
  const b = base.toLowerCase();
  return langNorm === b || langNorm.startsWith(`${b}-`);
}

function chooseSpanishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const entries = voices.map((voice) => ({
    voice,
    langNorm: normalizeVoiceLangTag(voice.lang),
    nameLower: voice.name.toLowerCase(),
  }));

  const preferredLocales = LANGUAGE_PREFERENCES.es.locales.map((l) => l.toLowerCase());
  for (const locale of preferredLocales) {
    const hit = entries.find((e) => e.langNorm === locale);
    if (hit) {
      return hit.voice;
    }
  }

  const anyEsLang = entries.find((e) => e.langNorm === "es" || e.langNorm.startsWith("es-"));
  if (anyEsLang) {
    return anyEsLang.voice;
  }

  for (const e of entries) {
    if (SPANISH_NAME_HINTS.some((hint) => e.nameLower.includes(hint))) {
      return e.voice;
    }
  }

  return null;
}

function chooseVoiceForLanguage(voices: SpeechSynthesisVoice[], languageKey: string): SpeechSynthesisVoice | null {
  if (languageKey === "es") {
    return chooseSpanishVoice(voices);
  }

  const prefs = LANGUAGE_PREFERENCES[languageKey] ?? LANGUAGE_PREFERENCES.en;
  const normalizedVoices = voices.map((voice) => ({
    voice,
    langLower: normalizeVoiceLangTag(voice.lang),
  }));

  for (const locale of prefs.locales) {
    const localeLower = locale.toLowerCase();
    const exact = normalizedVoices.find((entry) => entry.langLower === localeLower);
    if (exact) {
      return exact.voice;
    }
  }

  const basePrefix = `${prefs.base.toLowerCase()}-`;
  const baseMatch =
    normalizedVoices.find(
      (entry) => entry.langLower === prefs.base.toLowerCase() || entry.langLower.startsWith(basePrefix)
    ) ?? null;
  return baseMatch?.voice ?? null;
}

function isCachedVoiceStillValid(voice: SpeechSynthesisVoice, languageKey: string): boolean {
  return voiceMatchesLanguageBase(voice, languageKey);
}

export function getTargetLocaleForLanguage(language: string): string {
  const languageKey = getLanguageKey(language);
  return (LANGUAGE_PREFERENCES[languageKey] ?? LANGUAGE_PREFERENCES.en).fallbackLocale;
}

/** Map short or regional tags to the BCP-47 locale used for card/lesson TTS (e.g. `es` → `es-ES`). */
export function normalizeLanguageCodeForTts(language: string): string {
  return getTargetLocaleForLanguage(language);
}

export function getMatchingVoicesForLanguage(language: string): SpeechSynthesisVoice[] {
  const languageKey = getLanguageKey(language);
  const voices = ensureVoiceInventoryReady();
  return voices.filter((voice) => voiceMatchesLanguageBase(voice, languageKey));
}

/** True if at least one Spanish-capable system voice is listed (after async load). */
export function hasSpanishSystemVoice(): boolean {
  const voices = ensureVoiceInventoryReady();
  return chooseSpanishVoice(voices) !== null;
}

export function getPreferredVoiceForLanguage(language: string): SpeechSynthesisVoice | null {
  const languageKey = getLanguageKey(language);
  const voices = ensureVoiceInventoryReady();
  if (voices.length === 0) {
    return null;
  }

  const cachedIdentity = selectedVoiceByLanguage.get(languageKey);
  if (cachedIdentity) {
    const cachedVoice = findVoiceByIdentity(voices, cachedIdentity);
    if (cachedVoice && isCachedVoiceStillValid(cachedVoice, languageKey)) {
      return cachedVoice;
    }
    selectedVoiceByLanguage.delete(languageKey);
  }

  const selectedVoice = chooseVoiceForLanguage(voices, languageKey);
  if (!selectedVoice) {
    return null;
  }
  selectedVoiceByLanguage.set(languageKey, { name: selectedVoice.name, lang: selectedVoice.lang });
  return selectedVoice;
}

export function ensureTtsVoicesLoaded(): void {
  ensureVoiceInventoryReady();
}

export function formatAvailableVoiceLangs(voices: SpeechSynthesisVoice[]): string {
  const unique = Array.from(new Set(voices.map((v) => normalizeVoiceLangTag(v.lang || "")).filter(Boolean)));
  unique.sort();
  const max = 60;
  if (unique.length <= max) {
    return unique.join(", ");
  }
  return `${unique.slice(0, max).join(", ")} …+${unique.length - max} more`;
}

export function speakTextWithPreferredVoice(text: string, language: string, rate: number): void {
  const synth = getSpeechSynthesisHandle();
  if (!synth) {
    return;
  }
  const normalizedLanguage = normalizeLanguageCodeForTts(language);
  const languageKey = getLanguageKey(normalizedLanguage);
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = normalizedLanguage;
  utterance.rate = rate;

  ensureVoiceInventoryReady();
  const preferredVoice = getPreferredVoiceForLanguage(normalizedLanguage);

  if (preferredVoice) {
    utterance.voice = preferredVoice;
  } else if (process.env.NODE_ENV === "development" && !missingVoiceWarningByLanguage.has(languageKey)) {
    console.warn(`No TTS voice found for ${languageKey}; using browser default.`);
    missingVoiceWarningByLanguage.add(languageKey);
  }

  synth.cancel();
  synth.speak(utterance);
}
