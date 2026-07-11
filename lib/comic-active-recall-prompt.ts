import { getAcceptedMeanings } from "@/lib/translation-synonyms";
import { getExerciseSurfaceText } from "@/lib/chunk-normalizer";
import { getLanguageDisplayName } from "@/lib/language-display-name";
import { isNameOnlyPracticeText } from "./lesson-chunk-filter";
import type { ComicAnswerExerciseType } from "./comic-answer-hints";

export type ComicActiveRecallTaskType =
  | "full-sentence-target"
  | "fill-blank-target"
  | "chunk-meaning"
  | "english-translation"
  | "chunk-target";

export type ComicActiveRecallPromptMode = "sentence" | "chunk-meaning" | "fill-blank";

export type ComicActiveRecallHighlightSegment = {
  text: string;
  highlighted?: boolean;
};

export type ComicActiveRecallTask = {
  taskType: ComicActiveRecallTaskType;
  instruction: string;
  displayText: string;
  targetText?: string;
  highlightedTarget?: string;
  contextText?: string;
  inputLanguage: "target" | "english";
  expectedAnswers: string[];
  highlightSegments: ComicActiveRecallHighlightSegment[];
  /** Text used to bind the comic bubble (avoids whole-sentence display for chunk drills). */
  bubbleActiveText: string;
};

export type ComicActiveRecallPrompt = ComicActiveRecallTask & {
  mode: ComicActiveRecallPromptMode;
  /** @deprecated Use expectedAnswers */
  expectedAnswer: string[];
};

