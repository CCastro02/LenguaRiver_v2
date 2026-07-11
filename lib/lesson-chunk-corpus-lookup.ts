/**
 * Matches saved wild-word surface text against bundled lesson corpus keys (`language::surface`).
 *
 * Supports Spanish noun phrases where corpus entries include articles (una mesa, el menu)
 * but learners save bare lemmas (mesa, menu).
 */

import type { UserWildWord } from "@/lib/explore-content";
import { buildWildWordLanguagePresentation } from "@/lib/wild-word-extension-display";
import type { LessonChunkMetadata } from "@/lib/review-queue";

/** Leading Spanish articles for lesson chunk matching only (deterministic peeling). */
const SPANISH_ARTICLE_CHUNK = /^((un|una|unos|unas|el|la|los|las)\s+)+/iu;

export function stripLeadingSpanishArticles(phrase: string): string {
  let t = phrase.normalize("NFC").trim().replace(/\s+/gu, " ");
  let prev = "";
  while (prev !== t) {
    prev = t;
    t = t.replace(SPANISH_ARTICLE_CHUNK, "").trim().replace(/\s+/gu, " ");
  }
  return t.trim();
}

/**
 * Conservative Spanish plural → singular variants for corpus/image lookup only.
 * Does not mutate stored learner text or lexeme keys.
 */
export function spanishPluralSingularVariants(word: string): string[] {
  const w = word.normalize("NFC").trim().toLowerCase();
  if (w.length <= 4) {
    return [];
  }

  const out: string[] = [];

  // mesas → mesa, libros → libro
  if (w.endsWith("as")) {
    out.push(`${w.slice(0, -1)}`);
  } else if (w.endsWith("os")) {
    out.push(`${w.slice(0, -1)}`);
  } else if (w.endsWith("es")) {
    // coloniales → colonial; llaves → llave (not applied to …as/…os above)
    const stem = w.slice(0, -2);
    if (w.endsWith("ves") && stem.length >= 2) {
      out.push(`${stem}e`);
    } else {
      out.push(stem);
    }
  } else if (w.endsWith("s") && !w.endsWith("ss")) {
    // cafés → café when accents preserved in normalized form
    out.push(w.slice(0, -1));
  }

  return out.filter((v) => v.length >= 2);
}

/**
 * Lookup needles for Spanish lesson corpus matching: exact surface, article-stripped,
 * and singularized forms. Used only inside {@link lookupLessonChunkMetadata}.
 */
export function buildSpanishCorpusLookupNeedles(surface: string): string[] {
  const lowered = surface.normalize("NFC").trim().toLowerCase().replace(/\s+/gu, " ");
  const needles = new Set<string>();

  function add(form: string): void {
    const t = form.trim();
    if (t) {
      needles.add(t);
    }
  }

  add(lowered);
  const stripped = stripLeadingSpanishArticles(lowered);
  add(stripped);

  for (const base of [lowered, stripped]) {
    for (const singular of spanishPluralSingularVariants(base)) {
      add(singular);
    }
  }

  return [...needles];
}

function corpusRowHasImage(row: LessonChunkMetadata): boolean {
  return Boolean(row.image?.trim());
}

function lessonLanguageBase(languageTag: string): string {
  const base = languageTag.trim().toLowerCase().split(/[-_]/u)[0] ?? "";
  return base;
}

/** True when lookups should consult `es::*` corpus keys (may include article fallbacks). */
function shouldTrySpanishLessonCorpus(storedLang: string, presentationDisplayCode: string): boolean {
  return lessonLanguageBase(storedLang) === "es" || lessonLanguageBase(presentationDisplayCode) === "es";
}

export type LessonChunkCorpusMatchKind =
  | "lexeme"
  | "exact"
  | "spanish_article_normalized"
  | "none";

export type LessonCorpusLookupDiag = {
  lexemeKey: string | undefined;
  text: string;
  languageStored: string;
  displayCode: string;
  attemptedLookupKeys: string[];
  corpusMetaFound: boolean;
  corpusMetaImage?: string;
  matchKind: LessonChunkCorpusMatchKind;
};

export type LessonChunkCorpusLookupResult = {
  meta: LessonChunkMetadata | undefined;
  diag: LessonCorpusLookupDiag;
};

