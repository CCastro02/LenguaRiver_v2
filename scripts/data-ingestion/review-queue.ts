import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

type ConvertedLessonWord = {
  text: string;
  translation: string;
  baseForm: string;
  formality: "formal" | "informal" | "neutral";
};

type ConvertedLessonSentence = {
  text: string;
  translation: string;
  words: ConvertedLessonWord[];
};

type ConvertedLesson = {
  id: string;
  language: "es" | "ru";
  title: string;
  objective: string;
  sentences: ConvertedLessonSentence[];
};

type ConvertedEntry = {
  lesson: ConvertedLesson;
  warnings: string[];
};

type ConvertedLessonsFile = {
  converted: ConvertedEntry[];
};

type ReviewDecision = "approve" | "reject" | "skip";

const DEFAULT_CONVERTED_PATH = "./scripts/data-ingestion/output/converted-lessons.json";
const DEFAULT_APPROVED_PATH = "./scripts/data-ingestion/output/approved-lessons.json";
const DEFAULT_REJECTED_PATH = "./scripts/data-ingestion/output/rejected-lessons.json";

function parseArgs(argv: string[]): {
  convertedPath: string;
  approvedPath: string;
  rejectedPath: string;
  decisions?: string[];
} {
  const args = new Map<string, string>();
  argv.forEach((arg) => {
    const [key, value] = arg.split("=");
    if (key && value) {
      args.set(key, value);
    }
  });
  const decisions = args.get("--decisions")?.split(",").map((value) => value.trim().toLowerCase());
  return {
    convertedPath: args.get("--input") ?? DEFAULT_CONVERTED_PATH,
    approvedPath: args.get("--approved") ?? DEFAULT_APPROVED_PATH,
    rejectedPath: args.get("--rejected") ?? DEFAULT_REJECTED_PATH,
    decisions: decisions && decisions.length > 0 ? decisions : undefined,
  };
}

function readConvertedLessons(path: string): ConvertedEntry[] {
  const resolved = resolve(path);
  if (!existsSync(resolved)) {
    throw new Error(`Converted lessons file not found: ${resolved}`);
  }
  const raw = readFileSync(resolved, "utf-8");
  const parsed = JSON.parse(raw) as ConvertedLessonsFile;
  return parsed.converted ?? [];
}

function normalizeDecision(value: string): ReviewDecision | null {
  if (value === "a" || value === "approve") {
    return "approve";
  }
  if (value === "r" || value === "reject") {
    return "reject";
  }
  if (value === "s" || value === "skip") {
    return "skip";
  }
  return null;
}

function printLesson(entry: ConvertedEntry): void {
  const { lesson, warnings } = entry;
  console.log("\n========================================");
  console.log(`ID: ${lesson.id}`);
  console.log(`Title: ${lesson.title}`);
  console.log(`Objective: ${lesson.objective}`);
  if (warnings.length > 0) {
    console.log(`Warnings: ${warnings.join(" | ")}`);
  }
  console.log("Sentences:");
  lesson.sentences.forEach((sentence, sentenceIndex) => {
    console.log(`  ${sentenceIndex + 1}. ${sentence.text}`);
    console.log(`     Translation: ${sentence.translation}`);
    console.log("     Chunks:");
    sentence.words.forEach((word) => {
      console.log(
        `       - ${word.text} (base: ${word.baseForm}, formality: ${word.formality}, translation: ${word.translation})`
      );
    });
  });
}

async function runReviewQueue(): Promise<void> {
  const { convertedPath, approvedPath, rejectedPath, decisions } = parseArgs(process.argv.slice(2));
  const entries = readConvertedLessons(convertedPath);
  const approved: ConvertedEntry[] = [];
  const rejected: ConvertedEntry[] = [];

  const rl = createInterface({ input, output });
  try {
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      printLesson(entry);

      let decision: ReviewDecision | null = null;
      if (decisions && decisions[index]) {
        decision = normalizeDecision(decisions[index]);
      }

      while (!decision) {
        const answer = await rl.question("Decision [a=approve, r=reject, s=skip]: ");
        decision = normalizeDecision(answer.trim().toLowerCase());
      }

      if (decision === "approve") {
        approved.push(entry);
        console.log("-> Approved");
      } else if (decision === "reject") {
        rejected.push(entry);
        console.log("-> Rejected");
      } else {
        console.log("-> Skipped");
      }
    }
  } finally {
    rl.close();
  }

  writeFileSync(resolve(approvedPath), `${JSON.stringify({ approved }, null, 2)}\n`, "utf-8");
  writeFileSync(resolve(rejectedPath), `${JSON.stringify({ rejected }, null, 2)}\n`, "utf-8");

  console.log(`\nApproved lessons written: ${resolve(approvedPath)}`);
  console.log(`Rejected lessons written: ${resolve(rejectedPath)}`);
}

runReviewQueue().catch((error) => {
  console.error("Review queue failed:", error);
  process.exit(1);
});

