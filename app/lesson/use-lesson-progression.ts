"use client";

import { useMemo } from "react";
import { lessons, type Lesson, type LessonLanguage } from "@/lib/lesson-data";
import { useTopicProgressStore } from "@/app/topic-progress";
import { useProgressStore } from "@/app/progress-store";
import { getLessonCompletionStatus, getLessonProgressStatus } from "@/lib/lesson-status";
import { getTopicMasteryScore } from "@/lib/mastery";
import { isContinuationLessonUnlocked } from "@/lib/lesson-continuation-unlock";
import { resolveEffectiveContinuationPrerequisite } from "@/lib/lesson-scenario-continuation";
import { getOrderedScenarioTiers, groupLessonsByTopicContextScenario } from "@/lib/lesson-scenario-family";
import { isContinuationTenseMode, normalizeTenseMode } from "@/lib/lesson-tense-mode";
import { getScenarioTierGates } from "./lesson-tier-gates";
import {
  CORE_GROUP_ORDER,
  getCoreGroupName,
  type TopicStatus,
  type TopicCompletionSummary,
} from "./lesson-shared";
import { useDeveloperMode } from "@/lib/developer-mode";

function flattenLessonsInUiHierarchyOrder(groupLessons: Lesson[]): Lesson[] {
  const ordered: Lesson[] = [];
  const grouped = groupLessonsByTopicContextScenario(groupLessons);
  grouped.forEach((topicGroup) => {
    topicGroup.contextGroups.forEach((contextGroup) => {
      const pushScenarioLessons = (scenario: { tiers: Record<string, Lesson[] | undefined> }) => {
        getOrderedScenarioTiers(scenario.tiers).forEach((tierBucket) => {
          tierBucket.lessons.forEach((lesson) => ordered.push(lesson));
        });
      };
      contextGroup.scenarios.forEach(pushScenarioLessons);
      contextGroup.contexts.forEach((contextNode) => {
        contextNode.scenarios.forEach(pushScenarioLessons);
      });
    });
  });
  return ordered;
}

