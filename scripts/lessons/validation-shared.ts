import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { lessons as existingLessons } from "../../lib/lesson-data";

export type BatchLessonWord = {
  text: string;
  exerciseAnchorText?: string;
};

export type BatchLessonSentence = {
  text: string;
  words?: BatchLessonWord[];
};

export type BatchLesson = {
  id: string;
  topic: string;
  title: string;
  objective: string;
  sourceType?: string;
  language?: string;
  contextGroup?: string;
  context?: string;
  scenarioFamily?: string;
  scenarioTitle?: string;
  tier?: "easy" | "medium" | "real";
  themeTags?: string[];
  difficultyProfile?: {
    unknownWordTarget?: number;
    speechSpeed?: "slow" | "normal" | "real";
    ambiguity?: "low" | "medium" | "high";
  };
  coreWords?: string[];
  sentences: BatchLessonSentence[];
};

export type ValidationContext = {
  newLessons: BatchLesson[];
  existingLessons: BatchLesson[];
  warnings: string[];
  errors: string[];
  overlapRows: OverlapRow[];
  topicCoverage: Record<string, TopicCoverage>;
};

export type OverlapRow = {
  kind: "new-vs-existing" | "new-vs-new";
  leftId: string;
  rightId: string;
  topicMatch: boolean;
  scenarioScore: number;
  chunkScore: number;
  duplicatedSentenceCount: number;
  sharedIntents: string[];
};

type IntentRule = {
  intent: string;
  patterns: RegExp[];
};

type TopicCoverage = {
  lessonCount: number;
  intentCounts: Record<string, number>;
  missingIntents: string[];
};

const DEFAULT_BATCH_IDS_FILE = path.join(process.cwd(), "scripts", "lessons", "new-batch.ids.json");

const INTENT_RULES: IntentRule[] = [
  { intent: "order", patterns: [/\b(order|orden|pedir|pido|quiero)\b/i] },
  { intent: "ask", patterns: [/\b(ask|pregunt|d[óo]nde|cu[aá]nto|tiene|puede)\b/i] },
  { intent: "pay", patterns: [/\b(pay|pagar|cuenta|total|factura|cobrar)\b/i] },
  { intent: "help", patterns: [/\b(help|ayuda|polic[ií]a|doctor|emergenc|entiendo)\b/i] },
  { intent: "find", patterns: [/\b(find|busco|buscar|encontrar|d[óo]nde est[aá])\b/i] },
  { intent: "confirm", patterns: [/\b(confirm|confirmar|verdad|correct|seguro)\b/i] },
  { intent: "introduce", patterns: [/\b(me llamo|soy|mucho gusto|de d[óo]nde)\b/i] },
  { intent: "work", patterns: [/\b(work|trabajo|horario|turno|oficina)\b/i] },
  { intent: "feel", patterns: [/\b(feel|me siento|estoy)\b/i] },
];

const TOPIC_REQUIRED_INTENTS: Record<string, string[]> = {
  Introductions: ["introduce", "ask", "feel"],
  "Ordering Food": ["order", "ask", "pay"],
  Directions: ["ask", "find", "confirm"],
  Shopping: ["find", "ask", "pay"],
  Hotel: ["ask", "find", "pay"],
  "Emergencies & Help": ["help", "ask", "feel"],
  "Job & Hobbies": ["work", "ask", "feel"],
};

const VALID_TIERS = new Set(["easy", "medium", "real"]);
const VALID_CONTEXT_GROUPS = new Set([
  "Public Spaces",
  "Institutional",
  "Food & Drink",
  "Social Spaces",
  "Residential",
  "Residential / Living",
  "General",
]);
const VALID_CONTEXTS = new Set([
  "Park",
  "School",
  "Classroom",
  "Work",
  "Office",
  "Study Hall",
  "Coffee Shop",
  "Cafe",
  "Restaurant",
  "Street Vendor",
  "Food Truck",
  "Gym",
  "Party",
  "Friend / Family",
  "Home",
  "New House",
  "New City",
  "Neighborhood",
  "Neighbor / Neighborhood",
  "Home / Neighborhood",
  "Clarification Basics",
  "General",
]);

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isAllowedLabel(value: string | undefined, allowed: Set<string>): boolean {
  if (!value?.trim()) {
    return false;
  }
  const normalizedValue = normalizeLabel(value);
  for (const option of allowed) {
    if (normalizeLabel(option) === normalizedValue) {
      return true;
    }
  }
  return false;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\s?]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): Set<string> {
  const tokens = normalizeText(text)
    .split(/\s+/)
    .filter((token) => token.length > 1);
  return new Set(tokens);
}

