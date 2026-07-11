/**
 * Display-only cleanup for saved-word context sentences (My Words cards).
 * Does not mutate stored records.
 */

import { foldSpanishAccents } from "@/lib/wild-word-curated-images";

/** Default visible sentences on the card when no saved-word hit guides selection. */
export const CONTEXT_DISPLAY_DEFAULT_MAX = 2;

/** Hard cap; third sentence only when the first two are very short or around a saved-word hit. */
export const CONTEXT_DISPLAY_ABSOLUTE_MAX = 3;

/** @deprecated Use {@link CONTEXT_DISPLAY_ABSOLUTE_MAX}. */
export const CONTEXT_DISPLAY_MAX_SENTENCES = CONTEXT_DISPLAY_ABSOLUTE_MAX;

/** Sentences at or below this length count as "very short" for neighbor inclusion. */
export const CONTEXT_SHORT_SENTENCE_MAX_CHARS = 52;

export type ContextDisplayOptions = {
  maxSentences?: number;
  /** Saved surface form; prioritizes sentences containing this word. */
  savedWord?: string;
};

export type ContextDisplayResult = {
  /** Trimmed, normalized text shown on the card (up to 2–3 sentences). */
  display: string;
  /** Original context when display is shortened or filtered; for Details only. */
  full?: string;
};

export type ContextHighlightSegment = {
  text: string;
  highlight: boolean;
};

/** Collapse runs of whitespace; preserve single spaces between words. */
export function collapseContextWhitespace(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .replace(/ *\n */g, " ")
    .trim();
}

const SPANISH_ABBREV_PROTECT: { pattern: RegExp; replacement: string }[] = [
  { pattern: /\bDr\./giu, replacement: "Dr\uE001" },
  { pattern: /\bDra\./giu, replacement: "Dra\uE001" },
  { pattern: /\bSr\./giu, replacement: "Sr\uE001" },
  { pattern: /\bSra\./giu, replacement: "Sra\uE001" },
  { pattern: /\bSrta\./giu, replacement: "Srta\uE001" },
  { pattern: /\bProf\./giu, replacement: "Prof\uE001" },
  { pattern: /\bUd\./giu, replacement: "Ud\uE001" },
  { pattern: /\bUds\./giu, replacement: "Uds\uE001" },
  { pattern: /\betc\./giu, replacement: "etc\uE001" },
  { pattern: /\bEj\./giu, replacement: "Ej\uE001" },
  { pattern: /\be\.g\./giu, replacement: "eg\uE001" },
  { pattern: /\bi\.e\./giu, replacement: "ie\uE001" },
];

const ABBREV_DOT = "\uE001";

function protectSpanishAbbreviations(text: string): string {
  let out = text;
  for (const { pattern, replacement } of SPANISH_ABBREV_PROTECT) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function restoreSpanishAbbreviations(text: string): string {
  return text.replaceAll(ABBREV_DOT, ".");
}

/** Split normalized text into sentence-like segments. */
export function splitContextSentences(text: string): string[] {
  const normalized = collapseContextWhitespace(text);
  if (!normalized) {
    return [];
  }

  const segments: string[] = [];
  for (const line of normalized.split(/\n+/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      continue;
    }
    const protectedLine = protectSpanishAbbreviations(trimmedLine);
    const parts = protectedLine.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/gu);
    if (parts?.length) {
      for (const part of parts) {
        const s = restoreSpanishAbbreviations(part.trim());
        if (s) {
          segments.push(s);
        }
      }
    } else {
      segments.push(restoreSpanishAbbreviations(trimmedLine));
    }
  }

  return segments;
}

