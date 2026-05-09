import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type SupportedLanguage = "es" | "ru";

type InputChunk = {
  text?: string;
  translation?: string;
  baseForm?: string;
  formality?: "formal" | "informal" | "neutral";
  type?: "core" | "interest";
  partOfSpeech?: "noun" | "verb" | "adjective" | "phrase" | "preposition" | "pronoun" | "other";
  imageability?: "high" | "medium" | "low";
  repetitionPriority?: "high" | "medium" | "low";
};

type InputSentence = {
  text?: string;
  translation?: string;
  audioPlaceholder?: string;
  formality?: "formal" | "informal" | "neutral";
  words?: InputChunk[];
  chunks?: InputChunk[];
};

type ApprovedLesson = {
  id?: string;
  language?: SupportedLanguage;
  title?: string;
  topic?: string;
  objective?: string;
  trackType?: "core" | "language-specific" | "interest";
  required?: boolean;
  coreWords?: string[];
  interestWords?: string[];
  sentences?: InputSentence[];
};

type ApprovedEntry = {
  lesson?: ApprovedLesson;
  warnings?: string[];
};

type ApprovedLessonsFile = {
  approved?: ApprovedEntry[];
};

const APPROVED_PATH = "./scripts/data-ingestion/output/approved-lessons.json";
const LESSON_DATA_PATH = "./lib/lesson-data.ts";
const OUTPUT_PATH = "./scripts/data-ingestion/output/lesson-data.updated.ts";

type CoreTopicGroup =
  | "Introductions"
  | "Ordering Food"
  | "Directions"
  | "Shopping"
  | "Hotel"
  | "Emergencies & Help"
  | "Job & Hobbies";

function mapTopicToGroup(topic: string): CoreTopicGroup | null {
  const normalized = topic.toLowerCase();
  if (normalized.includes("introduc")) {
    return "Introductions";
  }
  if (normalized.includes("ordering food")) {
    return "Ordering Food";
  }
  if (normalized.includes("direction")) {
    return "Directions";
  }
  if (normalized.includes("shopping")) {
    return "Shopping";
  }
  if (normalized.includes("hotel") || normalized.includes("accommodation")) {
    return "Hotel";
  }
  if (normalized.includes("emergenc") || normalized.includes("help")) {
    return "Emergencies & Help";
  }
  if (normalized.includes("job") || normalized.includes("hobbies")) {
    return "Job & Hobbies";
  }
  return null;
}

function toLiteral(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function validateLesson(lesson: ApprovedLesson): string[] {
  const errors: string[] = [];
  if (!lesson.id?.trim()) {
    errors.push("missing id");
  }
  if (!lesson.title?.trim()) {
    errors.push("missing title");
  }
  if (!lesson.objective?.trim()) {
    errors.push("missing objective");
  }
  if (!lesson.sentences || lesson.sentences.length === 0) {
    errors.push("missing sentences");
  }
  lesson.sentences?.forEach((sentence, index) => {
    if (!sentence.text?.trim()) {
      errors.push(`sentence ${index + 1}: missing text`);
    }
    if (!sentence.translation?.trim()) {
      errors.push(`sentence ${index + 1}: missing translation`);
    }
    const chunks = sentence.chunks ?? sentence.words;
    if (!chunks || chunks.length === 0) {
      errors.push(`sentence ${index + 1}: missing chunks`);
      return;
    }
    chunks.forEach((chunk, chunkIndex) => {
      if (!chunk.text?.trim()) {
        errors.push(`sentence ${index + 1} chunk ${chunkIndex + 1}: missing chunk text`);
      }
    });
  });
  return errors;
}

function convertSentence(sentence: InputSentence): Record<string, unknown> {
  const chunks = (sentence.chunks ?? sentence.words ?? []).map((chunk) => ({
    text: chunk.text ?? "",
    translation: chunk.translation ?? `[translation needed: ${chunk.text ?? "chunk"}]`,
    type: chunk.type ?? "core",
    formality: chunk.formality ?? sentence.formality ?? "neutral",
    partOfSpeech: chunk.partOfSpeech ?? "phrase",
    imageability: chunk.imageability ?? "medium",
    repetitionPriority: chunk.repetitionPriority ?? "medium",
  }));
  return {
    text: sentence.text ?? "",
    translation: sentence.translation ?? "",
    formality: sentence.formality ?? "neutral",
    audioPlaceholder: sentence.audioPlaceholder ?? "[Audio coming soon]",
    words: chunks,
  };
}

function convertLessonToRaw(lesson: ApprovedLesson): string {
  const normalized = {
    id: lesson.id,
    language: lesson.language,
    title: lesson.title,
    topic: lesson.topic ?? lesson.title,
    trackType: lesson.trackType ?? "core",
    required: lesson.required ?? true,
    objective: lesson.objective,
    coreWords: lesson.coreWords ?? [],
    interestWords: lesson.interestWords ?? [],
    sentences: (lesson.sentences ?? []).map((sentence) => convertSentence(sentence)),
  };
  return toLiteral(normalized);
}

function findRawLessonsBounds(source: string): { start: number; end: number } {
  const anchor = "const rawLessons: RawLesson[] = [";
  const start = source.indexOf(anchor);
  if (start === -1) {
    throw new Error("Could not locate rawLessons array.");
  }
  const equalsIndex = source.indexOf("=", start);
  if (equalsIndex === -1) {
    throw new Error("Could not locate rawLessons assignment.");
  }
  const arrayStart = source.indexOf("[", equalsIndex);
  let depth = 0;
  for (let i = arrayStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "[") {
      depth += 1;
    } else if (ch === "]") {
      depth -= 1;
      if (depth === 0) {
        return { start: arrayStart, end: i };
      }
    }
  }
  throw new Error("Could not resolve rawLessons array bounds.");
}

