import { getExerciseSurfaceText } from "@/lib/chunk-normalizer";
import { getLanguageDisplayName } from "@/lib/language-display-name";
import {
  getComicActiveRecallExpectedAnswerLabel,
  resolveComicActiveRecallTask,
  type ComicActiveRecallTaskType,
} from "@/lib/comic-active-recall-prompt";

export type ComicAnswerExerciseType =
  | "chunk-to-meaning"
  | "meaning-to-chunk"
  | "contextual-fill-in"
  | "full-sentence-recall";

export type ComicAnswerChunk = {
  text: string;
  translation: string;
  acceptedMeanings?: string[];
  exerciseAnchorText?: string;
  phonetic?: string;
};

export type ComicExpectedAnswerSpec = {
  expectedAnswer: string;
  acceptableAnswers: string[];
  sentenceContext?: string;
  promptLabel: string;
  targetLanguage?: string;
  answerLanguage?: string;
  exerciseType: ComicAnswerExerciseType | "reinforcement";
  taskType?: ComicActiveRecallTaskType;
  expectedAnswerLabel?: string;
};

export type AnswerHintLevel = 0 | 1 | 2 | 3;

export type BuiltAnswerHint = {
  level: AnswerHintLevel;
  hintText: string | null;
  showExpectedAnswer: boolean;
  expectedAnswers: string[];
};

export function getAnswerHintLevel(wrongAttempts: number, revealAnswer = false): AnswerHintLevel {
  if (revealAnswer) {
    return 3;
  }
  if (wrongAttempts <= 0) {
    return 0;
  }
  if (wrongAttempts === 1) {
    return 1;
  }
  if (wrongAttempts === 2) {
    return 2;
  }
  return 3;
}

