import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { lessons } from "../../lib/lesson-data";

type CoreTopic =
  | "Introductions"
  | "Ordering Food"
  | "Directions"
  | "Shopping"
  | "Hotel"
  | "Emergencies & Help"
  | "Job & Hobbies";

type ScenarioReport = {
  topic: CoreTopic;
  expectedScenarios: string[];
  coveredScenarios: string[];
  missingScenarios: string[];
  weakScenarios: Array<{
    scenario: string;
    count: number;
    reason: "only-one-lesson" | "low-pattern-diversity";
  }>;
  overcoveredScenarios: Array<{
    scenario: string;
    count: number;
  }>;
};

type ScenarioRule = {
  id: string;
  scenario: string;
  patterns: RegExp[];
};

const EXPECTED_SCENARIOS: Record<CoreTopic, string[]> = {
  Introductions: [
    "greeting",
    "name exchange",
    "origin",
    "classroom introduction",
    "workplace introduction",
    "neighbor introduction",
    "casual small talk",
    "formal introduction",
    "meeting at event",
    "follow-up conversation",
  ],
  "Ordering Food": [
    "order drink",
    "order food",
    "ask price",
    "ask bill",
    "ask menu item",
    "takeout",
    "wrong order",
    "dietary request",
    "pay",
    "clarify order",
  ],
  Directions: [
    "ask location",
    "bathroom",
    "station",
    "hotel",
    "left/right",
    "near/far",
    "landmark",
    "confirm route",
    "lost",
    "transportation stop",
  ],
  Shopping: [
    "ask price",
    "find item",
    "size",
    "color",
    "pay",
    "return item",
    "exchange item",
    "ask availability",
    "compare options",
    "ask for help",
  ],
  Hotel: [
    "check-in",
    "reservation",
    "room problem",
    "key/card",
    "Wi-Fi",
    "amenities",
    "checkout",
    "ask location",
    "ask help",
    "noise/problem",
  ],
  "Emergencies & Help": [
    "feeling sick",
    "ask help",
    "lost phone",
    "police",
    "doctor",
    "pharmacy",
    "don’t understand",
    "call someone",
    "injury",
    "urgent assistance",
  ],
  "Job & Hobbies": [
    "work schedule",
    "busy/tired",
    "free time",
    "hobby",
    "weekend plans",
    "job role",
    "workplace problem",
    "meeting",
    "break/lunch",
    "after work",
  ],
};

