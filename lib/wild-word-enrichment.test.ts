/**
 * Run: `npx tsx lib/wild-word-enrichment.test.ts`
 */
import assert from "node:assert/strict";

import {
  sanitizeDefinitionForStorage,
  stripDefinitionLanguagePrefix,
} from "./definition-text-cleanup";
import {
  cleanWildWordTextForDisplay,
  fixCommonMojibake,
  MOJIBAKE_REPLACEMENT_CHAR,
  WILD_WORD_TEXT_ENCODING_FALLBACK,
} from "./fix-common-mojibake";
import {
  appendFakeDefinitionCleanupPatch,
  appendMojibakeCleanupPatch,
  appendOrphanExplanationCleanupPatch,
  appendRejectedConceptImageCleanupPatch,
  applyConceptImageResultToPatch,
  applyImageSearchResultToPatch,
  applyWikimediaImageResultToPatch,
  buildDefinitionLanguageInferencePatch,
  computeEnrichmentNeeds,
  ENRICHMENT_VERSION,
  explanationNeedsEnrichment,
  hasRealDefinition,
  isFakeTranslationDefinition,
  planExplanationEnrichment,
  resolveDisplayDefinition,
  enrichWildWordRecord,
  isReplaceableImageSource,
  isStaleImage,
  shouldApplyIncomingImageReplacement,
  shouldAttemptWikimediaImageEnrichment,
  TRANSLATION_FETCH_TIMEOUT_MS,
  type WildWordEnrichmentPatch,
} from "./wild-word-enrichment";
import { evaluateImageMemoryQuality } from "./image-memory-quality";
import { cleanupTranslationGloss } from "./translation-gloss-cleanup";
import { classifyImageability, getProviderSearchQuery } from "./imageability";
import type { ImageProviderResult } from "./image-providers/types";
import type { WikimediaImageResult } from "./wikimedia-image";
import {
  explanationHasEncodingIssue,
  resolveDefinitionCardDisplay,
  resolveExplanationCardDisplay,
  WILD_WORD_DEFINITION_NOT_ADDED,
  WILD_WORD_EXPLANATION_ENCODING_DETAILS,
} from "./wild-word-definition-display";
import { rankDefinitionCandidate } from "./wiktionary-definition-ranking";
import {
  buildSpanishDefinitionWithFormNote,
  getSpanishDefinitionLookupCandidates,
} from "./spanish-definition-lookup";
import { isSupportedWiktionaryLanguage, parseWiktionaryWikitext } from "./wiktionary";
import { WILD_WORD_FIELD_CLEAR } from "./wild-word-image-patch";
import { lookupCuratedWordImage } from "./wild-word-curated-images";
import { lookupConceptWordImage } from "./wild-word-concept-images";
import { hasUserWildWordImage } from "./wild-word-image-display";
import {
  planWildWordLanguageRepairForEnrichment,
  translationLooksLikeStaleIdentity,
} from "./wild-word-language-cleanup";
import {
  fallbackOppositeTarget,
  resolveEffectiveTranslationTarget,
  resolveEnrichmentLanguages,
  resolveWildWordTranslationLanguages,
} from "./wild-word-translation-target";

const baseRow = {
  id: "w1",
  text: "Disculpe",
  language: "es",
  lexemeKey: "lr:v1|es|disculpe",
  sourceItemId: "",
  sourceTitle: "",
  savedAt: "2026-01-01T00:00:00.000Z",
};

assert.equal(fallbackOppositeTarget("en"), "es");
assert.equal(fallbackOppositeTarget("es"), "en");
assert.equal(fallbackOppositeTarget("fr"), "en");

assert.equal(resolveEffectiveTranslationTarget("en", "en"), "es");
assert.equal(resolveEffectiveTranslationTarget("es", "en"), "en");
assert.equal(resolveEffectiveTranslationTarget("es", "es"), "en");

assert.deepEqual(resolveEnrichmentLanguages(baseRow, { language: "es", text: "Disculpe" }), {
  sourceLang: "es",
  targetLang: "en",
  effectiveTargetLang: "en",
  speechLang: "es",
});

assert.deepEqual(
  resolveEnrichmentLanguages({ ...baseRow, targetLanguage: "fr" }, { language: "es", text: "Disculpe" }),
  {
    sourceLang: "es",
    targetLang: "fr",
    effectiveTargetLang: "fr",
    speechLang: "es",
  }
);

assert.deepEqual(
  resolveEnrichmentLanguages(
    { id: "w2", text: "knowledge", language: "en", targetLanguage: "en" },
    { language: "en", text: "knowledge" }
  ),
  {
    sourceLang: "en",
    targetLang: "en",
    effectiveTargetLang: "es",
    speechLang: "en",
  }
);

assert.deepEqual(computeEnrichmentNeeds(baseRow), {
  translation: true,
  definition: true,
  explanation: false,
  phonetic: true,
  imageUrl: true,
});

assert.deepEqual(
  computeEnrichmentNeeds({
    ...baseRow,
    translation: "excuse me",
    definition: "Pedir perdón.",
    definitionLanguage: "es",
    explanation: "To ask for forgiveness.",
    explanationLanguage: "en",
    explanationSource: "argos",
    phonetic: "/disˈkulpe/",
    imageUrl: "/images/chunks/disculpe.png",
    translationTargetLanguage: "en",
    enrichmentVersion: ENRICHMENT_VERSION,
  }),
  {
    translation: false,
    definition: false,
    explanation: false,
    phonetic: false,
    imageUrl: false,
  }
);

assert.equal(
  computeEnrichmentNeeds({
    ...baseRow,
    translation: "excuse me",
    enrichmentVersion: ENRICHMENT_VERSION,
  }).translation,
  false
);

assert.equal(
  computeEnrichmentNeeds(
    {
      id: "w3",
      text: "knowledge",
      language: "en",
      targetLanguage: "en",
      translation: "knowledge",
      enrichmentVersion: ENRICHMENT_VERSION,
    },
    { force: false }
  ).translation,
  true
);

assert.equal(
  computeEnrichmentNeeds(
    {
      id: "w4",
      text: "learning",
      language: "en",
      targetLanguage: "en",
      translation: "learning",
      enrichmentVersion: ENRICHMENT_VERSION,
    },
    { force: false }
  ).translation,
  true
);

assert.equal(
  computeEnrichmentNeeds(
    {
      id: "w5",
      text: "knowledge",
      language: "en",
      targetLanguage: "en",
      translation: "conocimiento",
      translationTargetLanguage: "es",
      enrichmentVersion: ENRICHMENT_VERSION,
    },
    { force: false }
  ).translation,
  false
);