const NOISY_SENTENCE_PATTERNS: RegExp[] = [
  /\bvideo player\b/i,
  /\bplayer state\b/i,
  /\bsubtitle settings?\b/i,
  /\bclosed captions?\b/i,
  /\bcaptions?\s*(settings?|menu)\b/i,
  /\bautoplay\b/i,
  /\bad loading\b/i,
  /\bloading ad\b/i,
  /\bskip ad\b/i,
  /\bwatch later\b/i,
  /\bclick to (play|unmute|continue)\b/i,
  /\b(un)?mute\b/i,
  /\bfull\s*screen\b/i,
  /\bplayback speed\b/i,
  /\bquality\b.*\b(1080|720|480|360|auto)\b/i,
  /\bshare\b.*\b(save|embed|copy link)\b/i,
  /\bcookie(s)?\s+(policy|preferences|banner)\b/i,
  /\baccept all\b/i,
  /\bmanage preferences\b/i,
  /\bsign in to\b/i,
  /\bsubscribe\b.*\b(channel|bell)\b/i,
  /^\d{1,2}:\d{2}(:\d{2})?\s*(\/\s*\d{1,2}:\d{2}(:\d{2})?)?$/,
  /^(play|pause|replay|settings|subtitles?|captions?|cc|hd|4k|live|share|save)$/i,
];

/** True when a segment looks like player/UI chrome rather than real usage context. */
export function isNoisyContextSentence(sentence: string): boolean {
  const s = sentence.trim();
  if (!s) {
    return true;
  }

  if (s.length <= 2) {
    return true;
  }

  if (/^[\d\s:.,/\-–—|•·]+$/.test(s)) {
    return true;
  }

  const lower = s.toLowerCase();
  const uiTokenHits = (
    lower.match(
      /\b(play|pause|mute|unmute|volume|fullscreen|settings|subtitles?|captions?|autoplay|skip|share|save|hd|4k|live|cc|ads?|loading)\b/g
    ) ?? []
  ).length;

  if (s.length < 48 && uiTokenHits >= 2) {
    return true;
  }

  if (s.length < 28 && uiTokenHits >= 1) {
    return true;
  }

  return NOISY_SENTENCE_PATTERNS.some((re) => re.test(s));
}

export function isShortContextSentence(sentence: string): boolean {
  return sentence.trim().length <= CONTEXT_SHORT_SENTENCE_MAX_CHARS;
}

/**
 * Default 2 sentences; allow 3 only when the first two in the pool are very short.
 */
export function resolveContextDisplaySentenceLimit(sentences: string[]): number {
  if (sentences.length <= CONTEXT_DISPLAY_DEFAULT_MAX) {
    return sentences.length;
  }
  const firstTwo = sentences.slice(0, CONTEXT_DISPLAY_DEFAULT_MAX);
  if (firstTwo.every(isShortContextSentence) && sentences.length >= CONTEXT_DISPLAY_ABSOLUTE_MAX) {
    return CONTEXT_DISPLAY_ABSOLUTE_MAX;
  }
  return CONTEXT_DISPLAY_DEFAULT_MAX;
}

function escapeRegexLiteral(ch: string): string {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Accent-insensitive literal pattern; preserves matched span length in the original string. */
function buildAccentInsensitivePattern(term: string): string {
  return [...term].map((ch) => {
    const base = foldSpanishAccents(ch).replace(/[^\p{L}\p{N}]/gu, "");
    if (!base) {
      return escapeRegexLiteral(ch);
    }
    const esc = escapeRegexLiteral(base);
    return `${esc}[\u0300-\u036f]*`;
  }).join("");
}

/** Case- and accent-insensitive word-boundary match for saved surface forms. */
export function sentenceContainsSavedWord(sentence: string, savedWord: string): boolean {
  const term = savedWord.trim();
  if (!term) {
    return false;
  }
  const pattern = buildAccentInsensitivePattern(term);
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, "iu");
  return re.test(sentence);
}

/** Hit sentences shorter than this may borrow one neighboring short sentence for context. */
const HIT_NEEDS_NEIGHBOR_MAX_CHARS = 40;

