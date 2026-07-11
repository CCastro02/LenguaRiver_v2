"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_LESSON_UI_SETTINGS,
  getLessonUiSettingsFromBrowser,
  setLessonUiSettingsInBrowser,
  subscribeLessonUiSettings,
} from "./user-lesson-settings";
import type { LessonUiSettings } from "./user-lesson-settings";

export function useLessonUiSettings() {
  const [settings, setSettingsState] = useState<LessonUiSettings>(DEFAULT_LESSON_UI_SETTINGS);

  useEffect(() => {
    const sync = () => {
      setSettingsState(getLessonUiSettingsFromBrowser());
    };
    sync();
    return subscribeLessonUiSettings(sync);
  }, []);

  const setSettings = useCallback((patch: Partial<LessonUiSettings>) => {
    const next = setLessonUiSettingsInBrowser(patch);
    setSettingsState(next);
  }, []);

  return { settings, setSettings };
}