function sentenceSet(lesson: BatchLesson): Set<string> {
  return new Set(lesson.sentences.map((sentence) => normalizeText(sentence.text)));
}

function chunkSet(lesson: BatchLesson): Set<string> {
  const chunks = new Set<string>();
  (lesson.coreWords ?? []).forEach((coreWord) => {
    const cleaned = normalizeText(coreWord);
    if (cleaned) chunks.add(cleaned);
  });
  lesson.sentences.forEach((sentence) => {
    (sentence.words ?? []).forEach((word) => {
      const cleaned = normalizeText(word.exerciseAnchorText ?? word.text);
      if (cleaned) chunks.add(cleaned);
    });
  });
  return chunks;
}

function extractIntents(lesson: BatchLesson): Set<string> {
  const haystack = `${lesson.title}\n${lesson.objective}\n${lesson.sentences.map((s) => s.text).join(" ")}`;
  const intents = new Set<string>();
  for (const rule of INTENT_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(haystack))) {
      intents.add(rule.intent);
    }
  }
  return intents;
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) {
      overlap += 1;
    }
  }
  return overlap / Math.min(a.size, b.size);
}

function sentenceDuplicateCount(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const sentence of a) {
    if (b.has(sentence)) {
      count += 1;
    }
  }
  return count;
}

const PARTICIPANT_ROLE_PATTERNS: Array<{ role: string; pattern: RegExp }> = [
  { role: "stranger", pattern: /\b(stranger|desconocid[oa])\b/i },
  { role: "neighbor", pattern: /\b(neighbor|vecin[oa])\b/i },
  { role: "coworker", pattern: /\b(coworker|colega|equipo|oficina|client[ea])\b/i },
  { role: "classmate", pattern: /\b(classmate|clase|estudiant|profesor|teacher)\b/i },
  { role: "friend", pattern: /\b(friend|amig[oa]s?)\b/i },
];

function lessonNarrativeText(lesson: BatchLesson): string {
  return `${lesson.title} ${lesson.objective} ${lesson.sentences.map((s) => s.text).join(" ")}`;
}

function participantRoles(lesson: BatchLesson): Set<string> {
  const text = lessonNarrativeText(lesson);
  const roles = new Set<string>();
  for (const rolePattern of PARTICIPANT_ROLE_PATTERNS) {
    if (rolePattern.pattern.test(text)) {
      roles.add(rolePattern.role);
    }
  }
  return roles;
}

function objectiveSimilarity(a: BatchLesson, b: BatchLesson): number {
  return overlapScore(tokenize(a.objective), tokenize(b.objective));
}

const TITLE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "de",
  "del",
  "el",
  "en",
  "for",
  "in",
  "la",
  "los",
  "of",
  "the",
  "to",
  "y",
]);

function titleTokens(value: string): Set<string> {
  const normalized = normalizeText(value);
  return new Set(
    normalized
      .split(/\s+/)
      .filter((token) => token.length > 1)
      .filter((token) => !TITLE_STOP_WORDS.has(token))
  );
}

function titleScenarioSimilarity(title: string, scenarioTitle: string): number {
  return overlapScore(titleTokens(title), titleTokens(scenarioTitle));
}

function settingSignature(lesson: BatchLesson): string {
  const contextGroup = normalizeLabel(lesson.contextGroup ?? "unknown");
  const contextMeta = normalizeLabel(lesson.context ?? "unknown");
  return `${contextGroup}::${contextMeta}`;
}

function hasRoleDrift(base: BatchLesson, compare: BatchLesson): boolean {
  const baseRoles = participantRoles(base);
  const compareRoles = participantRoles(compare);
  if (!baseRoles.size || !compareRoles.size) {
    return false;
  }
  for (const role of baseRoles) {
    if (compareRoles.has(role)) {
      return false;
    }
  }
  return true;
}

