/**
 * Run: `npx tsx lib/image-providers/relevance.test.ts`
 */
import assert from "node:assert/strict";

import { assessImageRelevance } from "./relevance";
import { rankPexelsPhotos } from "./pexels";

const revenueAccepted = assessImageRelevance({
  queryTerms: ["revenue", "growth", "coins", "chart"],
  word: "revenue",
  tags: ["business", "coins", "chart", "finance"],
  alt: "coins and growth chart on desk",
});
assert.equal(revenueAccepted.accepted, true);
assert.ok(revenueAccepted.confidence === "high" || revenueAccepted.confidence === "medium");

const revenueRejected = assessImageRelevance({
  queryTerms: ["revenue", "growth", "coins", "chart"],
  word: "revenue",
  tags: ["landscape", "mountain", "sunset", "nature"],
  alt: "mountain landscape at sunset",
});
assert.equal(revenueRejected.accepted, false);

const revenueGiftRejected = assessImageRelevance({
  queryTerms: ["revenue", "growth", "coins", "chart"],
  word: "revenue",
  alt: "decorative gift box with ribbon on table",
  tags: ["gift", "present", "decorative", "box"],
});
assert.equal(revenueGiftRejected.accepted, false);
assert.match(revenueGiftRejected.reason, /gift|finance|decorative/i);

const learningAccepted = assessImageRelevance({
  queryTerms: ["student", "studying", "books", "learning"],
  word: "learning",
  tags: ["student", "books", "study", "education"],
  alt: "student studying with books",
});
assert.equal(learningAccepted.accepted, true);

const learningRejected = assessImageRelevance({
  queryTerms: ["student", "studying", "books", "learning"],
  word: "learning",
  tags: ["laptop", "computer", "keyboard"],
  alt: "laptop on desk",
});
assert.equal(learningRejected.accepted, false);

const knowledgeLightbulbRejected = assessImageRelevance({
  queryTerms: ["knowledge", "books", "library"],
  word: "knowledge",
  alt: "lightbulb idea concept",
  tags: ["lightbulb", "idea"],
});
assert.equal(knowledgeLightbulbRejected.accepted, false);

const knowledgeBooksAccepted = assessImageRelevance({
  queryTerms: ["knowledge", "books", "library"],
  word: "knowledge",
  alt: "library books knowledge education",
  tags: ["books", "library", "education"],
});
assert.equal(knowledgeBooksAccepted.accepted, true);

const momentoGiftRejected = assessImageRelevance({
  queryTerms: ["clock", "watch", "time"],
  word: "momento",
  translation: "time",
  alt: "decorative gift box with hand-painted illustration on table",
  tags: ["gift", "box", "decorative", "illustration"],
});
assert.equal(momentoGiftRejected.accepted, false);

const momentoClockAccepted = assessImageRelevance({
  queryTerms: ["clock", "watch", "time"],
  word: "momento",
  translation: "time",
  alt: "vintage clock and wrist watch on wooden table",
  tags: ["clock", "watch", "time"],
});
assert.equal(momentoClockAccepted.accepted, true);

const momentoPexelsRank = rankPexelsPhotos(
  [
    {
      alt: "decorative gift box with hand-painted illustration",
      src: { large: "https://images.pexels.com/photos/gift/large.jpg" },
    },
    {
      alt: "wall clock and wrist watch showing time",
      src: { large: "https://images.pexels.com/photos/clock/large.jpg" },
    },
  ],
  "clock watch time",
  { text: "momento", language: "es", translation: "time" }
);
assert.ok(momentoPexelsRank);
assert.match(momentoPexelsRank.photo.alt ?? "", /clock|watch/i);

const illustrationOnlyWeak = assessImageRelevance({
  queryTerms: ["clock", "watch", "time"],
  word: "momento",
  alt: "abstract decorative illustration background design",
  tags: ["illustration", "decorative", "design", "background"],
});
assert.equal(illustrationOnlyWeak.accepted, false);

const translationAccepted = assessImageRelevance({
  queryTerms: ["translation", "language", "speech", "bubbles"],
  word: "translation",
  alt: "language translation text speech bubbles dictionary",
  tags: ["language", "translation", "text"],
});
assert.equal(translationAccepted.accepted, true);

console.log("relevance.test.ts: all tests passed");