export type ComicActiveRecallExerciseInput = {
  type: ComicAnswerExerciseType;
  prompt: string;
  expectedParts: string[];
  sentenceText?: string;
  targetLanguage?: string;
  targetChunks: {
    text: string;
    translation: string;
    acceptedMeanings?: string[];
  }[];
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function normalizeRecallText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function joinedExpectedParts(parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join(" ").trim();
}

export function expectedMatchesFullSentence(
  expectedAnswers: string[],
  sentenceText: string
): boolean {
  const joined = joinedExpectedParts(expectedAnswers);
  const sentence = sentenceText.trim();
  if (!joined || !sentence) {
    return false;
  }
  return normalizeRecallText(joined) === normalizeRecallText(sentence);
}

export function isChunkOnlyExpected(
  expectedAnswers: string[],
  sentenceText: string
): boolean {
  if (expectedMatchesFullSentence(expectedAnswers, sentenceText)) {
    return false;
  }
  const joined = joinedExpectedParts(expectedAnswers);
  if (!joined) {
    return false;
  }
  const expectedTokens = normalizeRecallText(joined).split(" ").filter(Boolean);
  const sentenceTokens = normalizeRecallText(sentenceText).split(" ").filter(Boolean);
  if (sentenceTokens.length === 0) {
    return true;
  }
  return expectedTokens.length < sentenceTokens.length;
}

function instructionMentionsFullSentence(instruction: string): boolean {
  return /full sentence/i.test(instruction);
}

function resolveHighlightedTarget(
  exercise: ComicActiveRecallExerciseInput,
  expectedAnswers: string[]
): string {
  const chunkSurface = exercise.targetChunks
    .map((chunk) => getExerciseSurfaceText(chunk))
    .find(Boolean);
  if (chunkSurface) {
    return chunkSurface;
  }
  return joinedExpectedParts(expectedAnswers);
}

function chunkTargetInstruction(highlightedTarget: string, targetLanguage?: string): string {
  const languageName = getLanguageDisplayName(targetLanguage ?? "es");
  const wordCount = normalizeRecallText(highlightedTarget).split(" ").filter(Boolean).length;
  return wordCount <= 1
    ? `Type the highlighted ${languageName} word`
    : `Type the highlighted ${languageName} phrase`;
}

function buildChunkTargetTask(input: {
  sentence: string;
  highlightedTarget: string;
  expectedAnswers: string[];
  contextText?: string;
  instruction?: string;
  targetLanguage?: string;
}): ComicActiveRecallTask {
  const highlightSegments = input.sentence
    ? buildChunkHighlightSegments(input.sentence, input.highlightedTarget)
    : [{ text: input.highlightedTarget, highlighted: true }];

  return {
    taskType: "chunk-target",
    displayText: input.sentence || input.highlightedTarget,
    targetText: input.highlightedTarget,
    highlightedTarget: input.highlightedTarget,
    contextText: input.contextText,
    instruction:
      input.instruction ?? chunkTargetInstruction(input.highlightedTarget, input.targetLanguage),
    inputLanguage: "target",
    expectedAnswers: input.expectedAnswers,
    highlightSegments,
    bubbleActiveText: input.highlightedTarget,
  };
}

function buildFullSentenceTargetTask(input: {
  sentence: string;
  englishCue: string;
  expectedAnswers: string[];
  targetLanguage?: string;
}): ComicActiveRecallTask {
  const languageName = getLanguageDisplayName(input.targetLanguage ?? "es");
  return {
    taskType: "full-sentence-target",
    displayText: input.englishCue,
    contextText: input.sentence || undefined,
    instruction: `Type the full ${languageName} sentence`,
    inputLanguage: "target",
    expectedAnswers: input.expectedAnswers,
    highlightSegments: [{ text: input.englishCue }],
    bubbleActiveText: input.sentence || input.englishCue,
  };
}

function taskToPromptMode(taskType: ComicActiveRecallTaskType): ComicActiveRecallPromptMode {
  if (taskType === "chunk-meaning") {
    return "chunk-meaning";
  }
  if (taskType === "fill-blank-target") {
    return "fill-blank";
  }
  return "sentence";
}

function taskToPrompt(task: ComicActiveRecallTask): ComicActiveRecallPrompt {
  return {
    ...task,
    mode: taskToPromptMode(task.taskType),
    expectedAnswer: task.expectedAnswers,
  };
}

/** Highlight `target` inside `sentence` when it appears (accent/case-insensitive). */
export function buildChunkHighlightSegments(
  sentence: string,
  target: string
): ComicActiveRecallHighlightSegment[] {
  const trimmedSentence = sentence.trim();
  const trimmedTarget = target.trim();
  if (!trimmedTarget) {
    return [{ text: trimmedSentence }];
  }
  if (!trimmedSentence) {
    return [{ text: trimmedTarget, highlighted: true }];
  }

  const pattern = new RegExp(
    escapeRegExp(trimmedTarget).replace(/\s+/g, "\\s+"),
    "iu"
  );
  const match = trimmedSentence.match(pattern);
  if (!match || match.index === undefined) {
    return [{ text: trimmedTarget, highlighted: true }];
  }

  const start = match.index;
  const end = start + match[0].length;
  const segments: ComicActiveRecallHighlightSegment[] = [];
  if (start > 0) {
    segments.push({ text: trimmedSentence.slice(0, start) });
  }
  segments.push({ text: trimmedSentence.slice(start, end), highlighted: true });
  if (end < trimmedSentence.length) {
    segments.push({ text: trimmedSentence.slice(end) });
  }
  return segments;
}

export function shouldExcludeActiveRecallExercisePrompt(
  exercise: Pick<ComicActiveRecallExerciseInput, "prompt" | "targetChunks">
): boolean {
  const prompt = exercise.prompt.trim();
  if (prompt && isNameOnlyPracticeText(prompt)) {
    return true;
  }
  const chunk = exercise.targetChunks[0]?.text.trim();
  if (chunk && isNameOnlyPracticeText(chunk)) {
    return true;
  }
  return false;
}

export function validateActiveRecallTask(task: ComicActiveRecallTask): {
  valid: boolean;
  issues: string[];
  fallbackTask?: ComicActiveRecallTask;
} {
  const issues: string[] = [];
  const joinedExpected = joinedExpectedParts(task.expectedAnswers);
  const sentence = task.contextText?.trim() ?? "";

  if (instructionMentionsFullSentence(task.instruction)) {
    if (!expectedMatchesFullSentence(task.expectedAnswers, task.contextText ?? task.displayText)) {
      issues.push("instruction mentions full sentence but expected answer is not the full sentence");
    }
  }

  if (task.taskType === "full-sentence-target") {
    if (
      sentence &&
      !expectedMatchesFullSentence(task.expectedAnswers, sentence)
    ) {
      issues.push("full-sentence-target task without full sentence expected answer");
    }
  }

  if (task.taskType === "chunk-meaning" && !task.highlightedTarget?.trim()) {
    issues.push("chunk-meaning task missing highlightedTarget");
  }

  if (
    task.inputLanguage === "english" &&
    task.taskType !== "chunk-meaning" &&
    task.taskType !== "english-translation" &&
    joinedExpected &&
    sentence &&
    expectedMatchesFullSentence([joinedExpected], sentence)
  ) {
    issues.push("inputLanguage english but expected answer is target-language sentence");
  }

  if (issues.length === 0) {
    return { valid: true, issues: [] };
  }

  let fallbackTask: ComicActiveRecallTask | undefined;
  if (
    sentence &&
    isChunkOnlyExpected(task.expectedAnswers, sentence)
  ) {
    fallbackTask = buildChunkTargetTask({
      sentence,
      highlightedTarget:
        task.highlightedTarget?.trim() ||
        task.targetText?.trim() ||
        resolveHighlightedTarget(
          {
            type: "meaning-to-chunk",
            prompt: task.displayText,
            expectedParts: task.expectedAnswers,
            sentenceText: sentence,
            targetChunks: [],
          },
          task.expectedAnswers
        ),
      expectedAnswers: task.expectedAnswers,
      contextText: task.taskType === "full-sentence-target" ? task.displayText : task.contextText,
    });
  } else if (
    sentence &&
    expectedMatchesFullSentence(task.expectedAnswers, sentence)
  ) {
    fallbackTask = buildFullSentenceTargetTask({
      sentence,
      englishCue: task.displayText,
      expectedAnswers: task.expectedAnswers,
      targetLanguage: undefined,
    });
  }

  return { valid: false, issues, fallbackTask };
}

export function resolveComicActiveRecallTask(
  exercise: ComicActiveRecallExerciseInput
): ComicActiveRecallTask {
  const sentence = exercise.sentenceText?.trim() ?? "";
  const prompt = exercise.prompt.trim();

  if (exercise.type === "chunk-to-meaning") {
    const chunk = exercise.targetChunks[0];
    const targetText = (chunk?.text ?? prompt).trim();
    const accepted =
      chunk?.acceptedMeanings?.length && chunk.acceptedMeanings.length > 0
        ? chunk.acceptedMeanings
        : chunk
          ? getAcceptedMeanings(chunk.translation, chunk.acceptedMeanings)
          : exercise.expectedParts;
    const expectedAnswers = uniqueNonEmpty(
      accepted.length > 0 ? accepted : [chunk?.translation ?? ""]
    );
    const highlightSegments = sentence
      ? buildChunkHighlightSegments(sentence, targetText)
      : [{ text: targetText, highlighted: true }];

    return {
      taskType: "chunk-meaning",
      displayText: targetText,
      targetText,
      highlightedTarget: targetText,
      contextText: sentence || undefined,
      instruction: "Type the English meaning of the highlighted phrase",
      inputLanguage: "english",
      expectedAnswers,
      highlightSegments,
      bubbleActiveText: targetText,
    };
  }

  if (exercise.type === "contextual-fill-in") {
    const displayText = prompt;
    const languageName = getLanguageDisplayName(exercise.targetLanguage ?? "es");
    return {
      taskType: "fill-blank-target",
      displayText,
      contextText: sentence || undefined,
      instruction: `Complete the ${languageName} sentence`,
      inputLanguage: "target",
      expectedAnswers: uniqueNonEmpty(exercise.expectedParts),
      highlightSegments: [{ text: displayText }],
      bubbleActiveText: displayText,
    };
  }

  if (exercise.type === "meaning-to-chunk") {
    const highlightedTarget = resolveHighlightedTarget(
      exercise,
      uniqueNonEmpty(exercise.expectedParts)
    );
    const expectedAnswers = uniqueNonEmpty([
      ...exercise.expectedParts,
      ...exercise.targetChunks.map((chunk) => getExerciseSurfaceText(chunk)),
    ]);
    const languageName = getLanguageDisplayName(exercise.targetLanguage ?? "es");
    const task = buildChunkTargetTask({
      sentence,
      highlightedTarget,
      expectedAnswers,
      contextText: prompt || undefined,
      targetLanguage: exercise.targetLanguage,
      instruction: sentence
        ? chunkTargetInstruction(highlightedTarget, exercise.targetLanguage)
        : `Type the ${languageName} word or phrase`,
    });
    if (sentence) {
      return task;
    }
    return {
      ...task,
      displayText: prompt || highlightedTarget,
      highlightSegments: [{ text: prompt || highlightedTarget }],
      bubbleActiveText: highlightedTarget,
    };
  }

  const expectedAnswers = uniqueNonEmpty(exercise.expectedParts);
  const highlightedTarget = resolveHighlightedTarget(exercise, expectedAnswers);

  if (sentence && expectedMatchesFullSentence(expectedAnswers, sentence)) {
    return buildFullSentenceTargetTask({
      sentence,
      englishCue: prompt || sentence,
      expectedAnswers,
      targetLanguage: exercise.targetLanguage,
    });
  }

  if (sentence && isChunkOnlyExpected(expectedAnswers, sentence)) {
    return buildChunkTargetTask({
      sentence,
      highlightedTarget,
      expectedAnswers,
      contextText: prompt || undefined,
      targetLanguage: exercise.targetLanguage,
    });
  }

  if (prompt && !sentence) {
    const languageName = getLanguageDisplayName(exercise.targetLanguage ?? "es");
    return {
      taskType: "full-sentence-target",
      displayText: prompt,
      instruction: `Type the full ${languageName} sentence`,
      inputLanguage: "target",
      expectedAnswers,
      highlightSegments: [{ text: prompt }],
      bubbleActiveText: prompt,
    };
  }

  const languageName = getLanguageDisplayName(exercise.targetLanguage ?? "es");
  const draftTask: ComicActiveRecallTask = {
    taskType: "full-sentence-target",
    displayText: sentence || prompt,
    contextText: sentence || undefined,
    instruction: `Type the full ${languageName} sentence`,
    inputLanguage: "target",
    expectedAnswers,
    highlightSegments: [{ text: sentence || prompt }],
    bubbleActiveText: sentence || prompt,
  };

  const validation = validateActiveRecallTask(draftTask);
  if (!validation.valid && validation.fallbackTask) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[ComicActiveRecall] Invalid task; falling back to safer prompt:",
        validation.issues.join("; ")
      );
    }
    return validation.fallbackTask;
  }

  return draftTask;
}

