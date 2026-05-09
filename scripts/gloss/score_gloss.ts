import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

type GlossScenario = {
  scenario: string;
  context: string;
  phrases: string[];
};

type ScoreBreakdown = {
  reuse: number;
  simplicity: number;
  patterns: number;
  clarity: number;
};

type ScoredGlossScenario = GlossScenario & {
  score: number;
  breakdown: ScoreBreakdown;
};

type ParsedArgs = {
  inputPath: string;
  outputPath: string;
  topN?: number;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_INPUT = join(__dirname, "output", "gloss_scenarios.json");
const DEFAULT_OUTPUT = join(__dirname, "output", "gloss_scenarios_scored.json");

const KNOWN_PATTERN_RULES: Array<{ label: string; regex: RegExp }> = [
  { label: "quiero ___", regex: /\bquiero(\s+___|\s+\S+)/iu },
  { label: "necesito ___", regex: /\bnecesito(\s+___|\s+\S+)/iu },
  { label: "¿dónde está ___?", regex: /\bd[oó]nde\s+est[aá](\s+___|\s+\S+)/iu },
  { label: "¿tiene ___?", regex: /\btiene(\s+___|\s+\S+)/iu },
  { label: "me siento ___", regex: /\bme\s+siento(\s+___|\s+\S+)/iu },
  { label: "trabajo mucho", regex: /\btrabajo\s+mucho\b/iu },
  { label: "estoy ___", regex: /\bestoy(\s+___|\s+\S+)/iu },
  { label: "soy de ___", regex: /\bsoy\s+de(\s+___|\s+\S+)/iu },
  { label: "¿de dónde eres?", regex: /\bde\s+d[oó]nde\s+eres\b/iu },
];

function clamp(min: number, n: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[!?.,;:]+/g, " ").replace(/\s+/g, " ").trim();
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    inputPath: DEFAULT_INPUT,
    outputPath: DEFAULT_OUTPUT,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input" || arg === "-i") {
      out.inputPath = resolve(argv[i + 1] ?? DEFAULT_INPUT);
      i += 1;
    } else if (arg === "--output" || arg === "-o") {
      out.outputPath = resolve(argv[i + 1] ?? DEFAULT_OUTPUT);
      i += 1;
    } else if (arg === "--top" || arg === "-t") {
      out.topN = Math.max(1, Number(argv[i + 1] ?? "3"));
      i += 1;
    }
  }
  return out;
}

function detectPatterns(phrases: string[]): string[] {
  const found = new Set<string>();
  phrases.forEach((phrase) => {
    const p = normalize(phrase);
    KNOWN_PATTERN_RULES.forEach((rule) => {
      if (rule.regex.test(p)) {
        found.add(rule.label);
      }
    });
  });
  return [...found];
}

function scoreReuseDensity(phrases: string[], detectedPatterns: string[]): number {
  if (phrases.length === 0) {
    return 0;
  }
  const patternHits = phrases.filter((phrase) => {
    const p = normalize(phrase);
    return KNOWN_PATTERN_RULES.some((rule) => rule.regex.test(p));
  }).length;
  const density = patternHits / phrases.length;
  const coverageBoost = detectedPatterns.length / 5;
  return clamp(0, (density * 80 + coverageBoost * 20), 100);
}

function scoreSimplicity(phrases: string[]): number {
  if (phrases.length === 0) {
    return 0;
  }
  const wordCounts = phrases.map((phrase) => normalize(phrase).split(" ").filter(Boolean).length);
  const avg = wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length;
  // Best around 2-5 words; heavier penalties after 7.
  const distancePenalty = Math.max(0, avg - 5) * 12 + Math.max(0, 2 - avg) * 5;
  const longPhrasePenalty = wordCounts.filter((n) => n > 7).length * 8;
  return clamp(0, 100 - distancePenalty - longPhrasePenalty, 100);
}

function scorePatternCoverage(detectedPatterns: string[]): number {
  // 3+ unique reusable patterns is strong for lesson drafting.
  return clamp(0, (detectedPatterns.length / 3) * 100, 100);
}

function scoreDialogueClarity(phrases: string[]): number {
  if (phrases.length === 0) {
    return 0;
  }
  const conversationalSignals = phrases.filter((phrase) =>
    /\b(hola|gracias|por favor|buenos|buenas|puede|quiero|necesito|d[oó]nde|tiene)\b/iu.test(phrase)
  ).length;
  const overDescriptive = phrases.filter((phrase) => normalize(phrase).split(" ").length > 9).length;
  const ratio = conversationalSignals / phrases.length;
  return clamp(0, ratio * 100 - overDescriptive * 15, 100);
}

function lengthConstraintMultiplier(phrases: string[]): number {
  const n = phrases.length;
  if (n >= 3 && n <= 6) {
    return 1;
  }
  if (n === 2 || n === 7) {
    return 0.88;
  }
  return 0.72;
}

function scoreScenario(row: GlossScenario): ScoredGlossScenario {
  const phrases = row.phrases ?? [];
  const detected = detectPatterns(phrases);
  const breakdown: ScoreBreakdown = {
    reuse: round1(scoreReuseDensity(phrases, detected)),
    simplicity: round1(scoreSimplicity(phrases)),
    patterns: round1(scorePatternCoverage(detected)),
    clarity: round1(scoreDialogueClarity(phrases)),
  };

  // Reuse density has highest weight; then simplicity, pattern coverage, clarity.
  const weighted =
    breakdown.reuse * 0.45 +
    breakdown.simplicity * 0.2 +
    breakdown.patterns * 0.2 +
    breakdown.clarity * 0.15;

  const score = round1(weighted * lengthConstraintMultiplier(phrases));
  return {
    scenario: row.scenario,
    context: row.context,
    phrases: row.phrases,
    score,
    breakdown,
  };
}

export function getTopScenarios(rows: ScoredGlossScenario[], n: number): ScoredGlossScenario[] {
  return [...rows].sort((a, b) => b.score - a.score).slice(0, Math.max(1, n));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const raw = await readFile(args.inputPath, "utf-8");
  const parsed = JSON.parse(raw) as GlossScenario[];
  const scored = parsed.map(scoreScenario).sort((a, b) => b.score - a.score);
  await writeFile(args.outputPath, JSON.stringify(scored, null, 2), "utf-8");

  const top = getTopScenarios(scored, args.topN ?? 3);
  console.log(
    JSON.stringify(
      {
        input: args.inputPath,
        output: args.outputPath,
        total: scored.length,
        top: top.map((row) => ({
          scenario: row.scenario,
          context: row.context,
          score: row.score,
          breakdown: row.breakdown,
          phrases: row.phrases.slice(0, 6),
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
