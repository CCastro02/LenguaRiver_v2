"use server";

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ApprovalResult, GlossLessonDraft } from "./types";

type RawLessonWord = {
  text: string;
  translation: string;
  type: "core" | "interest" | "person-name";
};

type RawLessonSentence = {
  text: string;
  translation: string;
  contextLabel?: string;
  audioPlaceholder: string;
  words: RawLessonWord[];
};

type RawLessonDraftShape = {
  id: string;
  sourceType: "generated";
  language: "es" | "ru";
  title: string;
  topic: string;
  trackType: "language-specific";
  required: false;
  specializationType: "culture";
  objective: string;
  coreWords: string[];
  interestWords: string[];
  sentences: RawLessonSentence[];
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[!?.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  items.forEach((item) => {
    const key = normalize(item);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(item.trim());
  });
  return out;
}

function isLikelyPersonName(chunk: string): boolean {
  const t = chunk.trim();
  if (!t) return false;
  if (t.includes(" ")) return false;
  if (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/u.test(t)) return true;
  if (/^[А-ЯЁ][а-яё]+$/u.test(t)) return true;
  return false;
}

function extractChunkPrefix(patternChunk: string): string {
  return patternChunk
    .toLowerCase()
    .replace("___", "")
    .replace(/[?¿]/g, "")
    .trim();
}

function sentenceWordsFromChunks(sentence: string, chunks: string[]): RawLessonWord[] {
  const normalizedSentence = normalize(sentence);
  const usable = chunks
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .filter((chunk) => {
      if (chunk.includes("___")) {
        return normalizedSentence.includes(extractChunkPrefix(chunk));
      }
      return normalizedSentence.includes(normalize(chunk));
    })
    .slice(0, 3);

  const selected = usable.length > 0 ? usable : chunks.slice(0, 1);
  return selected.map((chunk) => ({
    text: chunk,
    translation: chunk,
    // Generated lessons are optional extra practice; keep non-name chunks as interest.
    type: isLikelyPersonName(chunk) ? "person-name" : "interest",
  }));
}

function toRawLesson(draft: GlossLessonDraft): RawLessonDraftShape {
  const cleanSentences = dedupe(draft.sentences).slice(0, 5);
  const sentences: RawLessonSentence[] = cleanSentences.map((sentence) => ({
    text: sentence,
    translation: sentence,
    contextLabel: draft.context,
    audioPlaceholder: "[Audio coming soon]",
    words: sentenceWordsFromChunks(sentence, draft.chunks),
  }));

  const practiceWords = dedupe(draft.chunks)
    .filter((chunk) => !isLikelyPersonName(chunk))
    .slice(0, 8);

  return {
    id: draft.id,
    sourceType: "generated",
    language: draft.language === "ru" ? "ru" : "es",
    title: draft.title,
    topic: draft.topicSuggestion,
    trackType: "language-specific",
    required: false,
    specializationType: "culture",
    objective: draft.objective,
    coreWords: [],
    interestWords: practiceWords,
    sentences,
  };
}

function hasLessonId(lessonDataContent: string, id: string): boolean {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const idRegex = new RegExp(`(?:id|"id")\\s*:\\s*"${escaped}"`, "u");
  return idRegex.test(lessonDataContent);
}

function appendToGeneratedLessonsFile(fileContent: string, lessonObject: RawLessonDraftShape): string {
  const closeIndex = fileContent.lastIndexOf("];");
  if (closeIndex === -1) {
    throw new Error("generated-lessons.ts format is invalid.");
  }

  const beforeClose = fileContent.slice(0, closeIndex);
  const hasExisting = beforeClose.includes("{");
  const jsonObject = JSON.stringify(lessonObject, null, 2)
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
  const insertion = hasExisting ? `,\n${jsonObject}\n` : `\n${jsonObject}\n`;
  return `${beforeClose}${insertion}${fileContent.slice(closeIndex)}`;
}

export async function approveGlossDraft(draft: GlossLessonDraft): Promise<ApprovalResult> {
  const root = process.cwd();
  const generatedPath = join(root, "lib", "generated-lessons.ts");
  const lessonDataPath = join(root, "lib", "lesson-data.ts");

  const [generatedContent, lessonDataContent] = await Promise.all([
    readFile(generatedPath, "utf-8"),
    readFile(lessonDataPath, "utf-8"),
  ]);

  if (hasLessonId(generatedContent, draft.id) || hasLessonId(lessonDataContent, draft.id)) {
    return {
      ok: false,
      message: `Duplicate ID detected: ${draft.id}. Approval blocked.`,
    };
  }

  const lessonObject = toRawLesson(draft);
  const nextContent = appendToGeneratedLessonsFile(generatedContent, lessonObject);
  await writeFile(generatedPath, nextContent, "utf-8");

  return {
    ok: true,
    message: `Approved ${draft.id} and appended to lib/generated-lessons.ts`,
  };
}
