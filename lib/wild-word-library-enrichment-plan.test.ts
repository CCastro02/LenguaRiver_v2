/**
 * Run: `npx tsx lib/wild-word-library-enrichment-plan.test.ts`
 */
import assert from "node:assert/strict";

import { buildLexemeKey } from "./lexeme-key";
import { ENRICHMENT_VERSION } from "./wild-word-enrichment";
import {
  planWildWordLibraryEnrichment,
  wildWordLibraryEnrichmentNeedsForce,
} from "./wild-word-library-enrichment-plan";

const baseSaved = "2026-01-01T00:00:00.000Z";

const completeRow = {
  id: "complete",
  text: "Disculpe",
  language: "es",
  lexemeKey: buildLexemeKey("es", "disculpe"),
  translation: "excuse me",
  definition: "Pedir perdón.",
  definitionLanguage: "es",
  explanation: "To ask for forgiveness.",
  explanationLanguage: "en",
  explanationSource: "argos",
  phonetic: "/disˈkulpe/",
  imageUrl: "/images/chunks/disculpe.png",
  imageSource: "lesson",
  translationTargetLanguage: "en",
  enrichmentVersion: ENRICHMENT_VERSION,
  sourceItemId: "",
  sourceTitle: "",
  savedAt: baseSaved,
};

const completePlan = planWildWordLibraryEnrichment([completeRow]);
assert.equal(completePlan.rowsToEnrich.length, 0);

const missingTranslation = {
  id: "no-trans",
  text: "hola",
  language: "es",
  lexemeKey: buildLexemeKey("es", "hola"),
  sourceItemId: "",
  sourceTitle: "",
  savedAt: baseSaved,
};
const transPlan = planWildWordLibraryEnrichment([missingTranslation]);
assert.equal(transPlan.rowsToEnrich.length, 1);
assert.ok(transPlan.reasonsById["no-trans"]?.includes("missing_translation"));

const missingDefinition = {
  id: "no-def",
  text: "adiós",
  language: "es",
  lexemeKey: buildLexemeKey("es", "adiós"),
  translation: "goodbye",
  translationTargetLanguage: "en",
  enrichmentVersion: ENRICHMENT_VERSION,
  sourceItemId: "",
  sourceTitle: "",
  savedAt: baseSaved,
};
const defPlan = planWildWordLibraryEnrichment([missingDefinition]);
assert.ok(defPlan.reasonsById["no-def"]?.includes("missing_definition"));

const needsExplanation = {
  id: "no-exp",
  text: "mesa",
  language: "es",
  lexemeKey: buildLexemeKey("es", "mesa"),
  translation: "table",
  definition: "Mueble con tablero horizontal.",
  definitionLanguage: "es",
  translationTargetLanguage: "en",
  enrichmentVersion: ENRICHMENT_VERSION,
  sourceItemId: "",
  sourceTitle: "",
  savedAt: baseSaved,
};
const expPlan = planWildWordLibraryEnrichment([needsExplanation]);
assert.ok(expPlan.reasonsById["no-exp"]?.includes("missing_explanation"));

const missingImage = {
  id: "no-img",
  text: "perro",
  language: "es",
  lexemeKey: buildLexemeKey("es", "perro"),
  translation: "dog",
  definition: "Animal doméstico.",
  definitionLanguage: "es",
  explanation: "A domestic animal.",
  explanationLanguage: "en",
  explanationSource: "argos",
  translationTargetLanguage: "en",
  enrichmentVersion: ENRICHMENT_VERSION,
  sourceItemId: "",
  sourceTitle: "",
  savedAt: baseSaved,
};
const imgPlan = planWildWordLibraryEnrichment([missingImage]);
assert.ok(imgPlan.reasonsById["no-img"]?.includes("missing_image"));

const rejectedConcept = {
  id: "perhaps-img",
  text: "perhaps",
  language: "en",
  lexemeKey: buildLexemeKey("en", "perhaps"),
  translation: "quizás",
  imageUrl: "/images/concepts/uncertainty.png",
  imageSource: "concept",
  translationTargetLanguage: "en",
  enrichmentVersion: ENRICHMENT_VERSION,
  sourceItemId: "",
  sourceTitle: "",
  savedAt: baseSaved,
};
const rejectedPlan = planWildWordLibraryEnrichment([rejectedConcept]);
assert.ok(rejectedPlan.reasonsById["perhaps-img"]?.includes("rejected_image"));
assert.ok(wildWordLibraryEnrichmentNeedsForce(rejectedPlan.reasonsById["perhaps-img"] ?? []));

const userImageRow = {
  id: "user",
  text: "mesa",
  language: "es",
  lexemeKey: buildLexemeKey("es", "mesa"),
  imageSource: "user",
  imageAssetId: "blob-1",
  translation: "table",
  translationTargetLanguage: "en",
  enrichmentVersion: ENRICHMENT_VERSION,
  sourceItemId: "",
  sourceTitle: "",
  savedAt: baseSaved,
};
const userPlan = planWildWordLibraryEnrichment([userImageRow]);
assert.ok(!userPlan.reasonsById.user?.includes("missing_image"));
assert.ok(!userPlan.reasonsById.user?.includes("rejected_image"));

const aprenderStale = {
  id: "aprender",
  text: "aprender",
  language: "es",
  lexemeKey: buildLexemeKey("es", "aprender"),
  translation: "Learning",
  translationTargetLanguage: "en",
  enrichmentVersion: ENRICHMENT_VERSION,
  sourceItemId: "",
  sourceTitle: "",
  savedAt: baseSaved,
};
const aprenderPlan = planWildWordLibraryEnrichment([aprenderStale]);
assert.ok(aprenderPlan.reasonsById.aprender?.includes("stale_translation"));

console.log("wild-word-library-enrichment-plan.test.ts: all tests passed");
