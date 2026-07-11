/**
 * Client-only bridge between the LenguaRiver web app and the Chrome extension content script.
 * Uses window.postMessage only — no direct chrome APIs.
 */

export const EXTENSION_BRIDGE_SCHEMA_VERSION = 1;

const MSG_EXTENSION_WORD_SAVED = "lenguariver:extension-word-saved";
const MSG_EXTENSION_SYNC_RESPONSE = "lenguariver:extension-sync-response";
const MSG_WEB_SYNC_REQUEST = "lenguariver:web-sync-request";

export type ExtensionBridgeSyncResult = {
  source: "push" | "pull";
  words: Record<string, unknown>[];
};

type ExtensionBridgeMessage =
  | {
      type: typeof MSG_EXTENSION_WORD_SAVED;
      schemaVersion: 1;
      word: Record<string, unknown>;
    }
  | {
      type: typeof MSG_EXTENSION_SYNC_RESPONSE;
      schemaVersion: 1;
      words: Record<string, unknown>[];
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isExtensionBridgeMessage(data: unknown): data is ExtensionBridgeMessage {
  if (!isRecord(data)) {
    return false;
  }
  if (data.schemaVersion !== EXTENSION_BRIDGE_SCHEMA_VERSION) {
    return false;
  }
  if (data.type === MSG_EXTENSION_WORD_SAVED) {
    return isRecord(data.word);
  }
  if (data.type === MSG_EXTENSION_SYNC_RESPONSE) {
    return Array.isArray(data.words) && data.words.every(isRecord);
  }
  return false;
}

export function subscribeToExtensionBridge(options: {
  onWords: (words: Record<string, unknown>[], meta: { source: "push" | "pull" }) => void;
}): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) {
      return;
    }
    if (!isExtensionBridgeMessage(event.data)) {
      return;
    }

    if (event.data.type === MSG_EXTENSION_WORD_SAVED) {
      options.onWords([event.data.word], { source: "push" });
      return;
    }

    if (event.data.type === MSG_EXTENSION_SYNC_RESPONSE) {
      options.onWords(event.data.words, { source: "pull" });
    }
  };

  window.addEventListener("message", handler);
  return () => {
    window.removeEventListener("message", handler);
  };
}

export function requestExtensionSync(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.postMessage(
    {
      type: MSG_WEB_SYNC_REQUEST,
      schemaVersion: EXTENSION_BRIDGE_SCHEMA_VERSION,
    },
    window.location.origin
  );
}
