import type { LessonDraft } from "./lesson-draft-generator";
import type { SupportedLanguage } from "./types";

type ConvertedLessonWord = {
  text: string;
  translation: string;
  baseForm: string;
  type: "core" | "interest";
  formality: "formal" | "informal" | "neutral";
  partOfSpeech: "noun" | "verb" | "adjective" | "phrase" | "preposition" | "pronoun" | "other";
  imageability: "high" | "medium" | "low";
  repetitionPriority: "high" | "medium" | "low";
};

type ConvertedLessonSentence = {
  text: string;
  translation: string;
  formality: "formal" | "informal" | "neutral";
  audioPlaceholder: string;
  words: ConvertedLessonWord[];
};

export type ConvertedLesson = {
  id: string;
  language: SupportedLanguage;
  title: string;
  topic: string;
  trackType: "core" | "language-specific" | "interest";
  required: boolean;
  objective: string;
  coreWords: string[];
  interestWords: string[];
  sentences: ConvertedLessonSentence[];
};

export type ConversionResult = {
  lesson: ConvertedLesson;
  warnings: string[];
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

function inferPartOfSpeech(text: string): ConvertedLessonWord["partOfSpeech"] {
  const normalized = text.toLowerCase().trim();
  if (normalized.includes(" ")) {
    return "phrase";
  }
  if (/(ar|er|ir)$/u.test(normalized) || /(ть)$/u.test(normalized)) {
    return "verb";
  }
  if (/(yo|t[uú]|usted|я|ты|вы)$/u.test(normalized)) {
    return "pronoun";
  }
  return "noun";
}

function inferImageability(partOfSpeech: ConvertedLessonWord["partOfSpeech"]): ConvertedLessonWord["imageability"] {
  if (partOfSpeech === "noun") {
    return "high";
  }
  if (partOfSpeech === "phrase" || partOfSpeech === "verb") {
    return "medium";
  }
  return "low";
}

function inferRepetitionPriority(text: string, targets: Set<string>): ConvertedLessonWord["repetitionPriority"] {
  return targets.has(text.toLowerCase()) ? "high" : "medium";
}

function ensureChunkTranslation(translation: string | undefined, text: string): string {
  const value = translation?.trim();
  if (value && value.length > 0) {
    return value;
  }
  return `[translation needed: ${text}]`;
}

function validateDraftForConversion(draft: LessonDraft): string[] {
  const errors: string[] = [];
  if (!draft.targetChunks || draft.targetChunks.length === 0) {
    errors.push("Draft has no targetChunks.");
  }
  if (!draft.sentences || draft.sentences.length === 0) {
    errors.push("Draft has no sentences.");
  }
  if ((draft.sentences?.length ?? 0) < 2) {
    errors.push("Draft needs at least 2 sentences.");
  }
  const hasMissingChunkText = (draft.sentences ?? []).some((sentence) =>
    sentence.chunks.some((chunk) => !chunk.text || chunk.text.trim().length === 0)
  );
  if (hasMissingChunkText) {
    errors.push("Draft contains chunk with missing text.");
  }
  return errors;
}

export function convertLessonDraftToLesson(draft: LessonDraft): ConversionResult {
  const errors = validateDraftForConversion(draft);
  if (errors.length > 0) {
    throw new Error(`Draft conversion rejected: ${errors.join(" ")}`);
  }

  const warnings: string[] = [];
  const targetSet = new Set(draft.targetChunks.map((chunk) => chunk.toLowerCase()));
  const alignedSentences = draft.sentences.filter((sentence) =>
    sentence.chunks.some((chunk) => targetSet.has(chunk.text.toLowerCase()))
  );
  const selectedSentences = alignedSentences.slice(0, 4);
  if (selectedSentences.length < 2) {
    throw new Error("Draft conversion rejected: fewer than 2 target-aligned sentences.");
  }

  const formalCount = selectedSentences.filter((sentence) =>
    sentence.chunks.some((chunk) => chunk.formality === "formal")
  ).length;
  const informalCount = selectedSentences.filter((sentence) =>
    sentence.chunks.some((chunk) => chunk.formality === "informal")
  ).length;
  if (formalCount === 0 || informalCount === 0) {
    warnings.push("No formal/informal contrast in selected sentences.");
  }

  const targetCoverage = draft.targetChunks.filter((target) =>
    selectedSentences.some((sentence) =>
      sentence.chunks.some((chunk) => chunk.text.toLowerCase() === target.toLowerCase())
    )
  ).length;
  if (targetCoverage < Math.ceil(draft.targetChunks.length * 0.6)) {
    warnings.push("Weak example coverage for target chunks (<60%).");
  }

  const convertedSentences: ConvertedLessonSentence[] = selectedSentences.map((sentence) => {
    const sentenceFormality =
      sentence.chunks.find((chunk) => chunk.formality && chunk.formality !== "neutral")?.formality ?? "neutral";
    const words: ConvertedLessonWord[] = sentence.chunks.map((chunk) => {
      const partOfSpeech = inferPartOfSpeech(chunk.text);
      return {
        text: chunk.text,
        translation: ensureChunkTranslation(chunk.translation, chunk.text),
        baseForm: chunk.baseForm,
        type: targetSet.has(chunk.text.toLowerCase()) ? "core" : "interest",
        formality: chunk.formality ?? sentenceFormality,
        partOfSpeech,
        imageability: inferImageability(partOfSpeech),
        repetitionPriority: inferRepetitionPriority(chunk.text, targetSet),
      };
    });
    return {
      text: sentence.text,
      translation: ensureChunkTranslation(sentence.translation, sentence.text),
      formality: sentenceFormality,
      audioPlaceholder: "[Audio coming soon]",
      words,
    };
  });

  const lesson: ConvertedLesson = {
    id: `draft-${draft.language}-${slugify(draft.topic)}`,
    language: draft.language,
    title: draft.topic,
    topic: draft.topic,
    trackType: "core",
    required: true,
    objective: draft.objective,
    coreWords: draft.targetChunks,
    interestWords: draft.supportingChunks,
    sentences: convertedSentences,
  };

  return { lesson, warnings };
}

