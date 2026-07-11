import {
  isKnownPersonNameText,
  isLikelyPersonNameChunk,
  type ChunkNormalizerLanguage,
} from "./chunk-normalizer";

/** Coffee-shop lesson cast — explicit allowlist for name exclusion. */
export const COFFEE_SHOP_CHARACTER_NAMES = new Set([
  "andres",
  "andré",
  "maria",
  "maría",
  "leo",
  "mateo",
  "lucia",
  "lucía",
  "laura",
]);

export type PracticeChunkLike = {
  text: string;
  translation?: string;
  type?: string;
  exerciseAnchorText?: string;
};

function stripEdgePunctuation(text: string): string {
  return text.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "");
}

function normalizeNameKey(text: string): string {
  return stripEdgePunctuation(text.trim())
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function tokenCount(text: string): number {
  const trimmed = stripEdgePunctuation(text.trim());
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).filter(Boolean).length;
}

/** Speaker labels and similar — not vocabulary targets. */
function isSpeakerLabelChunk(text: string): boolean {
  const key = normalizeNameKey(text);
  return /^(learner|stranger|narrator|narration|speaker\s*[a-z0-9]*)$/i.test(key);
}

/**
 * True when a single token looks like a proper given name (allowlist or generic heuristic).
 * Does not exclude multi-word useful phrases or ordinary sentence-initial capitals like "Perdón".
 */
export function isLikelyProperNameChunk(
  text: string,
  options?: { translation?: string; sentenceText?: string; language?: ChunkNormalizerLanguage }
): boolean {
  const raw = text.trim();
  if (!raw || isSpeakerLabelChunk(raw)) {
    return false;
  }

  const key = normalizeNameKey(raw);
  if (!key) {
    return false;
  }

  if (COFFEE_SHOP_CHARACTER_NAMES.has(key) || isKnownPersonNameText(key)) {
    return tokenCount(raw) === 1;
  }

  return isLikelyPersonNameChunk({
    text: raw,
    translation: options?.translation,
    sentenceText: options?.sentenceText,
    language: options?.language ?? "es",
  });
}

export function shouldExcludeChunkFromPractice(
  chunk: PracticeChunkLike,
  options?: { sentenceText?: string; language?: ChunkNormalizerLanguage }
): boolean {
  if (chunk.type === "person-name") {
    return true;
  }
  const surface = chunk.exerciseAnchorText?.trim() || chunk.text.trim();
  if (!surface || surface.includes("___")) {
    return false;
  }
  if (isLikelyProperNameChunk(surface, {
    translation: chunk.translation,
    sentenceText: options?.sentenceText,
    language: options?.language,
  })) {
    return true;
  }
  return isLikelyProperNameChunk(chunk.text, {
    translation: chunk.translation,
    sentenceText: options?.sentenceText,
    language: options?.language,
  });
}

export function filterPracticeChunks<T extends PracticeChunkLike>(
  chunks: T[],
  options?: { sentenceText?: string; language?: ChunkNormalizerLanguage }
): T[] {
  return chunks.filter((chunk) => !shouldExcludeChunkFromPractice(chunk, options));
}

/** True when visible text is only a person name (optional trailing punctuation). */
export function isNameOnlyPracticeText(text: string): boolean {
  const raw = text.trim();
  if (!raw) {
    return false;
  }
  return isLikelyProperNameChunk(raw);
}

/** Leading single-token name in a reply line (e.g. "Andrés." at start of a sentence). */
export function extractLeadingProperNameToken(sentenceText: string): string | null {
  const trimmed = sentenceText.trim();
  const match = trimmed.match(/^([\p{Lu}][\p{L}\p{M}'-]*)\s*[,.!?]/u);
  if (!match?.[1]) {
    return null;
  }
  const candidate = match[1];
  return isLikelyProperNameChunk(candidate, { sentenceText: trimmed }) ? candidate : null;
}
