/**
 * Capture nearest paragraph/block or sentence-level context for a DOM Range (content script only).
 */

const MAX_BLOCK = 2000;
const MAX_CLIP = 1200;

const BLOCK_LOCAL_NAME = new Set([
  "p",
  "li",
  "td",
  "th",
  "blockquote",
  "figcaption",
  "dd",
  "dt",
  "pre",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
]);

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function findEnclosingBlock(node: Node | null): Element | null {
  let current: Node | null = node;
  while (current && current !== document.documentElement) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const el = current as Element;
      const name = el.localName;
      if (BLOCK_LOCAL_NAME.has(name)) {
        return el;
      }
      if (name === "article" || name === "section" || name === "main") {
        return el;
      }
    }
    current = current.parentNode;
  }
  return null;
}

/** Best-effort sentence boundaries for Latin text; OK if imperfect for CJK. */
function clipToSentences(text: string, maxLen: number): string {
  if (text.length <= maxLen) {
    return text;
  }
  const slice = text.slice(0, maxLen);
  const lastBoundary = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
    slice.lastIndexOf("…"),
  );
  if (lastBoundary > maxLen * 0.4) {
    return slice.slice(0, lastBoundary + 1).trim();
  }
  return `${slice.trim()}…`;
}

function substringAroundHaystack(full: string, needle: string, maxLen: number): string {
  const n = needle.trim();
  if (!n) {
    return clipToSentences(full, maxLen);
  }
  const idx = full.indexOf(n.slice(0, Math.min(48, n.length)));
  const center = idx >= 0 ? idx + Math.floor(n.length / 2) : Math.floor(full.length / 2);
  const half = Math.floor(maxLen / 2);
  let start = Math.max(0, center - half);
  let end = Math.min(full.length, start + maxLen);
  if (end - start < maxLen) {
    start = Math.max(0, end - maxLen);
  }
  let chunk = full.slice(start, end).trim();
  if (start > 0) {
    chunk = `…${chunk}`;
  }
  if (end < full.length) {
    chunk = `${chunk}…`;
  }
  return clipToSentences(chunk, maxLen + 4);
}

/**
 * Returns the best paragraph/sentence context string for persistence on `ExtensionWildWord.contextSentence`.
 */
export function captureNearestContext(range: Range): string | undefined {
  const selected = collapseWhitespace(range.toString());
  if (!selected) {
    return undefined;
  }

  const block = findEnclosingBlock(range.commonAncestorContainer);
  if (block) {
    const raw = block.textContent ?? "";
    const full = collapseWhitespace(raw);
    if (full.length === 0) {
      return sentenceFallback(range, selected);
    }
    if (full.length <= MAX_BLOCK) {
      return full;
    }
    return substringAroundHaystack(full, selected, MAX_CLIP);
  }

  return sentenceFallback(range, selected);
}

function sentenceFallback(range: Range, selected: string): string | undefined {
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) {
    return selected.length <= 400 ? selected : clipToSentences(selected, 400);
  }
  const whole = node.textContent ?? "";
  if (!whole) {
    return undefined;
  }
  const start = Math.min(range.startOffset, range.endOffset);
  const end = Math.max(range.startOffset, range.endOffset);
  const windowed = whole.slice(Math.max(0, start - 120), Math.min(whole.length, end + 120)).trim();
  const collapsed = collapseWhitespace(windowed);
  return collapsed || undefined;
}