function lessonStructureSignature(lesson: BatchLesson): string {
  const sentenceShape = lesson.sentences
    .map((sentence) => normalizeText(sentence.text))
    .filter(Boolean)
    .join(" || ");
  const chunkShape = lesson.sentences
    .flatMap((sentence) => (sentence.words ?? []).map((word) => normalizeText(word.exerciseAnchorText ?? word.text)))
    .filter(Boolean)
    .join(" || ");
  return `${sentenceShape} ### ${chunkShape}`;
}

function scenarioScore(a: BatchLesson, b: BatchLesson): number {
  const titleObjectiveA = tokenize(`${a.title} ${a.objective}`);
  const titleObjectiveB = tokenize(`${b.title} ${b.objective}`);
  const lexical = overlapScore(titleObjectiveA, titleObjectiveB);
  const intentsA = extractIntents(a);
  const intentsB = extractIntents(b);
  const intentSimilarity = overlapScore(intentsA, intentsB);
  return lexical * 0.6 + intentSimilarity * 0.4;
}

function parseArgValue(args: string[], key: string): string | undefined {
  const withEquals = args.find((arg) => arg.startsWith(`${key}=`));
  if (withEquals) {
    return withEquals.slice(key.length + 1);
  }
  const index = args.findIndex((arg) => arg === key);
  if (index >= 0 && args[index + 1]) {
    return args[index + 1];
  }
  return undefined;
}