type ExistingLessonInfo = {
  id: string;
  topic: string;
  start: number;
  end: number;
};

function extractExistingLessons(arrayContent: string): ExistingLessonInfo[] {
  const lessons: ExistingLessonInfo[] = [];
  let depth = 0;
  let objectStart = -1;
  for (let i = 0; i < arrayContent.length; i += 1) {
    const ch = arrayContent[i];
    if (ch === "{") {
      if (depth === 0) {
        objectStart = i;
      }
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0 && objectStart >= 0) {
        const objectEnd = i;
        const objectText = arrayContent.slice(objectStart, objectEnd + 1);
        const id = objectText.match(/id:\s*"([^"]+)"/)?.[1];
        const topic = objectText.match(/topic:\s*"([^"]+)"/)?.[1];
        if (id && topic) {
          lessons.push({ id, topic, start: objectStart, end: objectEnd + 1 });
        }
        objectStart = -1;
      }
    }
  }
  return lessons;
}

function run(): void {
  const approvedData = JSON.parse(readFileSync(resolve(APPROVED_PATH), "utf-8")) as ApprovedLessonsFile;
  const approvedEntries = approvedData.approved ?? [];
  const source = readFileSync(resolve(LESSON_DATA_PATH), "utf-8");
  const bounds = findRawLessonsBounds(source);
  const arrayContent = source.slice(bounds.start + 1, bounds.end);
  const existingLessons = extractExistingLessons(arrayContent);
  const existingIds = new Set(existingLessons.map((lesson) => lesson.id));

  const skippedDuplicates: string[] = [];
  const unknownTopics: string[] = [];
  const toInject: Array<{ lesson: ApprovedLesson; group: CoreTopicGroup | null }> = [];

  approvedEntries.forEach((entry) => {
    if (!entry.lesson) {
      return;
    }
    const errors = validateLesson(entry.lesson);
    if (errors.length > 0) {
      throw new Error(`Approved lesson ${entry.lesson.id ?? "(unknown)"} failed validation: ${errors.join(", ")}`);
    }
    const lessonId = entry.lesson.id as string;
    if (existingIds.has(lessonId)) {
      skippedDuplicates.push(lessonId);
      return;
    }
    const group = mapTopicToGroup(entry.lesson.topic ?? entry.lesson.title ?? "");
    if (!group) {
      unknownTopics.push(lessonId);
    }
    toInject.push({ lesson: entry.lesson, group });
  });

  let updatedArrayContent = arrayContent;
  let injectedCount = 0;

  toInject.forEach(({ lesson, group }) => {
    const objectLiteral = convertLessonToRaw(lesson);
    const existingNow = extractExistingLessons(updatedArrayContent);
    let insertionOffset = updatedArrayContent.length;
    if (group) {
      let lastInGroup: ExistingLessonInfo | undefined;
      existingNow.forEach((existing) => {
        if (mapTopicToGroup(existing.topic) === group) {
          lastInGroup = existing;
        }
      });
      if (lastInGroup) {
        insertionOffset = lastInGroup.end;
      }
    }

    const prefix = updatedArrayContent.slice(0, insertionOffset).trimEnd();
    const suffix = updatedArrayContent.slice(insertionOffset).trimStart();
    const needsComma = prefix.length > 0 && !prefix.trimEnd().endsWith(",");
    const injection = `${needsComma ? "," : ""}\n  ${objectLiteral.replace(/\n/g, "\n  ")}`;
    updatedArrayContent = `${prefix}${injection}${suffix ? `\n  ${suffix}` : "\n"}`;
    injectedCount += 1;
  });

  const updatedSource = `${source.slice(0, bounds.start + 1)}${updatedArrayContent}${source.slice(bounds.end)}`;
  writeFileSync(resolve(OUTPUT_PATH), updatedSource, "utf-8");

  console.log(`Injected lessons: ${injectedCount}`);
  console.log(`Skipped duplicates: ${skippedDuplicates.length}`);
  if (skippedDuplicates.length > 0) {
    console.log(`Duplicate IDs: ${skippedDuplicates.join(", ")}`);
  }
  console.log(`Unknown topics: ${unknownTopics.length}`);
  if (unknownTopics.length > 0) {
    console.log(`Unknown-topic lesson IDs: ${unknownTopics.join(", ")}`);
  }
}

run();

