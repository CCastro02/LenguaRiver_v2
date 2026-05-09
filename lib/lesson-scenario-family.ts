import type { Lesson, LessonTier } from "@/lib/lesson-data";

export type ScenarioFamilyTierKey = LessonTier | "legacy";

export type LessonTierBuckets = {
  easy?: Lesson[];
  medium?: Lesson[];
  real?: Lesson[];
  legacy?: Lesson[];
};

export type ScenarioGroup = {
  scenarioKey: string;
  scenarioFamily: string;
  scenarioTitle: string;
  isFallbackScenario: boolean;
  tiers: LessonTierBuckets;
};

export type ContextGroup = {
  name: string;
  scenarios: ScenarioGroup[];
  contexts: ContextNode[];
};

export type ContextNode = {
  name: string;
  scenarios: ScenarioGroup[];
};

export type TopicContextScenarioGroup = {
  topic: string;
  contextGroups: ContextGroup[];
};

const TIER_ORDER: ScenarioFamilyTierKey[] = ["easy", "medium", "real", "legacy"];
const CANONICAL_CONTEXT_GROUPS = new Set([
  "Institutional",
  "Social Spaces",
  "Food & Drink",
  "Public Spaces",
  "Residential / Living",
  "General",
]);

const CONTEXT_TO_GROUP: Record<string, string> = {
  "School": "Institutional",
  "Classroom": "Institutional",
  "Work": "Institutional",
  "Office": "Institutional",
  "Study Hall": "Institutional",
  "Park": "Social Spaces",
  "Party": "Social Spaces",
  "Gym": "Social Spaces",
  "Friend / Family": "Social Spaces",
  "Date": "Social Spaces",
  "Coffee Shop": "Food & Drink",
  "Restaurant": "Food & Drink",
  "Cafe": "Food & Drink",
  "Street Vendor": "Food & Drink",
  "Food Truck": "Food & Drink",
  "Home": "Residential / Living",
  "New House": "Residential / Living",
  "New City": "Residential / Living",
  "Neighborhood": "Residential / Living",
  "Neighbor / Neighborhood": "Residential / Living",
  "Street": "Public Spaces",
  "Station": "Public Spaces",
  "Train Station": "Public Spaces",
  "Bus Stop": "Public Spaces",
  "Airport": "Public Spaces",
  "Hotel Lobby": "Public Spaces",
  "General": "General",
  "Clarification Basics": "General",
  "Personal Introductions": "General",
};

function sortByTitle(a: Lesson, b: Lesson): number {
  return a.title.localeCompare(b.title);
}

function tierRank(tier: ScenarioFamilyTierKey): number {
  return TIER_ORDER.indexOf(tier);
}

function normalizeLookupValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/[^a-z0-9/&\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeContextName(value: string | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }
  const normalized = normalizeLookupValue(value);
  if (!normalized) {
    return null;
  }

  if (normalized.includes("neighbor") || normalized.includes("neighborhood") || normalized.includes("vecin")) {
    return "Neighbor / Neighborhood";
  }
  if (normalized.includes("coffee") || normalized.includes("cafe")) {
    return "Coffee Shop";
  }
  if (normalized.includes("food truck")) {
    return "Food Truck";
  }
  if (normalized.includes("street vendor")) {
    return "Street Vendor";
  }
  if (normalized.includes("restaurant")) {
    return "Restaurant";
  }
  if (normalized.includes("study hall")) {
    return "Study Hall";
  }
  if (normalized.includes("classroom") || normalized.includes("class")) {
    return "Classroom";
  }
  if (normalized.includes("school")) {
    return "School";
  }
  if (normalized.includes("office")) {
    return "Office";
  }
  if (normalized.includes("work") || normalized.includes("coworker") || normalized.includes("client")) {
    return "Work";
  }
  if (normalized.includes("park")) {
    return "Park";
  }
  if (normalized.includes("party")) {
    return "Party";
  }
  if (normalized.includes("gym")) {
    return "Gym";
  }
  if (normalized.includes("friend") || normalized.includes("family")) {
    return "Friend / Family";
  }
  if (normalized.includes("date")) {
    return "Date";
  }
  if (normalized.includes("new house")) {
    return "New House";
  }
  if (normalized.includes("new city")) {
    return "New City";
  }
  if (normalized === "home" || normalized.includes("house")) {
    return "Home";
  }
  if (normalized.includes("street")) {
    return "Street";
  }
  if (normalized.includes("train station")) {
    return "Train Station";
  }
  if (normalized.includes("bus stop")) {
    return "Bus Stop";
  }
  if (normalized.includes("airport")) {
    return "Airport";
  }
  if (normalized.includes("hotel lobby")) {
    return "Hotel Lobby";
  }
  if (normalized.includes("station")) {
    return "Station";
  }
  if (
    normalized.includes("clarification") ||
    normalized.includes("personal introductions")
  ) {
    return "General";
  }

  const exact = Object.keys(CONTEXT_TO_GROUP).find(
    (key) => normalizeLookupValue(key) === normalized
  );
  if (exact) {
    return exact;
  }
  return null;
}