export function useLessonProgression(language: LessonLanguage) {
  const { getProgress } = useTopicProgressStore();
  const { chunks } = useProgressStore();
  const { enabled: developerModeEnabled } = useDeveloperMode();

  const lessonsById = useMemo(() => new Map(lessons.map((l) => [l.id, l])), []);

  const languageLessons = useMemo(
    () => lessons.filter((lesson) => lesson.language === language),
    [language]
  );

  const coreGroups = useMemo(() => {
    return CORE_GROUP_ORDER.map((groupTitle) => ({
      groupTitle,
      topics: languageLessons.filter(
        (oneLesson) =>
          oneLesson.trackType === "core" &&
          oneLesson.sourceType === "core" &&
          getCoreGroupName(oneLesson) === groupTitle
      ),
    }));
  }, [languageLessons]);

  const languageSpecificLessons = useMemo(
    () =>
      languageLessons.filter((oneLesson) => {
        if (oneLesson.trackType !== "language-specific") {
          return false;
        }
        return oneLesson.specializationType !== "formal-informal";
      }),
    [languageLessons]
  );

  const generatedLanguageSpecific = useMemo(
    () => languageSpecificLessons.filter((oneLesson) => oneLesson.sourceType === "generated"),
    [languageSpecificLessons]
  );

  const requiredLanguageSpecific = useMemo(
    () =>
      languageSpecificLessons.filter(
        (oneLesson) => oneLesson.required && oneLesson.sourceType !== "generated"
      ),
    [languageSpecificLessons]
  );

  const optionalLanguageSpecific = useMemo(
    () =>
      languageSpecificLessons
        .filter((oneLesson) => !oneLesson.required && oneLesson.sourceType !== "generated")
        .sort((a, b) => a.title.localeCompare(b.title)),
    [languageSpecificLessons]
  );

  const optionalGeneratedLanguageSpecific = useMemo(
    () =>
      generatedLanguageSpecific
        .filter((oneLesson) => !oneLesson.required)
        .sort((a, b) => {
          const byTopic = a.topic.localeCompare(b.topic);
          if (byTopic !== 0) {
            return byTopic;
          }
          return a.title.localeCompare(b.title);
        }),
    [generatedLanguageSpecific]
  );

  const topicProgressById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getProgress>>();
    languageLessons.forEach((oneLesson) => {
      map.set(oneLesson.id, getProgress(language, oneLesson.id));
    });
    return map;
  }, [getProgress, languageLessons, language]);

  const topicCompletionById = useMemo(() => {
    const chunkProgressMap = new Map(
      Object.values(chunks).map((chunk) => [
        chunk.text.toLowerCase(),
        {
          timesSeen: chunk.timesSeen,
          timesCorrect: chunk.timesCorrect,
          lastPracticed: chunk.lastPracticed,
          speechAttempts: chunk.speechAttempts ?? 0,
          speechCorrect: chunk.speechCorrect ?? 0,
          speechMatchPercent: chunk.speechMatchPercent,
          lastSpeechPracticedAt: chunk.lastSpeechPracticedAt,
          writingAttempts: chunk.writingAttempts ?? 0,
          writingCorrect: chunk.writingCorrect ?? 0,
          writingAccuracy: chunk.writingAccuracy,
        },
      ])
    );
    const map = new Map<string, TopicCompletionSummary>();
    languageLessons.forEach((oneLesson) => {
      const progress = topicProgressById.get(oneLesson.id) ?? getProgress(language, oneLesson.id);
      const completion = getLessonCompletionStatus(oneLesson, progress);
      const mastery = getTopicMasteryScore([oneLesson], {
        topicProgressByLessonId: topicProgressById,
        chunkProgressByText: chunkProgressMap,
      });
      map.set(oneLesson.id, {
        isCompleted: completion.isComplete,
        accuracy: Math.round(completion.activeRecallAccuracy),
        phasesDone: completion.phasesDone,
        completion,
        masteryScore: mastery.score,
        masteryTier: mastery.tier,
        masteryBreakdown: mastery.breakdown,
      });
    });
    return map;
  }, [chunks, getProgress, languageLessons, language, topicProgressById]);

  const progressionSequence = useMemo(() => {
    const sequence: Lesson[] = [];
    const used = new Set<string>();
    CORE_GROUP_ORDER.forEach((groupName) => {
      const groupCore = coreGroups.find((group) => group.groupTitle === groupName)?.topics ?? [];
      const orderedGroupCore = flattenLessonsInUiHierarchyOrder(groupCore);
      orderedGroupCore.forEach((topic) => {
        sequence.push(topic);
        used.add(topic.id);
      });
      const insertedRequired = requiredLanguageSpecific.filter(
        (topic) => getCoreGroupName(topic) === groupName
      );
      insertedRequired.forEach((topic) => {
        sequence.push(topic);
        used.add(topic.id);
      });
    });
    requiredLanguageSpecific
      .filter((topic) => !used.has(topic.id))
      .forEach((topic) => sequence.push(topic));
    return sequence;
  }, [coreGroups, requiredLanguageSpecific]);

  const lockedById = useMemo(() => {
    const map = new Map<string, boolean>();
    const tierGateLockedById = new Map<string, boolean>();
    CORE_GROUP_ORDER.forEach((groupName) => {
      const groupCore = coreGroups.find((group) => group.groupTitle === groupName)?.topics ?? [];
      const grouped = groupLessonsByTopicContextScenario(groupCore);
      grouped.forEach((topicGroup) => {
        topicGroup.contextGroups.forEach((contextGroup) => {
          const evaluateScenario = (scenario: { tiers: Record<string, Lesson[] | undefined> }) => {
            const orderedTiers = getOrderedScenarioTiers(scenario.tiers);
            const gates = getScenarioTierGates(
              orderedTiers,
              (lesson) => topicCompletionById.get(lesson.id)?.isCompleted ?? false
            );
            orderedTiers
              .find((entry) => entry.tier === "medium")
              ?.lessons.forEach((lesson) => tierGateLockedById.set(lesson.id, !gates.medium.unlocked));
            orderedTiers
              .find((entry) => entry.tier === "real")
              ?.lessons.forEach((lesson) => tierGateLockedById.set(lesson.id, !gates.real.unlocked));
          };
          contextGroup.scenarios.forEach(evaluateScenario);
          contextGroup.contexts.forEach((contextNode) => {
            contextNode.scenarios.forEach(evaluateScenario);
          });
        });
      });
    });
    const seenCoreGroups = new Set<string>();
    progressionSequence.forEach((topic, index) => {
      const topicCoreGroup = topic.trackType === "core" ? getCoreGroupName(topic) : null;
      if (topicCoreGroup && !seenCoreGroups.has(topicCoreGroup)) {
        seenCoreGroups.add(topicCoreGroup);
        map.set(topic.id, tierGateLockedById.get(topic.id) ?? false);
        return;
      }
      if (index === 0) {
        map.set(topic.id, tierGateLockedById.get(topic.id) ?? false);
        return;
      }
      const previous = progressionSequence[index - 1];
      const previousCompleted = topicCompletionById.get(previous.id)?.isCompleted ?? false;
      const tierLocked = tierGateLockedById.get(topic.id) ?? false;
      map.set(topic.id, tierLocked || !previousCompleted);
    });
    progressionSequence.forEach((topic) => {
      if (!isContinuationTenseMode(normalizeTenseMode(topic.tenseMode))) {
        return;
      }
      const { prerequisite } = resolveEffectiveContinuationPrerequisite(topic, lessonsById);
      const { unlocked } = isContinuationLessonUnlocked({
        lesson: topic,
        prerequisiteLesson: prerequisite ?? undefined,
        prerequisiteProgress: prerequisite ? getProgress(language, prerequisite.id) : undefined,
      });
      if (!unlocked) {
        map.set(topic.id, true);
      }
    });
    return map;
  }, [coreGroups, getProgress, language, lessonsById, progressionSequence, topicCompletionById]);

  const topicStatusById = useMemo(() => {
    const map = new Map<string, TopicStatus>();
    languageLessons.forEach((topic) => {
      const progress = topicProgressById.get(topic.id) ?? getProgress(language, topic.id);
      const completion = topicCompletionById.get(topic.id) ?? {
        isCompleted: false,
        accuracy: 0,
        phasesDone: 0,
        completion: getLessonCompletionStatus(topic, progress),
        masteryScore: 0,
        masteryTier: "Untrained",
        masteryBreakdown: {
          speaking: { value: 0, source: "fallback" },
          recall: { value: 0, source: "exact" },
          writing: { value: 0, source: "approx" },
          consistency: { value: 0, source: "approx" },
        },
      };
      const isLockedBySequence = developerModeEnabled ? false : (lockedById.get(topic.id) ?? false);
      if (
        topic.trackType === "language-specific" &&
        (!topic.required || topic.sourceType === "generated")
      ) {
        map.set(topic.id, getLessonProgressStatus(completion.completion, false));
        return;
      }
      map.set(topic.id, getLessonProgressStatus(completion.completion, isLockedBySequence));
    });
    return map;
  }, [
    developerModeEnabled,
    getProgress,
    languageLessons,
    lockedById,
    language,
    topicCompletionById,
    topicProgressById,
  ]);

  return {
    languageLessons,
    coreGroups,
    requiredLanguageSpecific,
    optionalLanguageSpecific,
    optionalGeneratedLanguageSpecific,
    progressionSequence,
    topicStatusById,
    topicCompletionById,
    topicProgressById,
  };
}
