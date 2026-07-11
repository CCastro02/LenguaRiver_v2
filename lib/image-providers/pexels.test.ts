/**
 * Run: `npx tsx lib/image-providers/pexels.test.ts`
 */
import assert from "node:assert/strict";

import {
  buildPexelsProviderResult,
  lookupPexelsImage,
  photoLooksPeopleHeavy,
  rankPexelsPhotos,
  scorePexelsAltAlignment,
} from "./pexels";

async function runPexelsTests(): Promise<void> {
  const noKey = await lookupPexelsImage(
    { text: "revenue", language: "en" },
    {
      imageability: "concept",
      confidence: "medium",
      searchQuery: "revenue growth coins chart",
      providerSearchQueries: { pexels: "revenue growth coins chart" },
      reason: "test",
    },
    { apiKey: undefined }
  );
  assert.equal(noKey, null);

  assert.ok(
    scorePexelsAltAlignment(
      "business revenue growth chart coins on desk",
      "revenue growth coins chart"
    ) > 0.3
  );
  assert.equal(
    photoLooksPeopleHeavy("portrait of smiling woman in studio", "revenue growth coins chart"),
    true
  );
  assert.equal(
    photoLooksPeopleHeavy("students learning in classroom", "student studying books learning"),
    false
  );

  const ranked = rankPexelsPhotos(
    [
      {
        alt: "random sunset beach",
        url: "https://www.pexels.com/photo/1/",
        photographer: "A",
        photographer_url: "https://www.pexels.com/@a",
        src: { large: "https://images.pexels.com/photos/1/large.jpg" },
      },
      {
        alt: "business revenue growth chart coins on desk",
        url: "https://www.pexels.com/photo/2/",
        photographer: "B",
        photographer_url: "https://www.pexels.com/@b",
        src: { large: "https://images.pexels.com/photos/2/large.jpg" },
      },
    ],
    "revenue growth coins chart",
    { text: "revenue", language: "en" }
  );
  assert.ok(ranked);
  assert.equal(ranked.relevance.confidence, "high");

  const irrelevant = rankPexelsPhotos(
    [
      {
        alt: "ocean waves at sunset",
        src: { large: "https://images.pexels.com/photos/3/large.jpg" },
      },
    ],
    "revenue growth coins chart",
    { text: "revenue", language: "en" }
  );
  assert.equal(irrelevant, null);

  const built = buildPexelsProviderResult(
    ranked!,
    { text: "revenue", language: "en" },
    "revenue growth coins chart"
  );
  assert.equal(built.imageSource, "pexels");
  assert.equal(built.imageProvider, "pexels");
  assert.equal(built.imageLicense, "Pexels License");
  assert.ok(built.imageAttribution?.includes("B"));
  assert.equal(built.imagePageUrl, "https://www.pexels.com/photo/2/");

  let fetchCalled = false;
  const mockFetch = async () => {
    fetchCalled = true;
    return new Response(
      JSON.stringify({
        photos: [
          {
            alt: "knowledge books library education",
            url: "https://www.pexels.com/photo/99/",
            photographer: "Cam",
            photographer_url: "https://www.pexels.com/@cam",
            src: { large: "https://images.pexels.com/photos/99/large.jpg" },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const fromApi = await lookupPexelsImage(
    { text: "knowledge", language: "en" },
    {
      imageability: "concept",
      confidence: "medium",
      searchQuery: "knowledge books library",
      providerSearchQueries: { pexels: "knowledge books library" },
      reason: "test",
    },
    { apiKey: "test-key", fetchImpl: mockFetch as typeof fetch }
  );
  assert.equal(fetchCalled, true);
  assert.ok(fromApi);
  assert.equal(fromApi?.imageSource, "pexels");
  assert.equal(fromApi?.confidence, "high");
}

void runPexelsTests().then(() => {
  console.log("pexels.test.ts: all tests passed");
});
