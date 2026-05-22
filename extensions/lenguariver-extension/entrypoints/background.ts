import { defineBackground } from "wxt/utils/define-background";
import { browser } from "wxt/browser";

import {
  defaultMeta,
  DEFAULT_SETTINGS,
  getSettings,
  STORAGE_KEYS,
  upsertWildWord,
} from "../lib/storage";
import {
  broadcastSavedWordToLenguaRiverTabs,
  isLenguaRiverWebUrl,
  sendAllWordsToTab,
} from "../lib/web-bridge";

type SavePayload = {
  text: string;
  contextSentence?: string;
  pageUrl: string;
  pageTitle: string;
};

type LrMessage =
  | { type: "lr:save-wild-word"; payload: SavePayload }
  | { type: "lr:define"; payload: { text: string } }
  | { type: "lr:translate"; payload: { text: string } }
  | { type: "lenguariver:web-sync-request"; schemaVersion: 1 };

const MSG_DEFINE_PLACEHOLDER = "Definitions coming soon";
const MSG_TRANSLATE_PLACEHOLDER = "Translation coming soon";

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async () => {
    const existing = await browser.storage.local.get([STORAGE_KEYS.meta, STORAGE_KEYS.settings]);
    if (!existing[STORAGE_KEYS.meta]) {
      await browser.storage.local.set({ [STORAGE_KEYS.meta]: defaultMeta() });
    }
    if (!existing[STORAGE_KEYS.settings]) {
      await browser.storage.local.set({ [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS } });
    }
  });

  browser.runtime.onMessage.addListener((message: LrMessage, sender, sendResponse) => {
    if (!message || typeof message !== "object") {
      return false;
    }

    if (message.type === "lenguariver:web-sync-request") {
      if (message.schemaVersion !== 1) {
        return false;
      }
      const tabId = sender.tab?.id;
      const tabUrl = sender.tab?.url;
      if (tabId == null || !isLenguaRiverWebUrl(tabUrl)) {
        return false;
      }
      void sendAllWordsToTab(tabId);
      return false;
    }

    if (message.type === "lr:save-wild-word") {
      void (async () => {
        let settings: Awaited<ReturnType<typeof getSettings>> | null = null;
        try {
          settings = await getSettings();
          const { outcome, word } = await upsertWildWord({
            text: message.payload.text,
            contextSentence: message.payload.contextSentence,
            pageUrl: message.payload.pageUrl,
            pageTitle: message.payload.pageTitle,
            settings,
          });
          try {
            await broadcastSavedWordToLenguaRiverTabs(word);
          } catch {
            /* save succeeded; broadcast is best-effort */
          }
          sendResponse({ ok: true as const, outcome });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Save failed.";
          console.error("[LenguaRiver][save-wild-word]", {
            error: msg,
            text: message.payload.text,
            sourceUrl: message.payload.pageUrl,
            pageTitle: message.payload.pageTitle,
            settings,
          });
          sendResponse({ ok: false as const, error: msg });
        }
      })();
      return true;
    }

    if (message.type === "lr:define") {
      sendResponse({
        ok: true as const,
        kind: "placeholder" as const,
        feature: "define" as const,
        userMessage: MSG_DEFINE_PLACEHOLDER,
      });
      return false;
    }

    if (message.type === "lr:translate") {
      sendResponse({
        ok: true as const,
        kind: "placeholder" as const,
        feature: "translate" as const,
        userMessage: MSG_TRANSLATE_PLACEHOLDER,
      });
      return false;
    }

    return false;
  });
});
