"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { browserSpeechRecognitionLocale } from "@/lib/speech-recording-strategy";

const SILENCE_MS = 4000;
const SILENCE_TICK_MS = 300;

/** Minimal Web Speech API surface (DOM typings vary by TS version). */
type SpeechRecognitionResultLike = { transcript: string };

type SpeechRecognitionResultRow = {
  0: SpeechRecognitionResultLike;
  /** When interim results are used, only finals carry stable text. */
  isFinal?: boolean;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultRow> & { length: number };
};

type SpeechRecognitionErrorEventLike = {
  error?: string;
  message?: string;
};

export type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") {
    return null;
  }
  const w = window as Window &
    typeof globalThis & {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** SSR-safe: false on server; on client, whether the browser exposes Web Speech recognition. */
export function isBrowserSpeechRecognitionSupported(): boolean {
  return Boolean(getSpeechRecognitionCtor());
}

export function useSpeechRecognition(lang: string) {
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [recognitionError, setRecognitionError] = useState<string | null>(null);
  const [isSupported] = useState(() =>
    typeof window !== "undefined" ? Boolean(getSpeechRecognitionCtor()) : false
  );
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const silenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSpeechActivityRef = useRef(0);
  const hasReceivedSpeechRef = useRef(false);
  const latestTranscriptRef = useRef("");

  const clearSilenceWatcher = useCallback(() => {
    if (silenceIntervalRef.current) {
      clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = null;
    }
  }, []);

  const clearTranscript = useCallback(() => {
    latestTranscriptRef.current = "";
    setTranscript("");
  }, []);

  const clearRecognitionError = useCallback(() => {
    setRecognitionError(null);
  }, []);

  const stopListening = useCallback(() => {
    clearSilenceWatcher();
    const r = recognitionRef.current;
    if (r) {
      try {
        r.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, [clearSilenceWatcher]);

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      return;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    }
    clearSilenceWatcher();
    setRecognitionError(null);

    const recognition = new Ctor();
    recognition.lang = browserSpeechRecognitionLocale(lang);
    recognition.continuous = false;
    // Keep interim results on. In Chrome/PWA windows the final-only result can
    // be empty if the learner taps Stop quickly, even though interim text was
    // heard while they were speaking. We store the latest interim/final text in
    // latestTranscriptRef and score it after Stop.
    recognition.interimResults = true;
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      hasReceivedSpeechRef.current = true;
      lastSpeechActivityRef.current = Date.now();
      const next = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      latestTranscriptRef.current = next;
      setTranscript(next);
    };
    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      const code = event.error ?? "unknown";
      setRecognitionError(code);
      if (process.env.NODE_ENV === "development") {
        console.log("[speech-recognition] onerror", code, event.message ?? "");
      }
      clearSilenceWatcher();
      setIsListening(false);
      recognitionRef.current = null;
    };
    recognition.onend = () => {
      clearSilenceWatcher();
      setIsListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    hasReceivedSpeechRef.current = false;
    latestTranscriptRef.current = "";
    setTranscript("");
    setIsListening(true);
    silenceIntervalRef.current = setInterval(() => {
      const active = recognitionRef.current;
      if (!active) {
        clearSilenceWatcher();
        return;
      }
      if (!hasReceivedSpeechRef.current) {
        return;
      }
      if (Date.now() - lastSpeechActivityRef.current >= SILENCE_MS) {
        try {
          active.stop();
        } catch {
          /* ignore */
        }
      }
    }, SILENCE_TICK_MS);
    try {
      recognition.start();
    } catch {
      clearSilenceWatcher();
      setIsListening(false);
      recognitionRef.current = null;
    }
  }, [lang, clearSilenceWatcher]);

  const getLatestTranscript = useCallback(() => latestTranscriptRef.current, []);

  useEffect(() => {
    return () => {
      clearSilenceWatcher();
      const r = recognitionRef.current;
      if (r) {
        try {
          r.stop();
        } catch {
          /* ignore */
        }
        recognitionRef.current = null;
      }
      setIsListening(false);
    };
  }, [clearSilenceWatcher]);

  return {
    startListening,
    stopListening,
    clearTranscript,
    clearRecognitionError,
    getLatestTranscript,
    transcript,
    isListening,
    isSupported,
    recognitionError,
  };
}