/** First letter plus underscores for remaining characters (per word for multi-word answers). */
export function maskExpectedAnswer(answer: string): string {
  const trimmed = answer.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed
    .split(/\s+/)
    .map((word) => {
      if (!word) {
        return "";
      }
      const letters = word.replace(/[^\p{L}\p{N}]/gu, "");
      const first = letters.charAt(0) || word.charAt(0);
      const maskLen = Math.max(letters.length, word.length) - 1;
      const suffix = maskLen > 0 ? "_".repeat(maskLen) : "";
      const leading = word.slice(0, word.indexOf(first) + 1);
      const trailingPunct = word.slice(letters.length);
      return `${leading}${suffix}${trailingPunct}`;
    })
    .join(" ");
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function primaryExpectedFromParts(parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join(" ").trim();
}

function buildContextHint(spec: ComicExpectedAnswerSpec): string {
  const prompt = spec.promptLabel.trim();
  const targetLang = spec.targetLanguage ? getLanguageDisplayName(spec.targetLanguage) : "the target language";
  const answerLang = spec.answerLanguage ? getLanguageDisplayName(spec.answerLanguage) : targetLang;

  if (spec.taskType === "chunk-target") {
    const chunkLabel = prompt || "this word";
    if (spec.sentenceContext) {
      return `Target word/phrase: “${chunkLabel}”\nIn this sentence:\n“${spec.sentenceContext}”\nType the highlighted ${targetLang} word or phrase.`;
    }
    return `Target word/phrase: “${chunkLabel}”\nType the ${targetLang} word or phrase for this prompt.`;
  }

  if (spec.taskType === "chunk-meaning" || spec.exerciseType === "chunk-to-meaning") {
    const chunkLabel = prompt || "this phrase";
    if (spec.sentenceContext) {
      return `Target chunk: “${chunkLabel}”\nIn this sentence:\n“${spec.sentenceContext}”\nType the English meaning for this phrase.`;
    }
    return `Target chunk: “${chunkLabel}”\nType the English meaning for this phrase.`;
  }

  if (spec.taskType === "fill-blank-target" || spec.exerciseType === "contextual-fill-in") {
    if (spec.sentenceContext) {
      return `Fill in the blank using the word from this sentence:\n“${spec.sentenceContext}”`;
    }
    return "Fill in the blank using the word from the lesson sentence.";
  }

  if (spec.taskType === "full-sentence-target") {
    if (spec.sentenceContext) {
      return `Type the full ${answerLang} sentence that matches:\n“${spec.sentenceContext}”`;
    }
    return `Type the full ${answerLang} sentence for this prompt.`;
  }

  if (spec.taskType === "english-translation") {
    if (spec.sentenceContext) {
      return `Type the English translation for:\n“${spec.sentenceContext}”`;
    }
    return "Type the English translation for this prompt.";
  }

  if (spec.exerciseType === "reinforcement") {
    if (spec.sentenceContext) {
      return `In this lesson, use the ${targetLang} phrase from:\n“${spec.sentenceContext}”`;
    }
    return `Type the ${targetLang} translation for “${prompt}”.`;
  }

  // meaning-to-chunk and similar translation prompts
  if (spec.sentenceContext) {
    return `In this lesson, use the word from the sentence:\n“${spec.sentenceContext}”`;
  }
  return `This answer is the ${targetLang} word used here for “${prompt}”.`;
}

function buildShapeHint(spec: ComicExpectedAnswerSpec): string {
  const masked = maskExpectedAnswer(spec.expectedAnswer);
  if (!masked) {
    return "Expected form: (see sentence context)";
  }
  return `Starts with “${masked.slice(0, Math.min(masked.length, 12))}${masked.length > 12 ? "…" : ""}” — expected form: ${masked}`;
}

export function buildExpectedAnswerHint(input: {
  spec: ComicExpectedAnswerSpec;
  wrongAttempts: number;
  revealAnswer?: boolean;
}): BuiltAnswerHint {
  const level = getAnswerHintLevel(input.wrongAttempts, input.revealAnswer === true);
  const expectedAnswers =
    input.spec.acceptableAnswers.length > 0
      ? input.spec.acceptableAnswers
      : input.spec.expectedAnswer
        ? [input.spec.expectedAnswer]
        : [];

  if (level === 0) {
    return {
      level,
      hintText: null,
      showExpectedAnswer: false,
      expectedAnswers,
    };
  }

  if (level === 3) {
    return {
      level,
      hintText: null,
      showExpectedAnswer: true,
      expectedAnswers,
    };
  }

  const hintText = level === 1 ? buildContextHint(input.spec) : buildShapeHint(input.spec);
  return {
    level,
    hintText,
    showExpectedAnswer: false,
    expectedAnswers,
  };
}

export function shouldShowComicAnswerHints(input: {
  typingChecked: boolean;
  typingStatus?: "correct" | "partial" | "incorrect";
  wrongAttempts: number;
  revealAnswer: boolean;
}): boolean {
  if (input.typingStatus === "correct") {
    return false;
  }
  if (input.revealAnswer) {
    return true;
  }
  return (
    input.typingChecked &&
    input.wrongAttempts > 0 &&
    (input.typingStatus === "incorrect" || input.typingStatus === "partial")
  );
}

export function resolveActiveRecallExpectedAnswer(input: {
  type: ComicAnswerExerciseType;
  prompt: string;
  expectedParts: string[];
  expectedPhoneticParts?: string[];
  targetChunks: ComicAnswerChunk[];
  sentenceText?: string;
  lessonLanguage: string;
}): ComicExpectedAnswerSpec {
  const lessonLanguage = input.lessonLanguage.trim().toLowerCase();
  const primary = primaryExpectedFromParts(input.expectedParts);
  const task = resolveComicActiveRecallTask({
    type: input.type,
    prompt: input.prompt,
    expectedParts: input.expectedParts,
    sentenceText: input.sentenceText,
    targetLanguage: lessonLanguage,
    targetChunks: input.targetChunks,
  });
  const expectedAnswerLabel = getComicActiveRecallExpectedAnswerLabel(task.taskType);

  if (input.type === "chunk-to-meaning") {
    const chunk = input.targetChunks[0];
    const accepted =
      chunk?.acceptedMeanings?.length && chunk.acceptedMeanings.length > 0
        ? chunk.acceptedMeanings
        : chunk
          ? [chunk.translation]
          : input.expectedParts;
    return {
      exerciseType: input.type,
      promptLabel: input.prompt.trim() || chunk?.text || "",
      expectedAnswer: accepted[0] ?? primary,
      acceptableAnswers: uniqueNonEmpty(accepted),
      sentenceContext: input.sentenceText?.trim() || undefined,
      answerLanguage: "en",
      targetLanguage: "en",
      taskType: task.taskType,
      expectedAnswerLabel,
    };
  }

  const surfaceAnswers = input.targetChunks.map((chunk) => getExerciseSurfaceText(chunk));
  const phoneticAnswers = (input.expectedPhoneticParts ?? []).filter(Boolean);
  const acceptableAnswers = uniqueNonEmpty([
    ...input.expectedParts,
    ...surfaceAnswers,
    ...phoneticAnswers,
  ]);

  return {
    exerciseType: input.type,
    promptLabel: input.prompt.trim(),
    expectedAnswer: primary || surfaceAnswers[0] || "",
    acceptableAnswers:
      acceptableAnswers.length > 0 ? acceptableAnswers : primary ? [primary] : [],
    sentenceContext: input.sentenceText?.trim() || undefined,
    targetLanguage: lessonLanguage,
    answerLanguage: lessonLanguage,
    taskType: task.taskType,
    expectedAnswerLabel,
  };
}

export function resolveReinforcementExpectedAnswer(input: {
  text: string;
  translation: string;
  expectedParts: string[];
  contextLabel?: string;
  lessonLanguage: string;
}): ComicExpectedAnswerSpec {
  const primary = primaryExpectedFromParts(input.expectedParts) || input.text.trim();
  const acceptableAnswers = uniqueNonEmpty(
    input.expectedParts.length > 0 ? input.expectedParts : [primary]
  );
  return {
    exerciseType: "reinforcement",
    promptLabel: input.translation.trim() || input.text.trim(),
    expectedAnswer: primary,
    acceptableAnswers,
    sentenceContext: input.contextLabel?.trim() || undefined,
    targetLanguage: input.lessonLanguage.trim().toLowerCase(),
    answerLanguage: input.lessonLanguage.trim().toLowerCase(),
  };
}