function validateTierMetadata(
  newLessons: BatchLesson[],
  existingLessonsPool: BatchLesson[],
  warnings: string[],
  errors: string[]
): void {
  const tieredLessons = newLessons.filter(
    (lesson) =>
      lesson.contextGroup !== undefined ||
      lesson.context !== undefined ||
      lesson.scenarioFamily !== undefined ||
      lesson.scenarioTitle !== undefined ||
      lesson.tier !== undefined ||
      lesson.themeTags !== undefined ||
      lesson.difficultyProfile !== undefined
  );

  for (const lesson of tieredLessons) {
    if (lesson.contextGroup && !isAllowedLabel(lesson.contextGroup, VALID_CONTEXT_GROUPS)) {
      errors.push(
        `Invalid contextGroup naming (${lesson.id}): "${lesson.contextGroup}" is not in allowed set`
      );
    }
    if (lesson.context && !isAllowedLabel(lesson.context, VALID_CONTEXTS)) {
      errors.push(`Invalid context naming (${lesson.id}): "${lesson.context}" is not in allowed set`);
    }
    if (lesson.sentences.length < 5) {
      warnings.push(
        `Conversation length under 5 lines (${lesson.id}): got ${lesson.sentences.length} lines`
      );
    }

    const hasTierMetadata = lesson.tier !== undefined;
    if (hasTierMetadata && !lesson.scenarioFamily?.trim()) {
      errors.push(`Tier metadata invalid: scenarioFamily missing (${lesson.id})`);
    }
    if (hasTierMetadata && !lesson.scenarioTitle?.trim()) {
      errors.push(`Tier metadata invalid: scenarioTitle missing (${lesson.id})`);
    }
    if (hasTierMetadata && !lesson.contextGroup?.trim()) {
      errors.push(`Tier metadata invalid: contextGroup missing (${lesson.id})`);
    }
    if (hasTierMetadata && !lesson.context?.trim()) {
      errors.push(`Tier metadata invalid: context missing (${lesson.id})`);
    }
    if (hasTierMetadata && (!lesson.tier || !VALID_TIERS.has(lesson.tier))) {
      errors.push(`Tier metadata invalid: tier must be easy|medium|real (${lesson.id})`);
    }
    if (!hasTierMetadata && lesson.scenarioFamily?.trim()) {
      warnings.push(`Scenario family without tier will be treated as legacy (${lesson.id})`);
    }
    if (lesson.difficultyProfile) {
      if (typeof lesson.difficultyProfile.unknownWordTarget !== "number") {
        errors.push(`Tier metadata invalid: difficultyProfile.unknownWordTarget missing (${lesson.id})`);
      }
      if (!lesson.difficultyProfile.speechSpeed) {
        errors.push(`Tier metadata invalid: difficultyProfile.speechSpeed missing (${lesson.id})`);
      }
      if (!lesson.difficultyProfile.ambiguity) {
        errors.push(`Tier metadata invalid: difficultyProfile.ambiguity missing (${lesson.id})`);
      }
    }

    const titleObjective = `${lesson.title} ${lesson.objective}`.toLowerCase();
    if (titleObjective.includes("small talk")) {
      warnings.push(
        `Standalone small-talk pattern detected (${lesson.id}); embed small talk inside a scenario`
      );
    }
  }

  const targetFamilyKeys = new Set<string>();
  tieredLessons.forEach((lesson) => {
    if (!lesson.scenarioFamily?.trim()) {
      return;
    }
    targetFamilyKeys.add(`${lesson.topic}::${lesson.scenarioFamily.trim()}`);
  });

  const allTieredLessons = [...existingLessonsPool, ...newLessons].filter(
    (lesson) => lesson.scenarioFamily?.trim() && lesson.tier !== undefined
  );
  const byFamily = new Map<string, BatchLesson[]>();
  allTieredLessons.forEach((lesson) => {
    const key = `${lesson.topic}::${lesson.scenarioFamily!.trim()}`;
    if (!targetFamilyKeys.has(key)) {
      return;
    }
    const list = byFamily.get(key) ?? [];
    list.push(lesson);
    byFamily.set(key, list);
  });

  for (const [familyKey, lessonsInFamily] of byFamily.entries()) {
    const tierCounts = new Map<string, number>();
    lessonsInFamily.forEach((lesson) => {
      const tier = lesson.tier ?? "legacy";
      tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + 1);
    });

    for (const [tier, count] of tierCounts.entries()) {
      if (tier !== "legacy" && count > 1) {
        errors.push(`Duplicate tier in scenario family (${familyKey}): ${tier} appears ${count} times`);
      }
    }

    const hasEasy = (tierCounts.get("easy") ?? 0) > 0;
    const hasMedium = (tierCounts.get("medium") ?? 0) > 0;
    const hasReal = (tierCounts.get("real") ?? 0) > 0;
    const hasLegacy = (tierCounts.get("legacy") ?? 0) > 0;
    const hasStructured = hasEasy || hasMedium || hasReal;

    const scenarioTitles = new Set(lessonsInFamily.map((lesson) => lesson.scenarioTitle?.trim()).filter(Boolean));
    const contextGroups = new Set(lessonsInFamily.map((lesson) => lesson.contextGroup?.trim()).filter(Boolean));
    const contexts = new Set(lessonsInFamily.map((lesson) => lesson.context?.trim()).filter(Boolean));

    if (scenarioTitles.size > 1) {
      errors.push(`Conflicting scenario titles across tiers (${familyKey})`);
    }
    if (contextGroups.size > 1 || contexts.size > 1) {
      errors.push(`Inconsistent grouping for scenario family (${familyKey})`);
    }
    if (hasStructured && hasLegacy) {
      errors.push(`Mixed tiered and legacy lessons in scenario family (${familyKey})`);
    }

    if (hasReal && (!hasEasy || !hasMedium)) {
      errors.push(`Real tier without complete progression in scenario family (${familyKey})`);
    }
    if (hasMedium && !hasEasy) {
      errors.push(`Previous tier is empty: medium exists without easy (${familyKey})`);
    }
    if (hasReal && !hasMedium) {
      errors.push(`Previous tier is empty: real exists without medium (${familyKey})`);
    }
    if (hasStructured && !hasEasy) {
      errors.push(`Scenario family missing easy tier (${familyKey})`);
    }
    const enforceFullTierCompleteness = familyKey.startsWith("Introductions::");
    if (hasStructured && !hasMedium) {
      const msg = `Scenario family incomplete: medium tier missing (${familyKey})`;
      if (enforceFullTierCompleteness) {
        errors.push(msg);
      } else {
        warnings.push(msg);
      }
    }
    if (hasStructured && !hasReal) {
      const msg = `Scenario family incomplete: real tier missing (${familyKey})`;
      if (enforceFullTierCompleteness) {
        errors.push(msg);
      } else {
        warnings.push(msg);
      }
    }
    if (hasStructured && (tierCounts.get("easy") ?? 0) > 1) {
      errors.push(`Duplicate scenarioFamily within topic (${familyKey}) easy tier repeated`);
    }
    if (hasStructured && (tierCounts.get("medium") ?? 0) > 1) {
      errors.push(`Duplicate scenarioFamily within topic (${familyKey}) medium tier repeated`);
    }
    if (hasStructured && (tierCounts.get("real") ?? 0) > 1) {
      errors.push(`Duplicate scenarioFamily within topic (${familyKey}) real tier repeated`);
    }

    if (hasStructured) {
      const easyLesson = lessonsInFamily.find((lesson) => lesson.tier === "easy");
      const mediumLesson = lessonsInFamily.find((lesson) => lesson.tier === "medium");
      const realLesson = lessonsInFamily.find((lesson) => lesson.tier === "real");

      lessonsInFamily.forEach((lesson) => {
        const scenario = lesson.scenarioTitle?.trim() ?? "";
        const score = titleScenarioSimilarity(lesson.title, scenario);
        if (scenario && score < 0.2) {
          warnings.push(
            `Mixed or unrelated lesson title in scenario family (${familyKey}): "${lesson.title}" vs "${scenario}"`
          );
        }
      });

      if (easyLesson) {
        const easySignature = lessonStructureSignature(easyLesson);
        for (const compareTier of ["medium", "real"] as const) {
          const compareLesson = lessonsInFamily.find((lesson) => lesson.tier === compareTier);
          if (!compareLesson) {
            continue;
          }
          if (lessonStructureSignature(compareLesson) === easySignature) {
            warnings.push(
              `Tier scaffold warning: ${compareTier} has identical structure to easy (${familyKey})`
            );
          }
        }

        if (mediumLesson) {
          const mediumScenarioSimilarity = scenarioScore(easyLesson, mediumLesson);
          if (mediumScenarioSimilarity < 0.45) {
            warnings.push(
              `Medium diverges from easy intent (${familyKey}): scenario similarity ${(mediumScenarioSimilarity * 100).toFixed(0)}%`
            );
          }
          const mediumGoalSimilarity = objectiveSimilarity(easyLesson, mediumLesson);
          if (mediumGoalSimilarity < 0.2) {
            warnings.push(
              `Severe goal drift between easy and medium (${familyKey}): objective similarity ${(mediumGoalSimilarity * 100).toFixed(0)}%`
            );
          }
          if (mediumGoalSimilarity < 0.3) {
            warnings.push(
              `Conversation goal changes between easy and medium (${familyKey}): objective similarity ${(mediumGoalSimilarity * 100).toFixed(0)}%`
            );
          }
          if (hasRoleDrift(easyLesson, mediumLesson)) {
            warnings.push(`Participants changed between easy and medium (${familyKey})`);
          }
          if (settingSignature(easyLesson) !== settingSignature(mediumLesson)) {
            warnings.push(`Setting changed between easy and medium (${familyKey})`);
          }
        }

        if (realLesson) {
          const realScenarioSimilarity = scenarioScore(easyLesson, realLesson);
          if (realScenarioSimilarity < 0.45) {
            warnings.push(
              `Real introduces a new scenario (${familyKey}): scenario similarity ${(realScenarioSimilarity * 100).toFixed(0)}%`
            );
          }
          const realGoalSimilarity = objectiveSimilarity(easyLesson, realLesson);
          if (realGoalSimilarity < 0.2) {
            warnings.push(
              `Severe goal drift between easy and real (${familyKey}): objective similarity ${(realGoalSimilarity * 100).toFixed(0)}%`
            );
          }
          if (realGoalSimilarity < 0.3) {
            warnings.push(
              `Conversation goal changes between easy and real (${familyKey}): objective similarity ${(realGoalSimilarity * 100).toFixed(0)}%`
            );
          }
          if (hasRoleDrift(easyLesson, realLesson)) {
            warnings.push(`Participants changed between easy and real (${familyKey})`);
          }
          if (settingSignature(easyLesson) !== settingSignature(realLesson)) {
            warnings.push(`Setting changed between easy and real (${familyKey})`);
          }
        }
      }
      if (easyLesson && mediumLesson && realLesson) {
        const mediumToRealGoalSimilarity = objectiveSimilarity(mediumLesson, realLesson);
        if (mediumToRealGoalSimilarity < 0.2) {
          warnings.push(
            `Severe goal drift between medium and real (${familyKey}): objective similarity ${(mediumToRealGoalSimilarity * 100).toFixed(0)}%`
          );
        }
      }
    }
  }
}