const SCENARIO_RULES: Record<CoreTopic, ScenarioRule[]> = {
  Introductions: [
    { id: "intro-greeting", scenario: "greeting", patterns: [/\bhola\b/i, /\bbuen(as|os)\b/i] },
    {
      id: "intro-name",
      scenario: "name exchange",
      patterns: [/\bme llamo\b/i, /\bc[óo]mo te llamas\b/i, /\btu nombre\b/i],
    },
    { id: "intro-origin", scenario: "origin", patterns: [/\bsoy de\b/i, /\bde d[óo]nde eres\b/i] },
    { id: "intro-classroom", scenario: "classroom introduction", patterns: [/\baula\b/i, /\bclase\b/i, /\bestudio\b/i] },
    {
      id: "intro-workplace",
      scenario: "workplace introduction",
      patterns: [/\btrabajo\b/i, /\boficina\b/i, /\bequipo\b/i, /\bcoworker\b/i],
    },
    { id: "intro-neighbor", scenario: "neighbor introduction", patterns: [/\bvecin[oa]\b/i, /\bapartamento\b/i] },
    { id: "intro-smalltalk", scenario: "casual small talk", patterns: [/\bc[óo]mo est[aá]s\b/i, /\bqu[eé] tal\b/i] },
    { id: "intro-formal", scenario: "formal introduction", patterns: [/\bencantad[oa]\b/i, /\bmucho gusto\b/i, /\busted\b/i] },
    { id: "intro-event", scenario: "meeting at event", patterns: [/\bevento\b/i, /\bfiesta\b/i, /\breuni[óo]n\b/i] },
    { id: "intro-followup", scenario: "follow-up conversation", patterns: [/\bluego\b/i, /\bdespu[eé]s\b/i, /\bseguimos\b/i] },
  ],
  "Ordering Food": [
    { id: "food-order-drink", scenario: "order drink", patterns: [/\bcaf[eé]\b/i, /\bagua\b/i, /\bjugo\b/i, /\bbebida\b/i] },
    { id: "food-order-food", scenario: "order food", patterns: [/\bquiero\b/i, /\bpedir\b/i, /\borden\b/i, /\bcomida\b/i] },
    { id: "food-ask-price", scenario: "ask price", patterns: [/\bcu[aá]nto cuesta\b/i, /\bprecio\b/i] },
    { id: "food-ask-bill", scenario: "ask bill", patterns: [/\bla cuenta\b/i, /\bfactura\b/i] },
    { id: "food-ask-menu-item", scenario: "ask menu item", patterns: [/\bmen[uú]\b/i, /\btiene\b/i, /\bopci[oó]n\b/i] },
    { id: "food-takeout", scenario: "takeout", patterns: [/\bpara llevar\b/i, /\bbolsa\b/i, /\btakeout\b/i] },
    { id: "food-wrong-order", scenario: "wrong order", patterns: [/\bequivocad[oa]\b/i, /\borden correcta\b/i, /\bno est[aá] aqu[ií]\b/i] },
    { id: "food-dietary", scenario: "dietary request", patterns: [/\bsin\b/i, /\balerg/i, /\bveg(etar|an)/i] },
    { id: "food-pay", scenario: "pay", patterns: [/\bpagar\b/i, /\btotal\b/i, /\btarjeta\b/i, /\befectivo\b/i] },
    { id: "food-clarify", scenario: "clarify order", patterns: [/\bconfirm/i, /\brepetir\b/i, /\baclar/i] },
  ],
  Directions: [
    { id: "dir-ask-location", scenario: "ask location", patterns: [/\bd[óo]nde est[aá]\b/i, /\bubicaci[oó]n\b/i] },
    { id: "dir-bathroom", scenario: "bathroom", patterns: [/\bba[ñn]o\b/i] },
    { id: "dir-station", scenario: "station", patterns: [/\bestaci[oó]n\b/i, /\btren\b/i] },
    { id: "dir-hotel", scenario: "hotel", patterns: [/\bhotel\b/i, /\bhostal\b/i] },
    { id: "dir-left-right", scenario: "left/right", patterns: [/\bizquierda\b/i, /\bderecha\b/i] },
    { id: "dir-near-far", scenario: "near/far", patterns: [/\bcerca\b/i, /\blejos\b/i] },
    { id: "dir-landmark", scenario: "landmark", patterns: [/\bplaza\b/i, /\bpuente\b/i, /\bparque\b/i] },
    { id: "dir-confirm-route", scenario: "confirm route", patterns: [/\bverdad\b/i, /\bcorrect[oa]\b/i, /\bconfirm/i] },
    { id: "dir-lost", scenario: "lost", patterns: [/\bperdid[oa]\b/i, /\bno encuentro\b/i] },
    { id: "dir-transport-stop", scenario: "transportation stop", patterns: [/\bparada\b/i, /\bmetro\b/i, /\bautob[uú]s\b/i] },
  ],
  Shopping: [
    { id: "shop-ask-price", scenario: "ask price", patterns: [/\bcu[aá]nto cuesta\b/i, /\bprecio\b/i] },
    { id: "shop-find-item", scenario: "find item", patterns: [/\bbusco\b/i, /\bnecesito\b/i, /\bart[ií]culo\b/i] },
    { id: "shop-size", scenario: "size", patterns: [/\btalla\b/i, /\bgrande\b/i, /\bpeque[ñn]a\b/i] },
    { id: "shop-color", scenario: "color", patterns: [/\bcolor\b/i, /\bazul\b/i, /\bnegro\b/i, /\brojo\b/i] },
    { id: "shop-pay", scenario: "pay", patterns: [/\bpagar\b/i, /\btarjeta\b/i, /\bcaja\b/i] },
    { id: "shop-return", scenario: "return item", patterns: [/\bdevol/i, /\bdevolver\b/i] },
    { id: "shop-exchange", scenario: "exchange item", patterns: [/\bcambiar\b/i, /\bcambio\b/i] },
    { id: "shop-availability", scenario: "ask availability", patterns: [/\btiene\b/i, /\bhay\b/i, /\bdisponible\b/i] },
    { id: "shop-compare", scenario: "compare options", patterns: [/\bmejor\b/i, /\bm[aá]s\b/i, /\bcompar/i] },
    { id: "shop-help", scenario: "ask for help", patterns: [/\bayuda\b/i, /\bpuede ayudar\b/i] },
  ],
  Hotel: [
    { id: "hotel-checkin", scenario: "check-in", patterns: [/\bcheck-in\b/i, /\bregistrarme\b/i] },
    { id: "hotel-reservation", scenario: "reservation", patterns: [/\breserva\b/i, /\ba nombre de\b/i] },
    { id: "hotel-room-problem", scenario: "room problem", patterns: [/\bhabitaci[oó]n\b/i, /\bno est[aá] bien\b/i] },
    { id: "hotel-key", scenario: "key/card", patterns: [/\bllave\b/i, /\btarjeta\b/i] },
    { id: "hotel-wifi", scenario: "Wi-Fi", patterns: [/\bwifi\b/i, /\binternet\b/i, /\bclave\b/i] },
    { id: "hotel-amenities", scenario: "amenities", patterns: [/\btoalla\b/i, /\bdesayuno\b/i, /\bservicio\b/i] },
    { id: "hotel-checkout", scenario: "checkout", patterns: [/\bcheck-out\b/i, /\bsalida\b/i, /\bfactura\b/i] },
    { id: "hotel-ask-location", scenario: "ask location", patterns: [/\bd[óo]nde est[aá]\b/i, /\bentrada\b/i] },
    { id: "hotel-ask-help", scenario: "ask help", patterns: [/\bayuda\b/i, /\bpuede\b/i, /\bnecesito\b/i] },
    { id: "hotel-noise", scenario: "noise/problem", patterns: [/\bruido\b/i, /\bmolest/i, /\bproblema\b/i] },
  ],
  "Emergencies & Help": [
    { id: "help-sick", scenario: "feeling sick", patterns: [/\bme siento mal\b/i, /\benfermo\b/i, /\bduele\b/i] },
    { id: "help-ask-help", scenario: "ask help", patterns: [/\bayuda\b/i, /\bauxilio\b/i, /\bnecesito\b/i] },
    { id: "help-lost-phone", scenario: "lost phone", patterns: [/\bperd[ií] mi tel[eé]fono\b/i, /\bcelular\b/i] },
    { id: "help-police", scenario: "police", patterns: [/\bpolic[ií]a\b/i, /\bcomisar[ií]a\b/i] },
    { id: "help-doctor", scenario: "doctor", patterns: [/\bdoctor\b/i, /\bm[eé]dico\b/i, /\bcl[ií]nica\b/i] },
    { id: "help-pharmacy", scenario: "pharmacy", patterns: [/\bfarmacia\b/i, /\bmedicina\b/i] },
    { id: "help-dont-understand", scenario: "don’t understand", patterns: [/\bno entiendo\b/i, /\bm[aá]s despacio\b/i] },
    { id: "help-call", scenario: "call someone", patterns: [/\bllamar\b/i, /\btel[eé]fono\b/i, /\bn[uú]mero\b/i] },
    { id: "help-injury", scenario: "injury", patterns: [/\bherid[oa]\b/i, /\bsangre\b/i, /\baccidente\b/i] },
    { id: "help-urgent", scenario: "urgent assistance", patterns: [/\burgente\b/i, /\bahora\b/i, /\binmediat/i] },
  ],
  "Job & Hobbies": [
    { id: "job-schedule", scenario: "work schedule", patterns: [/\bhorario\b/i, /\bturno\b/i, /\btrabajo\b/i] },
    { id: "job-busy", scenario: "busy/tired", patterns: [/\bcansad[oa]\b/i, /\bocupad[oa]\b/i, /\bestoy\b/i] },
    { id: "job-free-time", scenario: "free time", patterns: [/\btiempo libre\b/i, /\bestoy libre\b/i] },
    { id: "job-hobby", scenario: "hobby", patterns: [/\bhobby\b/i, /\bme gusta\b/i, /\bpracticar\b/i] },
    { id: "job-weekend", scenario: "weekend plans", patterns: [/\bfines de semana\b/i, /\bs[áa]bado\b/i, /\bdomingo\b/i] },
    { id: "job-role", scenario: "job role", patterns: [/\btrabajo en\b/i, /\brol\b/i, /\bpuesto\b/i] },
    { id: "job-problem", scenario: "workplace problem", patterns: [/\bproblema\b/i, /\bequipo\b/i, /\boficina\b/i] },
    { id: "job-meeting", scenario: "meeting", patterns: [/\breuni[oó]n\b/i, /\bcita\b/i] },
    { id: "job-break", scenario: "break/lunch", patterns: [/\balmuerzo\b/i, /\bdescanso\b/i, /\bpausa\b/i] },
    { id: "job-afterwork", scenario: "after work", patterns: [/\bdespu[eé]s del trabajo\b/i, /\bdespu[eé]s\b/i, /\bnoche\b/i] },
  ],
};

