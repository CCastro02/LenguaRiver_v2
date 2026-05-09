import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type ScoredScenario = {
  scenario: string;
  context: string;
  phrases: string[];
  score: number;
  breakdown: {
    reuse: number;
    simplicity: number;
    patterns: number;
    clarity: number;
  };
};

type ParsedTurnsRecord = {
  scenario: string;
  context: string;
  dialogueLines: string[];
  turns: Array<{ speaker: string; text: string }>;
  patternMatches?: string[];
};

type GlossLessonDraft = {
  id: string;
  language: string;
  title: string;
  topicSuggestion: string;
  context: string;
  scenario: string;
  objective: string;
  sentences: string[];
  chunks: string[];
  dominantPattern: string;
  scenarioIntent: string;
  source: "gloss";
  sourceScore: number;
  warnings: string[];
};

type ParsedArgs = {
  inputPath: string;
  turnsPath: string;
  outputPath: string;
  minScore: number;
  maxDrafts: number;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_INPUT = join(__dirname, "output", "gloss_scenarios_scored.json");
const DEFAULT_TURNS = join(__dirname, "output", "gloss_parsed_turns.json");
const DEFAULT_OUTPUT = join(__dirname, "output", "gloss_lesson_drafts.json");

const RECOGNIZED_PATTERNS: Array<{ label: string; intent: string; regex: RegExp }> = [
  { label: "quiero ___", intent: "request/order", regex: /\bquiero\s+\S+/iu },
  { label: "cuánto cuesta ___", intent: "price", regex: /\bcu[aá]nto\s+cuesta\s+\S+/iu },
  { label: "dónde está ___", intent: "location", regex: /\bd[oó]nde\s+est[aá]\s+\S*/iu },
  { label: "tiene ___", intent: "availability", regex: /\btiene\s+\S+/iu },
  { label: "puedo ___", intent: "permission", regex: /\bpuedo\s+\S+/iu },
  { label: "necesito ___", intent: "help/need", regex: /\bnecesito\s+\S+/iu },
  { label: "me siento ___", intent: "condition/state", regex: /\bme\s+siento\s+\S+/iu },
  { label: "estoy ___", intent: "condition/state", regex: /\bestoy\s+\S+/iu },
  {
    label: "confirmación/aclaración",
    intent: "confirmation/clarification",
    regex: /\b(verdad|correcto|claro|confirm|aclar|repetir)\b/iu,
  },
  { label: "queja", intent: "complaint", regex: /\b(mal|problema|equivocad|incorrecto|ruido)\b/iu },
  { label: "comparación", intent: "comparison", regex: /\b(mejor|peor|m[aá]s|menos)\b/iu },
  { label: "rechazo", intent: "refusal", regex: /\b(no quiero|no puedo|prefiero no)\b/iu },
  { label: "corrección", intent: "correction", regex: /\b(perd[oó]n|quise decir|corregir|no,)\b/iu },
  { label: "trabajo mucho", intent: "work", regex: /\btrabajo\s+mucho\b/iu },
  { label: "soy de ___", intent: "origin", regex: /\bsoy\s+de\s+\S+/iu },
  { label: "de dónde eres", intent: "origin", regex: /\bde\s+d[oó]nde\s+eres\b/iu },
];

const FIXED_HIGH_VALUE_PHRASES = ["hola", "gracias", "por favor", "sí", "no"];
const LESS_USED_INTENTS = new Set(["complaint", "confirmation/clarification", "comparison", "refusal", "correction"]);
const PER_TOPIC_INTENT_CAP: Record<string, number> = {
  "request/order": 1,
  price: 1,
  location: 1,
  "help/need": 1,
  "confirmation/clarification": 1,
};

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    inputPath: DEFAULT_INPUT,
    turnsPath: DEFAULT_TURNS,
    outputPath: DEFAULT_OUTPUT,
    minScore: 70,
    maxDrafts: 5,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input" || arg === "-i") {
      out.inputPath = resolve(argv[i + 1] ?? DEFAULT_INPUT);
      i += 1;
    } else if (arg === "--turns") {
      out.turnsPath = resolve(argv[i + 1] ?? DEFAULT_TURNS);
      i += 1;
    } else if (arg === "--output" || arg === "-o") {
      out.outputPath = resolve(argv[i + 1] ?? DEFAULT_OUTPUT);
      i += 1;
    } else if (arg === "--min-score") {
      out.minScore = Number(argv[i + 1] ?? "70");
      i += 1;
    } else if (arg === "--max-drafts") {
      out.maxDrafts = Math.max(1, Number(argv[i + 1] ?? "5"));
      i += 1;
    }
  }
  return out;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[“”"]/g, "").replace(/\s+/g, " ").trim();
}

