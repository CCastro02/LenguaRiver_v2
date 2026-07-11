/**
 * Lightweight V1 language detection for highlighted text at save time.
 * Supported: en, es, fr, de, it, ru, ar, ja, zh — script/markers/wordlists + context fallback.
 *
 * @sync **Source of truth (shared core):** keep identical to
 * `LenguaRiver/lib/language-detect.ts` for everything through
 * `resolveContextSentenceLanguage` (wordlists, plural variants, scoring, reason strings).
 * - Update **both** files together when changing detection rules.
 * - Run `npm run verify:language-detect-sync` from `LenguaRiver/` after every change.
 * - Extension-only below: `resolveSaveLanguage`, `emergencySaveLanguageAfterDetectorFailure`.
 * - Web-only (other file): `resolveWildWordDetectLanguage` (exported `isUsableDetection`).
 */

export const DETECTABLE_LANGUAGES = [
  "en",
  "es",
  "fr",
  "de",
  "it",
  "ru",
  "ar",
  "ja",
  "zh",
] as const;

export type DetectableLanguage = (typeof DETECTABLE_LANGUAGES)[number];
export type ResolvedLanguage = DetectableLanguage | "und";
export type DetectionConfidence = "high" | "medium" | "low";
export type DetectionSource = "selected" | "context" | "fallback";

export type LanguageDetectionResult = {
  language: ResolvedLanguage;
  confidence: DetectionConfidence;
  reason: string;
  source: DetectionSource;
};

const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/u;
const CYRILLIC_SCRIPT = /[\u0400-\u04FF]/u;
const JAPANESE_SCRIPT = /[\u3040-\u309F\u30A0-\u30FF]/u;
const CJK_IDEOGRAPH_SCRIPT = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u;
const SPANISH_MARKERS = /[ñáéíóúü¿¡]/iu;
const GERMAN_MARKERS = /[äöüß]/iu;
const GERMAN_UNIQUE_MARKERS = /[äöß]/iu;
const FRENCH_UNIQUE_MARKERS = /[çœ]/iu;
const FRENCH_ACCENT_MARKERS = /[àèéêù]/iu;
const ITALIAN_MARKERS = /[ìò]/iu;

const SCORED_LATIN_LANGS = ["en", "es", "fr", "de", "it"] as const;
type ScoredLatinLang = (typeof SCORED_LATIN_LANGS)[number];
type LangScores = Record<ScoredLatinLang, number>;

const SPANISH_COMMON_WORDS = new Set([
  "bienvenidos",
  "bienvenida",
  "bienvenido",
  "mesa",
  "mesas",
  "colonial",
  "coloniales",
  "hola",
  "gracias",
  "mañana",
  "voy",
  "pedir",
  "quiero",
  "café",
  "cafe",
  "por",
  "favor",
  "una",
  "un",
  "el",
  "la",
  "los",
  "las",
  "de",
  "que",
  "y",
  "en",
  "pronto",
  "disculpe",
  "recurso",
  "estudiantes",
  "profesores",
  "amantes",
  "idioma",
  "español",
  "espanola",
  "española",
  "españolas",
  "espanolas",
  "nuevo",
  "nueva",
  "aquí",
  "aqui",
  "pagina",
  "página",
  "explorar",
  "populares",
  "visitante",
  "descubrir",
  "hasta",
]);

const ENGLISH_COMMON_WORDS = new Set([
  "paid",
  "free",
  "trial",
  "welcome",
  "hello",
  "please",
  "coffee",
  "the",
  "and",
  "is",
  "are",
  "you",
  "can",
  "use",
  "with",
  "learning",
  "knowledge",
  "coding",
  "development",
  "web",
  "website",
  "websites",
  "platform",
  "platforms",
  "translation",
  "translations",
  "manual",
  "work",
  "helpful",
  "tool",
  "know",
  "down",
  "line",
  "pretty",
  "smoothly",
  "focusing",
  "managing",
]);

const FRENCH_COMMON_WORDS = new Set([
  "bonjour",
  "merci",
  "oui",
  "non",
  "s'il",
  "vous",
  "nous",
  "avec",
  "pour",
  "dans",
  "une",
  "un",
  "le",
  "la",
  "les",
  "des",
  "je",
  "suis",
  "être",
  "etre",
  "avoir",
  "aller",
  "maison",
  "café",
  "cafe",
  "eau",
  "pain",
]);

