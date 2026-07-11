/**
 * Wikidata P18 + Wikimedia Commons imageinfo lookup for My Words image enrichment.
 * Controlled fallback only — no web scraping or open image search.
 */

import {
  buildSpanishCorpusLookupNeedles,
  stripLeadingSpanishArticles,
} from "@/lib/lesson-chunk-corpus-lookup";
import { COMMON_CONCRETE_NOUN_HINTS } from "@/lib/wiktionary-definition-ranking";

export type WikimediaImageLookupInput = {
  text: string;
  language: string;
  definition?: string;
  partOfSpeech?: string;
};

export type WikimediaImageResult = {
  imageUrl: string;
  imageSource: "wikimedia";
  imageProvider: "wikimedia";
  imageAlt: string;
  imageAttribution?: string;
  imageAttributionUrl?: string;
  imageLicense?: string;
  imageLicenseUrl?: string;
  imagePageUrl?: string;
  wikidataEntityId?: string;
  wikidataEntityLabel?: string;
  commonsFileTitle?: string;
};

type WikimediaFetch = typeof fetch;

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const FETCH_TIMEOUT_MS = 12_000;
const MAX_SEARCH_WORDS = 4;

const SUPPORTED_LANGUAGES = new Set(["es", "en", "de", "fr", "it", "pt"]);

/** Terms that should not receive random representative images. */
const ABSTRACT_TERMS = new Set([
  "perhaps",
  "expects",
  "expect",
  "expected",
  "expecting",
  "learning",
  "learn",
  "learned",
  "translation",
  "translate",
  "frequency",
  "maybe",
  "might",
  "would",
  "should",
  "could",
  "because",
  "although",
  "however",
  "therefore",
  "about",
  "almost",
  "always",
  "never",
  "often",
  "sometimes",
  "usually",
  "very",
  "really",
  "quite",
]);

const NON_IMAGEABLE_POS = new Set([
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "preposition",
  "conjunction",
  "determiner",
  "particle",
  "interjection",
]);

/** Wikidata description cues for entity types we usually want to skip. */
const DESCRIPTION_REJECT =
  /\b(human|male given name|female given name|family name|surname|footballer|politician|actor|actress|film|album|song|band|company|corporation|business enterprise|record label|university|college|city|town|village|municipality|country|sovereign state|airline|airport)\b/i;

/** Known Wikidata items for frequent concrete nouns (representative P18 expected). */
const PREFERRED_WIKIDATA_ENTITY: Readonly<Record<string, string>> = {
  dog: "Q144",
  cat: "Q146",
  apple: "Q89",
  airport: "Q1248784",
  bicycle: "Q11442",
};

const CONCRETE_DESCRIPTION_BOOST =
  /\b(domesticated|mammal|animal|canine|feline|species|fruit|food|vehicle|pet|plant)\b/i;

const REJECTED_LICENSE = /\b(non.?commercial|unknown|all rights reserved)\b/i;

type WikidataSearchHit = {
  id: string;
  label?: string;
  description?: string;
  aliases?: string[];
};

type WikidataEntityClaims = {
  id: string;
  labels?: Record<string, { value?: string }>;
  descriptions?: Record<string, { value?: string }>;
  claims?: {
    P18?: Array<{
      mainsnak?: {
        datavalue?: { value?: string };
      };
    }>;
  };
};

function lessonLanguageBase(languageTag: string): string {
  return languageTag.trim().toLowerCase().split(/[-_]/u)[0] ?? "";
}

export function isSupportedWikimediaLanguage(language: string): boolean {
  return SUPPORTED_LANGUAGES.has(lessonLanguageBase(language));
}

/** Normalize surface text for Wikidata search (not stored learner text). */
export function normalizeWikimediaSearchText(text: string, language: string): string {
  const trimmed = text.normalize("NFC").trim().replace(/\s+/gu, " ");
  const base = lessonLanguageBase(language);
  let query = trimmed.toLowerCase();
  if (base === "es") {
    const needles = buildSpanishCorpusLookupNeedles(trimmed);
    const stripped = stripLeadingSpanishArticles(query);
    query = needles.find((n) => n.length >= 2 && !n.includes(" ")) ?? stripped;
    if (!query || query.length < 2) {
      query = stripped || query;
    }
  }
  return query.trim();
}