function simplifyLine(text: string): string {
  return text
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\([^\)]*\b(noise|music|pause|static|laughs?)\b[^\)]*\)/giu, " ")
    .replace(/^[-*]\s*/u, "")
    .replace(/^([A-Za-z0-9_]+|Speaker\s*\d+)\s*[:\-]\s+/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitIntoCandidateSentences(text: string): string[] {
  return simplifyLine(text)
    .split(/[.!?]+/u)
    .map((x) => x.trim())
    .filter(Boolean);
}

function isLikelyPersonNameToken(phrase: string): boolean {
  const t = phrase.trim();
  if (!t) return false;
  const tokens = t.split(/\s+/u);
  if (tokens.length > 1) return false;
  if (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/u.test(t)) return true;
  if (/^[А-ЯЁ][а-яё]+$/u.test(t)) return true;
  return false;
}

function detectPatterns(phrase: string): string[] {
  const p = normalize(phrase);
  return RECOGNIZED_PATTERNS.filter((r) => r.regex.test(p)).map((r) => r.label);
}

function detectPatternHits(text: string): Array<{ label: string; intent: string }> {
  const normalized = normalize(text);
  return RECOGNIZED_PATTERNS.filter((rule) => rule.regex.test(normalized)).map((rule) => ({
    label: rule.label,
    intent: rule.intent,
  }));
}

function inferDominantPatternAndIntent(row: ScoredScenario, turnRecord?: ParsedTurnsRecord): {
  dominantPattern: string;
  scenarioIntent: string;
  matchedIntents: string[];
} {
  const corpus = [row.scenario, row.context, ...row.phrases, ...(turnRecord?.dialogueLines ?? [])].join(" ");
  const hits = detectPatternHits(corpus);
  if (hits.length === 0) {
    return {
      dominantPattern: "unclassified",
      scenarioIntent: "unclassified",
      matchedIntents: ["unclassified"],
    };
  }

  const patternCounts = new Map<string, number>();
  const intentCounts = new Map<string, number>();
  hits.forEach((hit) => {
    patternCounts.set(hit.label, (patternCounts.get(hit.label) ?? 0) + 1);
    intentCounts.set(hit.intent, (intentCounts.get(hit.intent) ?? 0) + 1);
  });

  const dominantPattern = [...patternCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unclassified";
  const scenarioIntent = [...intentCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unclassified";
  const matchedIntents = [...new Set(hits.map((hit) => hit.intent))];
  return { dominantPattern, scenarioIntent, matchedIntents };
}

function inferTopicSuggestion(scenario: string, context: string): string {
  const blob = `${scenario} ${context}`.toLowerCase();
  if (/\b(food|cafe|café|restaurant|order)\b/u.test(blob)) return "Ordering Food";
  if (/\b(street|direction|station|location|where)\b/u.test(blob)) return "Directions";
  if (/\b(hotel|front desk|room|accommodation)\b/u.test(blob)) return "Hotel";
  if (/\b(sick|help|lost|emergency)\b/u.test(blob)) return "Emergencies & Help";
  if (/\b(work|schedule|job|office)\b/u.test(blob)) return "Job & Hobbies";
  if (/\b(name|origin|meeting|introduc)\b/u.test(blob)) return "Introductions";
  return "Review Needed";
}

function makeDraftId(topicSuggestion: string, idx: number): string {
  const slug = topicSuggestion
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `draft-gloss-${slug}-${String(idx).padStart(2, "0")}`;
}

function isQuestionSentence(text: string): boolean {
  return /\?|¿/.test(text) || /\b(c[oó]mo|d[oó]nde|cu[aá]nto|puede|tiene)\b/iu.test(text);
}

function isShortResponseSentence(text: string): boolean {
  return normalize(text).split(/\s+/u).filter(Boolean).length <= 3;
}

function isConfirmationSentence(text: string): boolean {
  return /\b(s[ií]|claro|correcto|de acuerdo|verdad)\b/iu.test(text);
}

function isCorrectionSentence(text: string): boolean {
  return /\b(perd[oó]n|quise decir|no,\s|correcci[oó]n|equivocado)\b/iu.test(text);
}

function startsWithYoPlusVerb(text: string): boolean {
  return /^\s*yo\s+\p{L}+/iu.test(text);
}

function pickByRule(
  candidates: string[],
  selected: string[],
  rule: (text: string) => boolean
): string | null {
  const found = candidates.find((candidate) => !selected.includes(candidate) && rule(candidate));
  if (!found) {
    return null;
  }
  selected.push(found);
  return found;
}

function pickSentences(
  scored: ScoredScenario,
  turnRecord: ParsedTurnsRecord | undefined
): { sentences: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const orderedCandidates: string[] = [];

  if (turnRecord?.dialogueLines?.length) {
    turnRecord.dialogueLines.forEach((line) => {
      splitIntoCandidateSentences(line).forEach((sent) => orderedCandidates.push(sent));
    });
  }

  if (orderedCandidates.length === 0) {
    scored.phrases.forEach((p) => {
      splitIntoCandidateSentences(p).forEach((sent) => orderedCandidates.push(sent));
    });
  }

  const clean = orderedCandidates
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((s) => !/\b(stage direction|translator note)\b/iu.test(s));

  const deduped: string[] = [];
  const seen = new Set<string>();
  clean.forEach((s) => {
    const k = normalize(s);
    if (seen.has(k)) return;
    seen.add(k);
    deduped.push(s);
  });

  // Keep short and speakable lines.
  const usable = deduped.filter((s) => s.split(/\s+/u).length <= 10).slice(0, 12);
  if (usable.length < 3) {
    warnings.push("fewer than 3 usable sentences");
  }

  const selected: string[] = [];
  if (!pickByRule(usable, selected, isQuestionSentence)) {
    warnings.push("missing question sentence in selected draft");
  }
  if (!pickByRule(usable, selected, isShortResponseSentence)) {
    warnings.push("missing short response sentence in selected draft");
  }
  if (!pickByRule(usable, selected, isConfirmationSentence)) {
    warnings.push("missing confirmation sentence in selected draft");
  }
  if (!pickByRule(usable, selected, isCorrectionSentence)) {
    warnings.push("missing correction sentence in selected draft");
  }

  usable.forEach((sentence) => {
    if (selected.length >= 5) {
      return;
    }
    if (!selected.includes(sentence)) {
      selected.push(sentence);
    }
  });

  if (selected.length >= 2 && selected.every((sentence) => startsWithYoPlusVerb(sentence))) {
    const replacement = usable.find((sentence) => !startsWithYoPlusVerb(sentence) && !selected.includes(sentence));
    if (replacement) {
      selected[selected.length - 1] = replacement;
    } else {
      warnings.push("sentence starts are overly repetitive (yo + verb)");
    }
  }

  return { sentences: selected.slice(0, 5), warnings };
}

function buildChunks(sentences: string[], phraseCandidates: string[]): { chunks: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const chunkSet = new Set<string>();

  // Reusable patterns first.
  phraseCandidates.forEach((phrase) => {
    detectPatterns(phrase).forEach((pattern) => chunkSet.add(pattern));
  });

  // Then high-value short fixed phrases from selected sentences.
  sentences.forEach((sentence) => {
    const lowered = normalize(sentence);
    FIXED_HIGH_VALUE_PHRASES.forEach((fixed) => {
      if (new RegExp(`\\b${fixed}\\b`, "iu").test(lowered)) {
        chunkSet.add(fixed);
      }
    });
  });

  // Add short conversational chunks if patterns are sparse.
  if (chunkSet.size < 3) {
    sentences.forEach((sentence) => {
      const lowered = normalize(sentence);
      const wc = lowered.split(/\s+/u).length;
      if (wc <= 2) {
        chunkSet.add(lowered);
      } else if (wc <= 5) {
        const firstPhrase = lowered.split(/,| y | pero /u)[0]?.trim() ?? "";
        if (firstPhrase) chunkSet.add(firstPhrase);
      }
    });
  }

  const chunks = [...chunkSet]
    .map((c) => c.trim())
    .filter(Boolean)
    .filter((c) => !isLikelyPersonNameToken(c))
    .slice(0, 8);

  // Warn if a chunk appears to be a full sentence (>2 words) rather than a reusable phrase.
  chunks.forEach((chunk) => {
    const wc = chunk.split(/\s+/u).length;
    const normalizedChunk = normalize(chunk);
    const isPattern = RECOGNIZED_PATTERNS.some((r) => r.label === normalizedChunk || r.regex.test(normalizedChunk));
    if (!isPattern && wc > 2) {
      warnings.push("possible full-sentence chunk");
    }
  });

  if (!chunks.some((c) => RECOGNIZED_PATTERNS.some((r) => r.label === c))) {
    warnings.push("no recognized patterns");
  }

  return { chunks, warnings };
}

function buildObjective(topic: string, scenario: string): string {
  return `${topic} scenario from GLOSS: ${scenario}`.trim();
}

function keyForScenario(row: { scenario: string; context: string }): string {
  return `${normalize(row.scenario)}::${normalize(row.context)}`;
}

type CandidateDraftContext = {
  row: ScoredScenario;
  turnRecord?: ParsedTurnsRecord;
  topicSuggestion: string;
  dominantPattern: string;
  scenarioIntent: string;
  matchedIntents: string[];
  warnings: string[];
};

function selectDiverseScenarios(
  rows: ScoredScenario[],
  turnsByKey: Map<string, ParsedTurnsRecord>,
  minScore: number,
  maxDrafts: number
): CandidateDraftContext[] {
  const candidates = rows
    .filter((row) => row.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .map((row) => {
      const turnRecord = turnsByKey.get(keyForScenario(row));
      const topicSuggestion = inferTopicSuggestion(row.scenario, row.context);
      const inferred = inferDominantPatternAndIntent(row, turnRecord);
      return {
        row,
        turnRecord,
        topicSuggestion,
        dominantPattern: inferred.dominantPattern,
        scenarioIntent: inferred.scenarioIntent,
        matchedIntents: inferred.matchedIntents,
        warnings: [] as string[],
      };
    });

  const byTopic = new Map<string, CandidateDraftContext[]>();
  candidates.forEach((candidate) => {
    const list = byTopic.get(candidate.topicSuggestion) ?? [];
    list.push(candidate);
    byTopic.set(candidate.topicSuggestion, list);
  });

  const selected: CandidateDraftContext[] = [];
  for (const topic of byTopic.keys()) {
    const topicCandidates = byTopic.get(topic) ?? [];
    const topicSelected: CandidateDraftContext[] = [];
    const usedPatterns = new Set<string>();
    const usedIntents = new Set<string>();
    const intentCountByTopic = new Map<string, number>();

    // Force at least two less-used intents when available.
    for (const candidate of topicCandidates) {
      if (topicSelected.length >= maxDrafts) {
        break;
      }
      if (!LESS_USED_INTENTS.has(candidate.scenarioIntent)) {
        continue;
      }
      if (usedPatterns.has(candidate.dominantPattern) || usedIntents.has(candidate.scenarioIntent)) {
        continue;
      }
      topicSelected.push(candidate);
      usedPatterns.add(candidate.dominantPattern);
      usedIntents.add(candidate.scenarioIntent);
      intentCountByTopic.set(candidate.scenarioIntent, (intentCountByTopic.get(candidate.scenarioIntent) ?? 0) + 1);
      if (intentCountByTopic.get(candidate.scenarioIntent)! > 1) {
        candidate.warnings.push(`dominant intent duplicate in topic batch: ${candidate.scenarioIntent}`);
      }
      if (topicSelected.filter((item) => LESS_USED_INTENTS.has(item.scenarioIntent)).length >= 2) {
        break;
      }
    }

    for (const candidate of topicCandidates) {
      if (topicSelected.length >= maxDrafts) {
        break;
      }
      if (usedPatterns.has(candidate.dominantPattern)) {
        continue;
      }
      if (usedIntents.has(candidate.scenarioIntent)) {
        continue;
      }
      const cap = PER_TOPIC_INTENT_CAP[candidate.scenarioIntent];
      const currentCount = intentCountByTopic.get(candidate.scenarioIntent) ?? 0;
      if (cap !== undefined && currentCount >= cap) {
        continue;
      }
      topicSelected.push(candidate);
      usedPatterns.add(candidate.dominantPattern);
      usedIntents.add(candidate.scenarioIntent);
      intentCountByTopic.set(candidate.scenarioIntent, currentCount + 1);
    }

    if (topicSelected.filter((item) => LESS_USED_INTENTS.has(item.scenarioIntent)).length < 2) {
      topicSelected.forEach((item) =>
        item.warnings.push("batch has fewer than 2 less-used intents (complaint/clarification/comparison/refusal/correction)")
      );
    }

    selected.push(...topicSelected);
  }

  return selected
    .sort((a, b) => b.row.score - a.row.score)
    .slice(0, maxDrafts);
}

async function loadParsedTurns(path: string): Promise<Map<string, ParsedTurnsRecord>> {
  try {
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw) as ParsedTurnsRecord[];
    return new Map(parsed.map((row) => [keyForScenario(row), row]));
  } catch {
    return new Map();
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const raw = await readFile(args.inputPath, "utf-8");
  const scored = JSON.parse(raw) as ScoredScenario[];
  const turnsByKey = await loadParsedTurns(args.turnsPath);

  const selected = selectDiverseScenarios(scored, turnsByKey, args.minScore, args.maxDrafts);
  const drafts: GlossLessonDraft[] = selected.map((candidate, index) => {
    const sentenceRes = pickSentences(candidate.row, candidate.turnRecord);
    const chunkRes = buildChunks(sentenceRes.sentences, candidate.row.phrases);
    const warnings = [...candidate.warnings, ...sentenceRes.warnings, ...chunkRes.warnings];
    if (candidate.topicSuggestion === "Review Needed") {
      warnings.push("unclear topic");
    }
    if (candidate.scenarioIntent === "request/order" || candidate.scenarioIntent === "location") {
      warnings.push("prioritize underrepresented intents over common patterns like quiero/donde esta");
    }

    return {
      id: makeDraftId(candidate.topicSuggestion, index + 1),
      language: "es",
      title: `${candidate.topicSuggestion} Draft ${index + 1}`,
      topicSuggestion: candidate.topicSuggestion,
      context: candidate.row.context,
      scenario: candidate.row.scenario,
      objective: buildObjective(candidate.topicSuggestion, candidate.row.scenario),
      sentences: sentenceRes.sentences.slice(0, 5),
      chunks: chunkRes.chunks,
      dominantPattern: candidate.dominantPattern,
      scenarioIntent: candidate.scenarioIntent,
      source: "gloss",
      sourceScore: candidate.row.score,
      warnings,
    };
  });

  await writeFile(args.outputPath, JSON.stringify(drafts, null, 2), "utf-8");

  const warningCount = drafts.reduce((sum, d) => sum + d.warnings.length, 0);
  const intentDistributionByTopic: Record<string, Record<string, number>> = {};
  const dominantPatternDuplicatesByTopic: Record<string, number> = {};
  const dominantPatternCountsByTopic: Record<string, Record<string, number>> = {};
  drafts.forEach((draft) => {
    const topicIntents = intentDistributionByTopic[draft.topicSuggestion] ?? {};
    topicIntents[draft.scenarioIntent] = (topicIntents[draft.scenarioIntent] ?? 0) + 1;
    intentDistributionByTopic[draft.topicSuggestion] = topicIntents;

    const topicPatterns = dominantPatternCountsByTopic[draft.topicSuggestion] ?? {};
    topicPatterns[draft.dominantPattern] = (topicPatterns[draft.dominantPattern] ?? 0) + 1;
    dominantPatternCountsByTopic[draft.topicSuggestion] = topicPatterns;
  });
  Object.entries(dominantPatternCountsByTopic).forEach(([topic, counts]) => {
    dominantPatternDuplicatesByTopic[topic] = Object.values(counts).reduce(
      (sum, count) => sum + Math.max(0, count - 1),
      0
    );
  });

  console.log(
    JSON.stringify(
      {
        input: args.inputPath,
        output: args.outputPath,
        selectedScenarios: selected.length,
        drafts: drafts.length,
        warnings: warningCount,
        generationConstraints:
          "Do not generate lessons that share the same dominant pattern or intent within the same topic batch. Prioritize underrepresented intents over common patterns like 'quiero' or 'donde esta'.",
        intentDistributionByTopic,
        dominantPatternDuplicatesByTopic,
        topDraft: drafts[0] ?? null,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
