"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isBrowserSpeechRecognitionSupported, useSpeechRecognition } from "./useSpeechRecognition";
import {
  classifyToken,
  computeWeightedMatchPercent,
  evaluateSpeechAnswer,
  isSpeechMatch,
  normalizeForSpeechCompare,
  type SpeechEvaluationResult,
} from "../../lib/speech-evaluation";

// Re-exported so existing call sites (e.g. LessonRunner.tsx) keep working
// without modification — the implementation now lives in lib/speech-evaluation.
export {
  classifyToken,
  computeWeightedMatchPercent,
  evaluateSpeechAnswer,
  isSpeechMatch,
  normalizeForSpeechCompare,
};

function sttLangFromLessonLanguage(language: string): string {
  if (language === "ar") {
    return "ar-SA";
  }
  if (language === "de") {
    return "de-DE";
  }
  if (language === "fr") {
    return "fr-FR";
  }
  if (language === "it") {
    return "it-IT";
  }
  if (language === "ru") {
    return "ru-RU";
  }
  if (language === "en") {
    return "en-US";
  }
  return "es-ES";
}

function isMediaRecordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

const isDev = process.env.NODE_ENV === "development";

function deferSpeechFollowup(work: () => void): void {
  window.setTimeout(work, 0);
}

const AUDIO_RECORDED_BUT_NO_STT =
  "Audio recorded, but speech recognition did not return text. Try again or type it.";

const STT_NETWORK_FALLBACK_MSG =
  "Speech recognition unavailable. You can still continue by typing what you said.";

const TRANSCRIPTION_FAILED_MSG = "Transcription failed. You can type what you said.";
const WEB_SPEECH_FINAL_GRACE_MS = 150;
const WHISPER_LOADING_GRACE_MS = 250;
const WHISPER_REFINEMENT_MIN_GAIN = 5;

type SpeechCheckDetails = {
  matchPercent: number;
  missingWords: string[];
  extraWords: string[];
  approxMispronounced: string[];
  missingGrammarCritical: string[];
};

type SpeechCheckResult = {
  ok: boolean;
  transcript: string;
  details: SpeechCheckDetails;
};

type ParentNotificationStatus = "correct" | "incorrect" | null;

type LocalTranscriptionResponse =
  | {
      ok: true;
      transcript: string;
      language: string;
    }
  | {
      ok: false;
      error: string;
    };

export type RecordingPanelProps = {
  expectedText: string;
  /**
   * For translation/meaning exercises: all accepted spoken answers (e.g. ["hello", "hi", "hey"]).
   * Speech is scored against EACH entry; the attempt passes if ANY reaches the 70 % threshold.
   * Missing/extra words are computed against the best-matching entry so alternate synonyms
   * are never surfaced as "missing".
   */
  acceptedSpokenTexts?: readonly string[];
  language: string;
  mode: "shadow" | "answer";
  answerInstruction?: string;
  onResult?: (
    ok: boolean,
    transcript: string,
    details?: SpeechCheckDetails
  ) => void;
  /** Optional parent hook for revealing external typing fallback UI. */
  onTypingFallbackNeeded?: () => void;
  autoCheckOnStop?: boolean;
  /** Shadowing satisfied — parent has counted this sentence spoken. UI stays interactive for practice. */
  complete?: boolean;
  /** When true, scoring/progression callbacks (onResult) are not invoked — e.g. Active Recall exercise already submitted. */
  suppressProgressionCallbacks?: boolean;
  /** Disable controls after exercise is checked (Active Recall). */
  interactionDisabled?: boolean;
  /** When false (default), parent is only notified on successful match via onResult(true, …). */
  notifyOnFailure?: boolean;
};

