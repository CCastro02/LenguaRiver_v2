/**
 * Browser speechSynthesis in extension contexts with a window (content scripts, popup, etc.).
 * Not available in MV3 service workers.
 */

export async function speakWithBrowserTts(
  text: string,
  lang: string,
  rate: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const syn = globalThis.speechSynthesis;
  if (typeof syn === "undefined") {
    return { ok: false, error: "Speech synthesis is not available in this page." };
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: "Nothing to pronounce." };
  }

  const clampedRate = Math.min(2, Math.max(0.5, rate));

  syn.cancel();

  return await new Promise((resolve) => {
    const utter = new SpeechSynthesisUtterance(trimmed);
    utter.lang = lang;
    utter.rate = clampedRate;

    let settled = false;
    const finish = (result: { ok: true } | { ok: false; error: string }) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    utter.onend = () => finish({ ok: true });
    utter.onerror = (ev) => {
      const err = ev.error;
      const msg =
        err === "not-allowed"
          ? "Speech was blocked. Try again after interacting with the page."
          : "Speech playback failed.";
      finish({ ok: false, error: msg });
    };

    try {
      syn.speak(utter);
    } catch (e) {
      finish({ ok: false, error: e instanceof Error ? e.message : "Speech failed." });
    }
  });
}
