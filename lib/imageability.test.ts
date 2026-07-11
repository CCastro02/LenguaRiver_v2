/**
 * Run: `npx tsx lib/imageability.test.ts`
 */
import assert from "node:assert/strict";

import {
  allowsConceptIconFallback,
  classifyImageability,
  conceptIconConfidence,
  getProviderSearchQuery,
  isExternalImageSearchAllowed,
} from "./imageability";

const dog = classifyImageability({ text: "dog", language: "en" });
assert.equal(dog.imageability, "concrete");
assert.equal(dog.confidence, "high");
assert.equal(dog.searchQuery, "dog");
assert.equal(getProviderSearchQuery(dog, "wikimedia"), "dog");
assert.equal(getProviderSearchQuery(dog, "pexels"), "dog animal");
assert.equal(getProviderSearchQuery(dog, "pixabay"), "dog animal");

const revenue = classifyImageability({ text: "revenue", language: "en" });
assert.equal(revenue.imageability, "concept");
assert.equal(revenue.providerSearchQueries.pexels, "revenue growth coins chart");
assert.equal(revenue.providerSearchQueries.pixabay, "revenue growth coins chart");
assert.equal(getProviderSearchQuery(revenue, "pexels"), "revenue growth coins chart");

const knowledge = classifyImageability({ text: "knowledge", language: "en" });
assert.equal(knowledge.imageability, "concept");
assert.equal(getProviderSearchQuery(knowledge, "pexels"), "knowledge books library");
assert.equal(getProviderSearchQuery(knowledge, "pixabay"), "knowledge books library");

const learning = classifyImageability({ text: "learning", language: "en" });
assert.equal(learning.imageability, "concept");
assert.equal(getProviderSearchQuery(learning, "pexels"), "student studying books learning");

const momento = classifyImageability({
  text: "momento",
  language: "es",
  translation: "time",
});
assert.equal(momento.imageability, "concept");
assert.equal(getProviderSearchQuery(momento, "pexels"), "clock watch time");
assert.ok(!getProviderSearchQuery(momento, "pexels").includes("illustration"));
assert.ok(!getProviderSearchQuery(momento, "pexels").includes("moment illustration"));

const tiempo = classifyImageability({ text: "tiempo", language: "es" });
assert.equal(getProviderSearchQuery(tiempo, "pexels"), "clock time watch");

const momentEn = classifyImageability({ text: "moment", language: "en" });
assert.equal(getProviderSearchQuery(momentEn, "pexels"), "clock watch time moment");

const perhaps = classifyImageability({ text: "perhaps", language: "en" });
assert.equal(perhaps.imageability, "abstract");
assert.equal(perhaps.confidence, "high");
assert.equal(perhaps.searchQuery, "");
assert.equal(isExternalImageSearchAllowed(perhaps), false);

const aprender = classifyImageability({
  text: "aprender",
  language: "es",
  partOfSpeech: "verb",
});
assert.equal(aprender.imageability, "concept");
assert.equal(getProviderSearchQuery(aprender, "pexels"), "student studying books learning");

const estudiar = classifyImageability({ text: "estudiar", language: "es", partOfSpeech: "verb" });
assert.equal(getProviderSearchQuery(estudiar, "pexels"), "student studying books");

const traducir = classifyImageability({ text: "traducir", language: "es", partOfSpeech: "verb" });
assert.equal(getProviderSearchQuery(traducir, "pexels"), "translation language text");

assert.equal(allowsConceptIconFallback({ text: "revenue", language: "en" }), true);
assert.equal(conceptIconConfidence({ text: "revenue", language: "en" }), "high");
assert.equal(allowsConceptIconFallback({ text: "dog", language: "en" }), false);
assert.equal(allowsConceptIconFallback({ text: "perhaps", language: "en" }), false);
assert.equal(allowsConceptIconFallback({ text: "expects", language: "en" }), false);
assert.equal(allowsConceptIconFallback({ text: "aprender", language: "es" }), false);

console.log("imageability.test.ts: all tests passed");
