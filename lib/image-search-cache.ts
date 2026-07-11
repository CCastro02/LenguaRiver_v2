/**
 * In-memory server-side cache for `/api/image-search` (V1).
 * Resets on process restart; not shared across instances.
 */

import { foldSpanishAccents } from "@/lib/wild-word-curated-images";
import {
  buildSpanishCorpusLookupNeedles,
  stripLeadingSpanishArticles,
} from "@/lib/lesson-chunk-corpus-lookup";
import type { ImageLookupInput, ImageProviderResult } from "@/lib/image-providers/types";

export const IMAGE_SEARCH_PROVIDER_VERSION = "image-search-v2";

const MAX_CACHE_ENTRIES = 1000;
const TTL_HIT_MS = 7 * 24 * 60 * 60 * 1000;
const TTL_MISS_MS = 24 * 60 * 60 * 1000;

export type ImageSearchCacheStatus = "hit" | "miss";

export type ImageSearchCacheEntry = {
  status: ImageSearchCacheStatus;
  result?: ImageProviderResult;
  cachedAt: number;
  expiresAt: number;
};

export type ImageSearchCacheInput = ImageLookupInput;

type CacheStoreEntry = ImageSearchCacheEntry & { key: string };

const store = new Map<string, CacheStoreEntry>();

function lessonLanguageBase(languageTag: string): string {
  return languageTag.trim().toLowerCase().split(/[-_]/u)[0] ?? "";
}

function normalizeOptionalField(value: string | undefined): string {
  return (value ?? "").normalize("NFC").trim().replace(/\s+/gu, " ").toLowerCase();
}

/** Same term normalization as imageability classification. */
export function normalizeImageSearchText(text: string, language: string): string {
  const trimmed = text.normalize("NFC").trim().replace(/\s+/gu, " ").toLowerCase();
  const base = lessonLanguageBase(language);
  if (base === "es") {
    const needles = buildSpanishCorpusLookupNeedles(trimmed);
    const stripped = stripLeadingSpanishArticles(trimmed);
    const single = needles.find((n) => n.length >= 2 && !n.includes(" "));
    return foldSpanishAccents(single ?? (stripped || trimmed));
  }
  return foldSpanishAccents(trimmed);
}

/** Stable cache key for identical image-search lookups. */
export function buildImageSearchCacheKey(input: ImageSearchCacheInput): string {
  const language = input.language.trim().toLowerCase();
  const text = normalizeImageSearchText(input.text, language);
  const parts = [
    IMAGE_SEARCH_PROVIDER_VERSION,
    language,
    text,
    normalizeOptionalField(input.translation),
    normalizeOptionalField(input.definition),
    normalizeOptionalField(input.explanation),
    normalizeOptionalField(input.partOfSpeech),
  ];
  return parts.join("\u001f");
}

function isExpired(entry: ImageSearchCacheEntry, now = Date.now()): boolean {
  return entry.expiresAt <= now;
}

function touchEntry(key: string, entry: CacheStoreEntry): void {
  store.delete(key);
  store.set(key, entry);
}

function evictIfNeeded(): void {
  if (store.size <= MAX_CACHE_ENTRIES) {
    return;
  }
  const sorted = [...store.entries()].sort((a, b) => a[1].cachedAt - b[1].cachedAt);
  const toRemove = store.size - MAX_CACHE_ENTRIES;
  for (let i = 0; i < toRemove; i += 1) {
    store.delete(sorted[i]![0]);
  }
}

export function clearExpiredImageSearchCache(now = Date.now()): number {
  let removed = 0;
  for (const [key, entry] of store.entries()) {
    if (isExpired(entry, now)) {
      store.delete(key);
      removed += 1;
    }
  }
  return removed;
}

export function getCachedImageSearch(
  input: ImageSearchCacheInput,
  now = Date.now()
): ImageSearchCacheEntry | null {
  clearExpiredImageSearchCache(now);
  const key = buildImageSearchCacheKey(input);
  const entry = store.get(key);
  if (!entry || isExpired(entry, now)) {
    if (entry) {
      store.delete(key);
    }
    return null;
  }
  touchEntry(key, entry);
  return {
    status: entry.status,
    result: entry.result,
    cachedAt: entry.cachedAt,
    expiresAt: entry.expiresAt,
  };
}

export function setCachedImageSearchHit(
  input: ImageSearchCacheInput,
  result: ImageProviderResult,
  now = Date.now()
): void {
  const key = buildImageSearchCacheKey(input);
  const entry: CacheStoreEntry = {
    key,
    status: "hit",
    result,
    cachedAt: now,
    expiresAt: now + TTL_HIT_MS,
  };
  store.set(key, entry);
  evictIfNeeded();
}

export function setCachedImageSearchMiss(input: ImageSearchCacheInput, now = Date.now()): void {
  const key = buildImageSearchCacheKey(input);
  const entry: CacheStoreEntry = {
    key,
    status: "miss",
    cachedAt: now,
    expiresAt: now + TTL_MISS_MS,
  };
  store.set(key, entry);
  evictIfNeeded();
}

export type ImageSearchCacheStats = {
  size: number;
  hits: number;
  misses: number;
  maxEntries: number;
};

export function getImageSearchCacheStats(): ImageSearchCacheStats {
  clearExpiredImageSearchCache();
  let hits = 0;
  let misses = 0;
  for (const entry of store.values()) {
    if (entry.status === "hit") {
      hits += 1;
    } else {
      misses += 1;
    }
  }
  return { size: store.size, hits, misses, maxEntries: MAX_CACHE_ENTRIES };
}

/** Test-only: reset in-memory store. */
export function __resetImageSearchCacheForTests(): void {
  store.clear();
}