function inferContextName(lesson: Lesson, scenarioTitle: string): string {
  const explicit = canonicalizeContextName(lesson.context);
  if (explicit) {
    return explicit;
  }
  const sentenceContext = lesson.sentences.find((sentence) => sentence.contextLabel?.trim())?.contextLabel;
  const fromSentence = canonicalizeContextName(sentenceContext);
  if (fromSentence) {
    return fromSentence;
  }
  const fromScenario = canonicalizeContextName(scenarioTitle);
  if (fromScenario) {
    return fromScenario;
  }
  const fromTitle = canonicalizeContextName(lesson.title);
  if (fromTitle) {
    return fromTitle;
  }
  return "General";
}

function isValidCanonicalContextGroup(value: string | undefined): boolean {
  if (!value?.trim()) {
    return false;
  }
  return CANONICAL_CONTEXT_GROUPS.has(value.trim());
}

function inferContextGroup(contextName: string, scenarioTitle: string, lessonTitle: string): string {
  if (contextName === "Neighbor / Neighborhood" || contextName === "Neighborhood") {
    return "Residential / Living";
  }
  if (CONTEXT_TO_GROUP[contextName]) {
    return CONTEXT_TO_GROUP[contextName];
  }

  const fallbackSignal = normalizeLookupValue(`${scenarioTitle} ${lessonTitle}`);
  if (fallbackSignal.includes("neighbor") || fallbackSignal.includes("neighborhood")) {
    return "Residential / Living";
  }
  if (fallbackSignal.includes("coffee") || fallbackSignal.includes("cafe") || fallbackSignal.includes("restaurant")) {
    return "Food & Drink";
  }
  if (fallbackSignal.includes("park") || fallbackSignal.includes("party") || fallbackSignal.includes("gym")) {
    return "Social Spaces";
  }
  if (
    fallbackSignal.includes("school") ||
    fallbackSignal.includes("classroom") ||
    fallbackSignal.includes("office") ||
    fallbackSignal.includes("work")
  ) {
    return "Institutional";
  }
  if (fallbackSignal.includes("home") || fallbackSignal.includes("house") || fallbackSignal.includes("city")) {
    return "Residential / Living";
  }
  if (
    fallbackSignal.includes("street") ||
    fallbackSignal.includes("station") ||
    fallbackSignal.includes("airport") ||
    fallbackSignal.includes("hotel")
  ) {
    return "Public Spaces";
  }
  return "General";
}

function resolveContextGroupName(lesson: Lesson, contextName: string, scenarioTitle: string): string {
  const explicitGroup = lesson.contextGroup?.trim();
  if (
    explicitGroup &&
    isValidCanonicalContextGroup(explicitGroup) &&
    !isSameLabel(explicitGroup, contextName) &&
    !isSameLabel(explicitGroup, scenarioTitle)
  ) {
    return isGeneralLabel(explicitGroup) ? "General" : explicitGroup;
  }
  const inferred = inferContextGroup(contextName, scenarioTitle, lesson.title);
  return isGeneralLabel(inferred) ? "General" : inferred;
}

function resolveContextName(lesson: Lesson, scenarioTitle: string): string {
  const resolved = inferContextName(lesson, scenarioTitle);
  return isGeneralLabel(resolved) ? "General" : resolved;
}

function resolveScenarioFamily(lesson: Lesson): string {
  if (lesson.scenarioFamily?.trim()) {
    return lesson.scenarioFamily.trim();
  }
  if (lesson.title.trim()) {
    return lesson.title.trim();
  }
  return lesson.id;
}