assert.equal(
  computeEnrichmentNeeds(
    {
      ...baseRow,
      translation: "excuse me",
      enrichmentVersion: ENRICHMENT_VERSION,
    },
    { force: true }
  ).translation,
  true
);

assert.equal(TRANSLATION_FETCH_TIMEOUT_MS, 10_000);

const learningStaleRow = {
  id: "learning-stale",
  text: "learning",
  language: "es",
  targetLanguage: "en",
  translation: "Learning",
  translationTargetLanguage: "en",
  enrichmentVersion: ENRICHMENT_VERSION,
  enrichedAt: "2026-01-01T00:00:00.000Z",
  definition: "El aprendizaje.",
  phonetic: "/ˈlɜrnɪŋ/",
  imageUrl: "/images/chunks/learning.png",
};

const learningRepair = planWildWordLanguageRepairForEnrichment(learningStaleRow);
assert.ok(learningRepair);
assert.equal(learningRepair.repairedLanguage, "en");

const learningWorking = { ...learningStaleRow, ...learningRepair.patch };
delete learningWorking.translationTargetLanguage;
delete learningWorking.translation;

assert.deepEqual(
  resolveWildWordTranslationLanguages(learningWorking, {
    language: "en",
    text: "learning",
  }),
  {
    sourceLang: "en",
    targetLang: "en",
    effectiveTargetLang: "es",
    speechLang: "en",
  }
);

assert.equal(
  computeEnrichmentNeeds(learningWorking, { force: false }).translation,
  true,
  "learning retranslation needed after language repair"
);

assert.equal(translationLooksLikeStaleIdentity("learning", "Learning"), true);

const disculpeRow = {
  id: "disculpe",
  text: "Disculpe",
  language: "es",
  targetLanguage: "en",
  translation: "Excuse me",
  translationTargetLanguage: "en",
  enrichmentVersion: ENRICHMENT_VERSION,
};

assert.equal(planWildWordLanguageRepairForEnrichment(disculpeRow), null);
assert.deepEqual(resolveEnrichmentLanguages(disculpeRow, { language: "es", text: "Disculpe" }), {
  sourceLang: "es",
  targetLang: "en",
  effectiveTargetLang: "en",
  speechLang: "es",
});

const mesasRow = {
  id: "mesas",
  text: "Mesas",
  language: "es",
  targetLanguage: "en",
  translation: "Tables",
  translationTargetLanguage: "en",
  enrichmentVersion: ENRICHMENT_VERSION,
};

assert.equal(planWildWordLanguageRepairForEnrichment(mesasRow), null);

const curatedWhenCorpusMisses = lookupCuratedWordImage({
  language: "es",
  text: "Mesas",
});
assert.ok(curatedWhenCorpusMisses);
assert.equal(curatedWhenCorpusMisses.imageUrl, "/images/chunks/mesa.png");
assert.equal(curatedWhenCorpusMisses.imageSource, "curated");

const userImageRow = {
  id: "user-mesa",
  text: "mesa",
  language: "es",
  imageSource: "user",
  imageAssetId: "blob-asset-1",
  imageUrl: "/images/chunks/mesa.png",
};
assert.equal(hasUserWildWordImage(userImageRow), true);
assert.equal(
  lookupCuratedWordImage({ language: "es", text: "mesa" })?.imageUrl,
  "/images/chunks/mesa.png"
);
assert.equal(userImageRow.imageSource, "user", "user imageSource must stay user (enrichment skips curated apply)");

assert.equal(
  computeEnrichmentNeeds(
    {
      ...userImageRow,
      enrichmentVersion: ENRICHMENT_VERSION,
    },
    { force: true }
  ).imageUrl,
  false,
  "force refresh must not request image when user owns the thumbnail"
);

const conceptImageRow = {
  id: "revenue-concept",
  text: "revenue",
  language: "en",
  imageUrl: "/images/concepts/revenue.png",
  imageSource: "concept",
  enrichmentVersion: ENRICHMENT_VERSION,
};
assert.equal(isStaleImage(conceptImageRow), true);
assert.equal(isReplaceableImageSource(conceptImageRow, { force: true }), true);
assert.equal(
  computeEnrichmentNeeds(conceptImageRow, { force: false }).imageUrl,
  false,
  "concept image kept when not force refresh"
);
assert.equal(
  computeEnrichmentNeeds(conceptImageRow, { force: true }).imageUrl,
  true,
  "concept image replaceable on force refresh"
);

assert.equal(
  shouldApplyIncomingImageReplacement(
    conceptImageRow,
    {
      imageUrl: "https://images.pexels.com/photos/99/large.jpg",
      imageSource: "pexels",
      imageConfidence: "high",
      imageSearchQuery: "revenue growth coins chart",
    },
    true
  ),
  true
);

assert.equal(
  shouldApplyIncomingImageReplacement(userImageRow, {
    imageUrl: "https://images.pexels.com/photos/1/large.jpg",
    imageSource: "pexels",
    imageConfidence: "high",
  }, true),
  false,
  "user image never replaced on force"
);

const highConfidencePexelsRow = {
  id: "revenue-pexels-stored",
  text: "revenue",
  language: "en",
  imageUrl: "https://images.pexels.com/photos/42/large.jpg",
  imageSource: "pexels",
  imageProvider: "pexels",
  imageConfidence: "high",
  imageSearchQuery: "revenue growth coins chart",
  imageReason: "Several query terms match alt/tags.",
  enrichmentVersion: ENRICHMENT_VERSION,
};
assert.equal(
  shouldApplyIncomingImageReplacement(
    highConfidencePexelsRow,
    {
      imageUrl: "https://images.pexels.com/photos/99/large.jpg",
      imageSource: "pexels",
      imageConfidence: "medium",
      imageSearchQuery: "revenue growth coins chart",
    },
    true
  ),
  false,
  "same-query high-confidence provider image not downgraded on refresh"
);

const curatedImageRow = {
  id: "curated-mesa",
  text: "mesa",
  language: "es",
  imageUrl: "/images/chunks/mesa.png",
  imageSource: "curated",
  enrichmentVersion: ENRICHMENT_VERSION,
};
assert.equal(
  shouldAttemptWikimediaImageEnrichment({
    rawRecord: curatedImageRow,
    word: { language: "es", text: "mesa" },
    needsImageUrl: false,
    working: curatedImageRow,
  }),
  false,
  "existing curated image prevents Wikimedia when image need is satisfied"
);