/** Append a human-readable corpus key we tried (stable order). */
function pushAttempt(list: string[], label: string): void {
  if (!list.includes(label)) {
    list.push(label);
  }
}

/** Find corpus row for lexical hints / lesson-backed enrichment (translations, phonetics, chunk images). */
export function lookupLessonChunkMetadata(opts: {
  rawRecord: Record<string, unknown>;
  word: UserWildWord;
  corpusMap: Map<string, LessonChunkMetadata>;
  lexemeLookup: Map<string, LessonChunkMetadata>;
}): LessonChunkCorpusLookupResult {
  const langPres = buildWildWordLanguagePresentation(opts.rawRecord, opts.word);
  const storedBase = lessonLanguageBase(opts.word.language);
  const displayBase = lessonLanguageBase(langPres.displayCode);
  const langBuckets = Array.from(new Set([storedBase, displayBase])).filter(Boolean);

  /** Mirrors lesson corpus keys: `word.text` lowercasing only (authors may omit whitespace normalization). */
  const loweredExact = opts.word.text.trim().toLowerCase();

  let meta: LessonChunkMetadata | undefined;
  let matchKind: LessonChunkCorpusMatchKind = "none";

  const attemptedLookupKeys: string[] = [];

  if (opts.word.lexemeKey) {
    pushAttempt(attemptedLookupKeys, `lexeme:${opts.word.lexemeKey}`);
    const byLex = opts.lexemeLookup.get(opts.word.lexemeKey);
    if (byLex) {
      meta = byLex;
      matchKind = "lexeme";
    }
  }

  if (!meta) {
    for (const bucket of langBuckets) {
      const exactKey = `${bucket}::${loweredExact}`;
      pushAttempt(attemptedLookupKeys, exactKey);
      const hit = opts.corpusMap.get(exactKey);
      if (hit) {
        meta = hit;
        matchKind = "exact";
        break;
      }
    }
  }

  if (!meta && shouldTrySpanishLessonCorpus(opts.word.language, langPres.displayCode) && loweredExact.length > 0) {
    const userNeedles = buildSpanishCorpusLookupNeedles(loweredExact);
    const needleSet = new Set(userNeedles);
    for (const needle of userNeedles) {
      pushAttempt(attemptedLookupKeys, `es_needle::${needle}`);
    }

    let chosen: LessonChunkMetadata | undefined;
    let pickedKey: string | undefined;

    function considerCandidate(row: LessonChunkMetadata, keyLabel: string): void {
      if (!chosen) {
        chosen = row;
        pickedKey = keyLabel;
        return;
      }
      if (corpusRowHasImage(row) && !corpusRowHasImage(chosen)) {
        chosen = row;
        pickedKey = keyLabel;
      }
    }

    for (const needle of userNeedles) {
      const esCoreKey = `es::${needle}`;
      pushAttempt(attemptedLookupKeys, esCoreKey);
      const esCoreHit = opts.corpusMap.get(esCoreKey);
      if (esCoreHit) {
        considerCandidate(esCoreHit, esCoreKey);
      }
    }

    for (const [mapKey, row] of opts.corpusMap) {
      if (!mapKey.startsWith("es::")) {
        continue;
      }
      const corpusLemmaNorm = stripLeadingSpanishArticles(mapKey.slice("es::".length));
      if (!needleSet.has(corpusLemmaNorm)) {
        continue;
      }
      pushAttempt(attemptedLookupKeys, `es_article_scan_candidate::${mapKey}`);
      considerCandidate(row, mapKey);
    }

    if (chosen && pickedKey) {
      pushAttempt(
        attemptedLookupKeys,
        `es_article_scan_picked::${userNeedles.join("|")}@(corpus:${pickedKey})`
      );
      meta = chosen;
      matchKind = "spanish_article_normalized";
    }
  }

  const diag: LessonCorpusLookupDiag = {
    lexemeKey: opts.word.lexemeKey,
    text: opts.word.text,
    languageStored: opts.word.language,
    displayCode: langPres.displayCode,
    attemptedLookupKeys,
    corpusMetaFound: Boolean(meta),
    corpusMetaImage: meta?.image,
    matchKind,
  };

  return { meta, diag };
}
