/**
 * Wild-word row field glossary (web `localStorage` + extension `chrome.storage`).
 *
 * Rows are open JSON objects: known fields are documented here; unknown keys are preserved on import/patch.
 *
 * ## Core identity & content
 *
 * - **`language`** — Detected / source language of the saved **highlighted text** (`text`), not the gloss language.
 * - **`text`** — Surface form as captured (whitespace-normalized on import).
 * - **`lexemeKey`** — Canonical lexical identity (`lr:v1|<lang>|<normalized>`). Stable across observations;
 *   use for corpus lookup and dedupe. Must not embed URLs, timestamps, or page ids.
 *
 * ## Learner settings vs enrichment output
 *
 * - **`targetLanguage`** — Language the learner wants **explanations/translations in** (extension settings at save time).
 *   Legacy extension rows may omit this (see `EXTENSION_LEGACY_DEFAULT_TARGET_LANGUAGE`).
 * - **`translationTargetLanguage`** — Language actually used when enrichment stored **`translation`** (may differ after
 *   same-language conflict resolution — see `wild-word-translation-target.ts`).
 *
 * ## Provenance (observation)
 *
 * - **`sourceKind`** — Observation channel (`"web"` for extension page captures).
 * - **`sourceUrl`** — Page URL where the word was saved (extension).
 * - **`sourceItemId`** / **`sourceTitle`** — Human or machine reference (URL, lesson id, title).
 * - **`sourceDomain`** — Derived hostname for display/filter.
 *
 * ## Enrichment cache (web app; `enrichmentVersion` = 1 today)
 *
 * - **`translation`** — Short gloss in the learner/explanation language (`translationTargetLanguage`).
 *   Not a dictionary definition.
 * - **`definition`** — Dictionary-style gloss in the **source language** of the saved word (`definitionLanguage`).
 * - **`definitionLanguage`** — ISO code for the **source-language** dictionary gloss in **`definition`**.
 * - **`explanation`** — Learner-language gloss of the definition (not the short **`translation`**).
 *   Created by translating a real **`definition`** into **`explanationLanguage`**; omitted when there is no real definition.
 * - **`explanationLanguage`** — ISO code for **`explanation`** (usually **`translationTargetLanguage`** / effective gloss language).
 * - **`explanationSource`** — `"argos"` \| `"lesson"` \| `"manual"` \| `"llm"` (future).
 * - **`phonetic`**, **`partOfSpeech`**, **`imageUrl`**
 * - **`imageSource`**, **`imageAssetId`**, **`imageAlt`**, **`imageUpdatedAt`** — user uploads (`imageSource: "user"`) store blobs in IndexedDB; row holds ids only
 * - **`imageAttribution`**, **`imageLicense`**, **`imagePageUrl`**, **`imageProvider`** — Wikimedia, Pexels, or Pixabay metadata when `imageSource` matches
 * - **`imageSearchQuery`**, **`imageTags`**, **`imageSearchProviderRank`**, **`imageConfidence`**, **`imageReason`** — external lookup diagnostics (Details panel)
 * - **`wikidataEntityId`**, **`commonsFileTitle`** — provenance for automated Wikimedia resolution
 * - **`enrichmentStatus`**, **`enrichmentErrors`**, **`enrichedAt`**, **`*Source`** fields
 *
 * Custom images are device-local (IndexedDB) and are not included in JSON export yet (metadata may export).
 *
 * @see {@link ./wild-word-translation-target.ts} for `sourceLang` / effective gloss language resolution
 * @see {@link ./wild-word-record.ts} for safe coercion from raw storage
 */

/** Default gloss language when a row omits `targetLanguage` (web app enrichment). */
export const DEFAULT_EXPLANATION_TARGET_LANGUAGE = "en";

/**
 * Legacy extension exports often omitted `targetLanguage`; display/enrichment treat extension web rows as Spanish-learning.
 * @sync `extensions/lenguariver-extension` default settings `targetLanguage`.
 */
export const EXTENSION_LEGACY_DEFAULT_TARGET_LANGUAGE = "es";
