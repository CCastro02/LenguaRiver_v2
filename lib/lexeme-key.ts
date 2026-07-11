/**
 * Canonical lexeme identity for LenguaRiver (sync-safe key generation).
 *
 * Extension mirror — keep aligned: **`extensions/lenguariver-extension/lib/lexeme-key.ts`** (same algorithms).
 *
 * ## Lexeme vs Observation vs Progress
 *
 * - **Lexeme** — The learner-facing lexical unit (“what we're learning”).
 *   In storage we only materialize **`lexemeKey`** here plus optional caches elsewhere.
 *
 * - **Observation** — A concrete occurrence (Explore item, webpage URL,
 *   subtitle cue, lesson encounter). Stored separately later; identities must NOT
 *   embed URLs or timestamps in **`lexemeKey`**.
 *
 * - **Progress** — Drill state (SRS, times seen/correct). Keyed independently;
 *   future adapters will align **`lexemeKey`** with progress lookups.
 *
 * ## Key format (v1)
 * `lr:v1|<language>|<normalized-text>`
 *
 * The third segment may contain **`|`** punctuation from learner text — always
 * parse with **`tryParseLexemeKey`** rather than naive **`String#split('|')`** when text may contain `|`.
 */

const KEY_SCHEME = "lr:v1" as const;

/** Language roots that omit case folding (no reliable simple lower in product today). */
const NO_CASE_COLLAPSE = new Set(["ja", "zh"]);

/** Prefer ICU locale lowercase for curriculum + extension-supported bases. */
const LOWERCASE_LOCALE_BY_LANGUAGE: Partial<Record<string, string>> = {
  es: "es",
  en: "en",
  fr: "fr",
  de: "de",
  it: "it",
  pt: "pt",
  ru: "ru-RU",
  ar: "ar",
};

/**
 * Normalize a BCP‑47-ish language tag into a short base code (`es`, `ru`, …).
 * Unknown or empty inputs become **`und`** (undefined language per ISO).
 */
export function maybeNormalizeLanguage(input: string | null | undefined): string {
  if (input == null) {
    return "und";
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return "und";
  }

  let base = trimmed.split(/[-_]/u)[0]?.toLowerCase() ?? trimmed.toLowerCase();
  base = base.replace(/[^\p{L}]/gu, "");
  return base === "" ? "und" : base;
}

function collapseWhitespaceNfc(surface: string): string {
  return surface.normalize("NFC").trim().replace(/\s+/gu, " ");
}

function localeLower(surface: string, languageBase: string): string {
  if (surface === "") {
    return "";
  }

  const tag = LOWERCASE_LOCALE_BY_LANGUAGE[languageBase];
  if (!tag) {
    try {
      return surface.toLocaleLowerCase("und");
    } catch {
      return surface.toLowerCase();
    }
  }

  try {
    return surface.toLocaleLowerCase(tag);
  } catch {
    return surface.toLowerCase();
  }
}

/**
 * Deterministic surface normalization for identity (no stemming / lemmatization).
 *
 * - Unicode NFC trim
 * - Runs of whitespace collapsed to a single ASCII space (\\u0020)
 * - Case-fold only where we have explicit locale mappings; **`ja`** / **`zh`** keep graphemes
 * - Punctuation is preserved verbatim (including **`|`** inside text)
 *
 * **`language`** should be the **base** tag from **`maybeNormalizeLanguage`** or any BCP‑47 string.
 */
export function normalizeLexemeSurface(surface: string, language: string): string {
  const collapsed = collapseWhitespaceNfc(surface);
  const lang = maybeNormalizeLanguage(language);

  if (collapsed === "" || lang === "und") {
    return collapsed;
  }

  if (NO_CASE_COLLAPSE.has(lang)) {
    return collapsed;
  }

  return localeLower(collapsed, lang);
}

/** Build the canonical deterministic key for a lexical unit. */
export function buildLexemeKey(languageTag: string, surface: string): string {
  const lang = maybeNormalizeLanguage(languageTag);
  const norm = normalizeLexemeSurface(surface, lang);
  return `${KEY_SCHEME}|${lang}|${norm}`;
}

export type ParsedLexemeKey =
  | { ok: true; scheme: typeof KEY_SCHEME; language: string; normalizedSurface: string }
  | { ok: false };

/**
 * Parse **`buildLexemeKey`** output safely when the normalized segment may contain `|`.
 *
 * Preferred over naive **`split('|')`** for tooling and migration scripts.
 */
export function tryParseLexemeKey(fullKey: string): ParsedLexemeKey {
  const prefix = `${KEY_SCHEME}|`;
  if (!fullKey.startsWith(prefix)) {
    return { ok: false };
  }
  const rest = fullKey.slice(prefix.length);
  const divider = rest.indexOf("|");
  if (divider < 0 || divider === 0) {
    return { ok: false };
  }
  const lang = rest.slice(0, divider);
  const normalizedSurface = rest.slice(divider + 1);

  return {
    ok: true,
    scheme: KEY_SCHEME,
    language: lang === "" ? "und" : lang,
    normalizedSurface,
  };
}