function toCoreTopic(topic: string): CoreTopic | null {
  const normalized = topic.toLowerCase();
  if (normalized.includes("introduc")) return "Introductions";
  if (normalized.includes("ordering food")) return "Ordering Food";
  if (normalized.includes("direction")) return "Directions";
  if (normalized.includes("shopping")) return "Shopping";
  if (normalized.includes("hotel")) return "Hotel";
  if (normalized.includes("emergenc") || normalized.includes("help")) return "Emergencies & Help";
  if (normalized.includes("job") || normalized.includes("hobbies") || normalized.includes("work")) {
    return "Job & Hobbies";
  }
  return null;
}

function lessonText(lesson: (typeof lessons)[number]): string {
  const sentences = lesson.sentences.map((sentence) => sentence.text).join(" ");
  const contexts = lesson.sentences.map((sentence) => sentence.contextLabel ?? "").join(" ");
  const chunks = lesson.sentences
    .flatMap((sentence) => sentence.words.map((word) => word.exerciseAnchorText ?? word.text))
    .join(" ");
  const coreWords = lesson.coreWords.join(" ");
  return `${lesson.title} ${lesson.objective} ${contexts} ${sentences} ${chunks} ${coreWords}`.toLowerCase();
}

function detectScenariosForLesson(
  topic: CoreTopic,
  lesson: (typeof lessons)[number]
): Map<string, Set<string>> {
  const text = lessonText(lesson);
  const matched = new Map<string, Set<string>>();
  for (const rule of SCENARIO_RULES[topic]) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      const set = matched.get(rule.scenario) ?? new Set<string>();
      set.add(rule.id);
      matched.set(rule.scenario, set);
    }
  }
  return matched;
}

