/**
 * Run: `npx tsx lib/lesson-chunk-corpus-lookup.test.ts`
 */
import assert from "node:assert/strict";

import {
  buildSpanishCorpusLookupNeedles,
  lookupLessonChunkMetadata,
  spanishPluralSingularVariants,
  stripLeadingSpanishArticles,
} from "./lesson-chunk-corpus-lookup";
import type { UserWildWord } from "./explore-content";
import { buildLessonChunkMetadataMap } from "./review-queue";

const corpusMap = buildLessonChunkMetadataMap();
const lexemeLookup = new Map<string, (typeof corpusMap extends Map<string, infer V> ? V : never)>();
for (const row of corpusMap.values()) {
  if (row.lexemeKey && !lexemeLookup.has(row.lexemeKey)) {
    lexemeLookup.set(row.lexemeKey, row);
  }
}

function lookupImage(text: string, language = "es"): string | undefined {
  const word: UserWildWord = {
    id: "test",
    text,
    language,
    sourceItemId: "",
    sourceTitle: "",
    savedAt: new Date().toISOString(),
  };
  const { meta } = lookupLessonChunkMetadata({
    rawRecord: { language },
    word,
    corpusMap,
    lexemeLookup: new Map(),
  });
  return meta?.image;
}

assert.deepEqual(spanishPluralSingularVariants("mesas"), ["mesa"]);
assert.deepEqual(spanishPluralSingularVariants("libros"), ["libro"]);
assert.deepEqual(spanishPluralSingularVariants("llaves"), ["llave"]);
assert.deepEqual(spanishPluralSingularVariants("coloniales"), ["colonial"]);
assert.ok(buildSpanishCorpusLookupNeedles("Mesas").includes("mesa"));
assert.equal(stripLeadingSpanishArticles("una mesa"), "mesa");

assert.equal(lookupImage("Mesas"), "/images/chunks/mesa.png");
assert.equal(lookupImage("mesa"), "/images/chunks/mesa.png");
assert.equal(lookupImage("cuenta"), "/images/chunks/cuenta.png");
assert.equal(lookupImage("picante"), "/images/chunks/picante.png");

assert.equal(lookupImage("muchas"), undefined);

console.log("lesson-chunk-corpus-lookup.test.ts: ok");