const GERMAN_COMMON_WORDS = new Set([
  "hallo",
  "danke",
  "ja",
  "nein",
  "bitte",
  "ich",
  "du",
  "sie",
  "wir",
  "mit",
  "für",
  "fur",
  "und",
  "der",
  "die",
  "das",
  "ein",
  "eine",
  "haus",
  "wasser",
  "brot",
  "kaffee",
  "gehen",
  "sein",
  "haben",
]);

const ITALIAN_COMMON_WORDS = new Set([
  "ciao",
  "grazie",
  "sì",
  "si",
  "no",
  "favore",
  "io",
  "tu",
  "noi",
  "voi",
  "con",
  "per",
  "nel",
  "nella",
  "una",
  "un",
  "il",
  "lo",
  "la",
  "gli",
  "le",
  "casa",
  "acqua",
  "pane",
  "caffè",
  "caffe",
  "andare",
  "essere",
  "avere",
]);
function normalizeFallback(fallbackLanguage: string): DetectableLanguage | "und" {
  const base = fallbackLanguage.trim().split(/[-_]/u)[0]?.toLowerCase() ?? "";
  if ((DETECTABLE_LANGUAGES as readonly string[]).includes(base)) {
    return base as DetectableLanguage;
  }
  return "und";
}

function tokenize(text: string): string[] {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/u)
    .map((t) => t.replace(/^['"]+|['"]+$/gu, "").trim())
    .filter(Boolean);
}

/**
 * Surface variants used only against static wordlists — does **not** change stored selection text.
 * Heuristic plurals: drop trailing `s`, then trailing `es` where length allows (mesas→mesa;
 * coloniales→colonial). Unknown surfaces still resolve safely to `{ token }`.
 */
function surfaceVariantsForWordlist(surfaceToken: string): string[] {
  const t = surfaceToken.normalize("NFC").toLowerCase().replace(/^['"]+|['"]+$/gu, "").trim();
  if (!t) {
    return [];
  }
  const out = new Set<string>([t]);
  if (t.length >= 4 && t.endsWith("s") && !t.endsWith("ss")) {
    const minusS = t.slice(0, -1);
    if (minusS.length >= 2) {
      out.add(minusS);
    }
  }
  if (t.length >= 5 && t.endsWith("es")) {
    const minusEs = t.slice(0, -2);
    if (minusEs.length >= 2) {
      out.add(minusEs);
    }
  }
  return [...out];
}

function hitsWordlist(token: string, words: Set<string>): boolean {
  return surfaceVariantsForWordlist(token).some((v) => words.has(v));
}

function hitsSpanishWordlist(token: string): boolean {
  return hitsWordlist(token, SPANISH_COMMON_WORDS);
}

function hitsEnglishWordlist(token: string): boolean {
  return hitsWordlist(token, ENGLISH_COMMON_WORDS);
}

function hitsFrenchWordlist(token: string): boolean {
  return hitsWordlist(token, FRENCH_COMMON_WORDS);
}

function hitsGermanWordlist(token: string): boolean {
  return hitsWordlist(token, GERMAN_COMMON_WORDS);
}

function hitsItalianWordlist(token: string): boolean {
  return hitsWordlist(token, ITALIAN_COMMON_WORDS);
}

function emptyLangScores(): LangScores {
  return { en: 0, es: 0, fr: 0, de: 0, it: 0 };
}

function scoreWordlists(tokens: string[]): LangScores {
  const scores = emptyLangScores();
  for (const token of tokens) {
    if (hitsSpanishWordlist(token)) {
      scores.es += 1;
    }
    if (hitsEnglishWordlist(token)) {
      scores.en += 1;
    }
    if (hitsFrenchWordlist(token)) {
      scores.fr += 1;
    }
    if (hitsGermanWordlist(token)) {
      scores.de += 1;
    }
    if (hitsItalianWordlist(token)) {
      scores.it += 1;
    }
  }
  return scores;
}

function languagesHitByToken(token: string): ScoredLatinLang[] {
  const hits: ScoredLatinLang[] = [];
  if (hitsEnglishWordlist(token)) {
    hits.push("en");
  }
  if (hitsSpanishWordlist(token)) {
    hits.push("es");
  }
  if (hitsFrenchWordlist(token)) {
    hits.push("fr");
  }
  if (hitsGermanWordlist(token)) {
    hits.push("de");
  }
  if (hitsItalianWordlist(token)) {
    hits.push("it");
  }
  return hits;
}

function applyMarkerBoosts(text: string, scores: LangScores): LangScores {
  const out = { ...scores };
  if (GERMAN_MARKERS.test(text)) {
    out.de += 2;
  }
  if (ITALIAN_MARKERS.test(text)) {
    out.it += 1;
  }
  if (SPANISH_MARKERS.test(text)) {
    out.es += 1;
  }
  if (FRENCH_UNIQUE_MARKERS.test(text)) {
    out.fr += 2;
  }
  if (FRENCH_ACCENT_MARKERS.test(text)) {
    const romanceMax = Math.max(out.fr, out.es, out.it);
    if (out.fr >= romanceMax - 1) {
      out.fr += 1;
    }
  }
  return out;
}

function formatScoreSummary(scores: LangScores): string {
  return `en:${scores.en} es:${scores.es} fr:${scores.fr} de:${scores.de} it:${scores.it}`;
}

function rankedScores(scores: LangScores): { lang: ScoredLatinLang; score: number }[] {
  return SCORED_LATIN_LANGS.map((lang) => ({ lang, score: scores[lang] }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
}

function detectionResult(
  language: ResolvedLanguage,
  confidence: DetectionConfidence,
  source: DetectionSource,
  detail: string,
): LanguageDetectionResult {
  return {
    language,
    confidence,
    source,
    reason: `${source}: ${detail}`,
  };
}

function markerOnlyFallback(
  text: string,
  source: DetectionSource,
  prefix: string,
): LanguageDetectionResult | null {
  if (GERMAN_UNIQUE_MARKERS.test(text)) {
    return detectionResult("de", "medium", source, `${prefix}german unique markers`);
  }
  if (ITALIAN_MARKERS.test(text)) {
    return detectionResult("it", "medium", source, `${prefix}italian markers`);
  }
  if (FRENCH_UNIQUE_MARKERS.test(text)) {
    return detectionResult("fr", "medium", source, `${prefix}french unique markers`);
  }
  if (SPANISH_MARKERS.test(text)) {
    return detectionResult("es", "medium", source, `${prefix}spanish markers`);
  }
  return null;
}

function resolveFromPhraseScores(
  scores: LangScores,
  source: DetectionSource,
  detailPrefix: string,
  opts: { hasSpanishMarkers: boolean; mode: "selected" | "context" },
): LanguageDetectionResult {
  const ranked = rankedScores(scores);
  const summary = formatScoreSummary(scores);

  if (ranked.length === 0) {
    return detectionResult("und", "low", source, `${detailPrefix}no wordlist hits (${summary})`);
  }

  const top = ranked[0]!;
  const second = ranked[1]?.score ?? 0;
  const margin = top.score - second;

  if (ranked.length === 1) {
    const confidence: DetectionConfidence =
      top.score >= 2 || (opts.mode === "selected" && top.lang === "de" && top.score >= 1)
        ? "high"
        : "medium";
    return detectionResult(
      top.lang,
      confidence,
      source,
      `${detailPrefix}phrase score ${summary}`,
    );
  }

  if (opts.mode === "context") {
    if (margin >= 3 && top.score >= 3) {
      return detectionResult(top.lang, "high", source, `${detailPrefix}score ${summary}`);
    }
    if (margin >= 2 && top.score >= 2) {
      return detectionResult(top.lang, "medium", source, `${detailPrefix}score ${summary}`);
    }
    return detectionResult(
      "und",
      "low",
      source,
      `${detailPrefix}weak ${top.lang} lead ${summary}`,
    );
  }

  const confidence: DetectionConfidence =
    margin >= 2 || (opts.hasSpanishMarkers && top.lang === "es" && margin >= 1)
      ? "high"
      : "medium";

  return detectionResult(
    top.lang,
    confidence,
    source,
    `${detailPrefix}phrase score ${summary}`,
  );
}

function isUsableDetection(
  detection: LanguageDetectionResult,
): detection is LanguageDetectionResult & { language: DetectableLanguage } {
  return (
    (detection.confidence === "high" || detection.confidence === "medium") &&
    detection.language !== "und"
  );
}

/**
 * Detect the language of highlighted text only (no context, no settings fallback).
 */
export function resolveSelectedTextLanguage(
  text: string,
  _fallbackLanguage?: string,
): LanguageDetectionResult {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return detectionResult("und", "low", "selected", "empty text");
  }

  if (ARABIC_SCRIPT.test(trimmed)) {
    return detectionResult("ar", "high", "selected", "arabic script");
  }

  if (CYRILLIC_SCRIPT.test(trimmed)) {
    return detectionResult("ru", "high", "selected", "cyrillic script");
  }

  if (JAPANESE_SCRIPT.test(trimmed)) {
    return detectionResult("ja", "high", "selected", "japanese kana script");
  }

  if (CJK_IDEOGRAPH_SCRIPT.test(trimmed)) {
    return detectionResult("zh", "high", "selected", "cjk ideograph script");
  }

  const hasSpanishMarkers = SPANISH_MARKERS.test(trimmed);
  const tokens = tokenize(trimmed);
  const baseScores = scoreWordlists(tokens);

  if (GERMAN_UNIQUE_MARKERS.test(trimmed) && baseScores.en === 0) {
    return detectionResult("de", "high", "selected", "german unique orthography markers");
  }

  if (
    hasSpanishMarkers &&
    baseScores.en === 0 &&
    baseScores.es > 0 &&
    baseScores.es >= baseScores.fr &&
    baseScores.es >= baseScores.it
  ) {
    return detectionResult("es", "high", "selected", "spanish orthography markers");
  }

  if (tokens.length === 1) {
    const token = tokens[0]!;
    const hits = languagesHitByToken(token);

    if (hits.length === 1) {
      return detectionResult(
        hits[0]!,
        "high",
        "selected",
        `${hits[0]} wordlist: ${token}`,
      );
    }

    if (hits.length > 1) {
      if (hits.includes("de") && GERMAN_UNIQUE_MARKERS.test(trimmed)) {
        return detectionResult("de", "high", "selected", `german markers + wordlist: ${token}`);
      }
      if (hits.includes("it") && (ITALIAN_MARKERS.test(trimmed) || token === "gli" || token === "nella" || token === "nel")) {
        return detectionResult("it", "high", "selected", `italian disambiguation: ${token}`);
      }
      if (hits.includes("es") && hasSpanishMarkers && !hits.includes("en")) {
        return detectionResult("es", "medium", "selected", `ambiguous romance token: ${token}`);
      }
      const leader = hits.includes("fr")
        ? "fr"
        : hits.includes("es")
          ? "es"
          : hits[0]!;
      return detectionResult(
        leader,
        "medium",
        "selected",
        `ambiguous wordlist token: ${token}`,
      );
    }

    if (GERMAN_UNIQUE_MARKERS.test(trimmed)) {
      return detectionResult("de", "medium", "selected", "german markers on single token");
    }
    if (ITALIAN_MARKERS.test(trimmed)) {
      return detectionResult("it", "medium", "selected", "italian markers on single token");
    }
    if (FRENCH_UNIQUE_MARKERS.test(trimmed)) {
      return detectionResult("fr", "medium", "selected", "french markers on single token");
    }
    if (hasSpanishMarkers) {
      return detectionResult("es", "medium", "selected", "spanish markers on single token");
    }
    return detectionResult("und", "low", "selected", "single token without strong signals");
  }

  const scores = applyMarkerBoosts(trimmed, baseScores);
  const total = SCORED_LATIN_LANGS.reduce((sum, lang) => sum + scores[lang], 0);

  if (total === 0) {
    const markerOnly = markerOnlyFallback(trimmed, "selected", "");
    if (markerOnly) {
      return markerOnly;
    }
    return detectionResult("und", "low", "selected", "no wordlist hits");
  }

  return resolveFromPhraseScores(scores, "selected", "", {
    hasSpanishMarkers,
    mode: "selected",
  });
}

/**
 * Score a surrounding sentence when the selected token alone is ambiguous.
 */
export function resolveContextSentenceLanguage(contextSentence: string): LanguageDetectionResult {
  const trimmed = contextSentence.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return detectionResult("und", "low", "context", "empty context");
  }

  if (ARABIC_SCRIPT.test(trimmed)) {
    return detectionResult("ar", "high", "context", "arabic script in context");
  }

  if (CYRILLIC_SCRIPT.test(trimmed)) {
    return detectionResult("ru", "high", "context", "cyrillic script in context");
  }

  if (JAPANESE_SCRIPT.test(trimmed)) {
    return detectionResult("ja", "high", "context", "japanese kana script in context");
  }

  if (CJK_IDEOGRAPH_SCRIPT.test(trimmed)) {
    return detectionResult("zh", "high", "context", "cjk ideograph script in context");
  }

  const hasSpanishMarkers = SPANISH_MARKERS.test(trimmed);
  const scores = applyMarkerBoosts(trimmed, scoreWordlists(tokenize(trimmed)));
  const total = SCORED_LATIN_LANGS.reduce((sum, lang) => sum + scores[lang], 0);

  if (total === 0) {
    const markerOnly = markerOnlyFallback(trimmed, "context", "");
    if (markerOnly) {
      return markerOnly;
    }
    return detectionResult("und", "low", "context", "no wordlist hits in context");
  }

  return resolveFromPhraseScores(scores, "context", "", {
    hasSpanishMarkers,
    mode: "context",
  });
}

function sanitizeDetectorFailureMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message.trim()) {
    return reason.message.slice(0, 200).replace(/\s+/gu, " ").trim();
  }
  if (typeof reason === "string" && reason.trim()) {
    return reason.slice(0, 200).replace(/\s+/gu, " ").trim();
  }
  return "unknown error";
}

/**
 * Recover when detection throws unexpectedly (belt-and-suspenders for storage layer).
 *
 * @internal
 */
export function emergencySaveLanguageAfterDetectorFailure(
  settingsSourceLanguage: string,
  cause: unknown,
): { saveLanguage: string; detection: LanguageDetectionResult } {
  const safe = sanitizeDetectorFailureMessage(cause);
  const fallback = normalizeFallback(settingsSourceLanguage);
  const saveLanguage =
    fallback !== "und" ? fallback : settingsSourceLanguage.trim().split(/[-_]/u)[0]?.toLowerCase() || "en";
  const detection = detectionResult(
    saveLanguage as ResolvedLanguage,
    "low",
    "fallback",
    `detector failed: ${safe}`,
  );
  return { saveLanguage, detection };
}

function resolveSaveLanguageUnsafe(
  text: string,
  fallbackLanguage: string,
  contextSentence?: string,
): {
  saveLanguage: string;
  detection: LanguageDetectionResult;
} {
  const trimmedForDetect = text.replace(/\s+/g, " ").trim();
  const tokenDetection = resolveSelectedTextLanguage(trimmedForDetect);
  if (isUsableDetection(tokenDetection)) {
    return { saveLanguage: tokenDetection.language, detection: tokenDetection };
  }

  const contextTrimmed = contextSentence?.replace(/\s+/g, " ").trim();
  if (contextTrimmed) {
    const contextDetection = resolveContextSentenceLanguage(contextTrimmed);
    if (isUsableDetection(contextDetection)) {
      return { saveLanguage: contextDetection.language, detection: contextDetection };
    }
  }

  const fallback = normalizeFallback(fallbackLanguage);
  const saveLanguage =
    fallback !== "und" ? fallback : fallbackLanguage.trim() || "en";

  const detection = detectionResult(
    saveLanguage as ResolvedLanguage,
    "low",
    "fallback",
    `sourceLanguage ${saveLanguage}`,
  );
  return { saveLanguage, detection };
}

/** Language to persist on `ExtensionWildWord.language` and detection metadata. Never throws. */
export function resolveSaveLanguage(
  text: string,
  fallbackLanguage: string,
  contextSentence?: string,
): {
  saveLanguage: string;
  detection: LanguageDetectionResult;
} {
  try {
    return resolveSaveLanguageUnsafe(text, fallbackLanguage, contextSentence);
  } catch (error) {
    return emergencySaveLanguageAfterDetectorFailure(fallbackLanguage, error);
  }
}

