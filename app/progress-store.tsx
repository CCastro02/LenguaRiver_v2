"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { LessonWordType } from "@/lib/lesson-data";
import { isKnownPersonNameText } from "@/lib/chunk-normalizer";
import { LENGUA_RIVER_PROGRESS_CLEARED_EVENT } from "@/lib/app-settings";

type ChunkProgress = {
  text: string;
  type: LessonWordType;
  timesSeen: number;
  timesCorrect: number;
  lastPracticed: string;
  speechAttempts?: number;
  speechCorrect?: number;
  speechMatchPercent?: number;
  lastSpeechPracticedAt?: string;
  writingAttempts?: number;
  writingCorrect?: number;
  writingAccuracy?: number;
};

type HelpUsage = {
  translationReveals: number;
  phoneticReveals: number;
  lastUsed: string;
};

type ProgressStore = {
  chunks: Record<string, ChunkProgress>;
  helpUsage: Record<string, HelpUsage>;
  recordChunkAttempt: (text: string, type: LessonWordType, isCorrect: boolean) => void;
  recordSpeechAttempt: (
    text: string,
    type: LessonWordType,
    isCorrect: boolean,
    matchPercent: number
  ) => void;
  recordWritingAttempt: (
    text: string,
    type: LessonWordType,
    isCorrect: boolean,
    matchPercent: number
  ) => void;
  recordHelpReveal: (key: string, helpType: "translation" | "phonetic") => void;
};

const STORAGE_KEY = "lenguariver_chunk_progress";
const HELP_STORAGE_KEY = "lenguariver_help_usage";

const ProgressContext = createContext<ProgressStore | null>(null);

function loadInitialChunks(): Record<string, ChunkProgress> {
  if (typeof window === "undefined") {
    return {};
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, ChunkProgress>;
    Object.entries(parsed).forEach(([key, chunk]) => {
      if (chunk.type === "core" && isKnownPersonNameText(chunk.text)) {
        parsed[key] = { ...chunk, type: "person-name" };
      }
    });
    return parsed;
  } catch {
    return {};
  }
}

function loadInitialHelpUsage(): Record<string, HelpUsage> {
  if (typeof window === "undefined") {
    return {};
  }

  const raw = window.localStorage.getItem(HELP_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as Record<string, HelpUsage>;
  } catch {
    return {};
  }
}

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const [chunks, setChunks] = useState<Record<string, ChunkProgress>>({});
  const [helpUsage, setHelpUsage] = useState<Record<string, HelpUsage>>({});
  const [progressHydrated, setProgressHydrated] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- hydrate from localStorage after mount; initial {} matches SSR */
    setChunks(loadInitialChunks());
    setHelpUsage(loadInitialHelpUsage());
    setProgressHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!progressHydrated) {
      return;
    }
    const onCleared = () => {
      setChunks({});
      setHelpUsage({});
    };
    window.addEventListener(LENGUA_RIVER_PROGRESS_CLEARED_EVENT, onCleared);
    return () => window.removeEventListener(LENGUA_RIVER_PROGRESS_CLEARED_EVENT, onCleared);
  }, [progressHydrated]);

  useEffect(() => {
    if (!progressHydrated) {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(chunks));
  }, [chunks, progressHydrated]);

  useEffect(() => {
    if (!progressHydrated) {
      return;
    }
    window.localStorage.setItem(HELP_STORAGE_KEY, JSON.stringify(helpUsage));
  }, [helpUsage, progressHydrated]);

  const value = useMemo<ProgressStore>(
    () => ({
      chunks,
      helpUsage,
      recordChunkAttempt: (text, type, isCorrect) => {
        setChunks((prev) => {
          const key = text.toLowerCase();
          const existing = prev[key];
          const next: ChunkProgress = {
            text,
            type,
            timesSeen: (existing?.timesSeen ?? 0) + 1,
            timesCorrect: (existing?.timesCorrect ?? 0) + (isCorrect ? 1 : 0),
            lastPracticed: new Date().toISOString(),
          };

          return {
            ...prev,
            [key]: next,
          };
        });
      },
      recordSpeechAttempt: (text, type, isCorrect, matchPercent) => {
        setChunks((prev) => {
          const key = text.toLowerCase();
          const existing = prev[key];
          const nextAttempts = (existing?.speechAttempts ?? 0) + 1;
          const prevAvg = existing?.speechMatchPercent ?? 0;
          const rollingAvg = ((prevAvg * (nextAttempts - 1)) + Math.max(0, Math.min(100, matchPercent))) / nextAttempts;
          const next: ChunkProgress = {
            text,
            type,
            timesSeen: existing?.timesSeen ?? 0,
            timesCorrect: existing?.timesCorrect ?? 0,
            lastPracticed: existing?.lastPracticed ?? new Date(0).toISOString(),
            speechAttempts: nextAttempts,
            speechCorrect: (existing?.speechCorrect ?? 0) + (isCorrect ? 1 : 0),
            speechMatchPercent: rollingAvg,
            lastSpeechPracticedAt: new Date().toISOString(),
          };
          return {
            ...prev,
            [key]: next,
          };
        });
      },
      recordWritingAttempt: (text, type, isCorrect, matchPercent) => {
        setChunks((prev) => {
          const key = text.toLowerCase();
          const existing = prev[key];
          const nextAttempts = (existing?.writingAttempts ?? 0) + 1;
          const prevAvg = existing?.writingAccuracy ?? 0;
          const nextMatchPercent = Math.max(0, Math.min(100, matchPercent));
          const rollingAvg = ((prevAvg * (nextAttempts - 1)) + nextMatchPercent) / nextAttempts;
          const next: ChunkProgress = {
            text,
            type,
            timesSeen: existing?.timesSeen ?? 0,
            timesCorrect: existing?.timesCorrect ?? 0,
            lastPracticed: existing?.lastPracticed ?? new Date(0).toISOString(),
            speechAttempts: existing?.speechAttempts,
            speechCorrect: existing?.speechCorrect,
            speechMatchPercent: existing?.speechMatchPercent,
            lastSpeechPracticedAt: existing?.lastSpeechPracticedAt,
            writingAttempts: nextAttempts,
            writingCorrect: (existing?.writingCorrect ?? 0) + (isCorrect ? 1 : 0),
            writingAccuracy: rollingAvg,
          };
          return {
            ...prev,
            [key]: next,
          };
        });
      },
      recordHelpReveal: (key, helpType) => {
        setHelpUsage((prev) => {
          const normalizedKey = key.toLowerCase().trim();
          const existing = prev[normalizedKey];
          const next: HelpUsage = {
            translationReveals: existing?.translationReveals ?? 0,
            phoneticReveals: existing?.phoneticReveals ?? 0,
            lastUsed: new Date().toISOString(),
          };
          if (helpType === "translation") {
            next.translationReveals += 1;
          } else {
            next.phoneticReveals += 1;
          }
          return {
            ...prev,
            [normalizedKey]: next,
          };
        });
      },
    }),
    [chunks, helpUsage]
  );

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgressStore(): ProgressStore {
  const context = useContext(ProgressContext);
  if (!context) {
    throw new Error("useProgressStore must be used within ProgressProvider");
  }
  return context;
}
