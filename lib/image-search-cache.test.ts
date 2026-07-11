/**
 * Run: `npx tsx lib/image-search-cache.test.ts`
 */
import assert from "node:assert/strict";

import {
  IMAGE_SEARCH_PROVIDER_VERSION,
  __resetImageSearchCacheForTests,
  buildImageSearchCacheKey,
  getCachedImageSearch,
  getImageSearchCacheStats,
  setCachedImageSearchHit,
  setCachedImageSearchMiss,
} from "./image-search-cache";
import type { ImageProviderResult } from "./image-providers/types";

__resetImageSearchCacheForTests();

const sampleResult: ImageProviderResult = {
  imageUrl: "https://example.com/photo.jpg",
  imageSource: "pexels",
  imageProvider: "pexels",
  imageAlt: "Revenue chart",
  confidence: "high",
  reason: "test",
};

const baseInput = {
  text: "revenue",
  language: "en",
  translation: "ingresos",
  definition: "money earned",
  explanation: "business income",
  partOfSpeech: "noun",
};

setCachedImageSearchHit(baseInput, sampleResult, 1_000);
const hit = getCachedImageSearch(baseInput, 2_000);
assert.ok(hit);
assert.equal(hit.status, "hit");
assert.equal(hit.result?.imageUrl, sampleResult.imageUrl);

setCachedImageSearchMiss({ text: "perhaps", language: "en" }, 3_000);
const miss = getCachedImageSearch({ text: "perhaps", language: "en" }, 4_000);
assert.ok(miss);
assert.equal(miss.status, "miss");
assert.equal(miss.result, undefined);

const expiredHit = getCachedImageSearch(baseInput, 1_000 + 8 * 24 * 60 * 60 * 1000);
assert.equal(expiredHit, null);

__resetImageSearchCacheForTests();
const now = 10_000;
for (let i = 0; i < 1001; i += 1) {
  setCachedImageSearchMiss({ text: `word${i}`, language: "en" }, now + i);
}
const stats = getImageSearchCacheStats();
assert.ok(stats.size <= 1000, `expected eviction, got ${stats.size}`);

const keyA = buildImageSearchCacheKey({ text: "revenue", language: "en" });
const keyB = buildImageSearchCacheKey({ text: "revenue", language: "es" });
assert.notEqual(keyA, keyB);

const keyC = buildImageSearchCacheKey({
  text: "revenue",
  language: "en",
  translation: "other",
});
assert.notEqual(keyA, keyC);

assert.ok(keyA.includes(IMAGE_SEARCH_PROVIDER_VERSION));

__resetImageSearchCacheForTests();
console.log("image-search-cache.test.ts: OK");