export function buildComicActiveRecallPrompt(
  exercise: ComicActiveRecallExerciseInput
): ComicActiveRecallPrompt {
  return taskToPrompt(resolveComicActiveRecallTask(exercise));
}

export function getComicActiveRecallBubbleActiveText(
  exercise: ComicActiveRecallExerciseInput
): string {
  return resolveComicActiveRecallTask(exercise).bubbleActiveText;
}

export function getComicActiveRecallInputPlaceholder(
  task: ComicActiveRecallTask,
  targetLanguage?: string
): string {
  if (task.inputLanguage === "english") {
    if (task.taskType === "chunk-meaning") {
      return "Type the English meaning…";
    }
    return "Type the English translation…";
  }
  return `Type in ${getLanguageDisplayName(targetLanguage ?? "es")}…`;
}

export function getComicActiveRecallExpectedAnswerLabel(
  taskType: ComicActiveRecallTaskType
): string {
  switch (taskType) {
    case "full-sentence-target":
      return "Expected full sentence:";
    case "fill-blank-target":
      return "Expected missing word/phrase:";
    case "chunk-meaning":
      return "Expected meaning:";
    case "chunk-target":
      return "Expected word/phrase:";
    case "english-translation":
      return "Expected translation:";
    default:
      return "Expected answer:";
  }
}
