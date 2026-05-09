export const LENGUA_RIVER_PROGRESS_CLEARED_EVENT = "lenguariver-progress-cleared";

/** LocalStorage keys that store learner progress (not preferences). */
export const LENGUA_RIVER_PROGRESS_STORAGE_KEYS = [
  "lenguariver_chunk_progress",
  "lenguariver_help_usage",
  "lenguariver_topic_progress",
] as const;

export function resetLocalProgressStorage(): void {
  if (typeof window === "undefined") {
    return;
  }
  LENGUA_RIVER_PROGRESS_STORAGE_KEYS.forEach((key) => {
    window.localStorage.removeItem(key);
  });
}
