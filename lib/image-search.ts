/**
 * Orchestrates licensed image lookup: imageability → provider chain by term kind.
 */

import {
  classifyImageability,
  getProviderSearchQuery,
  isExternalImageSearchAllowed,
  type ImageabilityInput,
  type ImageabilityResult,
} from "@/lib/imageability";
import { lookupPexelsImage } from "@/lib/image-providers/pexels";
import { lookupPixabayImage } from "@/lib/image-providers/pixabay";
import type { ImageLookupInput, ImageProviderResult } from "@/lib/image-providers/types";
import {
  isSupportedWikimediaLanguage,
  lookupWikimediaImageForWord,
  type WikimediaImageLookupInput,
  type WikimediaImageResult,
} from "@/lib/wikimedia-image";

export type ImageSearchInput = ImageLookupInput;

export type ImageSearchOptions = {
  pexelsApiKey?: string;
  pixabayApiKey?: string;
  wikimediaLookup?: (input: WikimediaImageLookupInput) => Promise<WikimediaImageResult | null>;
  pexelsLookup?: (
    input: ImageLookupInput,
    classification: ImageabilityResult
  ) => Promise<ImageProviderResult | null>;
  pixabayLookup?: (
    input: ImageLookupInput,
    classification: ImageabilityResult
  ) => Promise<ImageProviderResult | null>;
};

export function wikimediaResultToProviderResult(
  result: WikimediaImageResult,
  searchQuery: string,
  providerRank?: string
): ImageProviderResult {
  return {
    imageUrl: result.imageUrl,
    imageSource: "wikimedia",
    imageProvider: "wikimedia",
    imageAlt: result.imageAlt,
    imageAttribution: result.imageAttribution,
    imageAttributionUrl: result.imageAttributionUrl,
    imageLicense: result.imageLicense,
    imageLicenseUrl: result.imageLicenseUrl,
    imagePageUrl: result.imagePageUrl,
    wikidataEntityId: result.wikidataEntityId,
    wikidataEntityLabel: result.wikidataEntityLabel,
    commonsFileTitle: result.commonsFileTitle,
    confidence: "high",
    reason: "Wikimedia Commons entity image (P18).",
    imageSearchQuery: searchQuery,
    imageSearchProviderRank: providerRank,
  };
}

function withProviderRank(
  result: ImageProviderResult,
  rank: number,
  chain: readonly string[]
): ImageProviderResult {
  return {
    ...result,
    imageSearchProviderRank: String(rank),
    imageSearchQuery:
      result.imageSearchQuery ??
      chain[rank - 1] ??
      result.imageSearchQuery,
  };
}

async function tryWikimedia(
  input: ImageLookupInput,
  classification: ImageabilityResult,
  options: ImageSearchOptions | undefined,
  rank: number
): Promise<ImageProviderResult | null> {
  const language = input.language.trim().toLowerCase();
  if (!isSupportedWikimediaLanguage(language)) {
    return null;
  }
  if (
    classification.imageability === "concept" &&
    classification.confidence === "low"
  ) {
    return null;
  }
  if (
    classification.imageability === "abstract" &&
    classification.confidence === "high"
  ) {
    return null;
  }
  const wikimediaLookup = options?.wikimediaLookup ?? lookupWikimediaImageForWord;
  const wiki = await wikimediaLookup({
    text: input.text.trim(),
    language,
    definition: input.definition,
    partOfSpeech: input.partOfSpeech,
  });
  if (!wiki) {
    return null;
  }
  const query =
    getProviderSearchQuery(classification, "wikimedia") || classification.searchQuery;
  return withProviderRank(
    wikimediaResultToProviderResult(wiki, query),
    rank,
    classification.imageability === "concrete"
      ? ["wikimedia", "pexels", "pixabay"]
      : ["pexels", "pixabay", "wikimedia"]
  );
}

async function tryPexels(
  input: ImageLookupInput,
  classification: ImageabilityResult,
  options: ImageSearchOptions | undefined,
  rank: number,
  chain: readonly string[]
): Promise<ImageProviderResult | null> {
  const pexelsLookup =
    options?.pexelsLookup ??
    ((inp, cls) => lookupPexelsImage(inp, cls, { apiKey: options?.pexelsApiKey }));
  const result = await pexelsLookup({ ...input }, classification);
  if (!result || (result.confidence !== "high" && result.confidence !== "medium")) {
    return null;
  }
  return withProviderRank(result, rank, chain);
}

async function tryPixabay(
  input: ImageLookupInput,
  classification: ImageabilityResult,
  options: ImageSearchOptions | undefined,
  rank: number,
  chain: readonly string[]
): Promise<ImageProviderResult | null> {
  const pixabayLookup =
    options?.pixabayLookup ??
    ((inp, cls) => lookupPixabayImage(inp, cls, { apiKey: options?.pixabayApiKey }));
  const result = await pixabayLookup({ ...input }, classification);
  if (!result || (result.confidence !== "high" && result.confidence !== "medium")) {
    return null;
  }
  return withProviderRank(result, rank, chain);
}

const CONCRETE_CHAIN = ["wikimedia", "pexels", "pixabay"] as const;
const CONCEPT_CHAIN = ["pexels", "pixabay", "wikimedia"] as const;

/**
 * Server-side image search for My Words enrichment.
 * Returns null when no safe, licensed image is found.
 */
export async function searchImageForWord(
  input: ImageSearchInput,
  options?: ImageSearchOptions
): Promise<ImageProviderResult | null> {
  const text = input.text.trim();
  const language = input.language.trim().toLowerCase();
  if (!text || !language) {
    return null;
  }

  const classification = classifyImageability({
    text,
    language,
    translation: input.translation,
    definition: input.definition,
    explanation: input.explanation,
    partOfSpeech: input.partOfSpeech,
  });

  if (!isExternalImageSearchAllowed(classification)) {
    return null;
  }

  const lookupInput: ImageLookupInput = {
    ...input,
    text,
    language,
  };

  if (classification.imageability === "concrete") {
    const wiki = await tryWikimedia(lookupInput, classification, options, 1);
    if (wiki) {
      return wiki;
    }
    const pexels = await tryPexels(lookupInput, classification, options, 2, CONCRETE_CHAIN);
    if (pexels) {
      return pexels;
    }
    const pixabay = await tryPixabay(lookupInput, classification, options, 3, CONCRETE_CHAIN);
    if (pixabay) {
      return pixabay;
    }
    return null;
  }

  if (classification.imageability === "concept" || classification.searchQuery.trim()) {
    const pexels = await tryPexels(lookupInput, classification, options, 1, CONCEPT_CHAIN);
    if (pexels) {
      return pexels;
    }
    const pixabay = await tryPixabay(lookupInput, classification, options, 2, CONCEPT_CHAIN);
    if (pixabay) {
      return pixabay;
    }
    if (classification.imageability === "concept" && classification.confidence !== "low") {
      const wiki = await tryWikimedia(lookupInput, classification, options, 3);
      if (wiki) {
        return wiki;
      }
    }
  }

  return null;
}

export { classifyImageability, type ImageabilityInput };
