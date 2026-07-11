/**
 * Run: `npx tsx lib/text-context-cleanup.test.ts`
 */
import assert from "node:assert/strict";

import {
  cleanContextForDisplay,
  collapseContextWhitespace,
  highlightSavedTextInContext,
  isNoisyContextSentence,
  pickContextDisplaySentences,
  resolveContextDisplaySentenceLimit,
  sentenceContainsSavedWord,
  splitContextSentences,
} from "./text-context-cleanup";

assert.equal(collapseContextWhitespace("  Hello   world.  "), "Hello world.");
assert.equal(collapseContextWhitespace("Line one.\n\nLine two."), "Line one. Line two.");

const short = cleanContextForDisplay("She said hello to the clerk.");
assert.ok(short);
assert.equal(short!.display, "She said hello to the clerk.");
assert.equal(short!.full, undefined);

const longParagraph =
  "The morning market opened early with vendors arranging produce along the main avenue. Shoppers moved quickly between stalls comparing prices and chatting with sellers they knew well. Third adds detail about prices. Fourth is extra background. Fifth should not appear on the card.";
const longResult = cleanContextForDisplay(longParagraph);
assert.ok(longResult);
assert.equal(
  longResult!.display,
  "The morning market opened early with vendors arranging produce along the main avenue. Shoppers moved quickly between stalls comparing prices and chatting with sellers they knew well."
);
assert.equal(longResult!.full, longParagraph);

const threeShort =
  "Yes. OK. Fine. This fourth sentence must not appear on the card at all.";
const threeShortResult = cleanContextForDisplay(threeShort);
assert.ok(threeShortResult);
const threeShortParts = threeShortResult!.display.split(/(?<=[.!?])\s+/u);
assert.equal(threeShortParts.length, 3, "three very short opening sentences allowed");
assert.ok(!threeShortResult!.display.includes("fourth sentence"));
assert.equal(threeShortResult!.full, threeShort);

const fourShort = "A. B. C. D. E.";
const fourShortResult = cleanContextForDisplay(fourShort);
assert.ok(fourShortResult);
assert.equal(fourShortResult!.display.split(/(?<=[.!?])\s+/u).length, 3, "never more than 3 sentences");
assert.equal(fourShortResult!.full, fourShort);

assert.equal(resolveContextDisplaySentenceLimit(["One long sentence that exceeds the short threshold by design.", "Two."]), 2);

const noisyVideo = [
  "Video player is loading.",
  "Subtitles / CC · Settings",
  "Autoplay is on.",
  "The host greeted everyone in Spanish before the interview began.",
  "They discussed regional food traditions for several minutes.",
  "Ad loading · Skip ad · Watch later",
].join(" ");

const noisyResult = cleanContextForDisplay(noisyVideo);
assert.ok(noisyResult);
assert.ok(!noisyResult!.display.toLowerCase().includes("video player"));
assert.ok(!noisyResult!.display.toLowerCase().includes("skip ad"));
assert.ok(noisyResult!.display.includes("host greeted"));
assert.equal(noisyResult!.display.split(/(?<=[.!?])\s+/u).length, 2, "noisy pool still capped at 2 when sentences are long");
assert.equal(noisyResult!.full, noisyVideo);

assert.equal(cleanContextForDisplay(""), null);
assert.equal(cleanContextForDisplay("   \n  "), null);
assert.equal(cleanContextForDisplay(undefined), null);

assert.equal(isNoisyContextSentence("Video player is loading."), true);
assert.equal(isNoisyContextSentence("Skip ad"), true);
assert.equal(isNoisyContextSentence("A normal sentence about travel."), false);

const split = splitContextSentences("One. Two! Three?");
assert.deepEqual(split, ["One.", "Two!", "Three?"]);

const drSplit = splitContextSentences("Dr. García llegó temprano. Saludó a todos.");
assert.equal(drSplit.length, 2);
assert.ok(drSplit[0]!.startsWith("Dr. García"));

const picked = pickContextDisplaySentences([
  "Play",
  "Pause",
  "Real context from the page about learning vocabulary.",
]);
assert.equal(picked.length, 1);
assert.ok(picked[0]!.includes("Real context"));

const frecuenciaContext =
  "La palabra aparece con frecuencia en textos académicos. Los estudiantes la repiten en clase. Un tercer párrafo con más detalle histórico. Cuarto párrafo sobra en la tarjeta.";
