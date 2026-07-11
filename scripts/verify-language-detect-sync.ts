/**
 * Parity check: web `lib/language-detect.ts` vs extension `lib/language-detect.ts`.
 * Run: `npm run verify:language-detect-sync`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { LanguageDetectionResult } from "../lib/language-detect";
import * as web from "../lib/language-detect";
import * as ext from "../extensions/lenguariver-extension/lib/language-detect";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DETECT_PATH = path.join(__dirname, "..", "lib", "language-detect.ts");
const EXT_DETECT_PATH = path.join(
  __dirname,
  "..",
  "extensions",
  "lenguariver-extension",
  "lib",
  "language-detect.ts"
);

const EN_CTX =
  "Check out this platform for learning web development. The tools are pretty helpful.";
const ES_CTX =
  "Bienvenidos a este recurso para estudiantes amantes del idioma español. Aquí puede explorar páginas populares.";

function extractWordlistSet(source: string, constName: string): string[] {
  const marker = `const ${constName} = new Set([`;
  const start = source.indexOf(marker);
  if (start < 0) {
    throw new Error(`Could not find ${constName} in detector source.`);
  }
  const from = start + marker.length;
  const end = source.indexOf("]);", from);
  if (end < 0) {
    throw new Error(`Could not parse ${constName} literal.`);
  }
  const body = source.slice(from, end);
  const words: string[] = [];
  const re = /"([^"\\]*(?:\\.[^"\\]*)*)"/gu;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    words.push(match[1]!.replace(/\\"/gu, '"'));
  }
  return words.sort();
}

function assertWordlistsMatch(): void {
  const webSrc = readFileSync(WEB_DETECT_PATH, "utf8");
  const extSrc = readFileSync(EXT_DETECT_PATH, "utf8");

  for (const listName of [
    "SPANISH_COMMON_WORDS",
    "ENGLISH_COMMON_WORDS",
    "FRENCH_COMMON_WORDS",
    "GERMAN_COMMON_WORDS",
    "ITALIAN_COMMON_WORDS",
  ] as const) {
    const webWords = extractWordlistSet(webSrc, listName);
    const extWords = extractWordlistSet(extSrc, listName);
    assert.deepEqual(
      webWords,
      extWords,
      `${listName} differs between web and extension detectors`
    );
  }

  const sharedMarkers = [
    "function surfaceVariantsForWordlist",
    "function hitsSpanishWordlist",
    "function hitsEnglishWordlist",
    "function hitsFrenchWordlist",
    "function hitsGermanWordlist",
    "function hitsItalianWordlist",
    "function scoreWordlists",
    "function applyMarkerBoosts",
    "export function resolveSelectedTextLanguage",
    "export function resolveContextSentenceLanguage",
  ];
  for (const marker of sharedMarkers) {
    assert.ok(webSrc.includes(marker), `web detector missing ${marker}`);
    assert.ok(extSrc.includes(marker), `extension detector missing ${marker}`);
  }
}

type ExpectedDetection = {
  language: LanguageDetectionResult["language"];
  confidence?: LanguageDetectionResult["confidence"];
  source?: LanguageDetectionResult["source"];
};

function assertDetectionsEqual(
  label: string,
  webResult: LanguageDetectionResult,
  extResult: LanguageDetectionResult
): void {
  assert.equal(
    webResult.language,
    extResult.language,
    `${label}: language web=${webResult.language} ext=${extResult.language}`
  );
  assert.equal(
    webResult.confidence,
    extResult.confidence,
    `${label}: confidence web=${webResult.confidence} ext=${extResult.confidence}`
  );
  assert.equal(
    webResult.source,
    extResult.source,
    `${label}: source web=${webResult.source} ext=${extResult.source}`
  );
  assert.equal(
    webResult.reason,
    extResult.reason,
    `${label}: reason web=${webResult.reason} ext=${extResult.reason}`
  );
}

function assertSelectedParity(text: string, expected: ExpectedDetection): void {
  const webResult = web.resolveSelectedTextLanguage(text);
  const extResult = ext.resolveSelectedTextLanguage(text);
  assertDetectionsEqual(`selected:${text}`, webResult, extResult);
  assert.equal(webResult.language, expected.language, `selected:${text} language`);
  if (expected.confidence) {
    assert.equal(webResult.confidence, expected.confidence, `selected:${text} confidence`);
  }
  if (expected.source) {
    assert.equal(webResult.source, expected.source, `selected:${text} source`);
  }
}

function assertContextParity(context: string, expected: ExpectedDetection): void {
  const webResult = web.resolveContextSentenceLanguage(context);
  const extResult = ext.resolveContextSentenceLanguage(context);
  assertDetectionsEqual(`context`, webResult, extResult);
  assert.equal(webResult.language, expected.language, "context language");
  if (expected.confidence) {
    assert.equal(webResult.confidence, expected.confidence, "context confidence");
  }
}

function assertWildWordParity(text: string, context: string | undefined, expected: ExpectedDetection): void {
  const webResult = web.resolveWildWordDetectLanguage(text, context);
  assert.ok(webResult, `web resolveWildWordDetectLanguage(${text}) should not be null`);
  const extSave = ext.resolveSaveLanguage(text, "en", context);
  assert.equal(
    webResult!.language,
    extSave.detection.language,
    `wild-word vs save detection language for ${text}`
  );
  assert.equal(
    webResult!.language,
    extSave.saveLanguage,
    `wild-word vs saveLanguage for ${text}`
  );
  assert.equal(webResult!.language, expected.language, `wild-word:${text} language`);
}

function runBehavioralParityTests(): void {
  assertSelectedParity("paid", { language: "en", confidence: "high", source: "selected" });
  assertSelectedParity("free", { language: "en", confidence: "high", source: "selected" });
  assertSelectedParity("trial", { language: "en", confidence: "high", source: "selected" });
  assertSelectedParity("learning", { language: "en", confidence: "high", source: "selected" });
  assertSelectedParity("knowledge", { language: "en", confidence: "high", source: "selected" });
  assertSelectedParity("bienvenidos", { language: "es", confidence: "high", source: "selected" });
  assertSelectedParity("pronto", { language: "es", confidence: "high", source: "selected" });
  assertSelectedParity("Disculpe", { language: "es", confidence: "high", source: "selected" });
  assertSelectedParity("Mesas", { language: "es", confidence: "high", source: "selected" });
  assertSelectedParity("coloniales", { language: "es", confidence: "high", source: "selected" });
  assertSelectedParity("mañana", { language: "es", confidence: "high", source: "selected" });
  assertSelectedParity("привет", { language: "ru", confidence: "high", source: "selected" });
  assertSelectedParity("مرحبا", { language: "ar", confidence: "high", source: "selected" });

  assertSelectedParity("bonjour", { language: "fr", confidence: "high", source: "selected" });
  assertSelectedParity("merci", { language: "fr", confidence: "high", source: "selected" });
  assertSelectedParity("je suis", { language: "fr", confidence: "high", source: "selected" });
  assertSelectedParity("danke", { language: "de", confidence: "high", source: "selected" });
  assertSelectedParity("bitte", { language: "de", confidence: "high", source: "selected" });
  assertSelectedParity("das haus", { language: "de", confidence: "high", source: "selected" });
  assertSelectedParity("ciao", { language: "it", confidence: "high", source: "selected" });
  assertSelectedParity("grazie", { language: "it", confidence: "high", source: "selected" });
  assertSelectedParity("nella casa", { language: "it", confidence: "high", source: "selected" });

  assertContextParity(EN_CTX, { language: "en", confidence: "high", source: "context" });
  assertContextParity(ES_CTX, { language: "es", confidence: "high", source: "context" });

  assertWildWordParity("learning", EN_CTX, { language: "en" });
  assertWildWordParity("knowledge", EN_CTX, { language: "en" });

  const prontoWithEs = web.resolveWildWordDetectLanguage("pronto", ES_CTX);
  const prontoSave = ext.resolveSaveLanguage("pronto", "en", ES_CTX);
  assert.equal(prontoWithEs?.language, "es");
  assert.equal(prontoSave.saveLanguage, "es");
  assert.equal(prontoSave.detection.language, "es");

  const disculpeWithEs = web.resolveWildWordDetectLanguage("Disculpe", ES_CTX);
  const disculpeSave = ext.resolveSaveLanguage("Disculpe", "en", ES_CTX);
  assert.equal(disculpeWithEs?.language, "es");
  assert.equal(disculpeSave.saveLanguage, "es");

  const unknownEn = web.resolveWildWordDetectLanguage("xyz", EN_CTX);
  const unknownEnSave = ext.resolveSaveLanguage("xyz", "en", EN_CTX);
  assert.equal(unknownEn?.language, "en");
  assert.equal(unknownEnSave.saveLanguage, "en");
  assert.equal(unknownEnSave.detection.source, "context");

  const unknownEs = web.resolveWildWordDetectLanguage("xyz", ES_CTX);
  const unknownEsSave = ext.resolveSaveLanguage("xyz", "en", ES_CTX);
  assert.equal(unknownEs?.language, "es");
  assert.equal(unknownEsSave.saveLanguage, "es");

  const unknownAloneWeb = web.resolveWildWordDetectLanguage("xyz");
  assert.equal(unknownAloneWeb, null, "web: unknown token without context → null (no fallback)");

  const unknownAloneExt = ext.resolveSaveLanguage("xyz", "en");
  assert.equal(unknownAloneExt.saveLanguage, "en");
  assert.equal(unknownAloneExt.detection.confidence, "low");
  assert.equal(unknownAloneExt.detection.source, "fallback");
  console.log(
    "  documented divergence: unknown token without context → web null cleanup vs extension fallback saveLanguage=en"
  );
}

function main(): number {
  console.log("Language detector sync verification");
  console.log("----------------------------------");
  try {
    assertWordlistsMatch();
    console.log("OK: wordlists match between web and extension files.");
    runBehavioralParityTests();
    console.log("OK: behavioral parity tests passed (shared selected/context APIs).");
    console.log("\nAll checks passed.");
    return 0;
  } catch (error) {
    console.error("\nFAIL:", error instanceof Error ? error.message : error);
    return 1;
  }
}

process.exit(main());
