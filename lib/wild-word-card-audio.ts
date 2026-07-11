"use client";

/**
 * My Words card audio (system TTS today; native recordings can plug in here later).
 */

import { isMyWordsDebugEnabled } from "@/lib/debug-flags";
import type { UserWildWord } from "@/lib/explore-content";
import type { WildWordLanguagePresentation } from "@/lib/wild-word-extension-display";
import {
  ensureTtsVoicesLoaded,
  getMatchingVoicesForLanguage,
  getPreferredVoiceForLanguage,
  normalizeLanguageCodeForTts,
  speakTextWithPreferredVoice,
} from "@/lib/tts-voice";
import {
  fallbackOppositeTarget,
  resolveEffectiveTranslationTarget,
} from "@/lib/wild-word-translation-target";

const CARD_TTS_RATE = 0.9;

export type WildWordCardAudioContext = {
  wildWord: Pick<UserWildWord, "text" | "language" | "translation">;
  rawRecord: Record<string, unknown>;
  languagePresentation?: WildWordLanguagePresentation | null;
  extras?: {
    translationTargetLanguage?: string;
    targetLanguage?: string;
  } | null;
};

function trimLanguage(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readLanguage(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    const lang = trimLanguage(candidate);
    if (lang) {
      return lang;
    }
  }
  return undefined;
}

/**
 * Resolved source language for TTS:
 * `speechCode` → `displayCode` → stored `wildWord.language` → `en`.
 */
export function resolveCardSourceSpeechLanguage(ctx: WildWordCardAudioContext): string {
  if (ctx.languagePresentation) {
    return (
      readLanguage(
        ctx.languagePresentation.speechCode,
        ctx.languagePresentation.displayCode,
        ctx.wildWord.language
      ) ?? "en"
    );
  }
  return trimLanguage(ctx.wildWord.language) ?? "en";
}

/**
 * Language for translation TTS:
 * `translationTargetLanguage` → `rawRecord.translationTargetLanguage` → effective `rawRecord.targetLanguage` → fallback.
 */
export function resolveCardTranslationSpeechLanguage(ctx: WildWordCardAudioContext): string {
  const fromTranslationTarget = readLanguage(
    ctx.extras?.translationTargetLanguage,
    ctx.rawRecord.translationTargetLanguage
  );
  if (fromTranslationTarget) {
    return fromTranslationTarget;
  }

  const sourceSpeech = resolveCardSourceSpeechLanguage(ctx);
  const storedTarget = trimLanguage(ctx.rawRecord.targetLanguage);
  if (storedTarget) {
    return resolveEffectiveTranslationTarget(sourceSpeech, storedTarget);
  }

  return fallbackOppositeTarget(sourceSpeech);
}

function devLogCardTts(
  ctx: WildWordCardAudioContext,
  audioType: "source" | "translation",
  spokenText: string,
  resolvedRawLanguage: string
): void {
  if (!isMyWordsDebugEnabled()) {
    return;
  }
  ensureTtsVoicesLoaded();
  const normalizedTtsLanguage = normalizeLanguageCodeForTts(resolvedRawLanguage);
  const matchingVoices = getMatchingVoicesForLanguage(resolvedRawLanguage);
  const chosenVoice = getPreferredVoiceForLanguage(resolvedRawLanguage);
  console.info("[WordCard TTS]", {
    cardText: ctx.wildWord.text.trim(),
    audioType,
    spokenText,
    resolvedRawLanguage,
    normalizedTtsLanguage,
    availableMatchingVoices: matchingVoices.map((voice) => `${voice.name} (${voice.lang})`),
    chosenVoice: chosenVoice ? `${chosenVoice.name} (${chosenVoice.lang})` : null,
  });
}

/** Speak the saved word/phrase with the source language voice. */
export function playCardSourceAudio(ctx: WildWordCardAudioContext): void {
  const text = ctx.wildWord.text.trim();
  if (!text) {
    return;
  }
  const language = resolveCardSourceSpeechLanguage(ctx);
  devLogCardTts(ctx, "source", text, language);
  ensureTtsVoicesLoaded();
  speakTextWithPreferredVoice(text, language, CARD_TTS_RATE);
}

/**
 * Speak the gloss/translation. Caller supplies display text (may include lexeme hints).
 * No-op when `translationText` is empty.
 */
export function playCardTranslationAudio(ctx: WildWordCardAudioContext, translationText: string): void {
  const text = translationText.trim();
  if (!text) {
    return;
  }
  const language = resolveCardTranslationSpeechLanguage(ctx);
  devLogCardTts(ctx, "translation", text, language);
  ensureTtsVoicesLoaded();
  speakTextWithPreferredVoice(text, language, CARD_TTS_RATE);
}
