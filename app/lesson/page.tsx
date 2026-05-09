"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { lessons, type Lesson, type LessonLanguage } from "@/lib/lesson-data";
import { AppShell } from "@/app/AppShell";
import { useTopicProgressStore } from "@/app/topic-progress";
import { isContinuationLessonUnlocked } from "@/lib/lesson-continuation-unlock";
import {
  groupLessonsByScenarioFamilyTenseModeAndTier,
  resolveEffectiveContinuationPrerequisite,
} from "@/lib/lesson-scenario-continuation";
import type { TenseMode } from "@/lib/lesson-tense-mode";
import { normalizeTenseMode } from "@/lib/lesson-tense-mode";
import {
  phases,
  CORE_GROUP_ORDER,
  getCoreGroupAccordionStatus,
  getCoreGroupAvgAccuracy,
  getCoreGroupName,
  getSourceTypeLabel,
  getTrackLabel,
  LAST_LESSON_STORAGE_KEY,
} from "./lesson-shared";
import { useLessonProgression } from "./use-lesson-progression";
import { getMasteryTier } from "@/lib/mastery";
import { getLessonCompletionStatus } from "@/lib/lesson-status";
import {
  getOrderedScenarioTiers,
  groupLessonsByTopicContextScenario,
  hasStructuredTierMetadata,
  type ContextGroup,
  type LessonTierBuckets,
  type ScenarioGroup,
  type ScenarioFamilyTierKey,
} from "@/lib/lesson-scenario-family";
import { getScenarioTierGates } from "./lesson-tier-gates";

const DEFAULT_OPEN_GROUP = CORE_GROUP_ORDER[0] ?? "";

const CONTINUATION_TENSE_UI_ORDER = ["past-retell", "future-plan", "mixed"] as const satisfies readonly TenseMode[];

function continuationLessonsInTierOrder(
  byTense: Map<TenseMode, LessonTierBuckets>,
  tier: ScenarioFamilyTierKey
): Lesson[] {
  const out: Lesson[] = [];
  for (const mode of CONTINUATION_TENSE_UI_ORDER) {
    const bucket = byTense.get(mode);
    const raw = bucket?.[tier];
    if (!raw?.length) {
      continue;
    }
    out.push(...[...raw].sort((a, b) => a.title.localeCompare(b.title)));
  }
  return out;
}

function presentOnlyTierBuckets(tiers: LessonTierBuckets): LessonTierBuckets {
  const out: LessonTierBuckets = {};
  (["easy", "medium", "real", "legacy"] as const).forEach((key) => {
    const list = tiers[key];
    if (!list?.length) {
      return;
    }
    const filtered = list.filter((l) => normalizeTenseMode(l.tenseMode) === "present");
    if (filtered.length > 0) {
      out[key] = filtered;
    }
  });
  return out;
}

function formatTierLabel(tier: ScenarioFamilyTierKey): string {
  if (tier === "legacy") {
    return "Open Lesson / Legacy";
  }
  return tier[0].toUpperCase() + tier.slice(1);
}

function getTierChipClass(tier: ScenarioFamilyTierKey, structured: boolean): string {
  if (!structured || tier === "legacy") {
    return "lr-tier-chip lr-tier-chip--legacy";
  }
  return `lr-tier-chip lr-tier-chip--${tier}`;
}

function rememberLastLessonId(lessonId: string) {
  try {
    sessionStorage.setItem(LAST_LESSON_STORAGE_KEY, lessonId);
  } catch {
    /* ignore */
  }
}

