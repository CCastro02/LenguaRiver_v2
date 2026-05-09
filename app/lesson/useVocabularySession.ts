"use client";

import { useCallback, useMemo, useState } from "react";
import { isKnownPersonNameText } from "@/lib/chunk-normalizer";
import { normalizeText } from "@/lib/text-normalization";

const VOCAB_ITEMS_STORAGE_KEY = "lenguariver_vocab_items_v1";
const VOCAB_SESSIONS_STORAGE_KEY = "lenguariver_vocab_sessions_v1";
const VOCAB_ACTIVE_SESSION_STORAGE_KEY = "lenguariver_vocab_active_session_v1";

export type SessionVocabularyWord = {
  text: string;
  language: string;
  normalizedText: string;
  seenCount: number;
  contextSentences: string[];
  lessonId: string;
  translation?: string;
};

type SessionVocabularyStore = {
  sessionId: string;
  lessonIds: string[];
  wordsSeen: Map<string, SessionVocabularyWord>;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
};

type SerializedSessionVocabularyStore = {
  sessionId: string;
  lessonIds: string[];
  wordsSeen: Record<string, SessionVocabularyWord>;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
};

type TrackWordExposureInput = {
  text: string;
  language: string;
  lessonId: string;
  contextSentence?: string;
  translation?: string;
};

function createSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createSession(lessonId: string): SessionVocabularyStore {
  const now = new Date().toISOString();
  return {
    sessionId: createSessionId(),
    lessonIds: [lessonId],
    wordsSeen: new Map(),
    startedAt: now,
    updatedAt: now,
  };
}

function serializeSession(store: SessionVocabularyStore): SerializedSessionVocabularyStore {
  return {
    sessionId: store.sessionId,
    lessonIds: store.lessonIds,
    wordsSeen: Object.fromEntries(store.wordsSeen),
    startedAt: store.startedAt,
    updatedAt: store.updatedAt,
    completedAt: store.completedAt,
  };
}

function deserializeSession(
  payload: SerializedSessionVocabularyStore | null | undefined
): SessionVocabularyStore | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  if (!payload.sessionId || typeof payload.sessionId !== "string") {
    return null;
  }
  const lessonIds = Array.isArray(payload.lessonIds)
    ? payload.lessonIds.filter((value): value is string => typeof value === "string")
    : [];
  const wordsSeenObject = payload.wordsSeen ?? {};
  const wordsSeen = new Map<string, SessionVocabularyWord>();
  Object.entries(wordsSeenObject).forEach(([key, value]) => {
    if (!value || typeof value !== "object") {
      return;
    }
    const word = value as SessionVocabularyWord;
    if (!word.normalizedText || !word.text || !word.language || !word.lessonId) {
      return;
    }
    wordsSeen.set(key, {
      text: word.text,
      language: word.language,
      normalizedText: word.normalizedText,
      seenCount: Number.isFinite(word.seenCount) ? Math.max(0, word.seenCount) : 0,
      contextSentences: Array.isArray(word.contextSentences)
        ? word.contextSentences.filter((entry): entry is string => typeof entry === "string").slice(0, 2)
        : [],
      lessonId: word.lessonId,
      translation: typeof word.translation === "string" ? word.translation : undefined,
    });
  });
  return {
    sessionId: payload.sessionId,
    lessonIds,
    wordsSeen,
    startedAt: payload.startedAt || new Date().toISOString(),
    updatedAt: payload.updatedAt || new Date().toISOString(),
    completedAt: payload.completedAt,
  };
}

function isLikelyNameToken(text: string, translation?: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (isKnownPersonNameText(trimmed)) {
    return true;
  }
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length !== 1) {
    return false;
  }
  const startsUpper = /^\p{Lu}/u.test(trimmed);
  if (!startsUpper) {
    return false;
  }
  const normalizedText = normalizeText(trimmed);
  const normalizedTranslation = normalizeText(translation ?? "");
  return normalizedText.length > 0 && normalizedText === normalizedTranslation;
}

function loadActiveSession(lessonId: string): SessionVocabularyStore {
  if (typeof window === "undefined") {
    return createSession(lessonId);
  }
  try {
    const raw = window.localStorage.getItem(VOCAB_ACTIVE_SESSION_STORAGE_KEY);
    if (!raw) {
      return createSession(lessonId);
    }
    const parsed = JSON.parse(raw) as SerializedSessionVocabularyStore;
    const session = deserializeSession(parsed);
    if (!session) {
      return createSession(lessonId);
    }
    if (session.lessonIds.includes(lessonId) && !session.completedAt) {
      return session;
    }
    return createSession(lessonId);
  } catch {
    return createSession(lessonId);
  }
}

function persistActiveSession(session: SessionVocabularyStore): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(VOCAB_ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(serializeSession(session)));
}