function parseBatchIds(input: string): string[] {
  return input
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function parseBatchFile(filePath: string): BatchLesson[] {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const raw = readFileSync(absolutePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")) {
    return loadLessonsByIds(parsed as string[]);
  }
  if (Array.isArray(parsed)) {
    return parsed as BatchLesson[];
  }
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { lessons?: unknown }).lessons)) {
    return (parsed as { lessons: BatchLesson[] }).lessons;
  }
  throw new Error(`Unsupported batch file format: ${absolutePath}`);
}

function loadLessonsByIds(ids: string[]): BatchLesson[] {
  const byId = new Map(existingLessons.map((lesson) => [lesson.id, lesson]));
  return ids.map((id) => {
    const lesson = byId.get(id);
    if (!lesson) {
      throw new Error(`Batch ID not found in existing lessons: ${id}`);
    }
    return lesson as BatchLesson;
  });
}

function loadNewLessons(args: string[]): BatchLesson[] {
  const batchIdsInput = parseArgValue(args, "--ids");
  if (batchIdsInput) {
    return loadLessonsByIds(parseBatchIds(batchIdsInput));
  }

  const batchFileInput = parseArgValue(args, "--file");
  if (batchFileInput) {
    return parseBatchFile(batchFileInput);
  }

  if (existsSync(DEFAULT_BATCH_IDS_FILE)) {
    return parseBatchFile(DEFAULT_BATCH_IDS_FILE);
  }

  throw new Error(
    "No new lesson batch provided. Use --ids id1,id2 or --file scripts/lessons/new-batch.ids.json"
  );
}