const frecuenciaResult = cleanContextForDisplay(frecuenciaContext, { savedWord: "frecuencia" });
assert.ok(frecuenciaResult);
assert.ok(frecuenciaResult!.display.toLowerCase().includes("frecuencia"));
assert.equal(frecuenciaResult!.display.split(/(?<=[.!?])\s+/u).length, 1);
assert.ok(frecuenciaResult!.full?.includes("Cuarto párrafo"));

const frecuenciaHighlight = highlightSavedTextInContext(
  frecuenciaResult!.display,
  "frecuencia"
);
assert.ok(frecuenciaHighlight.some((s) => s.highlight && /frecuencia/i.test(s.text)));
assert.equal(
  frecuenciaHighlight.map((s) => s.text).join(""),
  frecuenciaResult!.display
);

const caseHighlight = highlightSavedTextInContext("They discussed FRECUENCIA often.", "frecuencia");
assert.ok(caseHighlight.some((s) => s.highlight && s.text === "FRECUENCIA"));

const accentHighlight = highlightSavedTextInContext("Aparece con frecuencia en el texto.", "frecuéncia");
assert.ok(accentHighlight.some((s) => s.highlight && /frecuencia/i.test(s.text)));

const noMatch = highlightSavedTextInContext("No related lemma here.", "frecuencia");
assert.equal(noMatch.length, 1);
assert.equal(noMatch[0]!.highlight, false);

const learningContext =
  "If you're getting into Python and considering web development, you might eventually deal with multilingual sites. Weglot could be helpful. It saves work if you're focusing on learning coding.";
const learningResult = cleanContextForDisplay(learningContext, { savedWord: "learning" });
assert.ok(learningResult);
assert.ok(learningResult!.display.toLowerCase().includes("learning"));
assert.ok(!learningResult!.display.toLowerCase().includes("weglot could be helpful"));
assert.equal(learningResult!.full, learningContext);

const trialContext =
  "There may be some with a free trial, but others require payment upfront. Annual plans often discount the monthly rate.";
const trialResult = cleanContextForDisplay(trialContext, { savedWord: "trial" });
assert.ok(trialResult);
assert.ok(/\btrial\b/i.test(trialResult!.display));

const disculpeContext = "Perdón / Disculpe. (Para pedir permiso o atención.) Otro ejemplo no debe dominar.";
const disculpeResult = cleanContextForDisplay(disculpeContext, { savedWord: "Disculpe" });
assert.ok(disculpeResult);
assert.ok(/disculpe/i.test(disculpeResult!.display));

const thirdSentenceHit =
  "Primera oración sin la palabra. Segunda tampoco aparece aquí. Tercera menciona aprendizaje activo. Cuarta sobra.";
const thirdHitResult = cleanContextForDisplay(thirdSentenceHit, { savedWord: "aprendizaje" });
assert.ok(thirdHitResult);
assert.ok(thirdHitResult!.display.toLowerCase().includes("aprendizaje"));
assert.ok(!thirdHitResult!.display.toLowerCase().startsWith("primera"));

const noWordFallback =
  "Alpha sentence one about travel. Beta sentence two about food. Gamma sentence three about music.";
const noWordResult = cleanContextForDisplay(noWordFallback, { savedWord: "zzzznotfound" });
assert.ok(noWordResult);
assert.equal(noWordResult!.display.split(/(?<=[.!?])\s+/u).length, 2);

assert.equal(sentenceContainsSavedWord("Free trial available.", "trial"), true);
assert.equal(sentenceContainsSavedWord("Perdón / Disculpe.", "Disculpe"), true);
assert.equal(sentenceContainsSavedWord("No match here.", "trial"), false);

const learningHighlight = highlightSavedTextInContext(learningResult!.display, "learning");
assert.ok(learningHighlight.some((s) => s.highlight && /learning/i.test(s.text)));

const maxThreeAroundHit = pickContextDisplaySentences(
  [
    "Intro without keyword.",
    "Short prev.",
    "It saves work if you're focusing on learning coding.",
    "Short next.",
    "Trailing extra sentence should not show.",
  ],
  { savedWord: "learning", maxSentences: 3 }
);
assert.ok(maxThreeAroundHit.length <= 3);
assert.ok(maxThreeAroundHit.some((s) => /learning/i.test(s)));

console.log("text-context-cleanup.test.ts: ok");