function persistVocabularyItem(word: SessionVocabularyWord): void {
  if (typeof window === "undefined") {
    return;
  }
  const key = `${word.language}::${word.normalizedText}`;
  let existing: Record<string, SessionVocabularyWord> = {};
  try {
    const raw = window.localStorage.getItem(VOCAB_ITEMS_STORAGE_KEY);
    existing = raw ? (JSON.parse(raw) as Record<string, SessionVocabularyWord>) : {};
  } catch {
    existing = {};
  }
  const prev = existing[key];
  const mergedContexts = Array.from(
    new Set([...(prev?.contextSentences ?? []), ...word.contextSentences.filter(Boolean)])
  ).slice(0, 2);
  existing[key] = {
    text: prev?.text ?? word.text,
    language: word.language,
    normalizedText: word.normalizedText,
    seenCount: Math.max(prev?.seenCount ?? 0, word.seenCount),
    contextSentences: mergedContexts,
    lessonId: word.lessonId,
    translation: word.translation ?? prev?.translation,
  };
  window.localStorage.setItem(VOCAB_ITEMS_STORAGE_KEY, JSON.stringify(existing));
}

function upsertSessionSnapshot(session: SessionVocabularyStore): void {
  if (typeof window === "undefined") {
    return;
  }
  let sessions: SerializedSessionVocabularyStore[] = [];
  try {
    const raw = window.localStorage.getItem(VOCAB_SESSIONS_STORAGE_KEY);
    sessions = raw ? (JSON.parse(raw) as SerializedSessionVocabularyStore[]) : [];
  } catch {
    sessions = [];
  }
  const serialized = serializeSession(session);
  const idx = sessions.findIndex((entry) => entry.sessionId === serialized.sessionId);
  if (idx === -1) {
    sessions.unshift(serialized);
  } else {
    sessions[idx] = serialized;
  }
  window.localStorage.setItem(VOCAB_SESSIONS_STORAGE_KEY, JSON.stringify(sessions.slice(0, 30)));
}

export function useVocabularySession(lessonId: string) {
  const [session, setSession] = useState<SessionVocabularyStore>(() => loadActiveSession(lessonId));

  const ensureLessonInSession = useCallback(
    (store: SessionVocabularyStore): SessionVocabularyStore => {
      if (store.lessonIds.includes(lessonId)) {
        return store;
      }
      return {
        ...store,
        lessonIds: [...store.lessonIds, lessonId],
      };
    },
    [lessonId]
  );

  const trackWordExposure = useCallback(
    (input: TrackWordExposureInput) => {
      const normalizedText = normalizeText(input.text);
      if (!normalizedText) {
        return;
      }
      if (isLikelyNameToken(input.text, input.translation)) {
        return;
      }

      setSession((prev) => {
        const nextBase = ensureLessonInSession(prev);
        const key = `${input.language}::${normalizedText}`;
        const current = nextBase.wordsSeen.get(key);
        const contextCandidates = [
          ...(current?.contextSentences ?? []),
          input.contextSentence?.trim() ?? "",
        ].filter(Boolean);
        const nextWord: SessionVocabularyWord = {
          text: current?.text ?? input.text.trim(),
          language: input.language,
          normalizedText,
          seenCount: (current?.seenCount ?? 0) + 1,
          contextSentences: Array.from(new Set(contextCandidates)).slice(0, 2),
          lessonId: input.lessonId,
          translation: current?.translation ?? (input.translation?.trim() || undefined),
        };
        const nextWordsSeen = new Map(nextBase.wordsSeen);
        nextWordsSeen.set(key, nextWord);
        const now = new Date().toISOString();
        const nextSession: SessionVocabularyStore = {
          ...nextBase,
          wordsSeen: nextWordsSeen,
          updatedAt: now,
        };
        persistActiveSession(nextSession);
        persistVocabularyItem(nextWord);
        upsertSessionSnapshot(nextSession);
        return nextSession;
      });
    },
    [ensureLessonInSession]
  );

  const finalizeSession = useCallback(() => {
    setSession((prev) => {
      if (prev.completedAt) {
        return prev;
      }
      const now = new Date().toISOString();
      const next = {
        ...prev,
        updatedAt: now,
        completedAt: now,
      };
      persistActiveSession(next);
      upsertSessionSnapshot(next);
      return next;
    });
  }, []);

  const sessionWords = useMemo(() => {
    return Array.from(session.wordsSeen.values()).sort((a, b) => {
      if (b.seenCount !== a.seenCount) {
        return b.seenCount - a.seenCount;
      }
      return a.text.localeCompare(b.text);
    });
  }, [session.wordsSeen]);

  return {
    sessionId: session.sessionId,
    lessonIds: session.lessonIds,
    wordsSeen: session.wordsSeen,
    sessionWords,
    trackWordExposure,
    finalizeSession,
  };
}