export function wordLooksLikeProperNoun(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  const words = trimmed.split(/\s+/u);
  if (words.length === 1) {
    const w = words[0] ?? "";
    return /^[A-ZÁÉÍÓÚÑÜ][\p{L}]+$/u.test(w) && w !== w.toLowerCase();
  }
  return words.every((w) => /^[A-ZÁÉÍÓÚÑÜ]/.test(w));
}

export function isCommonConcreteNoun(text: string): boolean {
  const normalized = normalizeWikimediaSearchText(text, "en");
  return normalized.length > 0 && normalized in COMMON_CONCRETE_NOUN_HINTS;
}

export function isNonImageableLookupTerm(
  text: string,
  partOfSpeech?: string
): boolean {
  const normalized = normalizeWikimediaSearchText(text, "en");
  if (!normalized) {
    return true;
  }
  const tokens = normalized.split(/\s+/u).filter(Boolean);
  if (tokens.length === 0) {
    return true;
  }
  if (tokens.length > MAX_SEARCH_WORDS) {
    return true;
  }
  if (tokens.every((t) => ABSTRACT_TERMS.has(t))) {
    return true;
  }
  if (tokens.length === 1 && ABSTRACT_TERMS.has(tokens[0] ?? "")) {
    return true;
  }
  const pos = (partOfSpeech ?? "").trim().toLowerCase();
  if (pos && NON_IMAGEABLE_POS.has(pos)) {
    if (tokens.length === 1 && isCommonConcreteNoun(tokens[0] ?? "")) {
      return false;
    }
    return true;
  }
  return false;
}

export function sanitizeWikimediaMetadata(value: string, maxLen = 280): string | undefined {
  const withoutTags = value
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/\s+/gu, " ")
    .trim();
  if (!withoutTags) {
    return undefined;
  }
  return withoutTags.length > maxLen ? `${withoutTags.slice(0, maxLen - 1)}…` : withoutTags;
}

function descriptionShouldReject(description: string | undefined, text: string): boolean {
  if (!description?.trim()) {
    return false;
  }
  if (!DESCRIPTION_REJECT.test(description)) {
    return false;
  }
  return !wordLooksLikeProperNoun(text);
}

function labelsMatchQuery(hit: WikidataSearchHit, query: string): boolean {
  const q = query.trim().toLowerCase();
  const label = (hit.label ?? "").trim().toLowerCase();
  if (label === q) {
    return true;
  }
  return (hit.aliases ?? []).some((a) => a.trim().toLowerCase() === q);
}

function scoreSearchHit(
  hit: WikidataSearchHit,
  query: string,
  text: string,
  definition?: string
): number {
  let score = 0;
  const q = query.trim().toLowerCase();
  if (labelsMatchQuery(hit, query)) {
    score += 12;
  } else if ((hit.label ?? "").trim().toLowerCase().includes(query)) {
    score += 4;
  } else {
    score -= 6;
  }
  const preferredId = PREFERRED_WIKIDATA_ENTITY[q];
  if (preferredId && hit.id === preferredId) {
    score += 25;
  }
  if (descriptionShouldReject(hit.description, text)) {
    score -= 20;
  }
  const desc = (hit.description ?? "").toLowerCase();
  if (/\b(type of|instance of|unit|grammatical|auxiliary)\b/.test(desc)) {
    score -= 8;
  }
  if (/\b(food|animal|plant|object|tool|vehicle|building|room|furniture|dish|drink)\b/.test(desc)) {
    score += 3;
  }
  if (CONCRETE_DESCRIPTION_BOOST.test(desc)) {
    score += 6;
  }
  const hints = COMMON_CONCRETE_NOUN_HINTS[q];
  if (hints?.length) {
    const hintHits = hints.filter((hint) => desc.includes(hint.toLowerCase())).length;
    score += hintHits * 5;
    if (/\b(band|film|album|song|surname|company|brand)\b/.test(desc)) {
      score -= 15;
    }
  }
  if (definition) {
    const defLower = definition.toLowerCase();
    if (/\bmechanical\b/.test(defLower) && CONCRETE_DESCRIPTION_BOOST.test(desc)) {
      score += 4;
    }
    if (/\b(domesticated|mammal|animal)\b/.test(defLower) && CONCRETE_DESCRIPTION_BOOST.test(desc)) {
      score += 8;
    }
  }
  return score;
}