function buildScenarioReports(): ScenarioReport[] {
  const topicLessons = new Map<CoreTopic, Array<(typeof lessons)[number]>>();
  for (const topic of Object.keys(EXPECTED_SCENARIOS) as CoreTopic[]) {
    topicLessons.set(topic, []);
  }

  for (const lesson of lessons) {
    if (lesson.language !== "es" || lesson.sourceType !== "core") {
      continue;
    }
    const coreTopic = toCoreTopic(lesson.topic);
    if (!coreTopic) {
      continue;
    }
    topicLessons.get(coreTopic)?.push(lesson);
  }

  const reports: ScenarioReport[] = [];
  for (const topic of Object.keys(EXPECTED_SCENARIOS) as CoreTopic[]) {
    const scenarioLessonCount = new Map<string, number>();
    const scenarioPatternDiversity = new Map<string, Set<string>>();
    const expectedScenarios = EXPECTED_SCENARIOS[topic];
    const relevantLessons = topicLessons.get(topic) ?? [];

    for (const lesson of relevantLessons) {
      const scenarioMatches = detectScenariosForLesson(topic, lesson);
      for (const [scenario, patternIds] of scenarioMatches.entries()) {
        scenarioLessonCount.set(scenario, (scenarioLessonCount.get(scenario) ?? 0) + 1);
        const existing = scenarioPatternDiversity.get(scenario) ?? new Set<string>();
        patternIds.forEach((id) => existing.add(id));
        scenarioPatternDiversity.set(scenario, existing);
      }
    }

    const coveredScenarios = expectedScenarios.filter((scenario) => (scenarioLessonCount.get(scenario) ?? 0) > 0);
    const missingScenarios = expectedScenarios.filter((scenario) => !coveredScenarios.includes(scenario));

    const weakScenarios: ScenarioReport["weakScenarios"] = [];
    const overcoveredScenarios: ScenarioReport["overcoveredScenarios"] = [];

    for (const scenario of coveredScenarios) {
      const count = scenarioLessonCount.get(scenario) ?? 0;
      const diversity = scenarioPatternDiversity.get(scenario)?.size ?? 0;
      if (count === 1) {
        weakScenarios.push({ scenario, count, reason: "only-one-lesson" });
      } else if (diversity <= 1) {
        weakScenarios.push({ scenario, count, reason: "low-pattern-diversity" });
      }
      if (count >= 4) {
        overcoveredScenarios.push({ scenario, count });
      }
    }

    reports.push({
      topic,
      expectedScenarios,
      coveredScenarios,
      missingScenarios,
      weakScenarios,
      overcoveredScenarios: overcoveredScenarios.sort((a, b) => b.count - a.count),
    });
  }

  return reports;
}