export function loadValidationInput(args: string[]): { newLessons: BatchLesson[]; existing: BatchLesson[] } {
  const newLessons = loadNewLessons(args);
  const newIds = new Set(newLessons.map((lesson) => lesson.id));
  const existing = (existingLessons as BatchLesson[]).filter((lesson) => !newIds.has(lesson.id));
  return { newLessons, existing };
}

function topicCoverageSummary(allLessons: BatchLesson[]): Record<string, TopicCoverage> {
  const byTopic = new Map<string, BatchLesson[]>();
  allLessons.forEach((lesson) => {
    const list = byTopic.get(lesson.topic) ?? [];
    list.push(lesson);
    byTopic.set(lesson.topic, list);
  });

  const summary: Record<string, TopicCoverage> = {};
  for (const [topic, lessons] of byTopic.entries()) {
    const intentCounts: Record<string, number> = {};
    lessons.forEach((lesson) => {
      for (const intent of extractIntents(lesson)) {
        intentCounts[intent] = (intentCounts[intent] ?? 0) + 1;
      }
    });
    const required = TOPIC_REQUIRED_INTENTS[topic] ?? [];
    const missingIntents = required.filter((intent) => !intentCounts[intent]);
    summary[topic] = {
      lessonCount: lessons.length,
      intentCounts,
      missingIntents,
    };
  }
  return summary;
}

