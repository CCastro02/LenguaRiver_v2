/**
 * Validates lesson sentence/chunk pairs after normalization rules.
 * Run: `npm run verify:lesson-chunks`
 */
import { lessonsRaw } from "@/lib/lesson-data";
import {
  autoFixChunk,
  validateChunk,
  type ChunkNormalizerLanguage,
} from "@/lib/chunk-normalizer";

function baseNormalize(text: string): string {
  return text.toLowerCase().trim();
}

export type ChunkValidationIssue = {
  lessonId: string;
  sentence: string;
  chunk: string;
  exerciseAnchor?: string;
  normalizedChunk?: string;
  reason: string;
};

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

function stripEdgePunctuation(text: string): string {
  return text.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "");
}

function surfaceInSentence(sentence: string, surface: string): boolean {
  const needle = stripAccents(stripEdgePunctuation(surface.toLowerCase().trim()));
  if (!needle) {
    return false;
  }
  const haystack = stripAccents(sentence.toLowerCase());
  return haystack.includes(needle);
}

function sentenceIsPatternTemplate(sentence: string): boolean {
  return sentence.includes("___");
}

export function collectLessonChunkIssues(): ChunkValidationIssue[] {
  const issues: ChunkValidationIssue[] = [];

  for (const lesson of lessonsRaw) {
    const language: ChunkNormalizerLanguage = lesson.language === "ru" ? "ru" : "es";
    for (const sentence of lesson.sentences) {
      for (const word of sentence.words) {
        const chunk = word.text.trim();
        const fix = autoFixChunk(sentence.text, chunk, { language, lessonId: lesson.id });
        const finalText = fix.text;
        const anchor =
          fix.exerciseAnchorText &&
          baseNormalize(fix.exerciseAnchorText) !== baseNormalize(finalText)
            ? fix.exerciseAnchorText
            : word.exerciseAnchorText;
        const reasons: string[] = [];

        if (fix.warning) {
          reasons.push(fix.warning);
        }
        if (!validateChunk(sentence.text, finalText)) {
          reasons.push("validateChunk failed on normalized text");
        }
        if (finalText.includes("___")) {
          const templateSentence = sentenceIsPatternTemplate(sentence.text);
          if (!templateSentence && (!anchor || !surfaceInSentence(sentence.text, anchor))) {
            reasons.push("pattern chunk missing valid exerciseAnchor in sentence");
          }
        } else if (!surfaceInSentence(sentence.text, finalText)) {
          reasons.push("chunk not found in sentence");
        }
        if (anchor && !surfaceInSentence(sentence.text, anchor)) {
          reasons.push("exerciseAnchor not in sentence");
        }

        if (reasons.length > 0) {
          issues.push({
            lessonId: lesson.id,
            sentence: sentence.text,
            chunk,
            exerciseAnchor: anchor,
            normalizedChunk: finalText !== chunk ? finalText : undefined,
            reason: reasons.join("; "),
          });
        }
      }
    }
  }

  return issues;
}

function main(): number {
  const issues = collectLessonChunkIssues();
  const byLesson = new Map<string, ChunkValidationIssue[]>();
  for (const issue of issues) {
    const list = byLesson.get(issue.lessonId) ?? [];
    list.push(issue);
    byLesson.set(issue.lessonId, list);
  }

  console.log("Lesson chunk validation");
  console.log("-----------------------");
  console.log(`Invalid chunk pairs: ${issues.length}`);
  console.log(`Lessons affected: ${byLesson.size}`);
  console.log("");

  const lessonIds = [...byLesson.keys()].sort((a, b) => a.localeCompare(b));
  for (const lessonId of lessonIds) {
    const list = byLesson.get(lessonId) ?? [];
    console.log(`${lessonId} (${list.length})`);
    for (const row of list) {
      console.log(`  chunk: "${row.chunk}"`);
      if (row.normalizedChunk) {
        console.log(`  normalized: "${row.normalizedChunk}"`);
      }
      if (row.exerciseAnchor) {
        console.log(`  exerciseAnchor: "${row.exerciseAnchor}"`);
      }
      console.log(`  reason: ${row.reason}`);
      const preview =
        row.sentence.length > 72 ? `${row.sentence.slice(0, 72)}…` : row.sentence;
      console.log(`  sentence: "${preview}"`);
    }
    console.log("");
  }

  return issues.length > 0 ? 1 : 0;
}

process.exit(main());