function renderMasteryBreakdown(breakdown: {
  speaking: { value: number; source: string };
  recall: { value: number; source: string };
  writing: { value: number; source: string };
  consistency: { value: number; source: string };
}) {
  const sourceMeta = (source: string) => {
    if (source === "exact") {
      return { label: "Exact", title: "Based on direct tracked correctness signals" };
    }
    if (source === "approx") {
      return { label: "Approx", title: "Estimated from proxy or mixed tracked signals" };
    }
    return { label: "Estimated", title: "Fallback estimate when direct data is missing" };
  };
  const speakingSource = sourceMeta(breakdown.speaking.source);
  const recallSource = sourceMeta(breakdown.recall.source);
  const writingSource = sourceMeta(breakdown.writing.source);
  const consistencySource = sourceMeta(breakdown.consistency.source);
  return (
    <>
      <p className="muted">Breakdown:</p>
      <ul className="sentence-list">
        <li>
          Speaking: {getMasteryTier(breakdown.speaking.value)} (
          <span title={speakingSource.title}>{speakingSource.label}</span>)
        </li>
        <li>
          Recall: {getMasteryTier(breakdown.recall.value)} (
          <span title={recallSource.title}>{recallSource.label}</span>)
        </li>
        <li>
          Writing: {getMasteryTier(breakdown.writing.value)} (
          <span title={writingSource.title}>{writingSource.label}</span>)
        </li>
        <li>
          Consistency: {getMasteryTier(breakdown.consistency.value)} (
          <span title={consistencySource.title}>{consistencySource.label}</span>)
        </li>
      </ul>
    </>
  );
}

function getEmptyCompletion(topic: Lesson) {
  return {
    isCompleted: false,
    accuracy: 0,
    phasesDone: 0,
    completion: getLessonCompletionStatus(topic, undefined),
    masteryScore: 0,
    masteryTier: "Untrained",
    masteryBreakdown: {
      speaking: { value: 0, source: "fallback" },
      recall: { value: 0, source: "exact" },
      writing: { value: 0, source: "approx" },
      consistency: { value: 0, source: "approx" },
    },
  } as const;
}

type TopicStatusMap = Map<string, "Not started" | "In progress" | "Complete" | "Locked">;

function getLessonStatus(
  topic: Lesson,
  topicStatusById: TopicStatusMap,
  showHydratedProgress: boolean
): "Not started" | "In progress" | "Complete" | "Locked" {
  const hydratedStatus = topicStatusById.get(topic.id) ?? "Not started";
  return showHydratedProgress ? hydratedStatus : "Not started";
}

