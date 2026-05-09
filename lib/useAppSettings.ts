"use client";

import { createContext, useContext } from "react";

const STORAGE_KEY = "lenguariver_settings";

export type AppTheme = "dark" | "light";

export type AppSettings = {
  language: string;
  ttsRate: number;
  repeatCount: number;
  dailyGoalMinutes: number;
  showTranslationsByDefault: boolean;
  theme: AppTheme;
};

export const DEFAULT_SETTINGS: AppSettings = {
  language: "es",
  ttsRate: 0.9,
  repeatCount: 1,
  dailyGoalMinutes: 20,
  showTranslationsByDefault: false,
  theme: "dark",
};

function readStoredRaw(): unknown {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function coerceAppSettings(unknownStored: unknown): AppSettings {
  const base = { ...DEFAULT_SETTINGS };
  if (!unknownStored || typeof unknownStored !== "object") {
    return base;
  }
  const o = unknownStored as Record<string, unknown>;

  if (o.language === "es" || o.language === "ru") {
    base.language = o.language;
  }

  if (o.ttsRate === 0.7 || o.ttsRate === 0.9) {
    base.ttsRate = o.ttsRate;
  }

  if (o.repeatCount === 1 || o.repeatCount === 2 || o.repeatCount === 3) {
    base.repeatCount = o.repeatCount;
  }

  if (o.dailyGoalMinutes === 10 || o.dailyGoalMinutes === 20 || o.dailyGoalMinutes === 30) {
    base.dailyGoalMinutes = o.dailyGoalMinutes;
  }

  if (typeof o.showTranslationsByDefault === "boolean") {
    base.showTranslationsByDefault = o.showTranslationsByDefault;
  }

  if (o.theme === "dark" || o.theme === "light") {
    base.theme = o.theme;
  }

  return base;
}

function persistToStorage(settings: AppSettings): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

// ---------------------------------------------------------------------------
// Shared context — all useAppSettings() calls in the tree share one instance.
// The provider component lives in AppSettingsProvider.tsx (needs .tsx for JSX).
// ---------------------------------------------------------------------------

export type AppSettingsContextValue = {
  settings: AppSettings;
  setSettings: (partial: Partial<AppSettings>) => void;
  hasMounted: boolean;
};

export const AppSettingsContext = createContext<AppSettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  setSettings: () => {},
  hasMounted: false,
});

export { coerceAppSettings, readStoredRaw, persistToStorage };

/**
 * Consume shared settings. Must be used inside <AppSettingsProvider>.
 */
export function useAppSettings(): AppSettingsContextValue {
  return useContext(AppSettingsContext);
}
