/**
 * Run: `npx tsx lib/wild-word-card-audio.test.ts`
 */
import assert from "node:assert/strict";

import { buildWildWordLanguagePresentation } from "./wild-word-extension-display";
import {
  resolveCardSourceSpeechLanguage,
  resolveCardTranslationSpeechLanguage,
  type WildWordCardAudioContext,
} from "./wild-word-card-audio";
import { normalizeLanguageCodeForTts } from "./tts-voice";

function ctx(
  partial: Partial<WildWordCardAudioContext> & Pick<WildWordCardAudioContext, "wildWord">
): WildWordCardAudioContext {
  return {
    rawRecord: {},
    ...partial,
  };
}

const disculpeRow = {
  id: "w-disculpe",
  text: "Disculpe",
  language: "es",
  translation: "Excuse me",
  savedAt: "2026-01-01T00:00:00.000Z",
};

const learningLegacyRow = {
  id: "ext-learning",
  text: "learning",
  language: "es",
  sourceUrl: "https://example.com/page",
  sourceKind: "web",
  savedAt: "2026-01-01T00:00:00.000Z",
};

const esWord = { text: "mesa", language: "es", translation: "table" };
const enWord = { text: "hello", language: "en", translation: "hola" };

assert.equal(
  resolveCardSourceSpeechLanguage(
    ctx({
      wildWord: disculpeRow,
      languagePresentation: buildWildWordLanguagePresentation(disculpeRow, disculpeRow),
    })
  ),
  "es",
  "Disculpe source -> es"
);

assert.equal(
  resolveCardTranslationSpeechLanguage(
    ctx({
      wildWord: disculpeRow,
      rawRecord: disculpeRow,
    })
  ),
  "en",
  "Excuse me translation -> en"
);

const learningPresentation = buildWildWordLanguagePresentation(learningLegacyRow, learningLegacyRow);
assert.equal(learningPresentation.speechCode, "en");
assert.equal(
  resolveCardSourceSpeechLanguage(
    ctx({
      wildWord: learningLegacyRow,
      languagePresentation: learningPresentation,
    })
  ),
  "en",
  "learning source -> en (legacy corrected row)"
);

assert.equal(
  resolveCardSourceSpeechLanguage(
    ctx({
      wildWord: { text: "learning", language: "es" },
      languagePresentation: {
        displayCode: "en",
        speechCode: "en",
        note: null,
      },
    })
  ),
  "en",
  "legacy corrected row source -> en"
);

assert.equal(
  resolveCardTranslationSpeechLanguage(
    ctx({
      wildWord: {
        text: "learning",
        language: "es",
        translation: "aprendizaje",
      },
      rawRecord: {
        ...learningLegacyRow,
        targetLanguage: "en",
        translationTargetLanguage: "es",
        translation: "aprendizaje",
      },
      languagePresentation: learningPresentation,
      extras: { translationTargetLanguage: "es", targetLanguage: "en" },
    })
  ),
  "es",
  "aprendizaje translation -> es"
);

assert.equal(
  resolveCardTranslationSpeechLanguage(
    ctx({
      wildWord: {
        text: "learning",
        language: "es",
        translation: "aprendizaje",
      },
      rawRecord: {
        ...learningLegacyRow,
        targetLanguage: "es",
        translation: "aprendizaje",
      },
      languagePresentation: learningPresentation,
    })
  ),
  "es",
  "learning translation uses effective target es when stored target matches corrected source"
);

assert.equal(
  resolveCardSourceSpeechLanguage(
    ctx({
      wildWord: esWord,
      languagePresentation: buildWildWordLanguagePresentation({ id: "1" }, esWord),
    })
  ),
  "es"
);

assert.equal(
  resolveCardSourceSpeechLanguage(
    ctx({
      wildWord: enWord,
      languagePresentation: buildWildWordLanguagePresentation({ id: "2" }, enWord),
    })
  ),
  "en"
);