function resolveScenarioTitle(lesson: Lesson): string {
  if (lesson.scenarioTitle?.trim()) {
    return lesson.scenarioTitle.trim();
  }
  if (lesson.scenarioFamily?.trim()) {
    return lesson.scenarioFamily.trim();
  }
  if (lesson.title.trim()) {
    return lesson.title.trim();
  }
  return lesson.id;
}

function sanitizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleContainsContext(scenarioTitle: string, contextName: string): boolean {
  const titleNorm = sanitizeText(scenarioTitle);
  const contextNorm = sanitizeText(contextName);
  if (!titleNorm || !contextNorm) {
    return false;
  }
  if (titleNorm === contextNorm || titleNorm.startsWith(`${contextNorm} `)) {
    return true;
  }
  const contextRegex = new RegExp(`\\b${escapeRegex(contextNorm)}\\b`);
  return contextRegex.test(titleNorm);
}

function isVagueScenarioTitle(scenarioTitle: string): boolean {
  const titleNorm = sanitizeText(scenarioTitle);
  return (
    titleNorm === "coffee shop" ||
    titleNorm === "gym casual" ||
    titleNorm === "party casual" ||
    titleNorm === "park playing" ||
    titleNorm === "park reading" ||
    titleNorm === "classroom introduction"
  );
}

function inferActionScenarioTitle(lesson: Lesson, contextName: string, currentTitle: string): string {
  const signal = sanitizeText(
    `${currentTitle} ${lesson.title} ${lesson.objective} ${lesson.sentences.map((sentence) => sentence.text).join(" ")}`
  );
  const contextNorm = sanitizeText(contextName);

  if (contextNorm === "park") {
    if (signal.includes("play") || signal.includes("jueg")) {
      return "Invited to join a game";
    }
    if (signal.includes("read") || signal.includes("book") || signal.includes("leer") || signal.includes("lees")) {
      return "Conversation with someone reading a book";
    }
  }
  if (contextNorm === "coffee shop") {
    return "Conversation with a stranger";
  }
  if (contextNorm === "gym") {
    return "Short conversation between sets";
  }
  if (contextNorm === "party") {
    return "Casual party introduction";
  }
  if (contextNorm === "classroom" || contextNorm === "school") {
    return "Introducing yourself to class";
  }

  if (signal.includes("introduc") || signal.includes("me llamo") || signal.includes("como te llamas")) {
    return "Personal introduction conversation";
  }
  if (signal.includes("stranger")) {
    return "Conversation with a stranger";
  }
  if (signal.includes("neighbor") || signal.includes("vecin")) {
    return "Meeting a neighbor";
  }
  if (signal.includes("order") || signal.includes("pedir")) {
    return "Placing a food order";
  }
  return currentTitle;
}

function normalizeScenarioTitle(lesson: Lesson, contextName: string): string {
  const currentTitle = resolveScenarioTitle(lesson);
  if (lesson.scenarioTitle?.trim() && lesson.scenarioFamily?.trim()) {
    return currentTitle;
  }
  const shouldNormalize = titleContainsContext(currentTitle, contextName) || isVagueScenarioTitle(currentTitle);
  if (!shouldNormalize) {
    return currentTitle;
  }
  return inferActionScenarioTitle(lesson, contextName, currentTitle);
}

function resolveScenarioKey(lesson: Lesson): string {
  if (lesson.scenarioFamily?.trim()) {
    return `family:${lesson.scenarioFamily.trim().toLowerCase()}`;
  }
  return `lesson:${lesson.id}`;
}

function resolveTier(lesson: Lesson): ScenarioFamilyTierKey {
  return lesson.tier ?? "legacy";
}

function isGeneralLabel(value: string): boolean {
  return value.trim().toLowerCase() === "general";
}