async function fetchJson<T>(
  url: string,
  fetchImpl: WikimediaFetch
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function searchWikidataEntities(
  query: string,
  language: string,
  fetchImpl: WikimediaFetch
): Promise<WikidataSearchHit[]> {
  const params = new URLSearchParams({
    action: "wbsearchentities",
    search: query,
    language: lessonLanguageBase(language),
    uselang: "en",
    format: "json",
    limit: "5",
    origin: "*",
  });
  const data = await fetchJson<{
    search?: Array<{
      id?: string;
      label?: string;
      description?: string;
      aliases?: string[];
    }>;
  }>(`${WIKIDATA_API}?${params.toString()}`, fetchImpl);
  const hits: WikidataSearchHit[] = [];
  for (const row of data?.search ?? []) {
    if (!row.id?.startsWith("Q")) {
      continue;
    }
    hits.push({
      id: row.id,
      label: row.label,
      description: row.description,
      aliases: row.aliases,
    });
  }
  return hits;
}

async function fetchWikidataEntities(
  ids: string[],
  language: string,
  fetchImpl: WikimediaFetch
): Promise<WikidataEntityClaims[]> {
  if (ids.length === 0) {
    return [];
  }
  const params = new URLSearchParams({
    action: "wbgetentities",
    ids: ids.join("|"),
    props: "claims|labels|descriptions",
    languages: lessonLanguageBase(language),
    format: "json",
    origin: "*",
  });
  const data = await fetchJson<{
    entities?: Record<string, WikidataEntityClaims>;
  }>(`${WIKIDATA_API}?${params.toString()}`, fetchImpl);
  const entities = data?.entities ?? {};
  return ids
    .map((id) => entities[id])
    .filter((e): e is WikidataEntityClaims => Boolean(e && e.id));
}

function p18Filename(entity: WikidataEntityClaims): string | undefined {
  const claims = entity.claims?.P18;
  if (!claims?.length) {
    return undefined;
  }
  for (const claim of claims) {
    const value = claim.mainsnak?.datavalue?.value;
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

export type CommonsImageInfoParsed = {
  imageUrl: string;
  imagePageUrl?: string;
  imageAttribution?: string;
  imageAttributionUrl?: string;
  imageLicense?: string;
  imageLicenseUrl?: string;
  commonsFileTitle?: string;
};

export function parseCommonsImageInfoResponse(
  fileTitle: string,
  payload: {
    query?: {
      pages?: Record<
        string,
        {
          title?: string;
          imageinfo?: Array<{
            thumburl?: string;
            url?: string;
            descriptionurl?: string;
            extmetadata?: Record<string, { value?: string }>;
          }>;
        }
      >;
    };
  }
): CommonsImageInfoParsed | null {
  const pages = payload.query?.pages ?? {};
  const page = Object.values(pages)[0];
  const info = page?.imageinfo?.[0];
  if (!info) {
    return null;
  }
  const imageUrl = (info.thumburl ?? info.url ?? "").trim();
  if (!imageUrl) {
    return null;
  }
  const meta = info.extmetadata ?? {};
  const artist = sanitizeWikimediaMetadata(meta.Artist?.value ?? "");
  const credit = sanitizeWikimediaMetadata(meta.Credit?.value ?? "");
  const license = sanitizeWikimediaMetadata(meta.LicenseShortName?.value ?? "");
  const licenseUrl = sanitizeWikimediaMetadata(meta.LicenseUrl?.value ?? "", 512);
  const imagePageUrl = (info.descriptionurl ?? "").trim() || undefined;

  if (license && REJECTED_LICENSE.test(license)) {
    return null;
  }
  if (!imagePageUrl && !license) {
    return null;
  }

  const imageAttribution = artist ?? credit;
  return {
    imageUrl,
    imagePageUrl,
    imageAttribution,
    imageAttributionUrl: imagePageUrl,
    imageLicense: license,
    imageLicenseUrl: licenseUrl,
    commonsFileTitle: page?.title ?? (fileTitle.startsWith("File:") ? fileTitle : `File:${fileTitle}`),
  };
}

async function fetchCommonsImageInfo(
  filename: string,
  fetchImpl: WikimediaFetch
): Promise<CommonsImageInfoParsed | null> {
  const fileTitle = filename.startsWith("File:") ? filename : `File:${filename}`;
  const params = new URLSearchParams({
    action: "query",
    titles: fileTitle,
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "512",
    format: "json",
    origin: "*",
  });
  const data = await fetchJson<Parameters<typeof parseCommonsImageInfoResponse>[1]>(
    `${COMMONS_API}?${params.toString()}`,
    fetchImpl
  );
  if (!data) {
    return null;
  }
  return parseCommonsImageInfoResponse(fileTitle, data);
}

function entityLabel(entity: WikidataEntityClaims, language: string): string | undefined {
  const lang = lessonLanguageBase(language);
  return (
    entity.labels?.[lang]?.value ??
    entity.labels?.en?.value ??
    Object.values(entity.labels ?? {})[0]?.value
  );
}

/**
 * Resolve a representative Wikimedia Commons image for a saved word surface form.
 */
export async function lookupWikimediaImageForWord(
  input: WikimediaImageLookupInput,
  options?: { fetch?: WikimediaFetch }
): Promise<WikimediaImageResult | null> {
  const fetchImpl = options?.fetch ?? fetch;
  const language = input.language?.trim() ?? "";
  const text = input.text?.trim() ?? "";
  if (!text || !isSupportedWikimediaLanguage(language)) {
    return null;
  }
  if (isNonImageableLookupTerm(text, input.partOfSpeech)) {
    return null;
  }

  const query = normalizeWikimediaSearchText(text, language);
  if (!query || query.length < 2) {
    return null;
  }

  const hits = await searchWikidataEntities(query, language, fetchImpl);
  if (hits.length === 0) {
    return null;
  }

  const ranked = [...hits]
    .map((hit) => ({
      hit,
      score: scoreSearchHit(hit, query, text, input.definition),
    }))
    .sort((a, b) => b.score - a.score);

  const bestScore = ranked[0]?.score ?? -999;
  if (bestScore < 0) {
    return null;
  }
  if (ranked.length > 1 && ranked[0]?.score === ranked[1]?.score) {
    return null;
  }

  const candidateIds = ranked
    .filter((r) => r.score >= bestScore - 2)
    .slice(0, 3)
    .map((r) => r.hit.id);

  const entities = await fetchWikidataEntities(candidateIds, language, fetchImpl);
  for (const entity of entities) {
    const file = p18Filename(entity);
    if (!file) {
      continue;
    }
    const commons = await fetchCommonsImageInfo(file, fetchImpl);
    if (!commons) {
      continue;
    }
    const label = entityLabel(entity, language) ?? text;
    return {
      imageUrl: commons.imageUrl,
      imageSource: "wikimedia",
      imageProvider: "wikimedia",
      imageAlt: label,
      imageAttribution: commons.imageAttribution,
      imageAttributionUrl: commons.imageAttributionUrl,
      imageLicense: commons.imageLicense,
      imageLicenseUrl: commons.imageLicenseUrl,
      imagePageUrl: commons.imagePageUrl,
      wikidataEntityId: entity.id,
      wikidataEntityLabel: label,
      commonsFileTitle: commons.commonsFileTitle,
    };
  }

  return null;
}
