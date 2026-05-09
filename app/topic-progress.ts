"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { LessonLanguage } from "@/lib/lesson-data";
import { LENGUA_RIVER_PROGRESS_CLEARED_EVENT } from "@/lib/app-settings";

export type LessonPhase = "Exposure" | "Breakdown" | "Active Recall" | "Reinforcement";

export type TopicProgress = {
  completedPhases: Partial<Record<LessonPhase, boolean>>;
  activeRecallAttempts: number;
  activeRecallCorrect: number;
  mastered: boolean;
};

const STORAGE_KEY = "lenguariver_topic_progress";

export function getTopicProgressStorageKey(language: LessonLanguage, topicId: string): string {
  return `${language}::${topicId}`;
}

type TopicProgressStore = {
  topicProgress: Record<string, TopicProgress>;
  getProgress: (language: LessonLanguage, topicId: string) => TopicProgress;
  markPhaseComplete: (language: LessonLanguage, topicId: string, phase: LessonPhase) => void;
  recordActiveRecallAttempt: (language: LessonLanguage, topicId: string, isCorrect: boolean) => void;
};

const TopicProgressContext = createContext<TopicProgressStore | null>(null);

function loadInitialTopicProgress(): Record<string, TopicProgress> {
  if (typeof window === "undefined") {
    return {};
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as Record<string, TopicProgress>;
  } catch {
    return {};
  }
}

export function TopicProgressProvider({ children }: { children: React.ReactNode }) {
  const [topicProgress, setTopicProgress] = useState<Record<string, TopicProgress>>({});
  const [topicProgressHydrated, setTopicProgressHydrated] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- hydrate from localStorage after mount; initial {} matches SSR */
    setTopicProgress(loadInitialTopicProgress());
    setTopicProgressHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!topicProgressHydrated) {
      return;
    }
    const onCleared = () => {
      setTopicProgress({});
    };
    window.addEventListener(LENGUA_RIVER_PROGRESS_CLEARED_EVENT, onCleared);
    return () => window.removeEventListener(LENGUA_RIVER_PROGRESS_CLEARED_EVENT, onCleared);
  }, [topicProgressHydrated]);

  useEffect(() => {
    if (!topicProgressHydrated) {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(topicProgress));
  }, [topicProgress, topicProgressHydrated]);

  const getProgress = useCallback((language: LessonLanguage, topicId: string): TopicProgress => {
    return (
      topicProgress[getTopicProgressStorageKey(language, topicId)] ?? {
        completedPhases: {},
        activeRecallAttempts: 0,
        activeRecallCorrect: 0,
        mastered: false,
      }
    );
  }, [topicProgress]);

  const markPhaseComplete = useCallback((language: LessonLanguage, topicId: string, phase: LessonPhase) => {
    setTopicProgress((prev) => {
      const key = getTopicProgressStorageKey(language, topicId);
      const current = prev[key] ?? {
        completedPhases: {},
        activeRecallAttempts: 0,
        activeRecallCorrect: 0,
        mastered: false,
      };
      return {
        ...prev,
        [key]: {
          ...current,
          completedPhases: {
            ...current.completedPhases,
            [phase]: true,
          },
        },
      };
    });
  }, []);

  const recordActiveRecallAttempt = useCallback((language: LessonLanguage, topicId: string, isCorrect: boolean) => {
    setTopicProgress((prev) => {
      const key = getTopicProgressStorageKey(language, topicId);
      const current = prev[key] ?? {
        completedPhases: {},
        activeRecallAttempts: 0,
        activeRecallCorrect: 0,
        mastered: false,
      };
      return {
        ...prev,
        [key]: {
          ...current,
          activeRecallAttempts: current.activeRecallAttempts + 1,
          activeRecallCorrect: current.activeRecallCorrect + (isCorrect ? 1 : 0),
        },
      };
    });
  }, []);

  const value = useMemo<TopicProgressStore>(
    () => ({
      topicProgress,
      getProgress,
      markPhaseComplete,
      recordActiveRecallAttempt,
    }),
    [getProgress, markPhaseComplete, recordActiveRecallAttempt, topicProgress]
  );

  return createElement(TopicProgressContext.Provider, { value }, children);
}

export function useTopicProgressStore(): TopicProgressStore {
  const context = useContext(TopicProgressContext);
  if (!context) {
    throw new Error("useTopicProgressStore must be used within TopicProgressProvider");
  }
  return context;
}
