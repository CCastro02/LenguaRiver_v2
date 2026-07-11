/**
 * Pexels API image search — licensed photos with required attribution metadata.
 * https://www.pexels.com/api/documentation/
 */

import type { ImageLookupInput, ImageProviderResult } from "@/lib/image-providers/types";
import type { ImageabilityResult } from "@/lib/imageability";
import { getProviderSearchQuery } from "@/lib/imageability";
import {
  assessImageRelevance,
  filterRelevanceQueryTerms,
  tokenize,
} from "@/lib/image-providers/relevance";

const PEXELS_SEARCH_URL = "https://api.pexels.com/v1/search";
const PEXELS_LICENSE = "Pexels License";
const PEXELS_LICENSE_URL = "https://www.pexels.com/license/";
const FETCH_TIMEOUT_MS = 12_000;

export type PexelsPhoto = {
  id?: number;
  width?: number;
  height?: number;
  url?: string;
  photographer?: string;
  photographer_url?: string;
  alt?: string;
  src?: {
    large?: string;
    large2x?: string;
    medium?: string;
    landscape?: string;
    original?: string;
  };
};

export type PexelsSearchResponse = {
  photos?: PexelsPhoto[];
};

export type PexelsLookupOptions = {
  apiKey?: string;
  fetchImpl?: typeof fetch;
};

/** Score how well photo alt + photographer metadata align with the visual search query (0–1). */
export function scorePexelsAltAlignment(alt: string, searchQuery: string, photographer = ""): number {
  const combined = `${alt} ${photographer}`.trim();
  const altTokens = new Set(tokenize(combined));
  const queryTokens = filterRelevanceQueryTerms(tokenize(searchQuery));
  if (queryTokens.length === 0) {
    return 0;
  }
  let hits = 0;
  for (const q of queryTokens) {
    if (altTokens.has(q)) {
      hits += 1;
      continue;
    }
    for (const a of altTokens) {
      if (a.startsWith(q) || q.startsWith(a)) {
        hits += 0.5;
        break;
      }
    }
  }
  return hits / queryTokens.length;
}

export function photoLooksPeopleHeavy(alt: string, searchQuery: string): boolean {
  const relevance = assessImageRelevance({
    queryTerms: tokenize(searchQuery),
    word: "",
    alt,
    tags: tokenize(alt),
  });
  if (relevance.reason.includes("People-heavy")) {
    return true;
  }
  return /\b(portrait|headshot|model|fashion)\b/i.test(alt) &&
    !/\b(student|students|learning|classroom|teacher|education)\b/i.test(searchQuery);
}

export function pickPexelsPhotoUrl(photo: PexelsPhoto): string | null {
  const src = photo.src;
  if (!src) {
    return null;
  }
  return (
    src.large?.trim() ||
    src.large2x?.trim() ||
    src.medium?.trim() ||
    src.landscape?.trim() ||
    src.original?.trim() ||
    null
  );
}

export type RankedPexelsCandidate = {
  photo: PexelsPhoto;
  alignment: number;
  relevance: ReturnType<typeof assessImageRelevance>;
};

/** Rank and filter Pexels photos; exported for tests. */
export function rankPexelsPhotos(
  photos: PexelsPhoto[],
  searchQuery: string,
  input: ImageLookupInput
): RankedPexelsCandidate | null {
  const queryTerms = filterRelevanceQueryTerms(tokenize(searchQuery));
  let best: RankedPexelsCandidate | null = null;

  for (const photo of photos) {
    const alt = (photo.alt ?? "").trim() || input.text.trim();
    const photographer = (photo.photographer ?? "").trim();
    if (photoLooksPeopleHeavy(alt, searchQuery)) {
      continue;
    }
    const url = pickPexelsPhotoUrl(photo);
    if (!url) {
      continue;
    }
    const alignment = scorePexelsAltAlignment(alt, searchQuery, photographer);
    const relevance = assessImageRelevance({
      queryTerms,
      word: input.text.trim(),
      translation: input.translation,
      definition: input.definition,
      explanation: input.explanation,
      alt,
      tags: tokenize(alt),
      title: photographer,
    });
    if (!relevance.accepted || relevance.confidence === "low") {
      continue;
    }
    const score =
      (relevance.confidence === "high" ? 3 : relevance.confidence === "medium" ? 2 : 1) +
      alignment;
    const bestScore = best
      ? (best.relevance.confidence === "high" ? 3 : best.relevance.confidence === "medium" ? 2 : 1) +
        best.alignment
      : 0;
    if (!best || score > bestScore) {
      best = { photo, alignment, relevance };
    }
  }
  return best;
}

export function buildPexelsProviderResult(
  candidate: RankedPexelsCandidate,
  input: ImageLookupInput,
  searchQuery: string,
  providerRank?: string
): ImageProviderResult {
  const { photo, relevance } = candidate;
  const imageUrl = pickPexelsPhotoUrl(photo)!;
  const photographer = (photo.photographer ?? "").trim();
  const photographerUrl = (photo.photographer_url ?? "").trim();
  const pageUrl = (photo.url ?? "").trim();
  const attribution = photographer
    ? `${photographer} on Pexels`
    : "Photos provided by Pexels";
  return {
    imageUrl,
    thumbnailUrl: photo.src?.medium?.trim() || undefined,
    imageSource: "pexels",
    imageProvider: "pexels",
    imageAlt: (photo.alt ?? "").trim() || input.text.trim(),
    imageAttribution: attribution,
    imageAttributionUrl: photographerUrl || "https://www.pexels.com",
    imageLicense: PEXELS_LICENSE,
    imageLicenseUrl: PEXELS_LICENSE_URL,
    imagePageUrl: pageUrl || undefined,
    confidence: relevance.confidence,
    reason: relevance.reason,
    imageSearchQuery: searchQuery,
    imageSearchProviderRank: providerRank,
  };
}

export async function lookupPexelsImage(
  input: ImageLookupInput,
  classification: ImageabilityResult,
  options?: PexelsLookupOptions
): Promise<ImageProviderResult | null> {
  const apiKey = options?.apiKey ?? process.env.PEXELS_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  const searchQuery = getProviderSearchQuery(classification, "pexels").trim();
  if (!searchQuery) {
    return null;
  }

  const fetchImpl = options?.fetchImpl ?? fetch;
  const url = `${PEXELS_SEARCH_URL}?query=${encodeURIComponent(searchQuery)}&per_page=5&orientation=landscape`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      headers: { Authorization: apiKey },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as PexelsSearchResponse;
    const photos = payload.photos ?? [];
    const ranked = rankPexelsPhotos(photos, searchQuery, input);
    if (!ranked) {
      return null;
    }
    return buildPexelsProviderResult(ranked, input, searchQuery);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
