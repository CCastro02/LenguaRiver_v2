import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type GlossTurn = {
  speaker: string;
  text: string;
};

type GlossRecord = {
  id: string;
  scenario: string;
  context: string;
  turns: GlossTurn[];
  dialogueLines: string[];
  phrases: string[];
  patternMatches: string[];
};

type ScenarioOutput = {
  scenario: string;
  context: string;
  phrases: string[];
};

type ParsedArgs = {
  inputPath: string;
  outputDir: string;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_INPUT = join(__dirname, "input", "gloss_raw.txt");
const DEFAULT_OUTPUT_DIR = join(__dirname, "output");

const PATTERN_DETECTORS: Array<{ pattern: string; regex: RegExp }> = [
  { pattern: "quiero ___", regex: /\bquiero\s+\S+/iu },
  { pattern: "necesito ___", regex: /\bnecesito\s+\S+/iu },
  { pattern: "¿dónde está ___?", regex: /\b(d[oó]nde\s+est[aá])\s+\S+/iu },
  { pattern: "¿tiene ___?", regex: /\btiene\s+\S+/iu },
  { pattern: "me siento ___", regex: /\bme\s+siento\s+\S+/iu },
  { pattern: "trabajo mucho", regex: /\btrabajo\s+mucho\b/iu },
  { pattern: "estoy ___", regex: /\bestoy\s+\S+/iu },
  { pattern: "soy de ___", regex: /\bsoy\s+de\s+\S+/iu },
  { pattern: "¿de dónde eres?", regex: /\bde\s+d[oó]nde\s+eres\b/iu },
];

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    inputPath: DEFAULT_INPUT,
    outputDir: DEFAULT_OUTPUT_DIR,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input" || arg === "-i") {
      out.inputPath = resolve(argv[i + 1] ?? DEFAULT_INPUT);
      i += 1;
    } else if (arg === "--output-dir" || arg === "-o") {
      out.outputDir = resolve(argv[i + 1] ?? DEFAULT_OUTPUT_DIR);
      i += 1;
    }
  }
  return out;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function simplifySentence(text: string): string {
  const noStageDirections = text
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\([^\)]*\b(laughs?|noise|music|static|pause)\b[^\)]*\)/giu, " ");
  const cleaned = normalizeWhitespace(noStageDirections);
  return cleaned.replace(/[“”"]/g, "");
}

function sentenceFragments(text: string): string[] {
  return simplifySentence(text)
    .split(/[.!?]+/u)
    .map(normalizeWhitespace)
    .filter(Boolean);
}

function detectPattern(sentence: string): string | null {
  return PATTERN_DETECTORS.find((entry) => entry.regex.test(sentence))?.pattern ?? null;
}

function isLikelyContextHeading(line: string): boolean {
  return /^(context|setting|situation)\s*:/iu.test(line);
}

function isLikelyScenarioHeading(line: string): boolean {
  return /^(scenario|situation|objective|task)\s*:/iu.test(line);
}

function extractHeadingValue(line: string): string {
  return normalizeWhitespace(line.replace(/^[^:]+:/u, ""));
}

function parseSpeakerTurn(line: string): GlossTurn | null {
  const normalized = normalizeWhitespace(line.replace(/^[-*]\s*/u, ""));
  const match = normalized.match(/^([A-Za-z0-9_]+|Speaker\s*\d+)\s*[:\-]\s+(.+)$/u);
  if (!match) {
    return null;
  }
  return {
    speaker: normalizeWhitespace(match[1]),
    text: simplifySentence(match[2]),
  };
}

function startsNewBlock(line: string): boolean {
  return /^((lesson|module|unit|dialog(ue)?)\b|###?\s+)/iu.test(line);
}

function buildScenarioOutput(record: GlossRecord): ScenarioOutput {
  return {
    scenario: record.scenario,
    context: record.context,
    phrases: record.phrases,
  };
}

function scorePhrase(phrase: string): number {
  const wordCount = phrase.split(/\s+/u).length;
  const hasUsefulVerb = /\b(quiero|necesito|busco|tiene|est[aá]|estoy|trabajo|siento|puede)\b/iu.test(phrase);
  const hasPoliteness = /\b(hola|gracias|por favor)\b/iu.test(phrase);
  let score = 0;
  if (wordCount >= 2 && wordCount <= 5) {
    score += 2;
  }
  if (hasUsefulVerb) {
    score += 3;
  }
  if (hasPoliteness) {
    score += 1;
  }
  return score;
}

function extractPhrases(turns: GlossTurn[]): { phrases: string[]; patternMatches: string[] } {
  const phraseSet = new Set<string>();
  const patternSet = new Set<string>();

  turns.forEach((turn) => {
    sentenceFragments(turn.text).forEach((fragment) => {
      const lowered = fragment.toLowerCase();
      const pattern = detectPattern(lowered);
      if (pattern) {
        patternSet.add(pattern);
        phraseSet.add(pattern);
      }
      const simplified = normalizeWhitespace(fragment);
      const wc = simplified.split(/\s+/u).length;
      if (wc >= 1 && wc <= 6 && scorePhrase(lowered) >= 2) {
        phraseSet.add(lowered);
      }
    });
  });

  const sorted = [...phraseSet].sort((a, b) => scorePhrase(b) - scorePhrase(a) || a.localeCompare(b));
  return {
    phrases: sorted.slice(0, 12),
    patternMatches: [...patternSet].sort(),
  };
}

function finalizeRecord(
  id: string,
  scenario: string,
  context: string,
  turns: GlossTurn[],
  fallbackLines: string[]
): GlossRecord {
  const safeScenario = scenario || "General everyday interaction scenario.";
  const safeContext = context || "daily conversation";
  const normalizedTurns =
    turns.length > 0
      ? turns
      : fallbackLines.map((line, index) => ({
          speaker: `Speaker${index % 2 === 0 ? "A" : "B"}`,
          text: simplifySentence(line),
        }));
  const extracted = extractPhrases(normalizedTurns);
  return {
    id,
    scenario: safeScenario,
    context: safeContext,
    turns: normalizedTurns,
    dialogueLines: normalizedTurns.map((t) => `${t.speaker}: ${t.text}`),
    phrases: extracted.phrases,
    patternMatches: extracted.patternMatches,
  };
}

function parseGlossText(raw: string): GlossRecord[] {
  const lines = raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const records: GlossRecord[] = [];
  let scenario = "";
  let context = "";
  let turns: GlossTurn[] = [];
  let fallbackDialogue: string[] = [];
  let blockIndex = 1;

  const flush = (): void => {
    if (!scenario && !context && turns.length === 0 && fallbackDialogue.length === 0) {
      return;
    }
    const record = finalizeRecord(`gloss-${String(blockIndex).padStart(3, "0")}`, scenario, context, turns, fallbackDialogue);
    records.push(record);
    blockIndex += 1;
    scenario = "";
    context = "";
    turns = [];
    fallbackDialogue = [];
  };

  lines.forEach((line) => {
    if (startsNewBlock(line)) {
      flush();
      return;
    }
    if (isLikelyScenarioHeading(line)) {
      scenario = extractHeadingValue(line);
      return;
    }
    if (isLikelyContextHeading(line)) {
      context = extractHeadingValue(line);
      return;
    }
    const turn = parseSpeakerTurn(line);
    if (turn) {
      turns.push(turn);
      return;
    }
    // Fallback dialogue line: useful when source has plain line-by-line dialog.
    if (line.length > 2) {
      fallbackDialogue.push(line);
    }
  });

  flush();
  return records;
}

async function writeOutputs(records: GlossRecord[], outputDir: string): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const parsedPath = join(outputDir, "gloss_parsed_turns.json");
  const scenarioPath = join(outputDir, "gloss_scenarios.json");
  await writeFile(parsedPath, JSON.stringify(records, null, 2), "utf-8");
  await writeFile(
    scenarioPath,
    JSON.stringify(records.map((record) => buildScenarioOutput(record)), null, 2),
    "utf-8"
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const raw = await readFile(args.inputPath, "utf-8");
  const records = parseGlossText(raw);
  await writeOutputs(records, args.outputDir);

  const avgPhraseCount =
    records.length === 0
      ? 0
      : Math.round(
          (records.reduce((sum, r) => sum + r.phrases.length, 0) / records.length) * 10
        ) / 10;
  const totalPatternHits = records.reduce((sum, r) => sum + r.patternMatches.length, 0);

  console.log(
    JSON.stringify(
      {
        input: args.inputPath,
        outputDir: args.outputDir,
        records: records.length,
        averagePhrasesPerScenario: avgPhraseCount,
        totalPatternHits,
        sample: records.slice(0, 2).map((record) => ({
          scenario: record.scenario,
          context: record.context,
          phrases: record.phrases.slice(0, 6),
        })),
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
