/**
 * Run: `npx tsx lib/language-detect.test.ts`
 *
 * @sync Run `npm run verify:language-detect-sync` after changing wordlists or scoring.
 */
import assert from "node:assert/strict";

import {
  isUsableDetection,
  resolveContextSentenceLanguage,
  resolveSelectedTextLanguage,
  resolveWildWordDetectLanguage,
} from "./language-detect";

const EN_CTX =
  "Check out this platform for learning web development. The tools are pretty helpful.";
const ES_CTX =
  "Bienvenidos a este recurso para estudiantes amantes del idioma español. Aquí puede explorar páginas populares.";

assert.equal(resolveSelectedTextLanguage("learning").language, "en");
assert.equal(resolveSelectedTextLanguage("learning").confidence, "high");

assert.equal(resolveSelectedTextLanguage("pronto").language, "es");
assert.equal(resolveSelectedTextLanguage("bienvenidos").language, "es");
assert.equal(resolveSelectedTextLanguage("paid").language, "en");
assert.equal(resolveSelectedTextLanguage("free").language, "en");
assert.equal(resolveSelectedTextLanguage("trial").language, "en");
assert.equal(resolveSelectedTextLanguage("Mesas").language, "es");
assert.equal(resolveSelectedTextLanguage("coloniales").language, "es");
assert.equal(resolveSelectedTextLanguage("mañana").language, "es");
assert.equal(resolveSelectedTextLanguage("Disculpe").language, "es");

assert.equal(resolveSelectedTextLanguage("привет").language, "ru");
assert.equal(resolveSelectedTextLanguage("مرحبا").language, "ar");

assert.equal(resolveSelectedTextLanguage("bonjour").language, "fr");
assert.equal(resolveSelectedTextLanguage("merci").language, "fr");
assert.equal(resolveSelectedTextLanguage("je suis").language, "fr");
assert.equal(resolveSelectedTextLanguage("danke").language, "de");
assert.equal(resolveSelectedTextLanguage("bitte").language, "de");
assert.equal(resolveSelectedTextLanguage("das haus").language, "de");
assert.equal(resolveSelectedTextLanguage("ciao").language, "it");
assert.equal(resolveSelectedTextLanguage("grazie").language, "it");
assert.equal(resolveSelectedTextLanguage("nella casa").language, "it");

const prontoCtx = resolveContextSentenceLanguage(ES_CTX);
assert.equal(prontoCtx.language, "es");
assert.ok(isUsableDetection(prontoCtx));

const learningCleanup = resolveWildWordDetectLanguage("learning", EN_CTX);
assert.ok(learningCleanup && learningCleanup.language === "en");

const knowledgeCleanup = resolveWildWordDetectLanguage("knowledge", EN_CTX);
assert.ok(knowledgeCleanup && knowledgeCleanup.language === "en");

const unknownEn = resolveWildWordDetectLanguage("xyz", EN_CTX);
assert.ok(unknownEn && unknownEn.language === "en");

const unknownEs = resolveWildWordDetectLanguage("xyz", ES_CTX);
assert.ok(unknownEs && unknownEs.language === "es");

assert.equal(resolveWildWordDetectLanguage("xyz"), null);

console.log("language-detect.test.ts: ok");
