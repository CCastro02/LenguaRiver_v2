"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/app/AppShell";
import { LENGUA_RIVER_PROGRESS_CLEARED_EVENT, resetLocalProgressStorage } from "@/lib/app-settings";
import { useAppSettings } from "@/lib/useAppSettings";
import { ensureTtsVoicesLoaded, hasSpanishSystemVoice } from "@/lib/tts-voice";
import { DeveloperModeActiveBanner, useDeveloperMode } from "@/lib/developer-mode";
import { useLessonUiSettings } from "@/lib/useLessonUiSettings";
import type { LessonDisplayMode } from "@/lib/user-lesson-settings";

export default function SettingsPage() {
  const { settings, setSettings } = useAppSettings();
  const { settings: lessonUiSettings, setSettings: setLessonUiSettings } = useLessonUiSettings();
  const { enabled: developerModeEnabled, setEnabled: setDeveloperModeEnabled } = useDeveloperMode();
  const [spanishVoiceDetected, setSpanishVoiceDetected] = useState<boolean | null>(null);
  const [lessonDisplaySaved, setLessonDisplaySaved] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      queueMicrotask(() => setSpanishVoiceDetected(null));
      return;
    }
    const synth = window.speechSynthesis;
    const refresh = () => {
      ensureTtsVoicesLoaded();
      queueMicrotask(() => setSpanishVoiceDetected(hasSpanishSystemVoice()));
    };
    refresh();
    synth.addEventListener("voiceschanged", refresh);
    return () => synth.removeEventListener("voiceschanged", refresh);
  }, []);

  const update = useCallback(
    <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) => {
      setSettings({ [key]: value } as Partial<typeof settings>);
    },
    [setSettings]
  );

  const onLessonDisplayChange = useCallback(
    (mode: LessonDisplayMode) => {
      setLessonUiSettings({ lessonDisplayMode: mode });
      setLessonDisplaySaved(true);
      window.setTimeout(() => setLessonDisplaySaved(false), 2000);
    },
    [setLessonUiSettings]
  );

  const onResetProgress = useCallback(() => {
    const ok = window.confirm(
      "Clear all saved practice progress on this device? Chunk memory, topic phases, and help usage will be removed. Settings and interest choice stay."
    );
    if (!ok) {
      return;
    }
    resetLocalProgressStorage();
    window.dispatchEvent(new Event(LENGUA_RIVER_PROGRESS_CLEARED_EVENT));
  }, []);

  return (
    <AppShell>
      <div className="page lr-settings-page">
        <h1>Settings</h1>
        <nav className="lr-settings-links" aria-label="Settings sections">
          <Link href="/settings/extension" className="db-link-ghost">
            Extension
          </Link>
        </nav>
        <DeveloperModeActiveBanner />
        <p className="muted">Preferences are saved in your browser (localStorage).</p>

        <section className="card lr-settings-card">
          <h2>Language</h2>
          <p className="muted">Target language (saved here; lesson flows still use their own selectors for now).</p>
          <label className="sr-only" htmlFor="lr-settings-lang">
            Target language
          </label>
          <select
            id="lr-settings-lang"
            className="text-input lr-lang-select"
            value={settings.language}
            onChange={(e) => update("language", e.target.value)}
            aria-label="Target language"
          >
            <option value="es">Spanish (es)</option>
            <option value="ru">Russian (ru)</option>
          </select>
        </section>

        <section className="card lr-settings-card">
          <h2>Audio</h2>
          <p className="muted">Defaults for listen / repeat (LessonRunner not wired yet).</p>
          {settings.language === "es" && spanishVoiceDetected === false ? (
            <p className="muted" style={{ marginBottom: "0.75rem" }}>
              No Spanish system voice detected. Install a Spanish voice on your device for better pronunciation.
              See the README section &quot;Text-to-speech (TTS) voices&quot; for iPhone, Windows, and macOS steps.
            </p>
          ) : null}
          <fieldset className="lr-settings-fieldset">
            <legend className="lr-settings-legend">Default TTS speed</legend>
            <label className="lr-settings-radio">
              <input
                type="radio"
                name="ttsRate"
                checked={settings.ttsRate === 0.7}
                onChange={() => update("ttsRate", 0.7)}
              />
              Slow (0.7)
            </label>
            <label className="lr-settings-radio">
              <input
                type="radio"
                name="ttsRate"
                checked={settings.ttsRate === 0.9}
                onChange={() => update("ttsRate", 0.9)}
              />
              Normal (0.9)
            </label>
          </fieldset>
          <fieldset className="lr-settings-fieldset">
            <legend className="lr-settings-legend">Default repeat count</legend>
            {([1, 2, 3] as const).map((n) => (
              <label key={n} className="lr-settings-radio">
                <input
                  type="radio"
                  name="repeatCount"
                  checked={settings.repeatCount === n}
                  onChange={() => update("repeatCount", n)}
                />
                {n}x
              </label>
            ))}
          </fieldset>
        </section>

        <section className="card lr-settings-card">
          <h2>Daily practice</h2>
          <p className="muted">Daily goal reminder target (display only for now).</p>
          <fieldset className="lr-settings-fieldset">
            <legend className="lr-settings-legend">Daily goal</legend>
            {([10, 20, 30] as const).map((m) => (
              <label key={m} className="lr-settings-radio">
                <input
                  type="radio"
                  name="dailyGoal"
                  checked={settings.dailyGoalMinutes === m}
                  onChange={() => update("dailyGoalMinutes", m)}
                />
                {m} minutes
              </label>
            ))}
          </fieldset>
        </section>

        <section className="card lr-settings-card">
          <h2>Appearance</h2>
          <p className="muted">Choose the app color theme.</p>
          <fieldset className="lr-settings-fieldset">
            <legend className="lr-settings-legend">Theme</legend>
            <label className="lr-settings-radio">
              <input
                type="radio"
                name="theme"
                checked={settings.theme === "dark"}
                onChange={() => update("theme", "dark")}
              />
              Dark
            </label>
            <label className="lr-settings-radio">
              <input
                type="radio"
                name="theme"
                checked={settings.theme === "light"}
                onChange={() => update("theme", "light")}
              />
              Light
            </label>
          </fieldset>
        </section>

        <section className="card lr-settings-card">
          <h2>Lesson display</h2>
          <p className="muted">Choose how lessons with a storyboard are presented.</p>
          <fieldset className="lr-settings-fieldset">
            <legend className="lr-settings-legend">Lesson display mode</legend>
            <label className="lr-settings-radio">
              <input
                type="radio"
                name="lessonDisplayMode"
                checked={lessonUiSettings.lessonDisplayMode === "comic"}
                onChange={() => onLessonDisplayChange("comic")}
              />
              <span>
                <strong>Comic storybook</strong>
                <span className="muted" style={{ display: "block", marginTop: "0.25rem" }}>
                  Show lessons as an interactive comic when a storyboard is available.
                </span>
              </span>
            </label>
            <label className="lr-settings-radio">
              <input
                type="radio"
                name="lessonDisplayMode"
                checked={lessonUiSettings.lessonDisplayMode === "classic"}
                onChange={() => onLessonDisplayChange("classic")}
              />
              <span>
                <strong>Classic lesson view</strong>
                <span className="muted" style={{ display: "block", marginTop: "0.25rem" }}>
                  Use the original lesson cards and controls.
                </span>
              </span>
            </label>
          </fieldset>
          {lessonDisplaySaved ? (
            <p className="muted" role="status" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
              Saved
            </p>
          ) : null}
        </section>

        <section className="card lr-settings-card">
          <h2>Display</h2>
          <label className="lr-settings-toggle">
            <input
              type="checkbox"
              checked={settings.showTranslationsByDefault}
              onChange={(e) => update("showTranslationsByDefault", e.target.checked)}
            />
            Show translations by default
          </label>
        </section>

        <section className="card lr-settings-card">
          <h2>Developer</h2>
          <label className="lr-settings-toggle">
            <input
              type="checkbox"
              checked={developerModeEnabled}
              onChange={(e) => setDeveloperModeEnabled(e.target.checked)}
            />
            Developer Mode
          </label>
          <p className="muted" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
            Unlock all lessons for demo/testing.
          </p>
        </section>

        <section className="card lr-settings-card lr-settings-card--danger">
          <h2>Reset</h2>
          <p className="muted">
            Removes chunk progress, topic phase progress, and help reveal counts from this browser.
          </p>
          <button type="button" className="button lr-settings-reset" onClick={onResetProgress}>
            Reset local progress…
          </button>
        </section>
      </div>
    </AppShell>
  );
}
