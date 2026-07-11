/**
 * Pixabay API image search — royalty-free photos with attribution metadata.
 * https://pixabay.com/api/docs/
 */

import type { ImageLookupInput, ImageProviderResult } from "@/lib/image-providers/types";
import type { ImageabilityResult } from "@/lib/imageability";
import { getProviderSearchQuery } from "@/lib/imageability";
import {
  assessImageRelevance,
  filterRelevanceQueryTerms,
  tokenize,
} from "@/lib/image-providers/relevance";

const PIXABAY_API_URL = "https://pixabay.com/api/";
const PIXABAY_LICENSE = "Pixabay Content License";
const PIXABAY_LICENSE_URL = "https://pixabay.com/service/license-summary/";
const FETCH_TIMEOUT_MS = 12_000;

export type PixabayHit = {
  id?: number;
  pageURL?: string;
  previewURL?: string;
  webformatURL?: string;
  largeImageURL?: string;
  tags?: string;
  user?: string;
  userImageURL?: string;
};

export type PixabaySearchResponse = {
  hits?: PixabayHit[];
};

export type PixabayLookupOptions = {
  apiKey?: string;
  fetchImpl?: typeof fetch;
};

function pickPixabayImageUrl(hit: PixabayHit): string | null {
  return (
    hit.largeImageURL?.trim() ||
    hit.webformatURL?.trim() ||
    null
  );
}

export type RankedPixabayCandidate = {
  hit: PixabayHit;
  relevance: ReturnType<typeof assessImageRelevance>;
};

export function rankPixabayHits(
  hits: PixabayHit[],
  searchQuery: string,
  input: ImageLookupInput
): RankedPixabayCandidate | null {
  const queryTerms = filterRelevanceQueryTerms(tokenize(searchQuery));
  let best: RankedPixabayCandidate | null = null;

  for (const hit of hits) {
    const imageUrl = pickPixabayImageUrl(hit);
    if (!imageUrl) {
      continue;
    }
    const tags = (hit.tags ?? "").trim();
    const relevance = assessImageRelevance({
      queryTerms,
      word: input.text.trim(),
      translation: input.translation,
      definition: input.definition,
      explanation: input.explanation,
      alt: tags,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    });
    if (!relevance.accepted || relevance.confidence === "low") {
      continue;
    }
    const score =
      relevance.confidence === "high" ? 3 : relevance.confidence === "medium" ? 2 : 1;
    const bestScore = best
      ? best.relevance.confidence === "high"
        ? 3
        : best.relevance.confidence === "medium"
          ? 2
          : 1
      : 0;
    if (!best || score > bestScore) {
      best = { hit, relevance };
    }
  }
  return best;
}

export function buildPixabayProviderResult(
  candidate: RankedPixabayCandidate,
  input: ImageLookupInput,
  searchQuery: string
): ImageProviderResult {
  const { hit, relevance } = candidate;
  const imageUrl = pickPixabayImageUrl(hit)!;
  const user = (hit.user ?? "").trim();
  const pageUrl = (hit.pageURL ?? "").trim();
  const tags = (hit.tags ?? "").trim();
  const attribution = user ? `${user} on Pixabay` : "Images from Pixabay";
  return {
    imageUrl,
    thumbnailUrl: hit.previewURL?.trim() || undefined,
    imageSource: "pixabay",
    imageProvider: "pixabay",
    imageAlt: tags || input.text.trim(),
    imageAttribution: attribution,
    imageAttributionUrl: pageUrl || "https://pixabay.com",
    imageLicense: PIXABAY_LICENSE,
    imageLicenseUrl: PIXABAY_LICENSE_URL,
    imagePageUrl: pageUrl || undefined,
    imageTags: tags || undefined,
    confidence: relevance.confidence,
    reason: relevance.reason,
    imageSearchQuery: searchQuery,
  };
}

export async function lookupPixabayImage(
  input: ImageLookupInput,
  classification: ImageabilityResult,
  options?: PixabayLookupOptions
): Promise<ImageProviderResult | null> {
  const apiKey = options?.apiKey ?? process.env.PIXABAY_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  const searchQuery = getProviderSearchQuery(classification, "pixabay").trim();
  if (!searchQuery) {
    return null;
  }

  const fetchImpl = options?.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    key: apiKey,
    q: searchQuery,
    image_type: "photo",
    orientation: "horizontal",
    safesearch: "true",
    per_page: "5",
  });
  const url = `${PIXABAY_API_URL}?${params.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as PixabaySearchResponse;
    const ranked = rankPixabayHits(payload.hits ?? [], searchQuery, input);
    if (!ranked) {
      return null;
    }
    return buildPixabayProviderResult(ranked, input, searchQuery);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