function printConsoleReport(reports: ScenarioReport[]): void {
  for (const report of reports) {
    const coveredCount = report.coveredScenarios.length;
    const total = report.expectedScenarios.length;
    console.log(`Topic: ${report.topic}`);
    console.log(`Covered: ${coveredCount}/${total}`);
    console.log("Missing:");
    if (report.missingScenarios.length === 0) {
      console.log("- none");
    } else {
      report.missingScenarios.forEach((scenario) => console.log(`- ${scenario}`));
    }
    console.log("Weak:");
    if (report.weakScenarios.length === 0) {
      console.log("- none");
    } else {
      report.weakScenarios.forEach((item) =>
        console.log(`- ${item.scenario} (${item.count} lesson${item.count === 1 ? "" : "s"}; ${item.reason})`)
      );
    }
    console.log("Overcovered:");
    if (report.overcoveredScenarios.length === 0) {
      console.log("- none");
    } else {
      report.overcoveredScenarios.forEach((item) => console.log(`- ${item.scenario} (${item.count} lessons)`));
    }
    console.log("");
  }
}

function writeJsonReport(reports: ScenarioReport[]): string {
  const outputDir = path.join(process.cwd(), "scripts", "lessons", "output");
  mkdirSync(outputDir, { recursive: true });
  const reportPath = path.join(outputDir, "scenario_gap_report.json");
  writeFileSync(reportPath, `${JSON.stringify(reports, null, 2)}\n`, "utf8");
  return reportPath;
}

function main(): void {
  const reports = buildScenarioReports();
  const outputPath = writeJsonReport(reports);
  printConsoleReport(reports);
  console.log(`Scenario gap report written: ${outputPath}`);
}

main();
