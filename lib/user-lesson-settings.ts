export const LENGUARIVER_LESSON_UI_SETTINGS_STORAGE_KEY = "lenguariver_lesson_ui_settings";

export const LENGUARIVER_LESSON_UI_SETTINGS_CHANGED_EVENT =
  "lenguariver_lesson_ui_settings_changed";

export type LessonDisplayMode = "comic" | "classic";

export type LessonUiSettings = {
  lessonDisplayMode: LessonDisplayMode;
};

export const DEFAULT_LESSON_UI_SETTINGS: LessonUiSettings = {
  lessonDisplayMode: "comic",
};

export function resolveLessonDisplayMode(value: unknown): LessonDisplayMode {
  if (value === "comic" || value === "classic") {
    return value;
  }
  return DEFAULT_LESSON_UI_SETTINGS.lessonDisplayMode;
}

function readStoredObject(): Record<string, unknown> {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(LENGUARIVER_LESSON_UI_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return { ...(parsed as Record<string, unknown>) };
  } catch {
    return {};
  }
}

export function coerceLessonUiSettings(stored: Record<string, unknown>): LessonUiSettings {
  return {
    lessonDisplayMode: resolveLessonDisplayMode(stored.lessonDisplayMode),
  };
}

export function getLessonUiSettingsFromBrowser(): LessonUiSettings {
  return coerceLessonUiSettings(readStoredObject());
}

export function setLessonUiSettingsInBrowser(
  patch: Partial<LessonUiSettings>
): LessonUiSettings {
  if (typeof window === "undefined") {
    return coerceLessonUiSettings(patch);
  }
  const stored = readStoredObject();
  const merged = { ...stored, ...patch };
  const next = coerceLessonUiSettings(merged);
  const toPersist = { ...merged, ...next };
  try {
    window.localStorage.setItem(
      LENGUARIVER_LESSON_UI_SETTINGS_STORAGE_KEY,
      JSON.stringify(toPersist)
    );
    window.dispatchEvent(new Event(LENGUARIVER_LESSON_UI_SETTINGS_CHANGED_EVENT));
  } catch {
    /* ignore quota / private mode */
  }
  return next;
}

export function subscribeLessonUiSettings(listener: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key === LENGUARIVER_LESSON_UI_SETTINGS_STORAGE_KEY || event.key === null) {
      listener();
    }
  };
  const onCustom = () => listener();
  window.addEventListener("storage", onStorage);
  window.addEventListener(LENGUARIVER_LESSON_UI_SETTINGS_CHANGED_EVENT, onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(LENGUARIVER_LESSON_UI_SETTINGS_CHANGED_EVENT, onCustom);
  };
}