const noImageRow = {
  id: "dog",
  text: "dog",
  language: "en",
  enrichmentVersion: ENRICHMENT_VERSION,
};
assert.equal(
  shouldAttemptWikimediaImageEnrichment({
    rawRecord: noImageRow,
    word: { language: "en", text: "dog" },
    needsImageUrl: true,
    working: { ...noImageRow },
  }),
  true
);

assert.equal(
  shouldAttemptWikimediaImageEnrichment({
    rawRecord: userImageRow,
    word: { language: "es", text: "mesa" },
    needsImageUrl: true,
    working: userImageRow,
  }),
  false,
  "user image rows must not call Wikimedia"
);

assert.equal(
  shouldAttemptWikimediaImageEnrichment({
    rawRecord: { id: "x", text: "perhaps", language: "en" },
    word: { language: "en", text: "perhaps" },
    needsImageUrl: true,
    working: { text: "perhaps", language: "en" },
  }),
  false,
  "abstract words skip Wikimedia"
);

const revenueConcept = lookupConceptWordImage({ language: "en", text: "revenue" });
assert.ok(revenueConcept);
assert.equal(revenueConcept.imageUrl, "/images/concepts/revenue.png");

const perhapsConceptQuality = evaluateImageMemoryQuality({
  text: "perhaps",
  language: "en",
  imageUrl: "/images/concepts/uncertainty.png",
  imageSource: "concept",
});
assert.equal(perhapsConceptQuality.accepted, false);

const perhapsCleanupPatch: WildWordEnrichmentPatch = {};
appendRejectedConceptImageCleanupPatch(
  {
    id: "perhaps-stale",
    text: "perhaps",
    language: "en",
    imageUrl: "/images/concepts/uncertainty.png",
    imageSource: "concept",
    imageAlt: "Uncertainty",
  },
  { language: "en", text: "perhaps" },
  perhapsCleanupPatch,
  true
);
assert.equal(perhapsCleanupPatch.imageUrl, WILD_WORD_FIELD_CLEAR);
assert.equal(perhapsCleanupPatch.imageSource, WILD_WORD_FIELD_CLEAR);

const userCleanupPatch: WildWordEnrichmentPatch = {};
appendRejectedConceptImageCleanupPatch(
  userImageRow,
  { language: "es", text: "mesa" },
  userCleanupPatch,
  true
);
assert.equal(userCleanupPatch.imageUrl, undefined, "user image never cleared");

const aprenderGloss = cleanupTranslationGloss({
  sourceText: "aprender",
  sourceLang: "es",
  targetLang: "en",
  translation: "Learning",
  partOfSpeech: "verb",
});
assert.equal(aprenderGloss, "to learn");

const aprenderClass = classifyImageability({ text: "aprender", language: "es", partOfSpeech: "verb" });
assert.equal(getProviderSearchQuery(aprenderClass, "pexels"), "student studying books learning");

assert.equal(
  shouldAttemptWikimediaImageEnrichment({
    rawRecord: { id: "rev", text: "revenue", language: "en" },
    word: { language: "en", text: "revenue" },
    needsImageUrl: true,
    working: { text: "revenue", language: "en" },
  }),
  true,
  "revenue may use external image-search before concept fallback"
);

assert.equal(
  shouldAttemptWikimediaImageEnrichment({
    rawRecord: noImageRow,
    word: { language: "en", text: "dog" },
    needsImageUrl: true,
    working: { ...noImageRow },
  }),
  true,
  "dog without concept mapping should still use Wikimedia"
);

const mockWikimediaResult: WikimediaImageResult = {
  imageUrl: "https://upload.wikimedia.org/thumb/dog.jpg",
  imageSource: "wikimedia",
  imageProvider: "wikimedia",
  imageAlt: "dog",
  imageLicense: "CC BY 4.0",
  imagePageUrl: "https://commons.wikimedia.org/wiki/File:Dog.jpg",
  wikidataEntityId: "Q144",
  wikidataEntityLabel: "dog",
  commonsFileTitle: "File:Dog.jpg",
};
const wikimediaPatch: WildWordEnrichmentPatch = {};
applyWikimediaImageResultToPatch(wikimediaPatch, mockWikimediaResult);
assert.equal(wikimediaPatch.imageUrl, mockWikimediaResult.imageUrl);
assert.equal(wikimediaPatch.imageSource, "wikimedia");
assert.equal(wikimediaPatch.imageProvider, "wikimedia");
assert.equal(wikimediaPatch.wikidataEntityId, "Q144");
assert.equal(wikimediaPatch.commonsFileTitle, "File:Dog.jpg");
assert.ok(wikimediaPatch.imageUpdatedAt);

const mockPexelsResult: ImageProviderResult = {
  imageUrl: "https://images.pexels.com/photos/42/large.jpg",
  imageSource: "pexels",
  imageProvider: "pexels",
  imageAlt: "Business revenue growth chart",
  imageAttribution: "Jane Doe on Pexels",
  imageAttributionUrl: "https://www.pexels.com/@jane",
  imageLicense: "Pexels License",
  imageLicenseUrl: "https://www.pexels.com/license/",
  imagePageUrl: "https://www.pexels.com/photo/42/",
  confidence: "high",
  reason: "Pexels photo matched query.",
  imageSearchQuery: "business revenue growth chart coins",
};

const pexelsPatch: WildWordEnrichmentPatch = {};
applyImageSearchResultToPatch(pexelsPatch, mockPexelsResult);
assert.equal(pexelsPatch.imageSource, "pexels");
assert.equal(pexelsPatch.imageProvider, "pexels");
assert.equal(pexelsPatch.imageSearchQuery, mockPexelsResult.imageSearchQuery);
assert.equal(pexelsPatch.imageConfidence, "high");

