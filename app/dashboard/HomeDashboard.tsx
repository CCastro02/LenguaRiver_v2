"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inter } from "next/font/google";
import { useEffect, useMemo, useState } from "react";
import { useProgressStore } from "@/app/progress-store";
import { INTEREST_OPTIONS, type InterestTopic, useSelectedInterest } from "@/app/interest-preferences";
import {
  DASHBOARD_REVIEW_ANCHOR,
  getLessonStatus,
  getReviewIntervalMs,
  lessons,
  nextLessonProgressPct,
  orderedCoreLessons,
  CORE_PILLAR_DEFS,
  pillarReadiness,
  type Lesson,
  type LessonLanguage,
  type ProgressChunk,
  weakCoreCount,
} from "./logic";
import { useLessonProgression } from "@/app/lesson/use-lesson-progression";
import { getLanguageMasteryScore, getMasteryTier, getTopicMasteryScore } from "@/lib/mastery";
import { LenguaRiverMark } from "@/app/LenguaRiverMark";
import { toCoreTopic, type CoreTopic } from "@/lib/core-topics";
import "../home-dashboard.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const TOPIC_EMOJI: Record<CoreTopic, string> = {
  Introductions: "👋",
  "Ordering Food": "🍽️",
  Directions: "🗺️",
  Shopping: "🛍️",
  Hotel: "🏨",
  "Emergencies & Help": "🚨",
  "Job & Hobbies": "💼",
};

function breakdownSummaryText(breakdown: {
  speaking: { value: number; source: string };
  recall: { value: number; source: string };
  writing: { value: number; source: string };
  consistency: { value: number; source: string };
}): string {
  const sourceLabel = (source: string) =>
    source === "exact" ? "Exact" : source === "approx" ? "Approx" : "Estimated";
  return `S ${getMasteryTier(breakdown.speaking.value)} (${sourceLabel(
    breakdown.speaking.source
  )}) · R ${getMasteryTier(breakdown.recall.value)} (${sourceLabel(
    breakdown.recall.source
  )}) · W ${getMasteryTier(breakdown.writing.value)} (${sourceLabel(
    breakdown.writing.source
  )}) · C ${getMasteryTier(breakdown.consistency.value)} (${sourceLabel(
    breakdown.consistency.source
  )})`;
}

