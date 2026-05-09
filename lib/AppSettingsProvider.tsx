"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppSettingsContext,
  DEFAULT_SETTINGS,
  coerceAppSettings,
  persistToStorage,
  readStoredRaw,
} from "./useAppSettings";
import type { AppSettings } from "./useAppSettings";

/**
 * Mount once at the root (layout.tsx).
 * Holds the single source of truth for all app settings and syncs
 * data-theme to <html> so every useAppSettings() call shares state.
 */
export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [hasMounted, setHasMounted] = useState(false);
  const allowPersistRef = useRef(false);

  // Read localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    queueMicrotask(() => {
      setSettingsState(coerceAppSettings(readStoredRaw()));
      allowPersistRef.current = true;
      setHasMounted(true);
    });
  }, []);

  // Sync data-theme on <html> whenever theme setting changes
  useEffect(() => {
    const el = document.documentElement;
    if (settings.theme === "light") {
      el.setAttribute("data-theme", "light");
    } else {
      el.removeAttribute("data-theme");
    }
  }, [settings.theme]);

  const setSettings = useCallback((partial: Partial<AppSettings>) => {
    setSettingsState((prev) => {
      const next = coerceAppSettings({ ...prev, ...partial });
      if (allowPersistRef.current) {
        persistToStorage(next);
      }
      return next;
    });
  }, []);

  return (
    <AppSettingsContext.Provider value={{ settings, setSettings, hasMounted }}>
      {children}
    </AppSettingsContext.Provider>
  );
}