function pickAroundHitSentence(
  pool: string[],
  hitIndex: number,
  maxSentences: number,
  savedWord: string
): string[] {
  const hit = pool[hitIndex];
  if (!hit) {
    return [];
  }

  const picked: string[] = [hit];
  const prev = hitIndex > 0 ? pool[hitIndex - 1] : undefined;
  const next = hitIndex < pool.length - 1 ? pool[hitIndex + 1] : undefined;

  const neighborUseful = (sentence: string | undefined): sentence is string => {
    if (!sentence || isNoisyContextSentence(sentence)) {
      return false;
    }
    if (sentenceContainsSavedWord(sentence, savedWord)) {
      return true;
    }
    return hit.length <= HIT_NEEDS_NEIGHBOR_MAX_CHARS && isShortContextSentence(sentence);
  };

  if (neighborUseful(prev) && picked.length < maxSentences) {
    picked.unshift(prev);
  }
  if (neighborUseful(next) && picked.length < maxSentences) {
    picked.push(next);
  }

  return picked.slice(0, Math.min(maxSentences, CONTEXT_DISPLAY_ABSOLUTE_MAX));
}

/**
 * Pick useful sentences up to the resolved display limit (never more than 3).
 * When `savedWord` is set, prefer the sentence containing that word and nearby short neighbors.
 */
export function pickContextDisplaySentences(
  sentences: string[],
  maxSentencesOrOptions?: number | ContextDisplayOptions
): string[] {
  const options: ContextDisplayOptions =
    typeof maxSentencesOrOptions === "number"
      ? { maxSentences: maxSentencesOrOptions }
      : (maxSentencesOrOptions ?? {});

  const useful = sentences.filter((s) => !isNoisyContextSentence(s));
  const pool = useful.length > 0 ? useful : sentences;
  const limit = Math.min(
    options.maxSentences ?? resolveContextDisplaySentenceLimit(pool),
    CONTEXT_DISPLAY_ABSOLUTE_MAX
  );
  const savedWord = options.savedWord?.trim();

  if (!savedWord) {
    return pool.slice(0, limit);
  }

  const hitIndex = pool.findIndex((sentence) => sentenceContainsSavedWord(sentence, savedWord));
  if (hitIndex >= 0) {
    return pickAroundHitSentence(pool, hitIndex, limit, savedWord);
  }

  const fallbackLimit = Math.min(limit, CONTEXT_DISPLAY_DEFAULT_MAX);
  return pool.slice(0, fallbackLimit);
}

/**
 * Split display context into segments for rendering; bold the saved word in the card UI only.
 */
export function highlightSavedTextInContext(
  context: string,
  savedText: string
): ContextHighlightSegment[] {
  const term = savedText.trim();
  if (!term || !context.trim()) {
    return [{ text: context, highlight: false }];
  }

  const pattern = buildAccentInsensitivePattern(term);
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, "iu");
  const match = re.exec(context);
  if (!match?.[0]) {
    return [{ text: context, highlight: false }];
  }

  const start = match.index;
  const end = start + match[0].length;
  const segments: ContextHighlightSegment[] = [];
  if (start > 0) {
    segments.push({ text: context.slice(0, start), highlight: false });
  }
  segments.push({ text: context.slice(start, end), highlight: true });
  if (end < context.length) {
    segments.push({ text: context.slice(end), highlight: false });
  }
  return segments;
}

/**
 * Prepare context for My Words card display.
 * Returns null when input is empty after trim.
 */
export function cleanContextForDisplay(
  raw: string | null | undefined,
  options?: ContextDisplayOptions
): ContextDisplayResult | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = collapseContextWhitespace(trimmed);
  const sentences = splitContextSentences(normalized);
  const limit = options?.maxSentences ?? resolveContextDisplaySentenceLimit(sentences);
  const picked = pickContextDisplaySentences(sentences, { ...options, maxSentences: limit });
  const display = picked.join(" ").trim();

  if (!display) {
    return null;
  }

  const filteredNoise = sentences.some(isNoisyContextSentence);
  const truncated = sentences.length > picked.length;
  const displayDiffersFromStored =
    collapseContextWhitespace(trimmed) !== display || picked.length < sentences.length;

  const full =
    truncated || filteredNoise || displayDiffersFromStored ? trimmed : undefined;

  return { display, full };
}
