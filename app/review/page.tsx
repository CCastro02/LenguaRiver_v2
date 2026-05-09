"use client";

import { useMemo, useState } from "react";
import { lessons, type LessonLanguage, type LessonWordType } from "@/lib/lesson-data";
import { useProgressStore } from "@/app/progress-store";
import { normalizeText } from "@/lib/text-normalization";
import { AppShell } from "@/app/AppShell";

const REVIEW_NOW = new Date().getTime();

function getReviewIntervalMs(timesCorrect: number, repetitionPriority: "high" | "medium" | "low"): number {
  if (repetitionPriority === "high") {
    if (timesCorrect <= 1) {
      return 3 * 60 * 1000;
    }
    if (timesCorrect <= 3) {
      return 20 * 60 * 1000;
    }
    return 2 * 60 * 60 * 1000;
  }
  if (repetitionPriority === "low") {
    if (timesCorrect <= 1) {
      return 30 * 60 * 1000;
    }
    if (timesCorrect <= 3) {
      return 3 * 60 * 60 * 1000;
    }
    return 18 * 60 * 60 * 1000;
  }
  if (timesCorrect <= 1) {
    return 10 * 60 * 1000;
  }
  if (timesCorrect <= 3) {
    return 60 * 60 * 1000;
  }
  return 6 * 60 * 60 * 1000;
}

function normalizeAnswer(value: string): string {
  return normalizeText(value);
}

type ReviewFeedback = {
  status: "correct" | "incorrect";
};

type ReviewItemMode = "input" | "checked";

type ReviewDisplayItem = {
  key: string;
  text: string;
  type: LessonWordType;
  timesSeen: number;
  timesCorrect: number;
};

function getTypeLabel(type: LessonWordType): string {
  if (type === "core") {
    return "core";
  }
  if (type === "interest") {
    return "interest";
  }
  return "Name";
}