async function runWikimediaEnrichmentIntegrationTests(): Promise<void> {
let imageSearchCalls = 0;
const corpusMap = new Map<string, import("./review-queue").LessonChunkMetadata>();
const trackImageSearch = async () => {
  imageSearchCalls += 1;
  return {
    ...mockWikimediaResult,
    confidence: "high" as const,
    reason: "Wikimedia test",
  };
};
const enrichedAfterCuratedMiss = await enrichWildWordRecord(
  {
    id: "zeppelin",
    text: "zeppelin",
    language: "en",
    targetLanguage: "es",
    translation: "zepelín",
    definition: "A rigid airship.",
    definitionLanguage: "en",
    explanation: "Un dirigible rígido.",
    explanationLanguage: "es",
    explanationSource: "manual",
    phonetic: "/ˈzɛpəlɪn/",
    translationTargetLanguage: "es",
    enrichmentVersion: ENRICHMENT_VERSION,
  },
  {
    corpusMap,
    lexemeLookup: new Map(),
    imageSearchLookup: trackImageSearch,
    skipWikimedia: false,
  }
);
assert.equal(imageSearchCalls, 1, "Image search runs after corpus/curated miss");
assert.equal(enrichedAfterCuratedMiss.imageSource, "wikimedia");
assert.equal(enrichedAfterCuratedMiss.imageUrl, mockWikimediaResult.imageUrl);

let revenueImageSearchCalls = 0;
const enrichedRevenuePexels = await enrichWildWordRecord(
  {
    id: "revenue-pexels",
    text: "revenue",
    language: "en",
    targetLanguage: "es",
    translation: "ingresos",
    translationTargetLanguage: "es",
    definition: "Income received from business activities.",
    definitionLanguage: "en",
    enrichmentVersion: ENRICHMENT_VERSION,
  },
  {
    corpusMap: new Map(),
    lexemeLookup: new Map(),
    imageSearchLookup: async () => {
      revenueImageSearchCalls += 1;
      return mockPexelsResult;
    },
  }
);
assert.equal(revenueImageSearchCalls, 1);
assert.equal(enrichedRevenuePexels.imageSource, "pexels");
assert.equal(enrichedRevenuePexels.imageUrl, mockPexelsResult.imageUrl);
assert.equal(enrichedRevenuePexels.imageAttribution, mockPexelsResult.imageAttribution);

let revenueImageSearchNullCalls = 0;
const enrichedRevenue = await enrichWildWordRecord(
  {
    id: "revenue",
    text: "revenue",
    language: "en",
    targetLanguage: "es",
    translation: "ingresos",
    translationTargetLanguage: "es",
    definition: "Income received from business activities.",
    definitionLanguage: "en",
    definitionSource: "wiktionary",
    enrichmentVersion: ENRICHMENT_VERSION,
  },
  {
    corpusMap: new Map(),
    lexemeLookup: new Map(),
    imageSearchLookup: async () => {
      revenueImageSearchNullCalls += 1;
      return null;
    },
  }
);
assert.equal(revenueImageSearchNullCalls, 1);
assert.equal(enrichedRevenue.imageSource, "concept");
assert.equal(enrichedRevenue.imageUrl, "/images/concepts/revenue.png");

const conceptPatch: WildWordEnrichmentPatch = {};
applyConceptImageResultToPatch(conceptPatch, revenueConcept!);
assert.equal(conceptPatch.imageSource, "concept");
assert.ok(conceptPatch.imageUpdatedAt);

let imageSearchCallsWithCurated = 0;
const enrichedWithCurated = await enrichWildWordRecord(
  {
    id: "mesa-wiki",
    text: "mesa",
    language: "es",
    imageUrl: "/images/chunks/mesa.png",
    imageSource: "curated",
    enrichmentVersion: ENRICHMENT_VERSION,
  },
  {
    corpusMap,
    lexemeLookup: new Map(),
    imageSearchLookup: async () => {
      imageSearchCallsWithCurated += 1;
      return mockWikimediaResult;
    },
  }
);
assert.equal(imageSearchCallsWithCurated, 0, "curated hit must not invoke image search");
assert.equal(enrichedWithCurated.imageUrl, undefined, "curated row already has imageUrl — patch omits it");

let conceptRefreshSearchCalls = 0;
const enrichedConceptRefresh = await enrichWildWordRecord(
  {
    id: "revenue-concept-refresh",
    text: "revenue",
    language: "en",
    targetLanguage: "es",
    translation: "ingresos",
    translationTargetLanguage: "es",
    imageUrl: "/images/concepts/revenue.png",
    imageSource: "concept",
    enrichmentVersion: ENRICHMENT_VERSION,
  },
  {
    force: true,
    corpusMap: new Map(),
    lexemeLookup: new Map(),
    imageSearchLookup: async () => {
      conceptRefreshSearchCalls += 1;
      return mockPexelsResult;
    },
  }
);
assert.equal(conceptRefreshSearchCalls, 1, "force refresh replaces concept with external search");
assert.equal(enrichedConceptRefresh.imageSource, "pexels");
assert.equal(enrichedConceptRefresh.imageUrl, mockPexelsResult.imageUrl);

let dogImageSearchCalls = 0;
const enrichedDog = await enrichWildWordRecord(
  {
    id: "dog",
    text: "dog",
    language: "en",
    targetLanguage: "es",
    translation: "perro",
    translationTargetLanguage: "es",
    definition: "A domesticated mammal, Canis familiaris, bred in many varieties.",
    definitionLanguage: "en",
    definitionSource: "wiktionary",
    phonetic: "/dɒɡ/",
    enrichmentVersion: ENRICHMENT_VERSION,
  },
  {
    corpusMap: new Map(),
    lexemeLookup: new Map(),
    imageSearchLookup: async () => {
      dogImageSearchCalls += 1;
      return { ...mockWikimediaResult, confidence: "high" as const, reason: "test" };
    },
    skipWikimedia: false,
  }
);
assert.ok(dogImageSearchCalls >= 1, "dog enrichment should attempt image search");
assert.equal(enrichedDog.imageUrl, mockWikimediaResult.imageUrl);
assert.equal(enrichedDog.wikidataEntityId, "Q144");

let venturesImageSearchCalls = 0;
const enrichedVentures = await enrichWildWordRecord(
  {
    id: "ventures",
    text: "ventures",
    language: "en",
    targetLanguage: "es",
    translation: "empresas",
    translationTargetLanguage: "es",
    enrichmentVersion: ENRICHMENT_VERSION,
  },
  {
    corpusMap: new Map(),
    lexemeLookup: new Map(),
    imageSearchLookup: async () => {
      venturesImageSearchCalls += 1;
      return null;
    },
  }
);
assert.equal(venturesImageSearchCalls, 1);
assert.equal(enrichedVentures.imageUrl, "/images/concepts/venture.png");
assert.equal(enrichedVentures.imageSource, "concept");

let perhapsSearchCalls = 0;
const enrichedPerhapsRefresh = await enrichWildWordRecord(
  {
    id: "perhaps-refresh",
    text: "perhaps",
    language: "en",
    targetLanguage: "es",
    translation: "quizás",
    imageUrl: "/images/concepts/uncertainty.png",
    imageSource: "concept",
    enrichmentVersion: ENRICHMENT_VERSION,
  },
  {
    force: true,
    corpusMap: new Map(),
    lexemeLookup: new Map(),
    imageSearchLookup: async () => {
      perhapsSearchCalls += 1;
      return null;
    },
  }
);
assert.equal(perhapsSearchCalls, 0, "perhaps skips external search");
assert.equal(enrichedPerhapsRefresh.imageUrl, WILD_WORD_FIELD_CLEAR);
assert.equal(enrichedPerhapsRefresh.imageSource, WILD_WORD_FIELD_CLEAR);

let expectsSearchCalls = 0;
const enrichedExpectsRefresh = await enrichWildWordRecord(
  {
    id: "expects-refresh",
    text: "expects",
    language: "en",
    targetLanguage: "es",
    translation: "espera",
    imageUrl: "/images/concepts/expectation.png",
    imageSource: "concept",
    enrichmentVersion: ENRICHMENT_VERSION,
  },
  {
    force: true,
    corpusMap: new Map(),
    lexemeLookup: new Map(),
    imageSearchLookup: async () => {
      expectsSearchCalls += 1;
      return null;
    },
  }
);
assert.equal(expectsSearchCalls, 0);
assert.equal(enrichedExpectsRefresh.imageUrl, WILD_WORD_FIELD_CLEAR);

let aprenderSearchCalls = 0;
const enrichedAprender = await enrichWildWordRecord(
  {
    id: "aprender",
    text: "aprender",
    language: "es",
    targetLanguage: "en",
    translation: "Learning",
    translationTargetLanguage: "en",
    enrichmentVersion: ENRICHMENT_VERSION,
  },
  {
    force: true,
    corpusMap: new Map(),
    lexemeLookup: new Map(),
    imageSearchLookup: async () => {
      aprenderSearchCalls += 1;
      return {
        ...mockPexelsResult,
        imageAlt: "Student studying books",
        imageSearchQuery: "student studying books learning",
        confidence: "high" as const,
      };
    },
  }
);
assert.equal(aprenderSearchCalls, 1);
assert.equal(enrichedAprender.imageSource, "pexels");
assert.equal(enrichedAprender.translation, "to learn");

const enrichedUserImage = await enrichWildWordRecord(
  { ...userImageRow, enrichmentVersion: ENRICHMENT_VERSION },
  { force: true, corpusMap: new Map(), lexemeLookup: new Map() }
);
assert.equal(enrichedUserImage.imageUrl, undefined);
assert.equal(userImageRow.imageSource, "user");
}