export default function HomeDashboard() {
  const { chunks } = useProgressStore();
  const [uiChunks, setUiChunks] = useState<Record<string, ProgressChunk>>({});
  const [selectedLanguage, setSelectedLanguage] = useState<LessonLanguage>("es");
  const [selectedInterest, setSelectedInterest] = useSelectedInterest();
  const [interestHydrated, setInterestHydrated] = useState(false);
  const [greetingReady, setGreetingReady] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setUiChunks(chunks);
    });
  }, [chunks]);

  useEffect(() => {
    queueMicrotask(() => {
      setInterestHydrated(true);
    });
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      setGreetingReady(true);
    });
  }, []);

  const languageLessons = useMemo(
    () => lessons.filter((lesson) => lesson.language === selectedLanguage),
    [selectedLanguage]
  );
  const coreLanguageLessons = useMemo(
    () => languageLessons.filter((lesson) => lesson.sourceType === "core"),
    [languageLessons]
  );
  const { topicProgressById } = useLessonProgression(selectedLanguage);

  const orderedLessons = useMemo(() => orderedCoreLessons(coreLanguageLessons), [coreLanguageLessons]);
  const chunkProgressMap = useMemo(
    () =>
      new Map(
        Object.values(uiChunks).map((chunk) => [
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
    [uiChunks]
  );

  const nextLesson = useMemo((): Lesson | null => {
    for (const l of orderedLessons) {
      if (getLessonStatus(l, uiChunks, topicProgressById) !== "completed") {
        return l;
      }
    }
    return orderedLessons[0] ?? null;
  }, [orderedLessons, topicProgressById, uiChunks]);

  const continueProgress = useMemo(() => nextLessonProgressPct(nextLesson, uiChunks), [nextLesson, uiChunks]);
  const nextLessonMastery = useMemo(() => {
    if (!nextLesson) {
      return {
        score: 0,
        tier: "Untrained",
        breakdown: {
          speaking: { value: 0, source: "fallback" },
          recall: { value: 0, source: "exact" },
          writing: { value: 0, source: "approx" },
          consistency: { value: 0, source: "approx" },
        },
      };
    }
    return getTopicMasteryScore([nextLesson], {
      topicProgressByLessonId: topicProgressById,
      chunkProgressByText: chunkProgressMap,
    });
  }, [chunkProgressMap, nextLesson, topicProgressById]);

  const totals = useMemo(() => {
    return Object.values(uiChunks).reduce(
      (acc, chunk) => {
        acc.seen += chunk.timesSeen;
        acc.correct += chunk.timesCorrect;
        if (chunk.type === "core" && chunk.timesCorrect > 0) {
          acc.coreLearned += 1;
        }
        if (chunk.type === "interest" && chunk.timesCorrect > 0) {
          acc.interestLearned += 1;
        }
        return acc;
      },
      { seen: 0, correct: 0, coreLearned: 0, interestLearned: 0 }
    );
  }, [uiChunks]);

  const reviewDueCount = useMemo(() => {
    const now = DASHBOARD_REVIEW_ANCHOR;
    const repetitionByText = new Map<string, "high" | "medium" | "low">();
    lessons.forEach((lesson) => {
      lesson.sentences.forEach((sentence) => {
        sentence.words.forEach((word) => {
          const key = word.text.toLowerCase();
          if (!repetitionByText.has(key)) {
            repetitionByText.set(key, word.repetitionPriority);
          }
        });
      });
    });

    return Object.values(uiChunks).filter((chunk) => {
      if (chunk.timesSeen <= 0) {
        return false;
      }
      const repetition = repetitionByText.get(chunk.text.toLowerCase()) ?? "medium";
      const interval = getReviewIntervalMs(chunk.timesCorrect, repetition);
      const last = new Date(chunk.lastPracticed).getTime();
      return now - last >= interval;
    }).length;
  }, [uiChunks]);

  const lessonStatuses = useMemo(
    () =>
      coreLanguageLessons.map((lesson) => ({
        lesson,
        status: getLessonStatus(lesson, uiChunks, topicProgressById),
      })),
    [coreLanguageLessons, topicProgressById, uiChunks]
  );

  const lessonsCompleted = lessonStatuses.filter((entry) => entry.status === "completed").length;
  const accuracy = totals.seen === 0 ? 0 : Math.round((totals.correct / totals.seen) * 100);

  const coreTopicCards = useMemo(() => {
    return CORE_PILLAR_DEFS.map((pillar) => {
      const inPillar = coreLanguageLessons.filter((l) => toCoreTopic(l.topic) === pillar.name);
      const { readiness, status } = pillarReadiness(inPillar, uiChunks, topicProgressById);
      const mastery = getTopicMasteryScore(inPillar, {
        topicProgressByLessonId: topicProgressById,
        chunkProgressByText: chunkProgressMap,
      });
      return {
        ...pillar,
        inPillar,
        readiness,
        status,
        lessonCount: inPillar.length,
        masteryScore: mastery.score,
        masteryTier: mastery.tier,
        masteryBreakdown: mastery.breakdown,
      };
    });
  }, [chunkProgressMap, coreLanguageLessons, topicProgressById, uiChunks]);

  const journeyPillars = useMemo(() => {
    return CORE_PILLAR_DEFS.map((pillar) => {
      const inPillar = coreLanguageLessons.filter((l) => toCoreTopic(l.topic) === pillar.name);
      const { readiness, status } = pillarReadiness(inPillar, uiChunks, topicProgressById);
      const allLessonsComplete =
        inPillar.length > 0 &&
        inPillar.every((l) => getLessonStatus(l, uiChunks, topicProgressById) === "completed");
      return { name: pillar.name, readiness, status, allLessonsComplete };
    });
  }, [coreLanguageLessons, topicProgressById, uiChunks]);
  const languageMastery = useMemo(() => {
    return getLanguageMasteryScore(
      coreTopicCards.map((card) => ({
        mastery: {
          score: card.masteryScore,
          tier: card.masteryTier,
          breakdown: card.masteryBreakdown,
        },
        weight: 1,
      }))
    );
  }, [coreTopicCards]);

  const currentPillarName = useMemo(() => {
    for (const p of journeyPillars) {
      if (!p.allLessonsComplete) {
        return p.name;
      }
    }
    return "All topics complete";
  }, [journeyPillars]);

  const displayInterest: InterestTopic = interestHydrated ? selectedInterest : "engineering";
  const interestLabel = INTEREST_OPTIONS.find((o) => o.value === displayInterest)?.label ?? "Engineering";
  const weak = weakCoreCount(uiChunks);

  const clockGreeting = !greetingReady
    ? "Welcome"
    : (() => {
        const h = new Date().getHours();
        if (h < 5) {
          return "Hello";
        }
        if (h < 12) {
          return "Good morning";
        }
        if (h < 18) {
          return "Good afternoon";
        }
        return "Good evening";
      })();

  return (
    <div className={`home-dashboard ${inter.className}`}>
      <div className="db-shell">
        <DashboardSidebar language={selectedLanguage} onLanguage={setSelectedLanguage} />

        <div className="db-main">
          <DashboardTopBar
            clockGreeting={clockGreeting}
            lessonsDone={lessonsCompleted}
            lessonTotal={coreLanguageLessons.length}
            reviewDueCount={reviewDueCount}
            accuracy={accuracy}
            languageMasteryTier={languageMastery.tier}
          />

          <section className="db-hero" aria-label="Focus">
            <p className="db-hero-hint">Keep learning: one word, one lesson, one step at a time.</p>
            <div className="db-hero-picks">
              <div>
                <span className="db-label" id="focus-h">
                  Learning focus
                </span>
                <select
                  className="db-select"
                  value={displayInterest}
                  onChange={(event) => setSelectedInterest(event.target.value as InterestTopic)}
                  aria-labelledby="focus-h"
                >
                  {INTEREST_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {interestHydrated && (
              <p className="db-aux db-aux-inline">
                Focus: <span className="db-aux-em">{interestLabel}</span> (shared with the Learn page).
              </p>
            )}
          </section>

          <section className="db-card db-card-elevate db-journey-section" aria-labelledby="journey-heading">
            <div className="db-card-head">
              <h2 id="journey-heading" className="db-card-title">
                <span className="db-emoji" aria-hidden>
                  🧭
                </span>{" "}
                Your learning journey
              </h2>
              <span className="db-card-eyebrow">Progress only — not navigation</span>
            </div>
            <JourneyMapVisual
              journeyPillars={journeyPillars}
              currentPillarName={currentPillarName}
              languageLessons={coreLanguageLessons}
              lessonsCompleted={lessonsCompleted}
              accuracy={accuracy}
            />
          </section>

          <div className="db-continue-block">
            <h2 className="db-continue-section-title" id="continue-h">
              <span className="db-emoji" aria-hidden>
                📚
              </span>
              <span>Continue learning</span>
            </h2>
            <div className="db-continue-slab" data-has-next={nextLesson ? "true" : "false"}>
            <div className="db-continue-inner">
              {nextLesson ? (
                <>
                  <div className="db-continue-left">
                    <p className="db-continue-kicker">Up next</p>
                    <h3 className="db-continue-title">{nextLesson.title}</h3>
                    <p className="db-continue-meta">
                      {nextLesson.topic} — {selectedLanguage === "es" ? "Spanish" : "Russian"}
                    </p>
                    <div className="db-bar-wrap" aria-label={`Your progress in this lesson: about ${continueProgress} percent`}>
                      <div className="db-bar" style={{ width: `${continueProgress}%` }} role="progressbar" aria-valuenow={continueProgress} aria-valuemin={0} aria-valuemax={100} />
                    </div>
                    <p className="db-continue-foot">Active path · practice mastery in this lesson</p>
                    <p className="db-continue-foot">Mastery: {nextLessonMastery.tier}</p>
                    <p className="db-continue-foot">
                      Breakdown: {breakdownSummaryText(nextLessonMastery.breakdown)}
                    </p>
                  </div>
                  <div className="db-continue-right">
                    <Link className="db-btn db-btn-cta" href="/lesson">
                      Continue
                    </Link>
                  </div>
                </>
              ) : (
                <p className="db-muted">Choose a language with lessons, then return here.</p>
              )}
            </div>
            </div>
          </div>

          <div className="db-section-block" id="core-topics">
            <div className="db-section-header">
              <h2 className="db-section-h">Core topics</h2>
              <p className="db-section-hint" title="On narrow screens, scroll sideways through all seven.">
                7 topics
              </p>
            </div>
            <div className="db-topic-rail" role="list">
              {coreTopicCards.map((card, index) => {
                const isNextPillar = Boolean(nextLesson && card.inPillar.some((l) => l.id === nextLesson.id));
                const isEmptyPillar = card.inPillar.length === 0;
                return (
                <Link
                  key={card.name}
                  className={
                    isNextPillar
                      ? "db-topic-slab db-topic-slab--active"
                      : isEmptyPillar
                        ? "db-topic-slab db-topic-slab--empty"
                        : "db-topic-slab"
                  }
                  data-tint={String(index % 7)}
                  data-active-pillar={isNextPillar ? "true" : "false"}
                  href="/lesson"
                  role="listitem"
                >
                  <h3 className="db-topic-slab-title">
                    <span className="db-topic-emoji" aria-hidden>
                      {TOPIC_EMOJI[card.name] ?? "📌"}
                    </span>
                    {card.name}
                  </h3>
                  <p className="db-topic-slab-desc">{card.blurb}</p>
                  <p className="db-topic-slab-count">
                    {card.inPillar.length === 0
                      ? "— lessons"
                      : `${card.lessonCount} ${card.lessonCount === 1 ? "lesson" : "lessons"}`}
                  </p>
                  {card.inPillar.length > 0 && (
                    <>
                      <div className="db-bar-wrap db-bar-wrap--thin" aria-label={`readiness about ${card.readiness} percent`}>
                        <div className="db-bar" style={{ width: `${card.readiness}%` }} />
                      </div>
                      <p className="db-topic-slab-pct">
                        {card.readiness}% · {card.status} · Mastery {card.masteryTier}
                      </p>
                      <p className="db-topic-slab-pct">
                        {breakdownSummaryText(card.masteryBreakdown)}
                      </p>
                    </>
                  )}
                </Link>
              );
              })}
            </div>
          </div>

          <section className="db-card" id="explore-section" aria-labelledby="explore-h">
            <h2 className="db-card-title" id="explore-h">
              <span className="db-emoji" aria-hidden>
                🌍
              </span>{" "}
              Explore the target country
            </h2>
            <p className="db-card-deck">Placeholders; real content later.</p>
            <p>
              <Link href="/explore" className="button">
                Open Explore
              </Link>
            </p>
            <div className="explore-dual">
              <div className="db-tile-hero db-tile-a">
                <h3 className="db-tile-title">Target country</h3>
                <p className="db-tile-body">Geography, cities, and everyday life — for later.</p>
              </div>
              <div className="db-tile-hero db-tile-b">
                <h3 className="db-tile-title">Popular culture</h3>
                <p className="db-tile-body">Songs, media, memes and what is trending — placeholders.</p>
              </div>
            </div>
          </section>

          <section className="db-card" aria-labelledby="practice-h">
            <h2 className="db-card-title" id="practice-h">
              <span className="db-emoji" aria-hidden>
                ⚡
              </span>{" "}
              Quick practice
            </h2>
            <div className="practice-row">
              <Link
                href="/practice/quick-recall"
                className="db-practice"
                aria-label="Quick recall, about five minutes"
              >
                <span className="db-practice-icon" aria-hidden>
                  ⚡
                </span>
                <h4>Quick recall</h4>
                <span>~5 min</span>
              </Link>
              <div className="db-practice db-practice--coming" aria-label="Word puzzles, coming soon">
                <span className="db-practice-icon" aria-hidden>
                  🧩
                </span>
                <h4>Word puzzles</h4>
                <span>~5 min</span>
              </div>
              <div className="db-practice db-practice--coming" aria-label="Typing, coming soon">
                <span className="db-practice-icon" aria-hidden>
                  ⌨
                </span>
                <h4>Typing practice</h4>
                <span>~5 min</span>
              </div>
              <div className="db-practice db-practice--coming" aria-label="Daily challenge, coming soon">
                <span className="db-practice-icon" aria-hidden>
                  🎯
                </span>
                <h4>Daily challenge</h4>
                <span>~10 min</span>
              </div>
            </div>
          </section>

          <section className="db-card db-card-words" aria-labelledby="words-h">
            <h2 className="db-card-title" id="words-h">
              <span className="db-emoji" aria-hidden>
                🧠
              </span>{" "}
              Practice vocabulary
            </h2>
            <p className="db-card-deck">
              Counts mirror{" "}
              <Link href="/progress" className="db-link-ghost">
                Progress
              </Link>{" "}
              (Learn and Review). Highlights you save from Explore live on{" "}
              <Link href="/my-words" className="db-link-ghost">
                My Words
              </Link>
              — not pulled from extension storage yet.
            </p>
            <div className="db-words-bento">
              <div className="db-words-brick">
                <span className="db-words-brick-l">Core words (practice mastery)</span>
                <strong>{totals.coreLearned}</strong>
              </div>
              <div className="db-words-brick">
                <span className="db-words-brick-l">Weak (core, need practice)</span>
                <strong>{weak}</strong>
              </div>
              <div className="db-words-brick">
                <span className="db-words-brick-l">Review due (by interval)</span>
                <strong>{reviewDueCount}</strong>
              </div>
            </div>
            <p className="db-words-linkrow">
              <Link href="/progress" className="db-link-ghost">
                Progress
              </Link>
              <span className="db-words-sep" aria-hidden>
                ·
              </span>
              <Link href="/my-words" className="db-link-ghost">
                My Words
              </Link>
              <span className="db-words-sep" aria-hidden>
                ·
              </span>
              <Link href="/review" className="db-link-ghost">
                Review
              </Link>
            </p>
          </section>

          <footer className="db-footnote" role="doc-tip">
            <p>
              Learning paths group related chunks so you can keep categories like <em>fishing or singing</em> in your interest
              content over time.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}

function DashboardSidebar({ language, onLanguage }: { language: LessonLanguage; onLanguage: (l: LessonLanguage) => void }) {
  const pathname = usePathname();

  return (
    <aside className="db-aside" aria-label="App navigation">
      <Link
        href="/"
        className="db-aside-brand"
        style={{ textDecoration: "none", color: "inherit" }}
        aria-label="LenguaRiver home"
      >
        <LenguaRiverMark decorative variant="sidebar" />
      </Link>
      <nav className="db-side-nav" aria-label="Main">
        <Link className="db-snav" href="/" data-active={pathname === "/" ? "true" : "false"} aria-current={pathname === "/" ? "page" : undefined}>
          Home
        </Link>
        <Link className="db-snav" href="/lesson" data-active={pathname === "/lesson" ? "true" : "false"}>
          Learn
        </Link>
        <Link className="db-snav" href="/review" data-active={pathname === "/review" ? "true" : "false"}>
          Review
        </Link>
        <Link className="db-snav" href="/my-words" data-active={pathname === "/my-words" ? "true" : "false"}>
          My Words
        </Link>
        <Link className="db-snav" href="/progress" data-active={pathname === "/progress" ? "true" : "false"}>
          Progress
        </Link>
        <Link className="db-snav" href="/explore" data-active={pathname === "/explore" ? "true" : "false"}>
          Explore
        </Link>
        <Link className="db-snav" href="/settings" data-active={pathname === "/settings" ? "true" : "false"}>
          Settings
        </Link>
      </nav>
      <div className="db-snapshot db-snapshot--placeholder">
        <p className="db-snapshot-t">This week (placeholder)</p>
        <p className="db-snapshot-ring" aria-label="Streak and rhythm coming later">
          <span className="db-snapshot-arc" />
        </p>
        <p className="db-snapshot-sub">Habits &amp; time goals are not built yet</p>
      </div>
      <div className="db-side-lang">
        <span className="db-label">Course language</span>
        <select
          className="db-select db-select-full"
          value={language}
          onChange={(event) => onLanguage(event.target.value as LessonLanguage)}
        >
          <option value="es">Spanish (es)</option>
          <option value="ru">Russian (ru)</option>
        </select>
      </div>
      <p className="db-side-credit">Learner: <strong>Explorer</strong> (not linked to a profile yet)</p>
    </aside>
  );
}

function DashboardTopBar({
  clockGreeting,
  lessonsDone,
  lessonTotal,
  reviewDueCount,
  accuracy,
  languageMasteryTier,
}: {
  clockGreeting: string;
  lessonsDone: number;
  lessonTotal: number;
  reviewDueCount: number;
  accuracy: number;
  languageMasteryTier: string;
}) {
  return (
    <header className="db-masthead">
      <div className="db-masthead-leading">
        <Link href="/" className="db-masthead-brand" aria-label="LenguaRiver home">
          <LenguaRiverMark decorative variant="wordmark" />
        </Link>
        <div className="db-masthead-text">
          <h1>
            <span className="db-emoji db-emoji--jumbo" aria-hidden>
              👋
            </span>{" "}
            {clockGreeting}
          </h1>
          <p className="db-masthead-sub">Structured lessons, review when due, and your own word memory.</p>
        </div>
      </div>
      <ul className="db-statbar" aria-label="Quick stats">
        <li>
          <span className="db-stat-ico" aria-hidden>
            🔥
          </span>
          <div>
            <span className="db-stat-label">Complete</span>
            <span className="db-stat-val" title="Lessons marked complete in this course">
              {lessonsDone} / {lessonTotal}
            </span>
          </div>
        </li>
        <li>
          <span className="db-stat-ico" aria-hidden>
            ⏱
          </span>
          <div>
            <span className="db-stat-label">Review</span>
            <span className="db-stat-val">{reviewDueCount}</span>
          </div>
        </li>
        <li className="db-stat--ring">
          <div className="db-level-ring" aria-label={`Session accuracy about ${accuracy} percent`} title="Accuracy: correct over seen">
            <span className="db-level-num">{accuracy}</span>
            <span className="db-level-unit">%</span>
          </div>
        </li>
        <li>
          <span className="db-stat-ico" aria-hidden>
            🧠
          </span>
          <div>
            <span className="db-stat-label">Mastery Tier</span>
            <span className="db-stat-val">{languageMasteryTier}</span>
          </div>
        </li>
      </ul>
    </header>
  );
}

function JourneyMapVisual({
  journeyPillars,
  currentPillarName,
  languageLessons,
  lessonsCompleted,
  accuracy,
}: {
  journeyPillars: { name: string; allLessonsComplete: boolean }[];
  currentPillarName: string;
  languageLessons: { id: string }[];
  lessonsCompleted: number;
  accuracy: number;
}) {
  return (
    <div>
      <div className="db-scene" role="img" aria-label="Decorative path: seven core topics then a goal star. Progress only.">
        <div className="db-scene-land" />
        <div className="db-scene-river" />
        <svg className="db-scene-path" viewBox="0 0 400 100" preserveAspectRatio="xMidYMid meet" aria-hidden>
          <path
            d="M 8 68 C 40 20 80 20 120 50 S 200 30 240 50 S 320 40 380 32"
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="2"
            strokeDasharray="5 5"
            strokeLinecap="round"
          />
        </svg>
        <div className="db-scene-rail">
          {journeyPillars.map((p, i) => (
            <div key={p.name} className="db-journey-slice">
              {i > 0 && (
                <div
                  className={`db-journey-line${journeyPillars[i - 1]!.allLessonsComplete ? " db-journey-line--on" : ""}`}
                  aria-hidden
                />
              )}
              <div
                className={`db-journey-node${
                  p.allLessonsComplete
                    ? " db-journey-node--done"
                    : currentPillarName === p.name
                      ? " db-journey-node--active"
                      : ""
                }`}
                title={p.name}
              >
                {i + 1}
              </div>
            </div>
          ))}
          <div className="db-journey-slice" aria-hidden>
            <div
              className={`db-journey-line${
                journeyPillars[journeyPillars.length - 1]!.allLessonsComplete ? " db-journey-line--on" : ""
              } db-journey-line--goal`}
            />
            <div className="db-journey-star" title="Course goal (visual)">
              ✦
            </div>
          </div>
        </div>
      </div>
      <div className="db-journey-meta2">
        <span>
          <strong>Focus</strong> {currentPillarName}
        </span>
        <span>
          <strong>Lessons</strong> {lessonsCompleted} / {languageLessons.length}
        </span>
        <span>
          <strong>Accuracy</strong> {accuracy}%
        </span>
      </div>
    </div>
  );
}
