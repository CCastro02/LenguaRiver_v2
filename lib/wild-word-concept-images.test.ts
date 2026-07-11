/**
 * Run: `npx tsx lib/wild-word-concept-images.test.ts`
 */
import assert from "node:assert/strict";

import { listConceptImageUrls, lookupConceptWordImage } from "./wild-word-concept-images";

function conceptUrl(word: string, language = "en") {
  return lookupConceptWordImage({ language, text: word })?.imageUrl;
}

assert.equal(conceptUrl("revenue"), "/images/concepts/revenue.png");
assert.equal(conceptUrl("income"), "/images/concepts/revenue.png");
assert.equal(conceptUrl("ventures"), "/images/concepts/venture.png");
assert.equal(conceptUrl("venture"), "/images/concepts/venture.png");
assert.equal(conceptUrl("learning"), "/images/concepts/learning.png");
assert.equal(conceptUrl("translation"), "/images/concepts/translation.png");
assert.equal(conceptUrl("frequency"), "/images/concepts/frequency.png");
assert.equal(conceptUrl("perhaps"), undefined);
assert.equal(conceptUrl("expects"), undefined);
assert.equal(conceptUrl("aprender", "es"), undefined);
assert.equal(conceptUrl("ingresos", "es"), "/images/concepts/revenue.png");
assert.equal(conceptUrl("empresas", "es"), "/images/concepts/company.png");
assert.equal(conceptUrl("aprendizaje", "es"), "/images/concepts/learning.png");
assert.equal(conceptUrl("quizás", "es"), undefined);

assert.equal(lookupConceptWordImage({ language: "en", text: "dog" }), null);
assert.equal(lookupConceptWordImage({ language: "en", text: "cat" }), null);
assert.equal(lookupConceptWordImage({ language: "en", text: "zzxyunknownword" }), null);

const revenue = lookupConceptWordImage({ language: "en", text: "revenue" });
assert.ok(revenue);
assert.equal(revenue.imageSource, "concept");
assert.equal(revenue.imageAlt, "Revenue");

assert.equal(listConceptImageUrls().length, 11);
assert.ok(listConceptImageUrls().every((u) => u.startsWith("/images/concepts/")));

console.log("wild-word-concept-images.test.ts: all tests passed");