export function runValidation(newLessons: BatchLesson[], existing: BatchLesson[]): ValidationContext {
  const warnings: string[] = [];
  const errors: string[] = [];
  const overlapRows: OverlapRow[] = [];

  const seenNewIds = new Set<string>();
  const existingIds = new Set(existing.map((lesson) => lesson.id));
  for (const lesson of newLessons) {
    if (seenNewIds.has(lesson.id)) {
      errors.push(`Duplicate ID inside new batch: ${lesson.id}`);
    }
    seenNewIds.add(lesson.id);
    if (existingIds.has(lesson.id)) {
      errors.push(`Duplicate ID against existing lessons: ${lesson.id}`);
    }
  }

  for (const lesson of newLessons) {
    if (lesson.sourceType && lesson.sourceType !== "core") {
      warnings.push(`New lesson has non-core sourceType (${lesson.sourceType}): ${lesson.id}`);
    }
  }
  validateTierMetadata(newLessons, existing, warnings, errors);

  const existingPairs = newLessons.flatMap((newLesson) =>
    existing.map((existingLesson) => ({ left: newLesson, right: existingLesson, kind: "new-vs-existing" as const }))
  );
  const newPairs: Array<{ left: BatchLesson; right: BatchLesson; kind: "new-vs-new" }> = [];
  for (let i = 0; i < newLessons.length; i += 1) {
    for (let j = i + 1; j < newLessons.length; j += 1) {
      newPairs.push({ left: newLessons[i], right: newLessons[j], kind: "new-vs-new" });
    }
  }

  for (const pair of [...existingPairs, ...newPairs]) {
    const leftSentenceSet = sentenceSet(pair.left);
    const rightSentenceSet = sentenceSet(pair.right);
    const leftChunkSet = chunkSet(pair.left);
    const rightChunkSet = chunkSet(pair.right);
    const leftIntents = extractIntents(pair.left);
    const rightIntents = extractIntents(pair.right);
    const sharedIntents = [...leftIntents].filter((intent) => rightIntents.has(intent));
    const row: OverlapRow = {
      kind: pair.kind,
      leftId: pair.left.id,
      rightId: pair.right.id,
      topicMatch: pair.left.topic === pair.right.topic,
      scenarioScore: scenarioScore(pair.left, pair.right),
      chunkScore: overlapScore(leftChunkSet, rightChunkSet),
      duplicatedSentenceCount: sentenceDuplicateCount(leftSentenceSet, rightSentenceSet),
      sharedIntents,
    };
    overlapRows.push(row);

    if (row.topicMatch && row.scenarioScore >= 0.65) {
      warnings.push(
        `Scenario overlap (${(row.scenarioScore * 100).toFixed(0)}%) ${row.leftId} vs ${row.rightId} [${row.kind}]`
      );
    }
    if (row.chunkScore > 0.7) {
      warnings.push(
        `Chunk overlap >70% (${(row.chunkScore * 100).toFixed(0)}%) ${row.leftId} vs ${row.rightId} [${row.kind}]`
      );
    }
    if (row.duplicatedSentenceCount > 0) {
      warnings.push(
        `Sentence duplication (${row.duplicatedSentenceCount}) ${row.leftId} vs ${row.rightId} [${row.kind}]`
      );
    }
  }

  const coverage = topicCoverageSummary([...existing, ...newLessons]);
  for (const [topic, row] of Object.entries(coverage)) {
    for (const [intent, count] of Object.entries(row.intentCounts)) {
      if (count >= 4) {
        warnings.push(`Topic imbalance in "${topic}": ${count} lessons clustered around intent "${intent}"`);
      }
    }
    if (row.missingIntents.length > 0) {
      warnings.push(`Coverage gap in "${topic}": missing intents ${row.missingIntents.join(", ")}`);
    }
  }

  return {
    newLessons,
    existingLessons: existing,
    warnings,
    errors,
    overlapRows,
    topicCoverage: coverage,
  };
}

export function printValidationSummary(context: ValidationContext, label: string): void {
  const topOverlaps = [...context.overlapRows]
    .sort((a, b) => b.scenarioScore + b.chunkScore - (a.scenarioScore + a.chunkScore))
    .slice(0, 8)
    .map((row) => ({
      pair: `${row.leftId} <> ${row.rightId}`,
      kind: row.kind,
      scenarioScore: Number((row.scenarioScore * 100).toFixed(1)),
      chunkScore: Number((row.chunkScore * 100).toFixed(1)),
      duplicatedSentenceCount: row.duplicatedSentenceCount,
      sharedIntents: row.sharedIntents.join(", "),
    }));

  const summary = {
    status: context.errors.length > 0 ? "FAIL" : "PASS",
    label,
    newLessons: context.newLessons.length,
    existingLessons: context.existingLessons.length,
    errors: context.errors.length,
    warnings: context.warnings.length,
    topOverlaps,
    topicCoverage: context.topicCoverage,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (context.errors.length > 0) {
    console.log("\nFAIL reasons:");
    context.errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error}`);
    });
  }
  if (context.warnings.length > 0) {
    console.log("\nWarnings (manual review required before merge):");
    context.warnings.slice(0, 50).forEach((warning, index) => {
      console.log(`${index + 1}. ${warning}`);
    });
    if (context.warnings.length > 50) {
      console.log(`...and ${context.warnings.length - 50} more warnings`);
    }
  }
}
