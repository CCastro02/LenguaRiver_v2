/**
 * Repair common UTF-8 misread as Latin-1 mojibake in Argos / legacy storage.
 * Intentionally small — add pairs only when seen in production data.
 */

/** Unicode replacement character (U+FFFD), often shown as in UI. */
export const MOJIBAKE_REPLACEMENT_CHAR = "\uFFFD";

/** Shown when display cleanup cannot remove all replacement characters. */
export const WILD_WORD_TEXT_ENCODING_FALLBACK =
  "Text encoding issue — refresh enrichment";

const RE = MOJIBAKE_REPLACEMENT_CHAR;

function escapeRegExp(fragment: string): string {
  return fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const RE_ESC = escapeRegExp(RE);

/** Word-level fixes where a single accented letter became U+FFFD. */
const MOJIBAKE_WORD_BASES: ReadonlyArray<readonly [string, string]> = [
  [`quiz${RE}s`, "quizás"],
  [`traducci${RE}n`, "traducción"],
  [`suceder${RE}`, "sucederá"],
  [`revelaci${RE}n`, "revelación"],
  [`predicci${RE}n`, "predicción"],
  [`publicaci${RE}n`, "publicación"],
  [`relaci${RE}n`, "relación"],
  [`informaci${RE}n`, "información"],
  [`compa${RE}${RE}a`, "compañía"],
  [`podr${RE}a`, "podría"],
  [`ser${RE}a`, "sería"],
  [`est${RE}n`, "están"],
  [`est${RE}`, "está"],
  [`tambi${RE}n`, "también"],
  [`despu${RE}s`, "después"],
  [`pa${RE}s`, "país"],
  [`alg${RE}n`, "algún"],
  [`seg${RE}n`, "según"],
  [`m${RE}s`, "más"],
  [`s${RE}`, "sí"],
  [`aqu${RE}`, "aquí"],
  [`acci${RE}n`, "acción"],
  [`educaci${RE}n`, "educación"],
  [`coraz${RE}n`, "corazón"],
  [`opini${RE}n`, "opinión"],
  [`caf${RE}`, "café"],
  [`ingl${RE}s`, "inglés"],
  [`espa${RE}ol`, "español"],
  [`ni${RE}o`, "niño"],
  [`a${RE}o`, "año"],
  [`se${RE}or`, "señor"],
];

/** UTF-8 bytes misread as Latin-1 (Ã¡ → á, etc.). */
const MOJIBAKE_LATIN1_UTF8: ReadonlyArray<readonly [string, string]> = [
  ["\u00C3\u00A1", "á"],
  ["\u00C3\u00A9", "é"],
  ["\u00C3\u00AD", "í"],
  ["\u00C3\u00B3", "ó"],
  ["\u00C3\u00BA", "ú"],
  ["\u00C3\u00B1", "ñ"],
  ["\u00C3\u0081", "Á"],
  ["\u00C3\u0089", "É"],
  ["\u00C3\u008D", "Í"],
  ["\u00C3\u0093", "Ó"],
  ["\u00C3\u009A", "Ú"],
  ["\u00C3\u0091", "Ñ"],
];

function expandCaseVariants(bad: string, good: string): Array<readonly [string, string]> {
  const pairs: Array<readonly [string, string]> = [[bad, good]];
  if (bad.length > 0 && good.length > 0) {
    const badTitle = bad.charAt(0).toUpperCase() + bad.slice(1);
    const goodTitle = good.charAt(0).toUpperCase() + good.slice(1);
    if (badTitle !== bad) {
      pairs.push([badTitle, goodTitle]);
    }
    const badUpper = bad.toUpperCase();
    const goodUpper = good.toUpperCase();
    if (badUpper !== bad) {
      pairs.push([badUpper, goodUpper]);
    }
  }
  return pairs;
}

function buildReplacementTable(): ReadonlyArray<readonly [string, string]> {
  const pairs: Array<readonly [string, string]> = [];
  for (const [bad, good] of MOJIBAKE_WORD_BASES) {
    pairs.push(...expandCaseVariants(bad, good));
  }
  pairs.push(...MOJIBAKE_LATIN1_UTF8);
  pairs.sort((a, b) => b[0].length - a[0].length);
  return pairs;
}

const MOJIBAKE_REPLACEMENTS = buildReplacementTable();

/**
 * Conservative in-text repairs for Spanish words ending with a corrupted accent.
 * Applied after known word/Latin-1 replacements.
 */
function repairSpanishReplacementCharPatterns(text: string): string {
  if (!text.includes(RE)) {
    return text;
  }

  let out = text;

  // -ción: revelacin, traduccin
  out = out.replace(new RegExp(`ci${RE_ESC}n\\b`, "giu"), "ción");

  // ñ from double replacement: compaa
  out = out.replace(new RegExp(`a${RE_ESC}${RE_ESC}a`, "giu"), "aña");

  // -ía: podra, sera
  out = out.replace(new RegExp(`r${RE_ESC}a\\b`, "giu"), "ría");

  // verb -ará / -erá / -irá: suceder
  out = out.replace(new RegExp(`er${RE_ESC}\\b`, "giu"), "erá");
  out = out.replace(new RegExp(`ar${RE_ESC}\\b`, "giu"), "ará");
  out = out.replace(new RegExp(`ir${RE_ESC}\\b`, "giu"), "irá");

  // está / están
  out = out.replace(new RegExp(`est${RE_ESC}n\\b`, "giu"), "están");
  out = out.replace(new RegExp(`est${RE_ESC}\\b`, "giu"), "está");

  return out;
}

export function textHasMojibakeMarkers(text: string): boolean {
  if (text.includes(MOJIBAKE_REPLACEMENT_CHAR)) {
    return true;
  }
  for (const [bad] of MOJIBAKE_LATIN1_UTF8) {
    if (text.includes(bad)) {
      return true;
    }
  }
  return false;
}

export function fixCommonMojibake(text: string): string {
  let out = text;
  for (const [bad, good] of MOJIBAKE_REPLACEMENTS) {
    if (out.includes(bad)) {
      out = out.split(bad).join(good);
    }
  }
  out = repairSpanishReplacementCharPatterns(out);
  return out;
}

/** Display/read path: clean mojibake; never surface raw U+FFFD when repair fails. */
export function cleanWildWordTextForDisplay(text: string | undefined): string | undefined {
  if (typeof text !== "string") {
    return undefined;
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }
  const cleaned = fixCommonMojibake(trimmed);
  if (textHasMojibakeMarkers(cleaned)) {
    return WILD_WORD_TEXT_ENCODING_FALLBACK;
  }
  return cleaned;
}

/** True when storage should be patched with a cleaned string (no retranslation). */
export function storedTextNeedsMojibakeRepair(stored: string): boolean {
  const trimmed = stored.trim();
  if (!trimmed) {
    return false;
  }
  const cleaned = fixCommonMojibake(trimmed);
  return cleaned !== trimmed;
}
