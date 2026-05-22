import { browser } from "wxt/browser";

import { getWildWords } from "./storage";
import type { ExtensionWildWord } from "./types";

export const BRIDGE_SCHEMA_VERSION = 1;

/**
 * Origins allowed for extension ↔ web app auto-sync (content-script bridge).
 * Must match the page origin exactly (scheme + host + port).
 */

/** Local development — active. */
export const LOCAL_DEV_LENGUARIVER_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
] as const;

/**
 * Production web origins — uncomment and replace placeholders with real URLs before release.
 *
 * - Vercel: use your deployment origin (see `NEXT_PUBLIC_SITE_URL` in PROJECT_RULES.md).
 *   Example shape: `https://<your-vercel-domain>.vercel.app`
 * - Custom domain: `https://lenguariver.com` when live.
 *
 * No concrete Vercel URL is committed in this repo; do not guess — configure here when known.
 */
// export const PRODUCTION_LENGUARIVER_ORIGINS = [
//   "https://<your-vercel-domain>.vercel.app",
//   "https://lenguariver.com",
// ] as const;

/** Documented production targets; inactive until added to `ALLOWED_LENGUARIVER_ORIGINS` above. */
export const PRODUCTION_LENGUARIVER_ORIGIN_PLACEHOLDERS = [
  "https://<your-vercel-domain>.vercel.app",
  "https://lenguariver.com",
] as const;

const ALLOWED_LENGUARIVER_ORIGINS = new Set<string>([
  ...LOCAL_DEV_LENGUARIVER_ORIGINS,
  // When enabling production sync, spread uncommented PRODUCTION_LENGUARIVER_ORIGINS here:
  // ...PRODUCTION_LENGUARIVER_ORIGINS,
]);

/** Active allowlist (for tests and diagnostics). */
export function getAllowedLenguaRiverOrigins(): readonly string[] {
  return [...ALLOWED_LENGUARIVER_ORIGINS];
}

export function isLenguaRiverWebUrl(url: string | undefined | null): boolean {
  return getLenguaRiverOriginFromUrl(url) !== null;
}

export function getLenguaRiverOriginFromUrl(url: string | undefined | null): string | null {
  if (!url || typeof url !== "string") {
    return null;
  }
  try {
    const origin = new URL(url).origin;
    return ALLOWED_LENGUARIVER_ORIGINS.has(origin) ? origin : null;
  } catch {
    return null;
  }
}

export async function broadcastSavedWordToLenguaRiverTabs(word: ExtensionWildWord): Promise<void> {
  let tabs: { id?: number; url?: string }[];
  try {
    tabs = await browser.tabs.query({});
  } catch {
    return;
  }

  const message = {
    type: "lenguariver:extension-word-saved" as const,
    schemaVersion: BRIDGE_SCHEMA_VERSION,
    word,
  };

  for (const tab of tabs) {
    if (tab.id == null || !isLenguaRiverWebUrl(tab.url)) {
      continue;
    }
    try {
      await browser.tabs.sendMessage(tab.id, message);
    } catch {
      /* content script may not be ready */
    }
  }
}

export async function sendAllWordsToTab(tabId: number): Promise<void> {
  let words: ExtensionWildWord[];
  try {
    words = await getWildWords();
  } catch {
    return;
  }

  try {
    await browser.tabs.sendMessage(tabId, {
      type: "lenguariver:extension-sync-response",
      schemaVersion: BRIDGE_SCHEMA_VERSION,
      words,
    });
  } catch {
    /* tab may have closed or content script unavailable */
  }
}