assert.equal(
  sanitizeDefinitionForStorage("en To predict, or believe that something will happen."),
  "To predict, or believe that something will happen."
);
assert.equal(stripDefinitionLanguagePrefix("English: To predict."), "To predict.");
assert.equal(
  sanitizeDefinitionForStorage(
    "* quote-journal|date=2017-08-09|author=Mark Carnall|journal=Nature|title=Sample"
  ),
  null
);
assert.equal(sanitizeDefinitionForStorage("quote-book|year=2001|author=Jane Doe|title=Words"), null);
assert.equal(
  sanitizeDefinitionForStorage("{{lb|en|verb}} |author=foo |date=2020 |title=Bar"),
  null
);
assert.equal(
  sanitizeDefinitionForStorage("The process of acquiring knowledge or skills."),
  "The process of acquiring knowledge or skills."
);
assert.equal(
  sanitizeDefinitionForStorage("Mueble con tablero horizontal sostenido por patas, usado para comer."),
  "Mueble con tablero horizontal sostenido por patas, usado para comer."
);

const expectsRow = {
  id: "expects",
  text: "expects",
  language: "en",
  targetLanguage: "es",
  translation: "espera",
  definition: "en To predict, or believe that something will happen.",
  definitionSource: "wiktionary",
  enrichmentVersion: ENRICHMENT_VERSION,
};
const expectsDisplay = resolveDisplayDefinition(expectsRow.definition, expectsRow.definitionSource);
assert.ok(expectsDisplay);
assert.ok(!/^en\s/i.test(expectsDisplay!));
assert.ok(expectsDisplay!.toLowerCase().includes("predict"));

const perhapsRow = {
  id: "perhaps",
  text: "perhaps",
  language: "en",
  targetLanguage: "es",
  translation: "quizás",
  definition: "* quote-journal|date=2017-08-09|author=Mark Carnall|journal=Nature",
  definitionSource: "wiktionary",
  enrichmentVersion: ENRICHMENT_VERSION,
};
const perhapsCard = resolveDefinitionCardDisplay(perhapsRow.definition, perhapsRow.definitionSource);
assert.equal(perhapsCard.isPlaceholder, true);
assert.equal(hasRealDefinition(perhapsRow), false);

const expectsWiki = parseWiktionaryWikitext(
  `==English==
===Verb===
# en To predict, or believe that something will happen.
# * quote-journal|date=2017|author=Someone|journal=Paper|title=Bad`,
  "en",
  "expects"
);
assert.ok(expectsWiki?.definition);
assert.ok(!/^en\s/i.test(expectsWiki!.definition));
assert.ok(!expectsWiki!.definition.includes("quote-journal"));

const perhapsWiki = parseWiktionaryWikitext(
  `==English==
===Adverb===
# * quote-journal|date=2017|author=Mark|journal=Nature|title=Only`,
  "en",
  "perhaps"
);
assert.equal(perhapsWiki, null);

assert.equal(isFakeTranslationDefinition('Means “Many” in English.', "translation-fallback"), true);
assert.equal(isFakeTranslationDefinition("many", "argos"), false);
assert.equal(resolveDisplayDefinition('Means “Many” in English.', "translation-fallback"), null);

const muchasRow = {
  id: "muchas",
  text: "muchas",
  language: "es",
  targetLanguage: "en",
  translation: "many",
  translationTargetLanguage: "en",
  definition: 'Means “many” in English.',
  definitionSource: "translation-fallback",
  enrichmentVersion: ENRICHMENT_VERSION,
};

assert.equal(resolveDisplayDefinition(muchasRow.definition, muchasRow.definitionSource), null);
assert.equal(hasRealDefinition(muchasRow), false);
assert.equal(computeEnrichmentNeeds(muchasRow).definition, true);

const learningWithDefinition = {
  id: "learning",
  text: "learning",
  language: "en",
  targetLanguage: "en",
  translation: "aprendizaje",
  translationTargetLanguage: "es",
  definition: "The process of acquiring knowledge.",
  definitionSource: "wiktionary",
  enrichmentVersion: ENRICHMENT_VERSION,
};

