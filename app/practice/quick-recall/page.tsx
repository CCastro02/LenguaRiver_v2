"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { LessonLanguage } from "@/lib/lesson-data";
import { AppShell } from "@/app/AppShell";
import { useProgressStore } from "@/app/progress-store";
import {
  buildLessonChunkMetadataMap,
  buildQuickRecallSessionItems,
  type QuickRecallItem,
} from "@/lib/review-queue";
import { computeWeightedMatchPercent } from "@/lib/speech-evaluation";
import { gradeRecallAnswer, type GradingResult } from "@/lib/quick-recall-grading";
import { getAcceptedMeanings } from "@/lib/translation-synonyms";
import "./quick-recall.css";

const MAX_PROMPTS = 12;

function languageLabel(lang: LessonLanguage): string {
  return lang === "es" ? "Spanish" : "Russian";
}

function expectedForTypingScore(item: QuickRecallItem): string {
  if (item.mode === "l2-to-meaning") {
    const accepted = getAcceptedMeanings(item.translation, item.acceptedMeanings);
    return accepted[0] ?? item.translation;
  }
  return item.surfaceText;
}

function gradingLanguage(item: QuickRecallItem, lessonLanguage: LessonLanguage): string {
  return item.mode === "l2-to-meaning" ? "en" : lessonLanguage;
}

export default function QuickRecallPage() {
  const { chunks, helpUsage, recordChunkAttempt, recordWritingAttempt } = useProgressStore();
  const chunkMetaMap = useMemo(() => buildLessonChunkMetadataMap(), []);

  const [language, setLanguage] = useState<LessonLanguage>("es");
  const [promptIndex, setPromptIndex] = useState(0);
  const [input, setInput] = useState("");
  const [lastReveal, setLastReveal] = useState<GradingResult | null>(null);

  const prompts = useMemo(
    () =>
      buildQuickRecallSessionItems(
        chunks,
        chunkMetaMap,
        { helpUsage, language },
        { maxPrompts: MAX_PROMPTS }
      ),
    [chunkMetaMap, chunks, helpUsage, language]
  );

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- language switch starts a fresh sprint */
    setPromptIndex(0);
    setInput("");
    setLastReveal(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [language]);

  useEffect(() => {
    if (!lastReveal) {
      return;
    }
    const timer = window.setTimeout(() => {
      setLastReveal(null);
      setInput("");
      setPromptIndex((i) => i + 1);
    }, 420);
    return () => window.clearTimeout(timer);
  }, [lastReveal]);

  const busy = Boolean(lastReveal);
  const active = prompts[promptIndex];
  const done = prompts.length > 0 && !active && promptIndex >= prompts.length && !busy;
  const pctThrough =
    prompts.length === 0
      ? 0
      : Math.min(100, Math.round(((Math.min(promptIndex, prompts.length - 1) + 1) / prompts.length) * 100));

  const submit = (): void => {
    if (!active || busy || !input.trim()) {
      return;
    }
    const trimmed = input.trim();
    const result = gradeRecallAnswer(active, trimmed, language);
    const pct = computeWeightedMatchPercent(
      expectedForTypingScore(active),
      trimmed,
      gradingLanguage(active, language)
    );

    recordChunkAttempt(active.text, active.type, result.chunkAttemptPositive);
    recordWritingAttempt(active.text, active.type, result.writingAccuracyPositive, pct);
    setLastReveal(result);
  };

  let body: ReactNode;

  if (prompts.length === 0) {
    body = (
      <>
        <p className="quick-recall--muted">
          Practice a few chunks in Lessons first — then this sprint adapts from your saved progress.
        </p>
        <div className="quick-recall--empty-btns">
          <Link className="button quick-recall--link" href="/lesson">
            Open Lessons
          </Link>
          <Link className="button quick-recall--link" href="/">
            Home
          </Link>
        </div>
      </>
    );
  } else if (done) {
    body = (
      <>
        <p>Sprint finished — chunk stats saved.</p>
        <div className="quick-recall--empty-btns">
          <Link className="button quick-recall--link" href="/lesson">
            Back to Lessons
          </Link>
          <button
            type="button"
            className="button"
            onClick={() => {
              setPromptIndex(0);
              setInput("");
              setLastReveal(null);
            }}
          >
            Run again
          </button>
        </div>
      </>
    );
  } else if (active) {
    const instruction =
      active.mode === "l2-to-meaning"
        ? `${languageLabel(language)} → meaning (English)`
        : `Meaning → ${languageLabel(language)}`;

    body = (
      <>
        <p className="quick-recall--instruction">{instruction}</p>
        <p className="quick-recall--cue">{active.mode === "l2-to-meaning" ? active.text : active.translation}</p>
        <input
          autoFocus
          className="quick-recall--input"
          placeholder={active.mode === "l2-to-meaning" ? "English…" : `Type ${languageLabel(language)}…`}
          disabled={busy}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="quick-recall--actions">
          <button type="button" className="quick-recall--btn" disabled={busy || !input.trim()} onClick={submit}>
            Check
          </button>
          {busy && active && lastReveal && (
            <span className={`quick-recall--feedback`} data-status={lastReveal.status}>
              {lastReveal.status === "correct"
                ? "Correct — next…"
                : lastReveal.status === "partial"
                  ? "Almost — next…"
                  : "Incorrect — next…"}
            </span>
          )}
        </div>
      </>
    );
  } else {
    body = (
      <p className="quick-recall--muted">
        Session idle.
        <Link href="/lesson"> Lesson</Link>
      </p>
    );
  }

  return (
    <AppShell>
      <div className="quick-recall">
        <div className="quick-recall--topline">
          <Link className="quick-recall--link" href="/">
            ← Home
          </Link>
          <span>
            Recall{" "}
            {prompts.length === 0 ? "" : `${Math.min(promptIndex + 1, prompts.length)} / ${prompts.length}`}
          </span>
          <select
            className="quick-recall--lang"
            value={language}
            onChange={(e) => setLanguage(e.target.value as LessonLanguage)}
            aria-label="Target language"
          >
            <option value="es">ES</option>
            <option value="ru">RU</option>
          </select>
        </div>

        {prompts.length > 0 && !done ? (
          <div className="quick-recall--bar-wrap">
            <div className="quick-recall--bar" style={{ width: `${pctThrough}%` }} />
          </div>
        ) : null}

        <p className="quick-recall--muted" style={{ marginTop: 0 }}>
          Quick Recall · short sprint · mastery updates only chunk/writing streaks (not lesson phases).
        </p>

        {body}
      </div>
    </AppShell>
  );
}
