"use client";

import { useMemo, useState } from "react";
import type { Lesson, LessonLanguage } from "@/lib/lesson-data";
import { useProgressStore } from "@/app/progress-store";
import { AppShell } from "@/app/AppShell";
import { useLessonProgression } from "@/app/lesson/use-lesson-progression";
import { CORE_GROUP_ORDER } from "@/app/lesson/lesson-shared";
import { useSelectedInterest } from "@/app/interest-preferences";
import { SolarSystemWordsMap, type SolarPlanetInput } from "@/app/progress/SolarSystemWordsMap";
import {
  getLanguageMasteryScore,
  getMasteryTier,
  getTopicMasteryScore,
  type TopicMasteryStores,
} from "@/lib/mastery";
import { isChunkMastered } from "@/lib/lesson-status";
import type { CoreTopic } from "@/lib/core-topics";

const LANGUAGE_LABEL: Record<LessonLanguage, string> = {
  es: "Spanish",
  ru: "Russian",
};

const CORE_TOPIC_IMPORTANCE: Record<CoreTopic, 1 | 2 | 3> = {
  Introductions: 3,
  "Ordering Food": 3,
  Directions: 3,
  Shopping: 2,
  Hotel: 2,
  "Emergencies & Help": 2,
  "Job & Hobbies": 2,
};

const PLACEHOLDER_PERIPHERAL = ["Culture", "Travel", "Work", "News"] as const;

function clamp01(n: number): number {
  if (Number.isNaN(n)) {
    return 0;
  }
  return Math.min(1, Math.max(0, n));
}

function breakdownSummaryText(breakdown: {
  speaking: { value: number; source: string };
  recall: { value: number; source: string };
  writing: { value: number; source: string };
  consistency: { value: number; source: string };
}): string {
  const sourceLabel = (source: string) =>
    source === "exact" ? "Exact" : source === "approx" ? "Approx" : "Estimated";
  return `Speaking ${getMasteryTier(breakdown.speaking.value)} (${sourceLabel(
    breakdown.speaking.source
  )}) · Recall ${getMasteryTier(breakdown.recall.value)} (${sourceLabel(
    breakdown.recall.source
  )}) · Writing ${getMasteryTier(breakdown.writing.value)} (${sourceLabel(
    breakdown.writing.source
  )}) · Consistency ${getMasteryTier(breakdown.consistency.value)} (${sourceLabel(
    breakdown.consistency.source
  )})`;
}