assert.equal(resolveDisplayDefinition(learningWithDefinition.definition, learningWithDefinition.definitionSource), learningWithDefinition.definition);
assert.equal(hasRealDefinition(learningWithDefinition), true);
assert.equal(computeEnrichmentNeeds(learningWithDefinition).definition, false);

const disculpeTranslationOnly = {
  id: "disculpe-no-def",
  text: "Disculpe",
  language: "es",
  targetLanguage: "en",
  translation: "Excuse me",
  translationTargetLanguage: "en",
  enrichmentVersion: ENRICHMENT_VERSION,
};

assert.equal(resolveDisplayDefinition(undefined, undefined), null);
assert.equal(hasRealDefinition(disculpeTranslationOnly), false);
assert.equal(computeEnrichmentNeeds(disculpeTranslationOnly).definition, true);

const mesasNoDef = {
  id: "mesas",
  text: "Mesas",
  language: "es",
  targetLanguage: "en",
  translation: "Tables",
  translationTargetLanguage: "en",
  enrichmentVersion: ENRICHMENT_VERSION,
};
const mesasCard = resolveDefinitionCardDisplay(mesasNoDef.definition, mesasNoDef.definitionSource);
assert.equal(mesasCard.isPlaceholder, true);
assert.equal(mesasCard.text, WILD_WORD_DEFINITION_NOT_ADDED);

const muchasCard = resolveDefinitionCardDisplay(muchasRow.definition, muchasRow.definitionSource);
assert.equal(muchasCard.isPlaceholder, true);
assert.equal(muchasCard.text, WILD_WORD_DEFINITION_NOT_ADDED);

const learningCard = resolveDefinitionCardDisplay(
  learningWithDefinition.definition,
  learningWithDefinition.definitionSource
);
assert.equal(learningCard.isPlaceholder, false);
assert.ok(learningCard.text.includes("knowledge"));

assert.equal(isSupportedWiktionaryLanguage("en"), true);
assert.equal(isSupportedWiktionaryLanguage("es"), true);
assert.equal(isSupportedWiktionaryLanguage("fr"), false);

const learningWiki = parseWiktionaryWikitext(
  `==English==
===Noun===
# The acquisition of knowledge or skills through study or experience.
===Verb===
# Present participle of learn.`,
  "en",
  "learning"
);
assert.ok(learningWiki?.definition);
assert.ok(learningWiki!.definition.toLowerCase().includes("knowledge"));

const mesaLemmaDefinition =
  "Mueble con tablero horizontal sostenido por una o más patas, usado para comer o trabajar.";

const mesasWiki = parseWiktionaryWikitext(
  `==Spanish==
===Noun===
# ${mesaLemmaDefinition}`,
  "es"
);
assert.ok(mesasWiki?.definition);
assert.ok(mesasWiki!.definition.toLowerCase().includes("mueble"));

assert.deepEqual(getSpanishDefinitionLookupCandidates("Mesas"), ["Mesas", "mesa"]);
assert.deepEqual(getSpanishDefinitionLookupCandidates("Muchas"), ["Muchas", "mucho", "mucha"]);
assert.deepEqual(getSpanishDefinitionLookupCandidates("muchas"), ["muchas", "mucho", "mucha"]);
assert.deepEqual(getSpanishDefinitionLookupCandidates("llaves"), ["llaves", "llave"]);
assert.ok(getSpanishDefinitionLookupCandidates("habitaciones").includes("habitación"));
assert.ok(getSpanishDefinitionLookupCandidates("habitaciones").includes("habitacion"));

const mesasSpanishDef = buildSpanishDefinitionWithFormNote(
  "Mesas",
  "mesa",
  mesaLemmaDefinition
);
assert.ok(mesasSpanishDef.toLowerCase().startsWith("plural de mesa"));
assert.ok(mesasSpanishDef.includes(mesaLemmaDefinition));

const muchoLemmaDefinition =
  "Indica una gran cantidad o un alto grado de algo.";
const muchasFormDefNote = buildSpanishDefinitionWithFormNote(
  "Muchas",
  "mucho",
  muchoLemmaDefinition
);
assert.ok(muchasFormDefNote.toLowerCase().includes("forma femenina plural de mucho"));
assert.ok(muchasFormDefNote.includes(muchoLemmaDefinition));

const mesasLookupWord = "mesa";
assert.notEqual(mesasLookupWord.toLowerCase(), "mesas");
assert.equal(
  buildSpanishDefinitionWithFormNote("Mesas", mesasLookupWord, mesaLemmaDefinition).includes("Plural de mesa"),
  true
);

const cleanupPatch: Record<string, unknown> = {};
appendFakeDefinitionCleanupPatch(muchasRow, { ...muchasRow }, cleanupPatch);
assert.equal(cleanupPatch.definition, WILD_WORD_FIELD_CLEAR);
assert.equal(cleanupPatch.definitionSource, WILD_WORD_FIELD_CLEAR);

const muchasAfterCleanup = { ...muchasRow };
delete muchasAfterCleanup.definition;
delete muchasAfterCleanup.definitionSource;
const noopPatch: Record<string, unknown> = {};
appendFakeDefinitionCleanupPatch(muchasAfterCleanup, muchasAfterCleanup, noopPatch);
assert.equal(noopPatch.definition, undefined);

const muchasWiki = parseWiktionaryWikitext(
  `==Spanish==
===Adjective===
# femenino plural de mucho
# indica gran cantidad`,
  "es"
);
assert.ok(muchasWiki?.definition);

const mesasEnrichmentSim = {
  text: "Mesas",
  lookupWord: "mesa",
  rawDefinition: mesaLemmaDefinition,
  definition: buildSpanishDefinitionWithFormNote("Mesas", "mesa", mesaLemmaDefinition),
  definitionSource: "wiktionary" as const,
  definitionLanguage: "es",
};
assert.equal(mesasEnrichmentSim.lookupWord, "mesa");
assert.equal(mesasEnrichmentSim.definitionSource, "wiktionary");
assert.equal(mesasEnrichmentSim.definitionLanguage, "es");
assert.ok(mesasEnrichmentSim.definition.toLowerCase().includes("plural de mesa"));
assert.notEqual(mesasEnrichmentSim.definition, mesasEnrichmentSim.text);