export function RecordingPanel({
  expectedText,
  acceptedSpokenTexts,
  language,
  mode,
  answerInstruction,
  onResult,
  onTypingFallbackNeeded,
  autoCheckOnStop = true,
  complete = false,
  suppressProgressionCallbacks = false,
  interactionDisabled = false,
  notifyOnFailure = false,
}: RecordingPanelProps) {
  const sttLang = sttLangFromLessonLanguage(language);
  const {
    startListening,
    stopListening,
    clearTranscript,
    clearRecognitionError,
    getLatestTranscript,
    transcript,
    isSupported,
    recognitionError,
  } = useSpeechRecognition(sttLang);
  const [lastTranscript, setLastTranscript] = useState("");
  const [isCorrect, setIsCorrect] = useState<null | boolean>(null);
  const [missingWords, setMissingWords] = useState<string[]>([]);
  const [extraWords, setExtraWords] = useState<string[]>([]);
  const [approxMispronounced, setApproxMispronounced] = useState<string[]>([]);
  const [matchPercent, setMatchPercent] = useState<number | null>(null);
  const [feedbackHint, setFeedbackHint] = useState<string | null>(null);
  const [sttTypedFallback, setSttTypedFallback] = useState("");
  const [whisperTranscript, setWhisperTranscript] = useState("");
  const [audioWithoutSttMessage, setAudioWithoutSttMessage] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [noSpeechMessage, setNoSpeechMessage] = useState<string | null>(null);
  const hasRecordedAudioBlobRef = useRef(false);
  const browserFastCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const whisperLoadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordedUrlForCleanupRef = useRef<string | null>(null);
  const hasAnnouncedTypingFallbackRef = useRef(false);
  const currentRecordingIdRef = useRef(0);
  const whisperPendingRef = useRef(false);
  const hasScoredCurrentRecordingRef = useRef(false);
  const lastScoredTranscriptRef = useRef("");
  const lastScoredMatchPercentRef = useRef<number | null>(null);
  const lastCheckResultRef = useRef<SpeechCheckResult | null>(null);
  const parentNotificationStatusRef = useRef<ParentNotificationStatus>(null);

  const displayTranscript = whisperTranscript.trim() || transcript.trim() || lastTranscript;
  const browserStt = isBrowserSpeechRecognitionSupported() && isSupported;
  const shouldShowNetworkFallback =
    recognitionError === "network" && !isTranscribing && !whisperTranscript.trim();
  const showSttTypedFallbackPanel =
    shouldShowNetworkFallback || Boolean(audioWithoutSttMessage);
  const sttFallbackGuidanceText =
    shouldShowNetworkFallback ? STT_NETWORK_FALLBACK_MSG : audioWithoutSttMessage;

  useEffect(() => {
    if (!showSttTypedFallbackPanel) {
      hasAnnouncedTypingFallbackRef.current = false;
      return;
    }
    if (hasAnnouncedTypingFallbackRef.current) {
      return;
    }
    hasAnnouncedTypingFallbackRef.current = true;
    onTypingFallbackNeeded?.();
  }, [onTypingFallbackNeeded, showSttTypedFallbackPanel]);

  useEffect(() => {
    recordedUrlForCleanupRef.current = recordedAudioUrl;
  }, [recordedAudioUrl]);

  useEffect(() => {
    return () => {
      if (browserFastCheckTimeoutRef.current) {
        clearTimeout(browserFastCheckTimeoutRef.current);
        browserFastCheckTimeoutRef.current = null;
      }
      if (whisperLoadingTimeoutRef.current) {
        clearTimeout(whisperLoadingTimeoutRef.current);
        whisperLoadingTimeoutRef.current = null;
      }
      stopListening();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      mediaRecorderRef.current = null;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      recordedChunksRef.current = [];
      const url = recordedUrlForCleanupRef.current;
      if (url) {
        URL.revokeObjectURL(url);
      }
      recordedUrlForCleanupRef.current = null;
    };
  }, [stopListening]);

  const notifyParentOfCheck = useCallback(
    (result: SpeechCheckResult) => {
      if (suppressProgressionCallbacks) {
        return;
      }
      if (!result.ok && !notifyOnFailure) {
        return;
      }
      const previousStatus = parentNotificationStatusRef.current;
      if (previousStatus === "correct") {
        return;
      }
      if (previousStatus === "incorrect" && !result.ok) {
        return;
      }
      parentNotificationStatusRef.current = result.ok ? "correct" : "incorrect";
      deferSpeechFollowup(() => {
        onResult?.(result.ok, result.transcript, result.details);
      });
    },
    [notifyOnFailure, onResult, suppressProgressionCallbacks]
  );

  /**
   * Single source of truth for scoring. Wraps `evaluateSpeechAnswer` so the
   * runtime UI uses the EXACT same matching pass that produced the percent —
   * no separate paths for "score" vs "missing/extra".
   */
  const evaluate = useCallback(
    (spokenTranscript: string): SpeechEvaluationResult =>
      evaluateSpeechAnswer({
        expectedText,
        spokenText: spokenTranscript,
        language,
        acceptedSpokenTexts,
      }),
    [acceptedSpokenTexts, expectedText, language]
  );

  const runCheck = useCallback(
    (transcriptOverride?: string, options?: { notifyParent?: boolean }): SpeechCheckResult | null => {
      if (isDev) console.time("[speech check] total");
      const raw = transcriptOverride ?? transcript;
      const t = raw.trim();
      if (!t) {
        if (isDev) console.time("[speech check] UI update");
        setIsCorrect(null);
        setMissingWords([]);
        setExtraWords([]);
        setApproxMispronounced([]);
        setMatchPercent(null);
        setFeedbackHint(null);
        const hasAudio = hasRecordedAudioBlobRef.current || Boolean(recordedAudioUrl);
        if (hasAudio) {
          setNoSpeechMessage(null);
          setAudioWithoutSttMessage(AUDIO_RECORDED_BUT_NO_STT);
        } else {
          setAudioWithoutSttMessage(null);
          setNoSpeechMessage("No speech detected. Try again.");
        }
        if (isDev) {
          console.timeEnd("[speech check] UI update");
          console.timeEnd("[speech check] total");
        }
        return null;
      }
      if (isDev) console.time("[speech check] scoring");
      setNoSpeechMessage(null);
      setAudioWithoutSttMessage(null);

      if (isDev) {
        console.groupCollapsed("[SpeechScore] runCheck inputs");
        console.log("  rawTranscript  :", JSON.stringify(raw));
        console.log("  trimmedT       :", JSON.stringify(t));
        console.log(
          "  transcript charCodes:",
          Array.from(t)
            .slice(0, 30)
            .map((c) => `${c}(U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")})`)
            .join(" ")
        );
        console.log("  expectedText   :", JSON.stringify(expectedText));
        console.log("  acceptedSpokenTexts:", acceptedSpokenTexts);
        console.groupEnd();
      }

      // ONE evaluation drives every UI surface: pass/fail, percent, missing,
      // extras, approx-mispronounced, feedback hint. No second path can
      // disagree with the score because nothing else recomputes anything.
      const evalResult = evaluate(t);
      const {
        ok,
        matchPercent: nextMatchPercent,
        missingWords: displayMissing,
        extraWords: nextExtra,
        approxMispronounced: nextApproxMispronounced,
        missingGrammarCritical,
        feedbackHint: nextFeedback,
      } = evalResult;

      if (isDev) {
        console.timeEnd("[speech check] scoring");
        console.time("[speech check] UI update");
      }
      setLastTranscript(t);
      setIsCorrect(ok);
      setMissingWords(displayMissing);
      setExtraWords(nextExtra);
      setApproxMispronounced(nextApproxMispronounced);
      setMatchPercent(nextMatchPercent);
      setFeedbackHint(nextFeedback);
      if (isDev) console.timeEnd("[speech check] UI update");
      const details: SpeechCheckDetails = {
        matchPercent: nextMatchPercent,
        missingWords: displayMissing,
        extraWords: nextExtra,
        approxMispronounced: nextApproxMispronounced,
        missingGrammarCritical,
      };
      const result: SpeechCheckResult = { ok, transcript: t, details };
      hasScoredCurrentRecordingRef.current = true;
      lastScoredTranscriptRef.current = t;
      lastScoredMatchPercentRef.current = nextMatchPercent;
      lastCheckResultRef.current = result;
      if (options?.notifyParent !== false) {
        notifyParentOfCheck(result);
      }
      if (isDev) console.timeEnd("[speech check] total");
      return result;
    },
    [
      acceptedSpokenTexts,
      evaluate,
      expectedText,
      notifyParentOfCheck,
      recordedAudioUrl,
      transcript,
    ]
  );

  const finishWithTranscriptionFallback = useCallback((recordingId = currentRecordingIdRef.current) => {
    if (!autoCheckOnStop) {
      return;
    }
    if (recordingId !== currentRecordingIdRef.current) {
      return;
    }
    const browserTranscript = getLatestTranscript().trim();
    if (browserTranscript) {
      setAudioWithoutSttMessage(null);
      runCheck(browserTranscript);
      return;
    }
    if (lastCheckResultRef.current) {
      notifyParentOfCheck(lastCheckResultRef.current);
      return;
    }
    setNoSpeechMessage(null);
    setAudioWithoutSttMessage(
      recognitionError === "network" ? STT_NETWORK_FALLBACK_MSG : TRANSCRIPTION_FAILED_MSG
    );
  }, [autoCheckOnStop, getLatestTranscript, notifyParentOfCheck, recognitionError, runCheck]);

  const scoreBrowserTranscriptIfAvailable = useCallback(
    (recordingId: number): boolean => {
      if (!autoCheckOnStop || recordingId !== currentRecordingIdRef.current) {
        return false;
      }
      const browserTranscript = getLatestTranscript().trim();
      if (!browserTranscript) {
        return false;
      }
      const alreadyScoredSameTranscript =
        hasScoredCurrentRecordingRef.current &&
        normalizeForSpeechCompare(browserTranscript) ===
          normalizeForSpeechCompare(lastScoredTranscriptRef.current);
      if (alreadyScoredSameTranscript) {
        return true;
      }
      setAudioWithoutSttMessage(null);
      const result = runCheck(browserTranscript, { notifyParent: false });
      if (result && (result.ok || !whisperPendingRef.current)) {
        notifyParentOfCheck(result);
      }
      return Boolean(result);
    },
    [autoCheckOnStop, getLatestTranscript, notifyParentOfCheck, runCheck]
  );

  const queueBrowserFastCheck = useCallback(
    (recordingId: number) => {
      if (browserFastCheckTimeoutRef.current) {
        clearTimeout(browserFastCheckTimeoutRef.current);
        browserFastCheckTimeoutRef.current = null;
      }
      if (scoreBrowserTranscriptIfAvailable(recordingId)) {
        return;
      }
      browserFastCheckTimeoutRef.current = setTimeout(() => {
        browserFastCheckTimeoutRef.current = null;
        const scored = scoreBrowserTranscriptIfAvailable(recordingId);
        if (!scored && !whisperPendingRef.current) {
          finishWithTranscriptionFallback(recordingId);
        }
      }, WEB_SPEECH_FINAL_GRACE_MS);
    },
    [finishWithTranscriptionFallback, scoreBrowserTranscriptIfAvailable]
  );

  useEffect(() => {
    if (!autoCheckOnStop || isRecordingAudio || !transcript.trim()) {
      return;
    }
    scoreBrowserTranscriptIfAvailable(currentRecordingIdRef.current);
  }, [autoCheckOnStop, isRecordingAudio, scoreBrowserTranscriptIfAvailable, transcript]);

  const transcribeRecordedAudio = useCallback(
    async (blob: Blob, recordingId: number) => {
      if (!autoCheckOnStop) {
        return;
      }
      whisperPendingRef.current = true;
      if (whisperLoadingTimeoutRef.current) {
        clearTimeout(whisperLoadingTimeoutRef.current);
      }
      whisperLoadingTimeoutRef.current = setTimeout(() => {
        whisperLoadingTimeoutRef.current = null;
        if (
          recordingId === currentRecordingIdRef.current &&
          !hasScoredCurrentRecordingRef.current
        ) {
          setIsTranscribing(true);
        }
      }, WHISPER_LOADING_GRACE_MS);
      setAudioWithoutSttMessage(null);
      setNoSpeechMessage(null);
      setWhisperTranscript("");

      try {
        const formData = new FormData();
        formData.append("audio", blob);
        formData.append("language", language);

        const response = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });
        const data = (await response.json()) as LocalTranscriptionResponse;

        if (recordingId !== currentRecordingIdRef.current) {
          return;
        }

        if (response.ok && data.ok && data.transcript.trim()) {
          const text = data.transcript.trim();
          clearRecognitionError();
          const hasFastScore = hasScoredCurrentRecordingRef.current;
          if (!hasFastScore) {
            setWhisperTranscript(text);
            runCheck(text);
            return;
          }

          const previousTranscript = lastScoredTranscriptRef.current;
          const previousScore =
            lastScoredMatchPercentRef.current ??
            evaluate(previousTranscript).matchPercent;
          const whisperScore = evaluate(text).matchPercent;
          const differsMeaningfully =
            normalizeForSpeechCompare(text) !== normalizeForSpeechCompare(previousTranscript);
          const improvesMatch =
            whisperScore >= previousScore + WHISPER_REFINEMENT_MIN_GAIN ||
            (previousScore < 70 && whisperScore >= 70);

          if (differsMeaningfully && improvesMatch) {
            setWhisperTranscript(text);
            const result = runCheck(text, { notifyParent: false });
            if (result && (result.ok || parentNotificationStatusRef.current === null)) {
              notifyParentOfCheck(result);
            }
            return;
          }

          if (lastCheckResultRef.current) {
            notifyParentOfCheck(lastCheckResultRef.current);
          }
          return;
        }

        finishWithTranscriptionFallback(recordingId);
      } catch {
        finishWithTranscriptionFallback(recordingId);
      } finally {
        if (whisperLoadingTimeoutRef.current) {
          clearTimeout(whisperLoadingTimeoutRef.current);
          whisperLoadingTimeoutRef.current = null;
        }
        if (recordingId === currentRecordingIdRef.current) {
          whisperPendingRef.current = false;
          setIsTranscribing(false);
        }
      }
    },
    [
      autoCheckOnStop,
      clearRecognitionError,
      evaluate,
      finishWithTranscriptionFallback,
      language,
      notifyParentOfCheck,
      runCheck,
    ]
  );

  const onStart = useCallback(async () => {
    if (interactionDisabled || startingRef.current || isRecordingAudio || isTranscribing) {
      return;
    }
    currentRecordingIdRef.current += 1;
    const recordingId = currentRecordingIdRef.current;
    startingRef.current = true;
    if (browserFastCheckTimeoutRef.current) {
      clearTimeout(browserFastCheckTimeoutRef.current);
      browserFastCheckTimeoutRef.current = null;
    }
    if (whisperLoadingTimeoutRef.current) {
      clearTimeout(whisperLoadingTimeoutRef.current);
      whisperLoadingTimeoutRef.current = null;
    }
    setMicError(null);
    setNoSpeechMessage(null);
    setAudioWithoutSttMessage(null);
    setSttTypedFallback("");
    setWhisperTranscript("");
    setIsTranscribing(false);
    hasRecordedAudioBlobRef.current = false;
    setIsCorrect(null);
    setMissingWords([]);
    setExtraWords([]);
    setApproxMispronounced([]);
    setMatchPercent(null);
    setFeedbackHint(null);
    setLastTranscript("");
    whisperPendingRef.current = false;
    hasScoredCurrentRecordingRef.current = false;
    lastScoredTranscriptRef.current = "";
    lastScoredMatchPercentRef.current = null;
    lastCheckResultRef.current = null;
    parentNotificationStatusRef.current = null;
    clearTranscript();
    recordedChunksRef.current = [];
    stopListening();

    if (mediaStreamRef.current && !mediaRecorderRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    try {
      if (isMediaRecordingSupported()) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          mediaStreamRef.current = stream;
          const recorder = new MediaRecorder(stream);
          mediaRecorderRef.current = recorder;
          recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              recordedChunksRef.current.push(event.data);
            }
          };
          recorder.onstop = () => {
            if (mediaRecorderRef.current !== recorder) {
              stream.getTracks().forEach((track) => track.stop());
              return;
            }
            const chunks = recordedChunksRef.current;
            recordedChunksRef.current = [];
            hasRecordedAudioBlobRef.current = chunks.length > 0;
            if (chunks.length > 0) {
              const blob = new Blob(chunks, { type: "audio/webm" });
              const url = URL.createObjectURL(blob);
              setRecordedAudioUrl((prev) => {
                if (prev) {
                  URL.revokeObjectURL(prev);
                }
                return url;
              });
              void transcribeRecordedAudio(blob, recordingId);
            } else {
              whisperPendingRef.current = false;
              finishWithTranscriptionFallback(recordingId);
            }
            if (mediaStreamRef.current) {
              mediaStreamRef.current.getTracks().forEach((track) => track.stop());
              mediaStreamRef.current = null;
            }
            mediaRecorderRef.current = null;
          };
          recorder.start();
          setIsRecordingAudio(true);
        } catch {
          setMicError("Microphone access failed or recording is not supported.");
          if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((track) => track.stop());
            mediaStreamRef.current = null;
          }
          mediaRecorderRef.current = null;
          return;
        }
      } else {
        setIsRecordingAudio(true);
      }

      startListening();
    } finally {
      startingRef.current = false;
    }
  }, [
    interactionDisabled,
    isRecordingAudio,
    isTranscribing,
    startListening,
    stopListening,
    clearTranscript,
    transcribeRecordedAudio,
    finishWithTranscriptionFallback,
  ]);

  const onStop = useCallback(() => {
    if (interactionDisabled || !isRecordingAudio) {
      return;
    }
    const recordingId = currentRecordingIdRef.current;
    const recorder = mediaRecorderRef.current;
    const willTranscribeAudio = Boolean(recorder && recorder.state !== "inactive");
    whisperPendingRef.current = willTranscribeAudio;
    stopListening();
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        whisperPendingRef.current = false;
        /* ignore */
      }
    } else {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      mediaRecorderRef.current = null;
    }
    setIsRecordingAudio(false);
    if (autoCheckOnStop) {
      queueBrowserFastCheck(recordingId);
    }
  }, [
    interactionDisabled,
    isRecordingAudio,
    stopListening,
    autoCheckOnStop,
    queueBrowserFastCheck,
  ]);

  const onManualCheck = useCallback(() => {
    if (interactionDisabled) {
      return;
    }
    const typed = sttTypedFallback.trim();
    const result = runCheck(typed || whisperTranscript.trim() || transcript.trim(), {
      notifyParent: false,
    });
    if (result && (result.ok || !whisperPendingRef.current)) {
      notifyParentOfCheck(result);
    }
  }, [
    interactionDisabled,
    notifyParentOfCheck,
    runCheck,
    sttTypedFallback,
    transcript,
    whisperTranscript,
  ]);

  const onTryRecordingAgain = useCallback(() => {
    clearTranscript();
    setSttTypedFallback("");
    setAudioWithoutSttMessage(null);
    clearRecognitionError();
    setNoSpeechMessage(null);
  }, [clearTranscript, clearRecognitionError]);

  const isShadow = mode === "shadow";
  const label = isShadow ? (
    <p className="muted" style={{ marginBottom: "0.35rem" }}>
      Repeat this sentence out loud. Stop recording when finished.
    </p>
  ) : (
    <p className="muted" style={{ marginBottom: "0.35rem" }}>
      <strong>Voice answer:</strong>{" "}
      {answerInstruction ?? "Speak your answer out loud, then stop or press Check."}
    </p>
  );

  /** Exposure: swap primary control — idle → Start speaking, recording → Stop speaking, after match → Practice again */
  const shadowShowsPracticeAgain = Boolean(complete || isCorrect === true);
  const shadowShowsStopRecording = Boolean(isRecordingAudio && !isTranscribing);

  const startButtonLabel =
    complete || isCorrect === true
      ? "🎙️ Practice again"
      : isShadow
        ? "🎙️ Start speaking"
        : "🎙️ Start recording";
  const startAriaLabel =
    complete || isCorrect === true ? "Practice again" : isShadow ? "Start speaking" : "Start recording";
  const stopButtonLabel = isShadow ? "⏹ Stop speaking" : "⏹ Stop recording";
  const stopAriaLabel = isShadow ? "Stop speaking" : "Stop recording";

  return (
    <div className="lr-recording-panel" style={{ marginTop: "0.5rem" }}>
      {label}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        {isShadow ? (
          !isTranscribing ? (
            shadowShowsStopRecording ? (
              <button
                type="button"
                className="button"
                onClick={onStop}
                disabled={interactionDisabled}
                aria-label={stopAriaLabel}
              >
                {stopButtonLabel}
              </button>
            ) : shadowShowsPracticeAgain ? (
              <button
                type="button"
                className="button"
                onClick={() => {
                  void onStart();
                }}
                disabled={interactionDisabled || isRecordingAudio || isTranscribing}
                aria-label="Practice again"
              >
                🎙️ Practice again
              </button>
            ) : (
              <button
                type="button"
                className="button"
                onClick={() => {
                  void onStart();
                }}
                disabled={interactionDisabled || isRecordingAudio || isTranscribing}
                aria-label="Start speaking"
              >
                🎙️ Start speaking
              </button>
            )
          ) : null
        ) : (
          <>
            <button
              type="button"
              className="button"
              onClick={() => {
                void onStart();
              }}
              disabled={interactionDisabled || isRecordingAudio || isTranscribing}
              aria-label={startAriaLabel}
            >
              {startButtonLabel}
            </button>
            <button
              type="button"
              className="button"
              onClick={onStop}
              disabled={interactionDisabled || !isRecordingAudio}
              aria-label={stopAriaLabel}
            >
              {stopButtonLabel}
            </button>
            <button
              type="button"
              className="button"
              onClick={onManualCheck}
              disabled={
                interactionDisabled ||
                isRecordingAudio ||
                isTranscribing ||
                (!displayTranscript.trim() && !sttTypedFallback.trim())
              }
            >
              Check
            </button>
          </>
        )}
      </div>
      {isDev ? (
        <div
          className="muted"
          style={{
            marginTop: "0.5rem",
            fontSize: "0.75rem",
            fontFamily: "ui-monospace, monospace",
            lineHeight: 1.45,
          }}
        >
          <div>Speech recognition supported: {browserStt ? "yes" : "no"}</div>
          <div>Last transcript: {transcript.trim() ? transcript.trim() : "(empty)"}</div>
          <div>Last recognition error: {recognitionError ?? "(none)"}</div>
        </div>
      ) : null}
      {micError ? (
        <p className="feedback-incorrect" style={{ marginTop: "0.35rem", marginBottom: 0 }}>
          {micError}
        </p>
      ) : null}
      {isTranscribing ? (
        <p className="muted" style={{ marginTop: "0.35rem", marginBottom: 0 }}>
          Transcribing...
        </p>
      ) : null}
      {noSpeechMessage ? (
        <p className="feedback-incorrect" style={{ marginTop: "0.35rem", marginBottom: 0 }}>
          {noSpeechMessage}
        </p>
      ) : null}
      {showSttTypedFallbackPanel ? (
        <div style={{ marginTop: "0.35rem" }}>
          {sttFallbackGuidanceText ? (
            <p className="muted" style={{ marginBottom: "0.35rem" }}>
              {sttFallbackGuidanceText}
            </p>
          ) : null}
          <label className="muted" htmlFor="lr-stt-typed-fallback" style={{ display: "block" }}>
            Type what you said
          </label>
          <input
            id="lr-stt-typed-fallback"
            className="text-input"
            type="text"
            value={sttTypedFallback}
            onChange={(e) => setSttTypedFallback(e.target.value)}
            placeholder="Type the sentence you spoke"
            style={{ marginTop: "0.25rem", maxWidth: "100%" }}
            disabled={interactionDisabled || isTranscribing}
            autoComplete="off"
          />
          {mode === "shadow" ? (
            <div style={{ marginTop: "0.35rem" }}>
              <button
                type="button"
                className="button"
                onClick={onManualCheck}
                disabled={
                  interactionDisabled ||
                  isRecordingAudio ||
                  isTranscribing ||
                  !sttTypedFallback.trim()
                }
              >
                Use typed text
              </button>
            </div>
          ) : null}
          <div style={{ marginTop: "0.35rem" }}>
            <button
              type="button"
              className="button"
              onClick={onTryRecordingAgain}
              disabled={interactionDisabled || isRecordingAudio || isTranscribing}
            >
              Try recording again
            </button>
          </div>
        </div>
      ) : null}
      {!interactionDisabled && complete && isCorrect === false ? (
        <p className="muted" style={{ marginTop: "0.35rem", marginBottom: 0 }}>
          Step already counted complete — practicing again won’t undo your progress.
        </p>
      ) : null}
      {(isCorrect === true || complete) ? (
        <div style={{ marginTop: "0.35rem" }}>
          <p className="feedback-correct" style={{ marginBottom: isShadow ? "0.25rem" : 0 }}>
            Correct — sentence complete
          </p>
          {isShadow ? (
            <p className="muted" style={{ marginTop: 0, marginBottom: 0 }}>
              Practice again to improve pronunciation
            </p>
          ) : null}
        </div>
      ) : null}
      {recordedAudioUrl ? (
        <div style={{ marginTop: "0.5rem" }}>
          <p className="muted" style={{ marginBottom: "0.25rem" }}>
            Replay your recording
          </p>
          <audio controls src={recordedAudioUrl} style={{ maxWidth: "100%", display: "block" }} />
        </div>
      ) : null}
      {displayTranscript ? (
        <p className="muted" style={{ marginTop: "0.35rem" }}>
          Transcript: {displayTranscript}
        </p>
      ) : null}
      {isCorrect !== null ? (
        <div className="muted" style={{ marginTop: "0.35rem" }}>
          <p style={{ marginBottom: "0.25rem" }}>
            <strong>Expected:</strong> {expectedText}
          </p>
          <p style={{ marginBottom: "0.25rem" }}>
            <strong>You said:</strong> {displayTranscript || "(empty)"}
          </p>
          <p style={{ marginBottom: "0.25rem" }}>
            <strong>Missing:</strong> {missingWords.length > 0 ? missingWords.join(", ") : "None"}
          </p>
          <p style={{ marginBottom: "0.25rem" }}>
            <strong>Extra:</strong> {extraWords.length > 0 ? extraWords.join(", ") : "None"}
          </p>
          <p style={{ marginBottom: "0.25rem" }}>
            <strong>Approx mispronounced:</strong>{" "}
            {approxMispronounced.length > 0 ? approxMispronounced.join(", ") : "None"}
          </p>
          <p style={{ marginBottom: 0 }}>
            <strong>Match:</strong> {matchPercent ?? 0}%
          </p>
          {feedbackHint ? (
            <p style={{ marginTop: "0.25rem", marginBottom: 0 }}>
              <strong>Feedback:</strong> {feedbackHint}
            </p>
          ) : null}
        </div>
      ) : null}
      {isCorrect === false ? (
        <>
          <p className="feedback-incorrect">❌ Try again</p>
          {missingWords.length > 0 ? (
            <p className="feedback-correction">
              Missing: <span className="feedback-highlight">{missingWords.join(", ")}</span>
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
