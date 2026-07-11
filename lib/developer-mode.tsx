"use client";

import { useCallback, useEffect, useState } from "react";

/** localStorage key — value must be exactly `"true"` when enabled. */
export const LENGUARIVER_DEV_MODE_STORAGE_KEY = "lenguariver_dev_mode";

export const LENGUARIVER_DEV_MODE_CHANGED_EVENT = "lenguariver_dev_mode_changed";

export function readDeveloperModeEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(LENGUARIVER_DEV_MODE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setDeveloperModeEnabled(enabled: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (enabled) {
      window.localStorage.setItem(LENGUARIVER_DEV_MODE_STORAGE_KEY, "true");
    } else {
      window.localStorage.removeItem(LENGUARIVER_DEV_MODE_STORAGE_KEY);
    }
    window.dispatchEvent(new Event(LENGUARIVER_DEV_MODE_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

export function useDeveloperMode() {
  const [enabled, setEnabledState] = useState(false);

  useEffect(() => {
    const sync = () => {
      setEnabledState(readDeveloperModeEnabled());
    };
    sync();
    const onStorage = (event: StorageEvent) => {
      if (event.key === LENGUARIVER_DEV_MODE_STORAGE_KEY || event.key === null) {
        sync();
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(LENGUARIVER_DEV_MODE_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(LENGUARIVER_DEV_MODE_CHANGED_EVENT, sync);
    };
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setDeveloperModeEnabled(next);
    setEnabledState(readDeveloperModeEnabled());
  }, []);

  return { enabled, setEnabled };
}

export function DeveloperModeActiveBanner() {
  const { enabled } = useDeveloperMode();
  if (!enabled) {
    return null;
  }
  return (
    <p className="muted lr-dev-mode-active" role="status">
      Developer Mode Active
    </p>
  );
}