const unknownSpanish = {
  id: "xyzunknown",
  text: "zzxyzznotaword",
  language: "es",
  targetLanguage: "en",
  translation: "something",
  translationTargetLanguage: "en",
  enrichmentVersion: ENRICHMENT_VERSION,
};
assert.equal(hasRealDefinition(unknownSpanish), false);
assert.equal(computeEnrichmentNeeds(unknownSpanish).definition, true);
assert.equal(
  resolveDefinitionCardDisplay(unknownSpanish.definition, unknownSpanish.definitionSource).text,
  WILD_WORD_DEFINITION_NOT_ADDED
);
assert.equal(planExplanationEnrichment(unknownSpanish, {
  id: unknownSpanish.id,
  text: unknownSpanish.text,
  language: unknownSpanish.language,
  sourceItemId: "",
  sourceTitle: "",
  savedAt: "2026-01-01T00:00:00.000Z",
}, false), null);

const muchasSpanishDef = {
  id: "muchas-wiki",
  text: "muchas",
  language: "es",
  targetLanguage: "en",
  translation: "many",
  translationTargetLanguage: "en",
  definition: muchasWiki!.definition,
  definitionSource: "wiktionary",
  definitionLanguage: "es",
  enrichmentVersion: ENRICHMENT_VERSION,
};
assert.equal(muchasSpanishDef.definitionLanguage, "es");
assert.equal(muchasSpanishDef.translationTargetLanguage, "en");
assert.notEqual(muchasSpanishDef.definition, muchasSpanishDef.translation);

const learningEnglishDef = {
  ...learningWithDefinition,
  definition: learningWiki!.definition,
  definitionLanguage: "en",
};
assert.equal(learningEnglishDef.definitionLanguage, "en");
assert.equal(learningEnglishDef.translationTargetLanguage, "es");
assert.notEqual(learningEnglishDef.definition, learningEnglishDef.translation);

const legacyDefNoLang = {
  id: "legacy-def-lang",
  text: "mesa",
  language: "es",
  targetLanguage: "en",
  translation: "table",
  translationTargetLanguage: "en",
  definition: "Mueble con tablero horizontal sostenido por patas.",
  definitionSource: "wiktionary",
  enrichmentVersion: ENRICHMENT_VERSION,
};
const inferred = buildDefinitionLanguageInferencePatch(legacyDefNoLang, {
  id: legacyDefNoLang.id,
  text: legacyDefNoLang.text,
  language: legacyDefNoLang.language,
  sourceItemId: "",
  sourceTitle: "",
  savedAt: "2026-01-01T00:00:00.000Z",
});
assert.deepEqual(inferred, { definitionLanguage: "es" });

const legacyWithLang = { ...legacyDefNoLang, definitionLanguage: "es" };
assert.equal(buildDefinitionLanguageInferencePatch(legacyWithLang, {
  id: legacyWithLang.id,
  text: legacyWithLang.text,
  language: legacyWithLang.language,
  sourceItemId: "",
  sourceTitle: "",
  savedAt: "2026-01-01T00:00:00.000Z",
}), null);

const fakeCleanupLang: Record<string, unknown> = {};
appendFakeDefinitionCleanupPatch(muchasRow, { ...muchasRow }, fakeCleanupLang);
assert.equal(fakeCleanupLang.definitionLanguage, WILD_WORD_FIELD_CLEAR);

const learningWord = {
  id: learningWithDefinition.id,
  text: learningWithDefinition.text,
  language: learningWithDefinition.language,
  sourceItemId: "",
  sourceTitle: "",
  savedAt: "2026-01-01T00:00:00.000Z",
};

assert.equal(
  computeEnrichmentNeeds(learningWithDefinition).explanation,
  true,
  "learning row with real definition should need explanation"
);

const learningPlan = planExplanationEnrichment(learningWithDefinition, learningWord, false);
assert.ok(learningPlan);
assert.equal(learningPlan.fromLang, "en");
assert.equal(learningPlan.toLang, "es");
assert.ok(learningPlan.definitionText.includes("knowledge"));

const muchasWithDef = {
  id: "muchas-def",
  text: "muchas",
  language: "es",
  targetLanguage: "en",
  translation: "many",
  translationTargetLanguage: "en",
  definition: "forma femenina plural de mucho; indica gran cantidad",
  definitionLanguage: "es",
  definitionSource: "wiktionary",
  enrichmentVersion: ENRICHMENT_VERSION,
};
const muchasPlan = planExplanationEnrichment(muchasWithDef, {
  id: muchasWithDef.id,
  text: muchasWithDef.text,
  language: muchasWithDef.language,
  sourceItemId: "",
  sourceTitle: "",
  savedAt: "2026-01-01T00:00:00.000Z",
}, false);
assert.ok(muchasPlan);
assert.equal(muchasPlan.fromLang, "es");
assert.equal(muchasPlan.toLang, "en");

const noDefExplanation = resolveExplanationCardDisplay(disculpeTranslationOnly, undefined, "en");
assert.equal(noDefExplanation.isPlaceholder, true);
assert.equal(noDefExplanation.text, WILD_WORD_DEFINITION_NOT_ADDED);

const fakeDefExplanation = resolveExplanationCardDisplay(muchasRow, "feminine plural of mucho", "en");
assert.equal(fakeDefExplanation.isPlaceholder, true);

assert.equal(planExplanationEnrichment(muchasRow, {
  id: muchasRow.id,
  text: muchasRow.text,
  language: muchasRow.language,
  sourceItemId: "",
  sourceTitle: "",
  savedAt: "2026-01-01T00:00:00.000Z",
}, false), null);

const orphanRow = {
  ...disculpeTranslationOnly,
  explanation: "Some orphan explanation",
  explanationLanguage: "en",
  explanationSource: "argos",
};
const orphanPatch: WildWordEnrichmentPatch = {};
appendOrphanExplanationCleanupPatch(orphanRow, orphanPatch);
assert.equal(orphanPatch.explanation, WILD_WORD_FIELD_CLEAR);

const learningWithExplanation = {
  ...learningWithDefinition,
  definitionLanguage: "en",
  explanation: "el proceso de adquirir conocimiento",
  explanationLanguage: "es",
  explanationSource: "argos",
};
assert.equal(explanationNeedsEnrichment(learningWithExplanation, learningWord, false), false);

const legacyDefNeedsExplanation = {
  ...legacyDefNoLang,
  definitionLanguage: "es",
};
assert.equal(
  computeEnrichmentNeeds(legacyDefNeedsExplanation).explanation,
  true
);

assert.equal(fixCommonMojibake("quiz\uFFFDs"), "quizás");
assert.equal(fixCommonMojibake("traducci\uFFFDn"), "traducción");
assert.equal(fixCommonMojibake("traducci\u00C3\u00B3n"), "traducción");
assert.equal(fixCommonMojibake("tambi\uFFFDn"), "también");
assert.equal(fixCommonMojibake("m\uFFFDs"), "más");
assert.equal(fixCommonMojibake("espa\uFFFDol"), "español");
assert.equal(fixCommonMojibake("quizás"), "quizás");