export default function ReviewPage() {
  const [selectedLanguage, setSelectedLanguage] = useState<LessonLanguage>("es");
  const [showPhoneticByKey, setShowPhoneticByKey] = useState<Record<string, boolean>>({});
  const [confirmPhoneticByKey, setConfirmPhoneticByKey] = useState<Record<string, boolean>>({});
  const { chunks, helpUsage, recordChunkAttempt, recordHelpReveal } = useProgressStore();
  const [recallInputs, setRecallInputs] = useState<Record<string, string>>({});
  const [attemptCounts, setAttemptCounts] = useState<Record<string, number>>({});
  const [feedbackByKey, setFeedbackByKey] = useState<Record<string, ReviewFeedback>>({});
  const [itemModeByKey, setItemModeByKey] = useState<Record<string, ReviewItemMode>>({});
  const [lockedItemsByKey, setLockedItemsByKey] = useState<Record<string, ReviewDisplayItem>>({});
  const [dismissedByKey, setDismissedByKey] = useState<Record<string, boolean>>({});

  const chunkMetadataByText = useMemo(() => {
    const map = new Map<
      string,
      {
        repetitionPriority: "high" | "medium" | "low";
        type: LessonWordType;
        partOfSpeech: string;
        translation: string;
        phonetic?: string;
        language: LessonLanguage;
        context: string;
      }
    >();
    lessons.forEach((oneLesson) => {
      oneLesson.sentences.forEach((sentence) => {
        sentence.words.forEach((word) => {
          const key = `${oneLesson.language}::${word.text.toLowerCase()}`;
          if (!map.has(key)) {
            map.set(key, {
              repetitionPriority: word.repetitionPriority,
              type: word.type,
              partOfSpeech: word.partOfSpeech,
              translation: word.translation,
              phonetic: word.phonetic,
              language: oneLesson.language,
              context: sentence.text,
            });
          }
        });
      });
    });
    return map;
  }, []);

  const reviewQueue = useMemo(() => {
    return Object.values(chunks)
      .filter((chunk) => {
        if (chunk.timesSeen <= 0) {
          return false;
        }

        const metadata = chunkMetadataByText.get(`${selectedLanguage}::${chunk.text.toLowerCase()}`);
        if (!metadata) {
          return false;
        }
        if (metadata.type === "person-name") {
          return false;
        }
        const repetitionPriority = metadata?.repetitionPriority ?? "medium";
        const lastPracticedMs = new Date(chunk.lastPracticed).getTime();
        const intervalMs = getReviewIntervalMs(chunk.timesCorrect, repetitionPriority);

        return REVIEW_NOW - lastPracticedMs >= intervalMs;
      })
      .sort((a, b) => {
        const aPriority =
          chunkMetadataByText.get(`${selectedLanguage}::${a.text.toLowerCase()}`)?.repetitionPriority ??
          "medium";
        const bPriority =
          chunkMetadataByText.get(`${selectedLanguage}::${b.text.toLowerCase()}`)?.repetitionPriority ??
          "medium";
        const weight = { high: 0, medium: 1, low: 2 };
        if (weight[aPriority] !== weight[bPriority]) {
          return weight[aPriority] - weight[bPriority];
        }
        const aHelp =
          (helpUsage[`${selectedLanguage}::chunk::${normalizeAnswer(a.text)}`]?.translationReveals ?? 0) +
          (helpUsage[`${selectedLanguage}::chunk::${normalizeAnswer(a.text)}`]?.phoneticReveals ?? 0);
        const bHelp =
          (helpUsage[`${selectedLanguage}::chunk::${normalizeAnswer(b.text)}`]?.translationReveals ?? 0) +
          (helpUsage[`${selectedLanguage}::chunk::${normalizeAnswer(b.text)}`]?.phoneticReveals ?? 0);
        if (aHelp !== bHelp) {
          return bHelp - aHelp;
        }
        const aAccuracy = a.timesSeen === 0 ? 0 : a.timesCorrect / a.timesSeen;
        const bAccuracy = b.timesSeen === 0 ? 0 : b.timesCorrect / b.timesSeen;
        if (aAccuracy !== bAccuracy) {
          return aAccuracy - bAccuracy;
        }
        return a.text.localeCompare(b.text);
      });
  }, [chunkMetadataByText, chunks, helpUsage, selectedLanguage]);

  const displayQueue = useMemo(() => {
    const merged = new Map<string, ReviewDisplayItem>();

    reviewQueue.forEach((chunk) => {
      const key = `${selectedLanguage}::${chunk.text.toLowerCase()}`;
      merged.set(key, {
        key,
        text: chunk.text,
        type: chunkMetadataByText.get(key)?.type ?? chunk.type,
        timesSeen: chunk.timesSeen,
        timesCorrect: chunk.timesCorrect,
      });
    });

    Object.entries(lockedItemsByKey).forEach(([key, item]) => {
      merged.set(key, item);
    });

    return Array.from(merged.values()).filter((item) => !dismissedByKey[item.key]);
  }, [chunkMetadataByText, dismissedByKey, lockedItemsByKey, reviewQueue, selectedLanguage]);

  return (
    <AppShell>
    <div className="page">
      <h1>Review</h1>
      <p className="muted">Spaced repetition queue based on chunk progress.</p>
      <section className="card">
        <h2>Language</h2>
        <select
          className="text-input"
          value={selectedLanguage}
          onChange={(event) => {
            setSelectedLanguage(event.target.value as LessonLanguage);
            setRecallInputs({});
            setAttemptCounts({});
            setFeedbackByKey({});
            setItemModeByKey({});
            setLockedItemsByKey({});
            setDismissedByKey({});
            setShowPhoneticByKey({});
            setConfirmPhoneticByKey({});
          }}
        >
          <option value="es">Spanish (es)</option>
          <option value="ru">Russian (ru)</option>
        </select>
      </section>
      <section className="card">
        <h2>Chunks Needing Review</h2>
        {displayQueue.length === 0 ? (
          <p className="muted">No chunks are due right now. Practice more in Lesson first.</p>
        ) : (
          <ul className="sentence-list">
            {displayQueue.map((item) => (
              <li key={item.key}>
                {(() => {
                  const chunkKey = item.key;
                  const metadata = chunkMetadataByText.get(chunkKey);
                  const feedback = feedbackByKey[chunkKey];
                  const attempts = attemptCounts[chunkKey] ?? 0;
                  const mode = itemModeByKey[chunkKey] ?? "input";

                  if (!metadata) {
                    return null;
                  }

                  return (
                    <>
                      <p>
                        <strong>{item.text}</strong> ({getTypeLabel(item.type)})
                      </p>
                      {metadata.phonetic && (
                        <>
                          <button
                            type="button"
                            className="button"
                            onClick={() => {
                              if (showPhoneticByKey[chunkKey]) {
                                setShowPhoneticByKey((prev) => ({
                                  ...prev,
                                  [chunkKey]: false,
                                }));
                                return;
                              }
                              setConfirmPhoneticByKey((prev) => ({
                                ...prev,
                                [chunkKey]: true,
                              }));
                            }}
                          >
                            {showPhoneticByKey[chunkKey] ? "Hide phonetic" : "Show phonetic"}
                          </button>
                          {confirmPhoneticByKey[chunkKey] && !showPhoneticByKey[chunkKey] && (
                            <p className="muted">
                              Try once first?{" "}
                              <button
                                type="button"
                                className="button"
                                onClick={() => {
                                  setShowPhoneticByKey((prev) => ({
                                    ...prev,
                                    [chunkKey]: true,
                                  }));
                                  setConfirmPhoneticByKey((prev) => ({
                                    ...prev,
                                    [chunkKey]: false,
                                  }));
                                  recordHelpReveal(
                                    `${selectedLanguage}::chunk::${normalizeAnswer(item.text)}`,
                                    "phonetic"
                                  );
                                }}
                              >
                                Reveal anyway
                              </button>{" "}
                              <button
                                type="button"
                                className="button"
                                onClick={() =>
                                  setConfirmPhoneticByKey((prev) => ({
                                    ...prev,
                                    [chunkKey]: false,
                                  }))
                                }
                              >
                                Cancel
                              </button>
                            </p>
                          )}
                          {showPhoneticByKey[chunkKey] && <p className="muted">{metadata.phonetic}</p>}
                        </>
                      )}
                      <p className="muted">
                        POS: {metadata.partOfSpeech} | Priority: {metadata.repetitionPriority}
                      </p>
                      <p className="muted">Context: {metadata.context}</p>
                      <p className="muted">
                        Seen: {item.timesSeen} | Correct: {item.timesCorrect}
                      </p>
                      <input
                        className="text-input"
                        type="text"
                        value={recallInputs[chunkKey] ?? ""}
                        onChange={(event) =>
                          setRecallInputs((prev) => ({
                            ...prev,
                            [chunkKey]: event.target.value,
                          }))
                        }
                        placeholder="Type chunk text or translation"
                        disabled={mode === "checked"}
                      />
                      {mode === "input" ? (
                        <button
                          type="button"
                          className="button"
                          onClick={() => {
                            const value = recallInputs[chunkKey] ?? "";
                            const normalizedInput = normalizeAnswer(value);
                            const normalizedChunk = normalizeAnswer(item.text);
                            const normalizedPhonetic = normalizeAnswer(metadata.phonetic ?? "");
                            const normalizedTranslation = normalizeAnswer(metadata.translation);
                            const isCorrect =
                              normalizedInput === normalizedChunk ||
                              (normalizedPhonetic.length > 0 && normalizedInput === normalizedPhonetic) ||
                              normalizedInput === normalizedTranslation;

                            recordChunkAttempt(item.text, item.type, isCorrect);
                            setAttemptCounts((prev) => ({
                              ...prev,
                              [chunkKey]: (prev[chunkKey] ?? 0) + 1,
                            }));
                            setFeedbackByKey((prev) => ({
                              ...prev,
                              [chunkKey]: { status: isCorrect ? "correct" : "incorrect" },
                            }));
                            setItemModeByKey((prev) => ({
                              ...prev,
                              [chunkKey]: "checked",
                            }));
                            setLockedItemsByKey((prev) => ({
                              ...prev,
                              [chunkKey]: item,
                            }));
                          }}
                          disabled={!recallInputs[chunkKey]?.trim()}
                        >
                          Check
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="button"
                          onClick={() => {
                            setDismissedByKey((prev) => ({ ...prev, [chunkKey]: true }));
                            setLockedItemsByKey((prev) => {
                              const next = { ...prev };
                              delete next[chunkKey];
                              return next;
                            });
                          }}
                        >
                          Next
                        </button>
                      )}
                      {feedback && (
                        <p className={feedback.status === "correct" ? "feedback-correct" : "feedback-incorrect"}>
                          {feedback.status === "correct" ? "Correct" : "Try again"}
                        </p>
                      )}
                      {feedback?.status === "incorrect" && attempts > 0 && (
                        <p className="muted">
                          Correct answer: {item.text}
                          {metadata.phonetic ? ` (${metadata.phonetic})` : ""} / {metadata.translation}
                        </p>
                      )}
                    </>
                  );
                })()}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
    </AppShell>
  );
}
