import { defineContentScript } from "wxt/utils/define-content-script";
import { browser } from "wxt/browser";

import { captureNearestContext } from "../lib/context-capture";
import { resolveSaveLanguage } from "../lib/language-detect";
import { speakWithBrowserTts } from "../lib/pronounce";
import { getSettings } from "../lib/storage";
import { isLenguaRiverWebUrl } from "../lib/web-bridge";

const HOST_ID = "lenguariver-selection-ui";
const MAX_SELECTION_CHARS = 800;

type Pending = {
  text: string;
  contextSentence?: string;
  rect: DOMRect;
};

type SaveResponse =
  | { ok: true; outcome: "saved" | "already_saved" }
  | { ok: false; error?: string };

type PlaceholderResponse = {
  ok: true;
  kind: "placeholder";
  feature: "define" | "translate";
  userMessage: string;
};

function isPlaceholderResponse(x: unknown): x is PlaceholderResponse {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as PlaceholderResponse).ok === true &&
    (x as PlaceholderResponse).kind === "placeholder"
  );
}

function isSaveResponse(x: unknown): x is SaveResponse {
  return typeof x === "object" && x !== null && "ok" in x;
}

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  runAt: "document_idle",
  main() {
    let host: HTMLDivElement | null = null;
    let menu: HTMLDivElement | null = null;
    let pending: Pending | null = null;
    let statusEl: HTMLParagraphElement | null = null;

    function isInsideUi(anchor: Node | null, uiHost: HTMLElement): boolean {
      if (!anchor) {
        return false;
      }
      const root = anchor.getRootNode();
      if (root instanceof ShadowRoot && root.host === uiHost) {
        return true;
      }
      try {
        return uiHost.contains(anchor as Node);
      } catch {
        return false;
      }
    }

    function getSelectedText(sel: Selection): string {
      return sel.toString().replace(/\s+/g, " ").trim();
    }

    function hideMenu() {
      if (host) {
        host.style.display = "none";
      }
      pending = null;
    }

    let statusTimeout = 0;

    type StatusVariant = "success" | "error" | "neutral";

    function showStatus(message: string, variant: StatusVariant = "neutral") {
      window.clearTimeout(statusTimeout);
      if (!statusEl) {
        return;
      }
      if (!message) {
        statusEl.textContent = "";
        return;
      }
      statusEl.textContent = message;
      if (variant === "success") {
        statusEl.style.color = "#166534";
      } else if (variant === "error") {
        statusEl.style.color = "#b91c1c";
      } else {
        statusEl.style.color = "rgba(248, 250, 252, 0.82)";
      }
      statusTimeout = window.setTimeout(() => {
        statusEl!.textContent = "";
      }, 2800);
    }

    /** Prefer placing the toolbar above the selection so it does not obscure the highlight. */
    function positionMenu(rect: DOMRect) {
      if (!menu || !host) {
        return;
      }
      host.style.display = "block";
      const margin = 8;
      const mw = Math.max(menu.offsetWidth, 260);
      const mh = Math.max(menu.offsetHeight, 48);
      const scrollY = window.scrollY;
      const scrollX = window.scrollX;
      const vh = window.innerHeight;

      let top = rect.top + scrollY - mh - margin;
      const below = rect.bottom + scrollY + margin;
      const minTop = scrollY + margin;
      const maxTop = scrollY + vh - mh - margin;

      if (top < minTop) {
        if (below <= maxTop) {
          top = below;
        } else {
          top = Math.min(maxTop, Math.max(minTop, top));
        }
      }

      let left = rect.left + scrollX + rect.width / 2 - mw / 2;
      left = Math.max(scrollX + margin, Math.min(left, scrollX + window.innerWidth - mw - margin));

      host.style.left = `${left}px`;
      host.style.top = `${top}px`;
    }

    function requestPosition(rect: DOMRect) {
      requestAnimationFrame(() => {
        positionMenu(rect);
        requestAnimationFrame(() => positionMenu(rect));
      });
    }

    function ensureUi() {
      if (host && menu) {
        return;
      }
      host = document.createElement("div");
      host.id = HOST_ID;
      Object.assign(host.style, {
        position: "absolute",
        left: "0px",
        top: "0px",
        zIndex: "2147483646",
        display: "none",
        pointerEvents: "none",
      } as Partial<CSSStyleDeclaration> & Record<string, string>);

      const shadow = host.attachShadow({ mode: "open" });

      const style = document.createElement("style");
      style.textContent = `
        :host, * { box-sizing: border-box; }
        .bar {
          font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          display: flex;
          gap: 6px;
          align-items: center;
          padding: 8px 10px;
          border-radius: 10px;
          background: #0f172a;
          color: #f8fafc;
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.35);
          pointer-events: auto;
          max-width: min(380px, calc(100vw - 24px));
          flex-wrap: wrap;
        }
        button {
          font: inherit;
          font-size: 12px;
          font-weight: 600;
          padding: 6px 9px;
          border-radius: 8px;
          border: 1px solid rgba(248, 250, 252, 0.18);
          background: rgba(248, 250, 252, 0.08);
          color: inherit;
          cursor: pointer;
          user-select: none;
        }
        button:hover { background: rgba(248, 250, 252, 0.16); }
        button.primary {
          background: #22c55e;
          border-color: #16a34a;
          color: #052e16;
        }
        button.primary:hover { filter: brightness(1.05); }
        .status {
          width: 100%;
          margin: 0;
          font-size: 12px;
          font-weight: 500;
          min-height: 1.2em;
        }
      `;
      shadow.appendChild(style);

      menu = document.createElement("div");
      menu.className = "bar";
      menu.innerHTML = `
        <button type="button" class="primary" data-action="save" title="Save to local list">Save</button>
        <button type="button" data-action="translate" title="Translate">Translate</button>
        <button type="button" data-action="pronounce" title="Pronounce">Pronounce</button>
        <button type="button" data-action="define" title="Define">Define</button>
        <p class="status" aria-live="polite"></p>
      `;
      shadow.appendChild(menu);
      statusEl = menu.querySelector(".status");

      (document.documentElement ?? document.body).appendChild(host);

      menu.addEventListener("mousedown", (ev) => ev.preventDefault(), { capture: true });
      menu.addEventListener("click", (ev) => {
        const btn = (ev.target as HTMLElement).closest("button[data-action]");
        if (!btn || !pending) {
          return;
        }
        const action = btn.getAttribute("data-action");
        void (async () => {
          try {
            if (action === "save") {
              const raw = await browser.runtime.sendMessage({
                type: "lr:save-wild-word",
                payload: {
                  text: pending!.text,
                  contextSentence: pending!.contextSentence,
                  pageUrl: location.href,
                  pageTitle: document.title,
                },
              });
              if (!isSaveResponse(raw)) {
                showStatus("Save failed", "error");
                return;
              }
              if (raw.ok) {
                if (raw.outcome === "already_saved") {
                  showStatus("Already saved", "neutral");
                } else {
                  showStatus("Saved", "success");
                }
              } else {
                showStatus("Save failed", "error");
              }
            } else if (action === "define") {
              const raw = await browser.runtime.sendMessage({
                type: "lr:define",
                payload: { text: pending!.text },
              });
              if (isPlaceholderResponse(raw)) {
                showStatus(raw.userMessage, "neutral");
              }
            } else if (action === "translate") {
              const raw = await browser.runtime.sendMessage({
                type: "lr:translate",
                payload: { text: pending!.text },
              });
              if (isPlaceholderResponse(raw)) {
                showStatus(raw.userMessage, "neutral");
              }
            } else if (action === "pronounce") {
              const settings = await getSettings();
              const { saveLanguage } = resolveSaveLanguage(
                pending!.text,
                settings.sourceLanguage,
                pending!.contextSentence,
              );
              const result = await speakWithBrowserTts(
                pending!.text,
                saveLanguage,
                settings.ttsRate,
              );
              if (result.ok) {
                showStatus("");
              } else {
                showStatus(result.error, "error");
              }
            }
          } catch {
            if (action === "save") {
              showStatus("Save failed", "error");
            } else {
              showStatus("Something went wrong", "error");
            }
          }
        })();
      });
    }

    function onMouseUp(ev: MouseEvent) {
      if (ev.button !== 0) {
        return;
      }
      ensureUi();
      if (!host || !menu) {
        return;
      }

      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        hideMenu();
        return;
      }

      const text = getSelectedText(sel);
      if (!text) {
        hideMenu();
        return;
      }

      if (isInsideUi(sel.anchorNode, host) || isInsideUi(sel.focusNode, host)) {
        return;
      }

      if (text.length > MAX_SELECTION_CHARS) {
        hideMenu();
        return;
      }

      const range = sel.rangeCount ? sel.getRangeAt(0) : null;
      if (!range) {
        hideMenu();
        return;
      }

      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        hideMenu();
        return;
      }

      let contextSentence: string | undefined;
      try {
        contextSentence = captureNearestContext(range.cloneRange());
      } catch {
        contextSentence = undefined;
      }

      pending = {
        text,
        contextSentence,
        rect,
      };
      requestPosition(rect);
    }

    function onKeyDown(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        hideMenu();
      }
    }

    function onScrollOrResize() {
      hideMenu();
    }

    function onDocumentPointerDown(ev: MouseEvent) {
      if (!host || host.style.display === "none") {
        return;
      }
      if (ev.button !== 0) {
        return;
      }
      if (ev.composedPath().includes(host)) {
        return;
      }
      hideMenu();
    }

    document.addEventListener("mousedown", onDocumentPointerDown, true);
    document.addEventListener("mouseup", onMouseUp, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);

    if (isLenguaRiverWebUrl(window.location.href)) {
      const pageOrigin = window.location.origin;

      browser.runtime.onMessage.addListener((message: unknown) => {
        if (!message || typeof message !== "object") {
          return;
        }
        const msg = message as { type?: string; schemaVersion?: number };
        if (msg.schemaVersion !== 1) {
          return;
        }
        if (
          msg.type === "lenguariver:extension-word-saved" ||
          msg.type === "lenguariver:extension-sync-response"
        ) {
          window.postMessage(message, pageOrigin);
        }
      });

      window.addEventListener("message", (event: MessageEvent) => {
        if (event.origin !== pageOrigin) {
          return;
        }
        if (!isLenguaRiverWebUrl(window.location.href)) {
          return;
        }
        const data = event.data;
        if (!data || typeof data !== "object") {
          return;
        }
        const msg = data as { type?: string; schemaVersion?: number };
        if (msg.type !== "lenguariver:web-sync-request" || msg.schemaVersion !== 1) {
          return;
        }
        void browser.runtime.sendMessage({
          type: "lenguariver:web-sync-request",
          schemaVersion: 1,
        });
      });
    }
  },
});