const mojibakeRow = {
  ...baseRow,
  translation: "quiz\uFFFDs",
  definition: "traducci\uFFFDn con informaci\uFFFDn extra",
  explanation: "tambi\u00E9n est\uFFFD",
  translationTargetLanguage: "en",
  definitionLanguage: "es",
  explanationLanguage: "en",
  definitionSource: "wiktionary",
  explanationSource: "argos",
  enrichmentVersion: ENRICHMENT_VERSION,
  enrichedAt: "2026-01-01T00:00:00.000Z",
};
const mojibakePatch: WildWordEnrichmentPatch = {};
appendMojibakeCleanupPatch(mojibakeRow, mojibakePatch);
assert.equal(mojibakePatch.translation, "quizás");
assert.equal(mojibakePatch.definition, "traducción con información extra");
assert.equal(mojibakePatch.explanation, "también está");

assert.equal(cleanWildWordTextForDisplay("quiz\uFFFDs"), "quizás");
assert.equal(
  resolveDisplayDefinition("traducci\uFFFDn de ejemplo larga", "wiktionary"),
  "traducción de ejemplo larga"
);
const mojibakeExplanation = resolveExplanationCardDisplay(
  {
    ...mojibakeRow,
    definition: "Una definici\uFFFDn de ejemplo larga.",
    definitionLanguage: "es",
    definitionSource: "wiktionary",
  },
  "est\uFFFD",
  "en"
);
assert.equal(mojibakeExplanation.realText, "está");

assert.equal(fixCommonMojibake("suceder\uFFFD"), "sucederá");
assert.equal(fixCommonMojibake("revelaci\uFFFDn"), "revelación");
assert.equal(fixCommonMojibake("traducci\uFFFDn"), "traducción");
assert.equal(fixCommonMojibake("compa\uFFFD\uFFFDa"), "compañía");
assert.equal(
  fixCommonMojibake("Predecir o creer que algo suceder\uFFFD"),
  "Predecir o creer que algo sucederá"
);

const knownDisplayCases = [
  "suceder\uFFFD",
  "revelaci\uFFFDn",
  "traducci\uFFFDn",
  "compa\uFFFD\uFFFDa",
  "predicci\uFFFDn",
  "podr\uFFFDa",
  "tambi\uFFFDn",
];
for (const sample of knownDisplayCases) {
  const displayed = cleanWildWordTextForDisplay(sample);
  assert.ok(displayed, `expected display cleanup for ${JSON.stringify(sample)}`);
  assert.ok(
    !displayed!.includes(MOJIBAKE_REPLACEMENT_CHAR),
    `raw replacement char in display output for ${JSON.stringify(sample)}: ${displayed}`
  );
}

const sucederExplanationRow = {
  ...baseRow,
  definition: "Una definici\uFFFDn larga de ejemplo.",
  definitionLanguage: "es",
  definitionSource: "wiktionary",
  explanation: "Predecir o creer que algo suceder\uFFFD",
  explanationLanguage: "en",
  explanationSource: "argos",
  enrichmentVersion: ENRICHMENT_VERSION,
  enrichedAt: "2026-01-01T00:00:00.000Z",
};
const sucederPatch: WildWordEnrichmentPatch = {};
appendMojibakeCleanupPatch(sucederExplanationRow, sucederPatch);
assert.equal(
  sucederPatch.explanation,
  "Predecir o creer que algo sucederá",
  "refresh should patch explanation mojibake without Argos"
);

assert.equal(cleanWildWordTextForDisplay("revelaci\uFFFDn"), "revelación");
assert.equal(
  cleanWildWordTextForDisplay("zz\uFFFDunknown\uFFFDzz"),
  WILD_WORD_TEXT_ENCODING_FALLBACK
);

const dogWiki = parseWiktionaryWikitext(
  `==English==
===Noun===
# A mechanical device or support that holds something in place.
# A domesticated mammal, Canis familiaris, bred in many varieties.`,
  "en",
  "dog"
);
assert.ok(dogWiki?.definition);
assert.ok(dogWiki!.definition.toLowerCase().includes("domesticated"));
assert.ok(!dogWiki!.definition.toLowerCase().includes("mechanical device"));

const dogExplanationRow = {
  id: "dog-en",
  text: "dog",
  language: "en",
  targetLanguage: "es",
  translation: "perro",
  translationTargetLanguage: "es",
  definition: "A domesticated mammal, Canis familiaris, bred as a pet.",
  definitionLanguage: "en",
  definitionSource: "wiktionary",
  explanation: "Un mam\u00EDfero domesticado de la especie Canis familiaris.",
  explanationLanguage: "es",
  explanationSource: "argos",
  enrichmentVersion: ENRICHMENT_VERSION,
};
const dogExplanationCard = resolveExplanationCardDisplay(
  dogExplanationRow,
  dogExplanationRow.explanation,
  "es"
);
assert.equal(dogExplanationCard.isPlaceholder, false);
assert.ok(dogExplanationCard.realText?.includes("mam"));
assert.ok(!dogExplanationCard.text.includes(WILD_WORD_TEXT_ENCODING_FALLBACK));
assert.equal(dogExplanationCard.encodingIssueInDetails, undefined);

const corruptExplanationCard = resolveExplanationCardDisplay(
  {
    ...dogExplanationRow,
    definition: dogExplanationRow.definition,
    definitionSource: "wiktionary",
    definitionLanguage: "en",
  },
  "zz\uFFFDunknown\uFFFDzz",
  "es"
);
assert.equal(corruptExplanationCard.isPlaceholder, true);
assert.equal(corruptExplanationCard.text, WILD_WORD_DEFINITION_NOT_ADDED);
assert.equal(corruptExplanationCard.encodingIssueInDetails, true);
assert.equal(explanationHasEncodingIssue("zz\uFFFDunknown\uFFFDzz"), true);
assert.equal(WILD_WORD_EXPLANATION_ENCODING_DETAILS.length > 10, true);

assert.ok(
  rankDefinitionCandidate("A mechanical device or support that holds something in place.", {
    word: "dog",
    language: "en",
  }) >
    rankDefinitionCandidate(
      "A domesticated mammal, Canis familiaris, bred in many varieties as a pet.",
      { word: "dog", language: "en" }
    )
);

void runWikimediaEnrichmentIntegrationTests().then(() => {
  console.log("wild-word-enrichment.test.ts: ok");
});