assert.equal(
  resolveCardTranslationSpeechLanguage(
    ctx({
      wildWord: esWord,
      rawRecord: { translationTargetLanguage: "en" },
    })
  ),
  "en"
);

assert.equal(
  resolveCardTranslationSpeechLanguage(
    ctx({
      wildWord: enWord,
      rawRecord: { targetLanguage: "es" },
    })
  ),
  "es"
);

assert.equal(
  resolveCardTranslationSpeechLanguage(
    ctx({
      wildWord: esWord,
      languagePresentation: buildWildWordLanguagePresentation({ id: "3" }, esWord),
    })
  ),
  "en"
);

assert.equal(
  resolveCardTranslationSpeechLanguage(
    ctx({
      wildWord: enWord,
      languagePresentation: buildWildWordLanguagePresentation({ id: "4" }, enWord),
    })
  ),
  "es"
);

assert.equal(
  resolveCardTranslationSpeechLanguage(
    ctx({
      wildWord: { text: "knowledge", language: "en", translation: "conocimiento" },
      rawRecord: { targetLanguage: "en" },
      languagePresentation: buildWildWordLanguagePresentation({ id: "5" }, { language: "en", text: "knowledge" }),
    })
  ),
  "es",
  "same-language target resolves to opposite gloss language"
);

assert.equal(
  resolveCardTranslationSpeechLanguage(
    ctx({
      wildWord: { text: "bonjour", language: "fr", translation: "hello" },
      extras: { translationTargetLanguage: "en" },
    })
  ),
  "en"
);

assert.equal(normalizeLanguageCodeForTts("es"), "es-ES");
assert.equal(normalizeLanguageCodeForTts("en"), "en-US");
assert.equal(normalizeLanguageCodeForTts("ru"), "ru-RU");
assert.equal(normalizeLanguageCodeForTts("ar"), "ar-SA");

function assertEndToEnd(
  label: string,
  audioType: "source" | "translation",
  context: WildWordCardAudioContext,
  spokenText: string,
  expectedRaw: string,
  expectedNormalized: string
): void {
  const resolved =
    audioType === "source"
      ? resolveCardSourceSpeechLanguage(context)
      : resolveCardTranslationSpeechLanguage(context);
  assert.equal(resolved, expectedRaw, `${label} raw language`);
  assert.equal(normalizeLanguageCodeForTts(resolved), expectedNormalized, `${label} normalized TTS language`);
  assert.equal(spokenText.trim().length > 0, true, `${label} spoken text`);
}

const disculpePresentation = buildWildWordLanguagePresentation(disculpeRow, disculpeRow);
assertEndToEnd(
  "Disculpe source",
  "source",
  ctx({ wildWord: disculpeRow, rawRecord: disculpeRow, languagePresentation: disculpePresentation }),
  "Disculpe",
  "es",
  "es-ES"
);
assertEndToEnd(
  "Excuse me translation",
  "translation",
  ctx({ wildWord: disculpeRow, rawRecord: disculpeRow, languagePresentation: disculpePresentation }),
  "Excuse me",
  "en",
  "en-US"
);
assertEndToEnd(
  "learning source",
  "source",
  ctx({
    wildWord: learningLegacyRow,
    rawRecord: learningLegacyRow,
    languagePresentation: learningPresentation,
  }),
  "learning",
  "en",
  "en-US"
);
assertEndToEnd(
  "aprendizaje translation",
  "translation",
  ctx({
    wildWord: { text: "learning", language: "es", translation: "aprendizaje" },
    rawRecord: {
      ...learningLegacyRow,
      targetLanguage: "en",
      translationTargetLanguage: "es",
      translation: "aprendizaje",
    },
    languagePresentation: learningPresentation,
    extras: { translationTargetLanguage: "es", targetLanguage: "en" },
  }),
  "aprendizaje",
  "es",
  "es-ES"
);

console.log("wild-word-card-audio.test.ts: ok");
