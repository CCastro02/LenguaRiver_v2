/**
 * Run: `npx tsx lib/image-providers/pixabay.test.ts`
 */
import assert from "node:assert/strict";

import {
  buildPixabayProviderResult,
  lookupPixabayImage,
  rankPixabayHits,
} from "./pixabay";

async function runPixabayTests(): Promise<void> {
  const noKey = await lookupPixabayImage(
    { text: "revenue", language: "en" },
    {
      imageability: "concept",
      confidence: "medium",
      searchQuery: "revenue growth coins chart",
      providerSearchQueries: {
        pixabay: "revenue growth coins chart",
      },
      reason: "test",
    },
    { apiKey: undefined }
  );
  assert.equal(noKey, null);

  const ranked = rankPixabayHits(
    [
      {
        tags: "sunset, mountain, landscape",
        webformatURL: "https://pixabay.com/get/sunset.jpg",
        pageURL: "https://pixabay.com/photos/sunset-1/",
        user: "A",
      },
      {
        tags: "business, coins, chart, revenue",
        largeImageURL: "https://pixabay.com/get/revenue.jpg",
        previewURL: "https://pixabay.com/get/revenue-preview.jpg",
        pageURL: "https://pixabay.com/photos/revenue-2/",
        user: "FinanceUser",
        userImageURL: "https://pixabay.com/users/financeuser/",
      },
    ],
    "revenue growth coins chart",
    { text: "revenue", language: "en" }
  );
  assert.ok(ranked);
  const built = buildPixabayProviderResult(
    ranked,
    { text: "revenue", language: "en" },
    "revenue growth coins chart"
  );
  assert.equal(built.imageSource, "pixabay");
  assert.equal(built.imageProvider, "pixabay");
  assert.equal(built.imageLicense, "Pixabay Content License");
  assert.equal(built.imageLicenseUrl, "https://pixabay.com/service/license-summary/");
  assert.equal(built.imagePageUrl, "https://pixabay.com/photos/revenue-2/");
  assert.ok(built.imageAttribution?.includes("FinanceUser"));
  assert.equal(built.imageUrl, "https://pixabay.com/get/revenue.jpg");
  assert.equal(built.thumbnailUrl, "https://pixabay.com/get/revenue-preview.jpg");

  let fetchCalled = false;
  const mockFetch = async () => {
    fetchCalled = true;
    return new Response(
      JSON.stringify({
        hits: [
          {
            tags: "knowledge, books, library, education",
            largeImageURL: "https://pixabay.com/get/knowledge.jpg",
            previewURL: "https://pixabay.com/get/knowledge-preview.jpg",
            pageURL: "https://pixabay.com/photos/knowledge-9/",
            user: "Reader",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const fromApi = await lookupPixabayImage(
    { text: "knowledge", language: "en" },
    {
      imageability: "concept",
      confidence: "medium",
      searchQuery: "knowledge books library",
      providerSearchQueries: {
        pixabay: "knowledge books library",
      },
      reason: "test",
    },
    { apiKey: "test-key", fetchImpl: mockFetch as typeof fetch }
  );
  assert.equal(fetchCalled, true);
  assert.ok(fromApi);
  assert.equal(fromApi?.imageSource, "pixabay");
  assert.ok(fromApi?.imageAttribution?.includes("Reader"));
}

void runPixabayTests().then(() => {
  console.log("pixabay.test.ts: all tests passed");
});
