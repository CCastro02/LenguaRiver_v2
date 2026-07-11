import { NextResponse } from "next/server";

import {
  getCachedImageSearch,
  setCachedImageSearchHit,
  setCachedImageSearchMiss,
} from "@/lib/image-search-cache";
import { searchImageForWord } from "@/lib/image-search";
import { classifyImageability, isExternalImageSearchAllowed } from "@/lib/imageability";
import type { ImageLookupInput, ImageProviderResult } from "@/lib/image-providers/types";
import { checkImageSearchRateLimit } from "@/lib/image-search-rate-limit";

export const runtime = "nodejs";

type ImageSearchRequestBody = ImageLookupInput;

type ImageSearchResponse =
  | { ok: true; result: ImageProviderResult; classification: ReturnType<typeof classifyImageability> }
  | { ok: false; error: string; cached?: boolean };

function jsonWithCacheHeader(
  body: ImageSearchResponse,
  status: number,
  cacheStatus: "HIT" | "MISS" | "BYPASS",
  extraHeaders?: Record<string, string>
): NextResponse {
  const headers: Record<string, string> = {
    "X-LR-Image-Cache": cacheStatus,
    ...extraHeaders,
  };
  return NextResponse.json(body, { status, headers });
}

export async function POST(request: Request) {
  try {
    const rate = checkImageSearchRateLimit(request);
    if (!rate.allowed) {
      const retryAfter = String(rate.retryAfterSeconds ?? 60);
      return NextResponse.json(
        {
          ok: false,
          error: "Too many image search requests. Please try again later.",
        },
        {
          status: 429,
          headers: {
            "X-LR-Image-Cache": "BYPASS",
            "Retry-After": retryAfter,
          },
        }
      );
    }

    const body = (await request.json()) as ImageSearchRequestBody;
    const text = (body.text ?? "").trim();
    const language = (body.language ?? "").trim().toLowerCase();

    if (!text) {
      return jsonWithCacheHeader(
        { ok: false, error: "Missing text." },
        400,
        "BYPASS"
      );
    }
    if (!language) {
      return jsonWithCacheHeader(
        { ok: false, error: "Missing language." },
        400,
        "BYPASS"
      );
    }

    const lookupInput: ImageLookupInput = {
      text,
      language,
      translation: body.translation,
      definition: body.definition,
      explanation: body.explanation,
      partOfSpeech: body.partOfSpeech,
    };

    const classification = classifyImageability(lookupInput);

    const cached = getCachedImageSearch(lookupInput);
    if (cached?.status === "miss") {
      return jsonWithCacheHeader(
        { ok: false, error: "No safe licensed image found.", cached: true },
        404,
        "HIT"
      );
    }

    if (!isExternalImageSearchAllowed(classification)) {
      setCachedImageSearchMiss(lookupInput);
      return jsonWithCacheHeader(
        { ok: false, error: "Term is not suitable for external image search." },
        404,
        "MISS"
      );
    }

    if (cached?.status === "hit" && cached.result?.imageUrl?.trim()) {
      const devMeta =
        process.env.NODE_ENV === "development"
          ? { "X-LR-Image-Cache-At": String(cached.cachedAt) }
          : undefined;
      return jsonWithCacheHeader(
        { ok: true, result: cached.result, classification },
        200,
        "HIT",
        devMeta
      );
    }
    const result = await searchImageForWord(lookupInput, {
      pexelsApiKey: process.env.PEXELS_API_KEY,
      pixabayApiKey: process.env.PIXABAY_API_KEY,
    });

    if (!result?.imageUrl?.trim()) {
      setCachedImageSearchMiss(lookupInput);
      return jsonWithCacheHeader(
        { ok: false, error: "No safe licensed image found." },
        404,
        "MISS"
      );
    }

    setCachedImageSearchHit(lookupInput, result);
    return jsonWithCacheHeader(
      { ok: true, result, classification },
      200,
      "MISS"
    );
  } catch (error) {
    return jsonWithCacheHeader(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Image search failed.",
      },
      500,
      "BYPASS"
    );
  }
}
