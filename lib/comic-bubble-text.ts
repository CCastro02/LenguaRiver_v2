import { isNameOnlyPracticeText } from "./lesson-chunk-filter";

/**
 * Normalizes comic bubble copy for display. Removes mid-clause "..." that look like
 * truncation (e.g. "asiento... está" → "asiento está") while keeping authored pauses
 * at the start of a line ("Eh... largo", "Bueno... no").
 */
/** STT/TTS target for a comic bubble — panel copy only, never lesson-level activeText. */
export function getComicBubbleSpeechTargetText(panelText: string): string {
  return normalizeComicBubbleText(panelText);
}

/** Stable per-bubble completion key (normalized panel text). */
export function getComicBubbleCompletionKey(panelText: string): string {
  return getComicBubbleSpeechTargetText(panelText);
}

export function normalizeComicBubbleText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.includes("...")) {
    return trimmed;
  }

  // Fake truncation: ellipsis after a multi-word fragment ("asiento... está").
  const withoutMidClause = trimmed.replace(/(\s\S+)\s*\.\.\.\s+/g, "$1 ");
  return withoutMidClause.replace(/\s{2,}/g, " ").trim();
}

/** Loose match for pairing a storyboard panel line with the active lesson sentence. */
export function comicBubbleTextsMatch(panelText: string, activeText: string): boolean {
  const a = normalizeComicBubbleText(panelText);
  const b = normalizeComicBubbleText(activeText);
  if (a === b) {
    return true;
  }
  const stripPunct = (s: string) =>
    s
      .toLowerCase()
      .replace(/[¿?¡!.,…]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const pa = stripPunct(a);
  const pb = stripPunct(b);
  if (pa === pb) {
    return true;
  }
  // Name-only panels must not bind to longer recall lines that merely start with a name.
  if (isNameOnlyPracticeText(a) && pb.includes(pa)) {
    return false;
  }
  if (isNameOnlyPracticeText(b) && pa.includes(pb)) {
    return false;
  }
  return pa.includes(pb) || pb.includes(pa);
}
