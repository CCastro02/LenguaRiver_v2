/**
 * Run: `npx tsx lib/image-memory-quality.test.ts`
 */
import assert from "node:assert/strict";

import {
  evaluateImageMemoryQuality,
  shouldAcceptConceptIcon,
} from "./image-memory-quality";

function conceptQuality(text: string, language = "en", imageUrl?: string) {
  return evaluateImageMemoryQuality({
    text,
    language,
    imageUrl: imageUrl ?? `/images/concepts/${text}.png`,
    imageSource: "concept",
    imageAlt: text,
  });
}

const perhaps = conceptQuality("perhaps", "en", "/images/concepts/uncertainty.png");
assert.equal(perhaps.accepted, false);
assert.equal(perhaps.score, "low");

const expects = conceptQuality("expects", "en", "/images/concepts/expectation.png");
assert.equal(expects.accepted, false);

const frequency = evaluateImageMemoryQuality({
  text: "frequency",
  language: "en",
  imageUrl: "/images/concepts/frequency.png",
  imageSource: "concept",
  imageAlt: "Frequency",
});
assert.equal(frequency.accepted, true);
assert.equal(frequency.score, "medium");

const revenue = evaluateImageMemoryQuality({
  text: "revenue",
  language: "en",
  imageUrl: "/images/concepts/revenue.png",
  imageSource: "concept",
  imageAlt: "Revenue",
});
assert.equal(revenue.accepted, true);
assert.equal(revenue.score, "high");

const aprenderConcept = evaluateImageMemoryQuality({
  text: "aprender",
  language: "es",
  imageUrl: "/images/concepts/learning.png",
  imageSource: "concept",
  imageAlt: "Learning",
});
assert.equal(aprenderConcept.accepted, false);

const aprenderExternal = evaluateImageMemoryQuality({
  text: "aprender",
  language: "es",
  imageSource: "pexels",
  imageProvider: "pexels",
  imageAlt: "Student studying with books",
  imageSearchQuery: "student studying books learning",
});
assert.equal(aprenderExternal.accepted, true);
assert.equal(aprenderExternal.score, "high");

assert.equal(shouldAcceptConceptIcon({ text: "perhaps", language: "en" }), false);
assert.equal(shouldAcceptConceptIcon({ text: "frequency", language: "en" }), true);

const dogPhoto = evaluateImageMemoryQuality({
  text: "dog",
  language: "en",
  imageSource: "wikimedia",
  imageProvider: "wikimedia",
  imageAlt: "Dog",
  imageSearchQuery: "dog",
});
assert.equal(dogPhoto.accepted, true);

console.log("image-memory-quality.test.ts: all tests passed");