export default function ProgressPage() {
  const { chunks } = useProgressStore();
  const [selectedLanguage, setSelectedLanguage] = useState<LessonLanguage>("es");
  const { coreGroups, optionalLanguageSpecific, optionalGeneratedLanguageSpecific, requiredLanguageSpecific, languageLessons, topicProgressById } =
    useLessonProgression(selectedLanguage);
  const [selectedInterest] = useSelectedInterest();

  const chunkMasteryMap = useMemo(
    () =>
      new Map(
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
      ),
    [chunks]
  );
  const masteryStores = useMemo<TopicMasteryStores>(
    () => ({
      topicProgressByLessonId: topicProgressById,
      chunkProgressByText: chunkMasteryMap,
    }),
    [chunkMasteryMap, topicProgressById]
  );

  const solarPlanets = useMemo((): SolarPlanetInput[] => {
    const inner: SolarPlanetInput[] = CORE_GROUP_ORDER.map((groupTitle) => {
      const topics = coreGroups.find((g) => g.groupTitle === groupTitle)?.topics ?? [];
      const mastery = getTopicMasteryScore(topics, masteryStores);
      const mastery01 = clamp01(mastery.score / 100);
      return {
        id: `core-${groupTitle}`,
        band: "inner",
        label: groupTitle,
        importance: CORE_TOPIC_IMPORTANCE[groupTitle],
        mastery01,
        weak: mastery.score < 40,
      };
    });

    const peripheralBuckets = new Map<string, Lesson[]>();
    const addPeripheralLesson = (lesson: Lesson) => {
      const key = lesson.topic.trim();
      const list = peripheralBuckets.get(key) ?? [];
      if (!list.some((x) => x.id === lesson.id)) {
        list.push(lesson);
      }
      peripheralBuckets.set(key, list);
    };

    requiredLanguageSpecific.forEach(addPeripheralLesson);
    optionalLanguageSpecific.forEach(addPeripheralLesson);
    optionalGeneratedLanguageSpecific.forEach(addPeripheralLesson);

    languageLessons.forEach((lesson) => {
      if (lesson.trackType !== "interest") {
        return;
      }
      if (lesson.interestTopic !== selectedInterest) {
        return;
      }
      addPeripheralLesson(lesson);
    });

    let outer: SolarPlanetInput[] = Array.from(peripheralBuckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 12)
      .map(([label, groupLessons]) => {
        const slug = label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        const mastery = getTopicMasteryScore(groupLessons, masteryStores);
        const mastery01 = clamp01(mastery.score / 100);
        return {
          id: `periph-${slug || "topic"}`,
          band: "outer" as const,
          label,
          importance: 1 as const,
          mastery01,
          weak: mastery.score < 40,
        };
      });

    if (outer.length === 0) {
      outer = PLACEHOLDER_PERIPHERAL.map((name) => ({
        id: `placeholder-${name}`,
        band: "outer" as const,
        label: name,
        importance: 1 as const,
        mastery01: 0,
        weak: false,
      }));
    }

    return [...inner, ...outer];
  }, [
    coreGroups,
    languageLessons,
    optionalLanguageSpecific,
    optionalGeneratedLanguageSpecific,
    requiredLanguageSpecific,
    selectedInterest,
    masteryStores,
  ]);
  const coreLanguageMastery = useMemo(() => {
    const coreTopicLessons = coreGroups.map((group) => group.topics).filter((topics) => topics.length > 0);
    const coreTopicScores = coreTopicLessons.map((topicLessons) => ({
      mastery: getTopicMasteryScore(topicLessons, masteryStores),
      weight: 1,
    }));
    return getLanguageMasteryScore(coreTopicScores);
  }, [coreGroups, masteryStores]);
  const coreTopicBreakdown = useMemo(
    () =>
      CORE_GROUP_ORDER.map((groupTitle) => {
        const topics = coreGroups.find((g) => g.groupTitle === groupTitle)?.topics ?? [];
        const mastery = getTopicMasteryScore(topics, masteryStores);
        return { groupTitle, mastery };
      }),
    [coreGroups, masteryStores]
  );

  const chunkList = useMemo(() => Object.values(chunks), [chunks]);

  const coreLearned = chunkList.filter(
    (chunk) => chunk.type === "core" && isChunkMastered(chunk)
  ).length;

  const interestLearned = chunkList.filter(
    (chunk) => chunk.type === "interest" && isChunkMastered(chunk)
  ).length;

  const totals = chunkList.reduce(
    (acc, chunk) => {
      acc.seen += chunk.timesSeen;
      acc.correct += chunk.timesCorrect;
      return acc;
    },
    { seen: 0, correct: 0 }
  );

  const accuracy = totals.seen === 0 ? 0 : Math.round((totals.correct / totals.seen) * 100);

  return (
    <AppShell>
      <div className="page">
        <h1>My words</h1>
        <p className="muted">Topic mastery map and a simple chunk memory snapshot.</p>

        <section className="card lr-lesson-overview-language">
          <h2>Language</h2>
          <label className="sr-only" htmlFor="lr-progress-lang">
            Progress language
          </label>
          <select
            id="lr-progress-lang"
            className="text-input lr-lang-select"
            value={selectedLanguage}
            onChange={(event) => setSelectedLanguage(event.target.value as LessonLanguage)}
            aria-label="Progress language"
          >
            <option value="es">Spanish (es)</option>
            <option value="ru">Russian (ru)</option>
          </select>
        </section>

        <SolarSystemWordsMap languageLabel={LANGUAGE_LABEL[selectedLanguage]} planets={solarPlanets} />

        <section className="card">
          <p>
            <strong>Core language mastery:</strong> {coreLanguageMastery.tier} ({Math.round(coreLanguageMastery.score)}
            /100)
          </p>
          <p>
            <strong>Mastery breakdown:</strong> {breakdownSummaryText(coreLanguageMastery.breakdown)}
          </p>
          <p>
            <strong>Total core chunks (practice mastery):</strong> {coreLearned}
          </p>
          <p>
            <strong>Total interest chunks (practice mastery):</strong> {interestLearned}
          </p>
          <p>
            <strong>Accuracy:</strong> {accuracy}%
          </p>
        </section>
        <section className="card">
          <h2>Core topic mastery signals</h2>
          <ul className="sentence-list">
            {coreTopicBreakdown.map(({ groupTitle, mastery }) => (
              <li key={`core-breakdown-${groupTitle}`}>
                <strong>{groupTitle}:</strong> {mastery.tier} ({Math.round(mastery.score)}/100) |{" "}
                {breakdownSummaryText(mastery.breakdown)}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
