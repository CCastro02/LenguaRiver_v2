/**
 * Spanish Wiktionary lookup candidates and morphology scaffolding for inflected/plural forms.
 * Conservative rules only — not a full morphological analyzer.
 */

import { spanishPluralSingularVariants } from "@/lib/lesson-chunk-corpus-lookup";

/** Safe, common form notes keyed by normalized saved surface (lowercase). */
export const SPANISH_FORM_DEFINITION_NOTES: Readonly<Record<string, string>> = {
  muchas: "Forma femenina plural de mucho",
  muchos: "Forma masculina plural de mucho",
  mesas: "Plural de mesa",
  llaves: "Plural de llave",
  habitaciones: "Plural de habitación",
};

function normalizeLookupKey(value: string): string {
  return value.normalize("NFC").trim().toLowerCase();
}

function addCandidate(seen: Set<string>, list: string[], form: string): void {
  const trimmed = form.normalize("NFC").trim();
  if (!trimmed) {
    return;
  }
  const key = normalizeLookupKey(trimmed);
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  list.push(trimmed);
}

/** Restore common -cion/-ciones lemmas to accented Wiktionary titles. */
function spanishAccentSingularVariants(singular: string): string[] {
  const lower = singular.normalize("NFC").trim().toLowerCase();
  const out: string[] = [];
  if (lower.endsWith("cion") && lower.length > 5) {
    out.push(`${lower.slice(0, -4)}ción`);
  }
  return out.filter((candidate) => normalizeLookupKey(candidate) !== lower);
}

/** Conservative verb lemma guesses (used only after surface + plural candidates). */
function spanishVerbLemmaCandidates(word: string): string[] {
  const lower = word.normalize("NFC").trim().toLowerCase();
  const candidates = new Set<string>();
  if (lower.endsWith("a") && lower.length > 2) {
    candidates.add(`${lower.slice(0, -1)}ar`);
  } else if (lower.endsWith("e") && lower.length > 2) {
    candidates.add(`${lower.slice(0, -1)}er`);
    candidates.add(`${lower.slice(0, -1)}ir`);
  } else if (lower.endsWith("o") && lower.length > 2) {
    candidates.add(`${lower.slice(0, -1)}ar`);
    candidates.add(`${lower.slice(0, -1)}er`);
    candidates.add(`${lower.slice(0, -1)}ir`);
  }
  candidates.delete(lower);
  return Array.from(candidates);
}

/** Extra lemma targets for the mucho/mucha/muchos/muchas family. */
function muchoFamilyCandidates(lower: string): string[] {
  if (!/^much[oa]s?$/u.test(lower)) {
    return [];
  }
  const out = ["mucho", "mucha"];
  if (lower === "mucho" || lower === "mucha") {
    return out.filter((lemma) => lemma !== lower);
  }
  return out;
}

/**
 * Ordered Wiktionary page titles to try for a saved Spanish surface form.
 * Surface first, then normalized singulars/lemmas.
 */
export function getSpanishDefinitionLookupCandidates(text: string): string[] {
  const trimmed = text.normalize("NFC").trim();
  if (!trimmed) {
    return [];
  }

  const seen = new Set<string>();
  const candidates: string[] = [];
  const lower = trimmed.toLowerCase();

  addCandidate(seen, candidates, trimmed);
  if (lower !== trimmed) {
    addCandidate(seen, candidates, lower);
  }

  for (const lemma of muchoFamilyCandidates(lower)) {
    addCandidate(seen, candidates, lemma);
  }

  const pluralBases = new Set<string>([lower]);
  for (const singular of spanishPluralSingularVariants(lower)) {
    pluralBases.add(singular);
    addCandidate(seen, candidates, singular);
    for (const accented of spanishAccentSingularVariants(singular)) {
      addCandidate(seen, candidates, accented);
    }
  }

  for (const lemma of spanishVerbLemmaCandidates(lower)) {
    addCandidate(seen, candidates, lemma);
  }

  return candidates;
}

function capitalizeLemmaForNote(lemma: string): string {
  const trimmed = lemma.trim();
  if (!trimmed) {
    return trimmed;
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Prepend a short morphology note when the definition came from a different lemma than the saved form.
 */
export function buildSpanishDefinitionWithFormNote(
  savedText: string,
  lookupLemma: string,
  definition: string
): string {
  const def = definition.trim();
  if (!def) {
    return def;
  }

  const savedKey = normalizeLookupKey(savedText);
  const lookupKey = normalizeLookupKey(lookupLemma);
  if (!savedKey || savedKey === lookupKey) {
    return def;
  }

  const hardcoded = SPANISH_FORM_DEFINITION_NOTES[savedKey];
  if (hardcoded) {
    return `${hardcoded}. ${def}`;
  }

  const savedLower = savedText.normalize("NFC").trim().toLowerCase();
  const singularTargets = spanishPluralSingularVariants(savedLower);
  if (
    singularTargets.some((singular) => normalizeLookupKey(singular) === lookupKey) &&
    savedLower.endsWith("s") &&
    !savedLower.endsWith("ss")
  ) {
    return `Plural de ${capitalizeLemmaForNote(lookupLemma)}. ${def}`;
  }

  if (/^much[oa]s$/u.test(savedLower) && (lookupKey === "mucho" || lookupKey === "mucha")) {
    if (savedLower.endsWith("as")) {
      return `Forma femenina plural de mucho. ${def}`;
    }
    if (savedLower.endsWith("os")) {
      return `Forma masculina plural de mucho. ${def}`;
    }
  }

  return def;
}