function isSameLabel(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function groupLessonsByTopic(lessons: Lesson[]): Map<string, Lesson[]> {
  const byTopic = new Map<string, Lesson[]>();
  lessons.forEach((lesson) => {
    const list = byTopic.get(lesson.topic) ?? [];
    list.push(lesson);
    byTopic.set(lesson.topic, list);
  });
  byTopic.forEach((list, topic) => {
    byTopic.set(topic, list.slice().sort(sortByTitle));
  });
  return byTopic;
}

function sortTierEntries(a: [ScenarioFamilyTierKey, Lesson[]], b: [ScenarioFamilyTierKey, Lesson[]]): number {
  return tierRank(a[0]) - tierRank(b[0]);
}

function sortScenarios(a: ScenarioGroup, b: ScenarioGroup): number {
  if (a.scenarioTitle === "Introductions and Daily Basics" && b.scenarioTitle !== "Introductions and Daily Basics") {
    return -1;
  }
  if (a.scenarioTitle !== "Introductions and Daily Basics" && b.scenarioTitle === "Introductions and Daily Basics") {
    return 1;
  }
  return a.scenarioTitle.localeCompare(b.scenarioTitle);
}

function sortContextNodes(a: ContextNode, b: ContextNode): number {
  if (a.name === "General" && b.name !== "General") {
    return -1;
  }
  if (a.name !== "General" && b.name === "General") {
    return 1;
  }
  return a.name.localeCompare(b.name);
}

function sortContextGroups(a: ContextGroup, b: ContextGroup): number {
  if (a.name === "General" && b.name !== "General") {
    return -1;
  }
  if (a.name !== "General" && b.name === "General") {
    return 1;
  }
  return a.name.localeCompare(b.name);
}

export function groupLessonsByTopicContextScenario(lessons: Lesson[]): TopicContextScenarioGroup[] {
  const byTopic = new Map<string, Map<string, Map<string, Map<string, ScenarioGroup>>>>();

  lessons.forEach((lesson) => {
    const rawScenarioTitle = resolveScenarioTitle(lesson);
    const contextName = resolveContextName(lesson, rawScenarioTitle);
    const scenarioTitle = normalizeScenarioTitle(lesson, contextName);
    const contextGroupName = resolveContextGroupName(lesson, contextName, scenarioTitle);
    const scenarioKey = resolveScenarioKey(lesson);
    const topicMap =
      byTopic.get(lesson.topic) ?? new Map<string, Map<string, Map<string, ScenarioGroup>>>();
    const contextGroupMap = topicMap.get(contextGroupName) ?? new Map<string, Map<string, ScenarioGroup>>();
    const contextMap = contextGroupMap.get(contextName) ?? new Map<string, ScenarioGroup>();
    const scenarioGroup =
      contextMap.get(scenarioKey) ??
      ({
        scenarioKey,
        scenarioFamily: resolveScenarioFamily(lesson),
        scenarioTitle,
        isFallbackScenario: !lesson.scenarioFamily?.trim(),
        tiers: {},
      } satisfies ScenarioGroup);

    const tier = resolveTier(lesson);
    const tierLessons = scenarioGroup.tiers[tier] ?? [];
    if (!tierLessons.some((existing) => existing.id === lesson.id)) {
      tierLessons.push(lesson);
    }
    tierLessons.sort(sortByTitle);
    scenarioGroup.tiers[tier] = tierLessons;

    contextMap.set(scenarioKey, scenarioGroup);
    contextGroupMap.set(contextName, contextMap);
    topicMap.set(contextGroupName, contextGroupMap);
    byTopic.set(lesson.topic, topicMap);
  });

  return Array.from(byTopic.entries())
    .map(([topic, contextGroupsMap]) => {
      const contextGroups = Array.from(contextGroupsMap.entries())
        .map(([contextGroupName, contextsMap]) => {
          const contexts = Array.from(contextsMap.entries())
            .map(([contextName, scenariosMap]) => ({
              name: contextName,
              scenarios: Array.from(scenariosMap.values()).sort(sortScenarios),
            }))
            .sort(sortContextNodes);

          const promotedScenarios: ScenarioGroup[] = [];
          const keptContexts: ContextNode[] = [];
          contexts.forEach((contextNode) => {
            const onlyContextInGroup = contexts.length === 1;
            const sameAsGroup = isSameLabel(contextGroupName, contextNode.name);
            const bothGeneral =
              isGeneralLabel(contextGroupName) && isGeneralLabel(contextNode.name) && onlyContextInGroup;
            const shouldCollapse = sameAsGroup || bothGeneral;
            if (shouldCollapse) {
              promotedScenarios.push(...contextNode.scenarios);
              return;
            }
            keptContexts.push(contextNode);
          });

          return {
            name: contextGroupName,
            scenarios: promotedScenarios.sort(sortScenarios),
            contexts: keptContexts,
          } satisfies ContextGroup;
        })
        .sort(sortContextGroups);
      return { topic, contextGroups } satisfies TopicContextScenarioGroup;
    })
    .sort((a, b) => a.topic.localeCompare(b.topic));
}

function hasStructuredTierEntries(tiers: LessonTierBuckets): boolean {
  return Boolean(tiers.easy?.length || tiers.medium?.length || tiers.real?.length);
}

export function getVisibleScenarioTiers(
  tiers: LessonTierBuckets
): Array<{ tier: ScenarioFamilyTierKey; lessons: Lesson[] }> {
  const hasStructured = hasStructuredTierEntries(tiers);
  return Object.entries(tiers)
    .filter((entry): entry is [ScenarioFamilyTierKey, Lesson[]] => Boolean(entry[1]?.length))
    .filter(([tier]) => !(hasStructured && tier === "legacy"))
    .sort(sortTierEntries)
    .map(([tier, tierLessons]) => ({ tier, lessons: tierLessons }));
}

export function getOrderedScenarioTiers(
  tiers: LessonTierBuckets
): Array<{ tier: ScenarioFamilyTierKey; lessons: Lesson[] }> {
  return getVisibleScenarioTiers(tiers);
}

export function groupLessonsByScenarioFamily(lessons: Lesson[]): ScenarioGroup[] {
  const topicContextGroups = groupLessonsByTopicContextScenario(lessons);
  const flattened: ScenarioGroup[] = [];
  topicContextGroups.forEach((topicGroup) => {
    topicGroup.contextGroups.forEach((contextGroup) => {
      contextGroup.scenarios.forEach((scenario) => {
        flattened.push(scenario);
      });
      contextGroup.contexts.forEach((context) => {
        context.scenarios.forEach((scenario) => {
          flattened.push(scenario);
        });
      });
    });
  });
  return flattened.sort((a, b) => a.scenarioTitle.localeCompare(b.scenarioTitle));
}

export function groupLessonsByTopicScenarioTier(lessons: Lesson[]): Map<string, ScenarioGroup[]> {
  const grouped = new Map<string, ScenarioGroup[]>();
  const byTopic = groupLessonsByTopic(lessons);
  byTopic.forEach((topicLessons, topic) => {
    grouped.set(topic, groupLessonsByScenarioFamily(topicLessons));
  });
  return grouped;
}

export function hasStructuredTierMetadata(scenario: ScenarioGroup): boolean {
  return hasStructuredTierEntries(scenario.tiers);
}

export function hasLegacyOnlyTier(scenario: ScenarioGroup): boolean {
  const visible = getVisibleScenarioTiers(scenario.tiers);
  return visible.length === 1 && visible[0].tier === "legacy";
}

export function getFallbackStandaloneLabel(lesson: Lesson): string {
  if (lesson.title.trim()) {
    return lesson.title.trim();
  }
  return lesson.id;
}

export function getContextFallbackLabel(name: string | undefined): string {
  if (name?.trim()) {
    return name.trim();
  }
  return "General";
}

export function getContextGroupFallbackLabel(name: string | undefined): string {
  if (name?.trim()) {
    return name.trim();
  }
  return "General";
}

export function countCollapsedContextNodes(lessons: Lesson[]): number {
  const byTopic = new Map<string, Map<string, Set<string>>>();
  lessons.forEach((lesson) => {
    const topicMap = byTopic.get(lesson.topic) ?? new Map<string, Set<string>>();
    const scenarioTitle = resolveScenarioTitle(lesson);
    const contextName = resolveContextName(lesson, scenarioTitle);
    const contextGroupName = resolveContextGroupName(lesson, contextName, scenarioTitle);
    const contexts = topicMap.get(contextGroupName) ?? new Set<string>();
    contexts.add(contextName);
    topicMap.set(contextGroupName, contexts);
    byTopic.set(lesson.topic, topicMap);
  });

  let removed = 0;
  byTopic.forEach((groupMap) => {
    groupMap.forEach((contexts, contextGroupName) => {
      contexts.forEach((contextName) => {
        const onlyContextInGroup = contexts.size === 1;
        const sameAsGroup = isSameLabel(contextGroupName, contextName);
        const bothGeneral =
          isGeneralLabel(contextGroupName) && isGeneralLabel(contextName) && onlyContextInGroup;
        if (sameAsGroup || bothGeneral) {
          removed += 1;
        }
      });
    });
  });
  return removed;
}