export default function LessonOverviewPage() {
  const [selectedLanguage, setSelectedLanguage] = useState<LessonLanguage>("es");
  const { getProgress } = useTopicProgressStore();
  const lessonsById = useMemo(() => new Map(lessons.map((l) => [l.id, l])), []);
  const {
    coreGroups,
    requiredLanguageSpecific,
    optionalLanguageSpecific,
    optionalGeneratedLanguageSpecific,
    topicStatusById,
    topicCompletionById,
  } = useLessonProgression(selectedLanguage);
  const [hasMounted, setHasMounted] = useState(false);
  const [openCoreGroupTitle, setOpenCoreGroupTitle] = useState<string>(DEFAULT_OPEN_GROUP);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- client mounted; first paint false matches SSR */
    setHasMounted(true);
  }, []);

  useEffect(() => {
    const onTouchStartCapture = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      console.log("[touch target]", el, el?.className, el?.tagName);
    };
    document.addEventListener("touchstart", onTouchStartCapture, { capture: true });
    return () => document.removeEventListener("touchstart", onTouchStartCapture, { capture: true });
  }, []);
  const showHydratedProgress = hasMounted;

  /* Open the core group that matches last lesson (sessionStorage) or the first pathway group. */
  useLayoutEffect(() => {
    if (!hasMounted) {
      return;
    }
    let lastId: string | null = null;
    try {
      lastId = sessionStorage.getItem(LAST_LESSON_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    const topic = lastId
      ? lessons.find((l) => l.id === lastId && l.language === selectedLanguage)
      : undefined;
    const groupTitle = topic ? getCoreGroupName(topic) : null;
    const openTitle = groupTitle ?? DEFAULT_OPEN_GROUP;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- sync open section from sessionStorage after mount / language change */
    setOpenCoreGroupTitle(openTitle);
  }, [hasMounted, selectedLanguage]);

  const getCompletion = (topic: Lesson) => {
    const emptyCompletion = getEmptyCompletion(topic);
    const hydratedCompletion = topicCompletionById.get(topic.id) ?? emptyCompletion;
    return showHydratedProgress ? hydratedCompletion : emptyCompletion;
  };

  const renderLessonEntry = (
    topic: Lesson,
    options?: {
      tierLabel?: string;
      extraMeta?: string;
      forceLocked?: boolean;
      continuationLockReason?: string;
      /** When true, do not apply pathway "Locked" from topicStatusById (used for continuation rows). */
      omitProgressionLock?: boolean;
      hideOptionalBadge?: boolean;
    }
  ) => {
    const status = getLessonStatus(topic, topicStatusById, showHydratedProgress);
    const completion = getCompletion(topic);
    const isLockedByProgression =
      !options?.omitProgressionLock && showHydratedProgress ? status === "Locked" : false;
    const isLocked = Boolean(options?.forceLocked) || isLockedByProgression;
    const tierPrefix = options?.tierLabel ? `${options.tierLabel} · ` : "";

    return (
      <li key={topic.id}>
        {isLocked ? (
          <span className="button lr-lesson-open lr-lesson-open--locked" aria-disabled="true">
            {(showHydratedProgress && status === "Complete" ? "✓ " : "") +
              "🔒 Locked" +
              `: ${tierPrefix}${topic.title}`}
          </span>
        ) : (
          <Link
            href={`/lesson/${topic.id}`}
            prefetch={false}
            className="button lr-lesson-open"
            aria-label={`Open lesson: ${topic.title}`}
            onClick={() => {
              console.log("[lesson link click]", topic.id);
              rememberLastLessonId(topic.id);
            }}
          >
            {(showHydratedProgress && status === "Complete" ? "✓ " : "") +
              "Open" +
              `: ${tierPrefix}${topic.title}`}
          </Link>
        )}
        <p className="muted">
          <span className="track-badge">{getTrackLabel(topic.trackType)}</span>{" "}
          {!options?.hideOptionalBadge && !topic.required ? <span className="track-badge">Optional</span> : null}{" "}
          {options?.tierLabel ? <span className="track-badge">{options.tierLabel}</span> : null}{" "}
          {getSourceTypeLabel(topic.sourceType, topic.trackType) ? (
            <>
              <span className="track-badge">{getSourceTypeLabel(topic.sourceType, topic.trackType)}</span>{" "}
            </>
          ) : null}
          Status: {status}
          {options?.extraMeta ? ` | ${options.extraMeta}` : ""} | Phases: {completion.phasesDone}/{phases.length} |
          Active Recall: {completion.accuracy}% | Mastery Tier: {completion.masteryTier}
        </p>
        {renderMasteryBreakdown(completion.masteryBreakdown)}
        {options?.continuationLockReason ? (
          <p className="muted lr-tier-lock-message">{options.continuationLockReason}</p>
        ) : null}
      </li>
    );
  };

  const renderNestedLessonGroups = (groupLessons: Lesson[], options?: { includeTopicHeader?: boolean }) => {
    const topicContexts = groupLessonsByTopicContextScenario(groupLessons);
    const completionById = new Map<string, { isCompleted: boolean }>();
    groupLessons.forEach((topic) => {
      completionById.set(topic.id, { isCompleted: getCompletion(topic).isCompleted });
    });

    const renderContinuationLessonRow = (
      lesson: Lesson,
      tierForceLocked: boolean,
      tierLabelForRow: string | undefined
    ) => {
      const { prerequisite } = resolveEffectiveContinuationPrerequisite(lesson, lessonsById);
      const unlock = isContinuationLessonUnlocked({
        lesson,
        prerequisiteLesson: prerequisite ?? undefined,
        prerequisiteProgress: prerequisite ? getProgress(selectedLanguage, prerequisite.id) : undefined,
      });
      return renderLessonEntry(lesson, {
        tierLabel: tierLabelForRow,
        forceLocked: tierForceLocked || !unlock.unlocked,
        continuationLockReason:
          !unlock.unlocked && unlock.reason ? unlock.reason : undefined,
        omitProgressionLock: true,
        hideOptionalBadge: true,
      });
    };

    const renderScenarioList = (scenarios: ScenarioGroup[], scopeKey: string) => {
      return (
        <ul className="sentence-list lr-hierarchy-list lr-hierarchy-list--scenario">
          {scenarios.map((scenario) => {
            const presentTiers = presentOnlyTierBuckets(scenario.tiers);
            const orderedTiersPresent = getOrderedScenarioTiers(presentTiers).filter(
              (bucket) => bucket.lessons.length > 0
            );
            const structuredPresent = hasStructuredTierMetadata({
              ...scenario,
              tiers: presentTiers,
            });
            const tierGate = getScenarioTierGates(
              orderedTiersPresent,
              (lesson) => completionById.get(lesson.id)?.isCompleted ?? false
            );
            const languageLessons = lessons.filter((l) => l.language === selectedLanguage);
            const byTense = groupLessonsByScenarioFamilyTenseModeAndTier(
              languageLessons,
              (scenario.scenarioFamily ?? "").trim()
            );
            return (
              <li key={`scenario-${scopeKey}-${scenario.scenarioKey}`} className="lr-h-level lr-h-level--scenario">
                <details open className="lr-h-details lr-h-details--scenario">
                  <summary className="lr-h-summary lr-h-summary--scenario">
                    <strong>{scenario.scenarioTitle}</strong>
                  </summary>
                  {orderedTiersPresent.length > 0 ? (
                    <ul className="sentence-list lr-hierarchy-list lr-hierarchy-list--tier">
                      {orderedTiersPresent.map((tierBucket) => {
                        const tierLabel = structuredPresent
                          ? formatTierLabel(tierBucket.tier)
                          : "Open Lesson / Legacy";
                        const gate = tierGate[tierBucket.tier];
                        const isLockedTier = !gate.unlocked;
                        const completionMeta =
                          tierBucket.tier === "easy"
                            ? `Easy completion: ${gate.completionPercent ?? 0}%`
                            : tierBucket.tier === "medium"
                              ? `Medium completion: ${gate.completionPercent ?? 0}%`
                              : null;
                        const tierContinuationLessons = continuationLessonsInTierOrder(byTense, tierBucket.tier);
                        const rowTierLabel = structuredPresent ? tierLabel : undefined;
                        return (
                          <li key={`tier-${scenario.scenarioKey}-${tierBucket.tier}`} className="lr-h-level lr-h-level--tier">
                            <details className="lr-h-details lr-h-details--tier" open={tierBucket.tier === "easy"}>
                              <summary className="lr-h-summary lr-h-summary--tier">
                                <span className={getTierChipClass(tierBucket.tier, structuredPresent)}>{tierLabel}</span>
                                <span className="lr-tier-summary-meta">
                                  {isLockedTier ? "🔒 Locked" : "▼"}
                                  {completionMeta ? ` • ${completionMeta}` : ""}
                                </span>
                              </summary>
                              {isLockedTier ? <p className="muted lr-tier-lock-message">{gate.lockReason}</p> : null}
                              <ul className="sentence-list">
                                {tierBucket.lessons.map((topic) =>
                                  renderLessonEntry(topic, {
                                    tierLabel: rowTierLabel,
                                    forceLocked: isLockedTier,
                                  })
                                )}
                                {tierContinuationLessons.map((lesson) =>
                                  renderContinuationLessonRow(lesson, isLockedTier, rowTierLabel)
                                )}
                              </ul>
                            </details>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </details>
              </li>
            );
          })}
        </ul>
      );
    };

    const renderContextGroup = (
      topicGroupTopic: string,
      contextGroup: ContextGroup
    ) => {
      const contextGroupScope = `${topicGroupTopic}-${contextGroup.name || "General"}`;
      return (
        <li key={`context-group-${contextGroupScope}`} className="lr-h-level lr-h-level--context-group">
          <details open className="lr-h-details lr-h-details--context-group">
            <summary className="lr-h-summary lr-h-summary--context-group">{contextGroup.name || "General"}</summary>
            {renderScenarioList(contextGroup.scenarios, `${contextGroupScope}-group`)}
            {contextGroup.contexts.length > 0 ? (
              <ul className="sentence-list lr-hierarchy-list lr-hierarchy-list--scenario">
                {contextGroup.contexts.map((context) => (
                  <li key={`context-${contextGroupScope}-${context.name}`} className="lr-h-level lr-h-level--context">
                    <details open className="lr-h-details lr-h-details--context">
                      <summary className="lr-h-summary lr-h-summary--context">{context.name || "General"}</summary>
                      {renderScenarioList(context.scenarios, `${contextGroupScope}-${context.name || "General"}`)}
                    </details>
                  </li>
                ))}
              </ul>
            ) : null}
          </details>
        </li>
      );
    };

    return (
      <ul className="sentence-list lr-hierarchy-list lr-hierarchy-list--topic">
        {topicContexts.map((topicGroup) => (
          <li key={`topic-group-${topicGroup.topic}`} className="lr-h-level lr-h-level--topic">
            {options?.includeTopicHeader ? (
              <details open className="lr-h-details lr-h-details--topic">
                <summary className="lr-h-summary lr-h-summary--topic">
                  <strong>{topicGroup.topic}</strong>
                </summary>
                <ul className="sentence-list lr-hierarchy-list lr-hierarchy-list--context-group">
                  {topicGroup.contextGroups.map((contextGroup) => renderContextGroup(topicGroup.topic, contextGroup))}
                </ul>
              </details>
            ) : (
              <ul className="sentence-list lr-hierarchy-list lr-hierarchy-list--context-group">
                {topicGroup.contextGroups.map((contextGroup) => renderContextGroup(topicGroup.topic, contextGroup))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <AppShell>
      <div className="page">
        <Link href="/lesson/es-intro-park-playing" className="button" prefetch={false}>
          TEST: Open Park Playing
        </Link>
        <h1>Lessons</h1>
        <p className="muted">Pick a topic, then open a lesson to work through the full session flow.</p>
        <section className="card lr-lesson-overview-language">
          <h2>Language</h2>
          <label className="sr-only" htmlFor="lr-lesson-lang">
            Lesson language
          </label>
          <select
            id="lr-lesson-lang"
            className="text-input lr-lang-select"
            value={selectedLanguage}
            onChange={(event) => setSelectedLanguage(event.target.value as LessonLanguage)}
            aria-label="Lesson language"
          >
            <option value="es">Spanish (es)</option>
            <option value="ru">Russian (ru)</option>
          </select>
        </section>
        <section className="card">
          <h2>Topic Progression</h2>
          <h3>Core Lesson Pathway</h3>
          {coreGroups.map((group, groupIndex) => {
            const groupStatus = getCoreGroupAccordionStatus(group.topics, topicStatusById, showHydratedProgress);
            const groupAvgAccuracy = getCoreGroupAvgAccuracy(
              group.topics,
              topicCompletionById,
              showHydratedProgress
            );
            const isOpen = openCoreGroupTitle === group.groupTitle;
            const headId = `lr-core-head-${groupIndex}`;
            const panelId = `lr-core-panel-${groupIndex}`;
            return (
              <div
                key={`core-${group.groupTitle}`}
                className={`lr-topic-accordion${isOpen ? " lr-topic-accordion--open" : ""}`}
                data-lr-core-group={group.groupTitle}
              >
                <button
                  type="button"
                  className="button lr-topic-accordion-header"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  id={headId}
                  onClick={() => {
                    setOpenCoreGroupTitle((prev) => (prev === group.groupTitle ? "" : group.groupTitle));
                  }}
                >
                  <span className="lr-topic-accordion-chevron" aria-hidden />
                  <span className="lr-topic-accordion-title">{group.groupTitle}</span>
                  <span className="lr-topic-accordion-track-badge track-badge">{getTrackLabel("core")}</span>
                  <span className="lr-topic-accordion-meta muted">
                    {groupStatus} · Active Recall {groupAvgAccuracy}%
                  </span>
                </button>
                {isOpen ? (
                  <div
                    className="lr-topic-accordion-panel-inner"
                    id={panelId}
                    role="region"
                    aria-labelledby={headId}
                  >
                    <div className="lr-core-lesson-links-static">{renderNestedLessonGroups(group.topics)}</div>
                  </div>
                ) : null}
              </div>
            );
          })}
          <h3>Language-Specific Topics</h3>
          {renderNestedLessonGroups([...requiredLanguageSpecific, ...optionalLanguageSpecific], {
            includeTopicHeader: true,
          })}
          {optionalGeneratedLanguageSpecific.length > 0 ? (
            <>
              <h3>Real-world Scenarios (Extra Practice)</h3>
              {renderNestedLessonGroups(optionalGeneratedLanguageSpecific, { includeTopicHeader: true })}
            </>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
