import type { ExploreContentItem } from "@/lib/explore-content";

const MAX_TITLE_CHARS = 160;
const MAX_SUMMARY_CHARS = 300;
const MAX_TEXT_CHARS = 800;

function stripHtmlRemnants(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cleanText(value: string): string {
  return stripHtmlRemnants(value).replace(/\s+/g, " ").trim();
}

function clamp(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars - 1).trimEnd()}…`;
}

function firstSentence(value: string): string {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return "";
  }
  const sentenceMatch = cleaned.match(/.+?[.!?](?:\s|$)/);
  return sentenceMatch ? sentenceMatch[0].trim() : cleaned;
}

function normalizeTags(tags: string[] | undefined, source: string): string[] {
  const normalized = (tags ?? [])
    .map((tag) => cleanText(tag).toLowerCase())
    .filter(Boolean);
  normalized.push(cleanText(source).toLowerCase());
  return normalized.filter((tag, index, all) => all.indexOf(tag) === index);
}

export function normalizeExploreItem(raw: ExploreContentItem): ExploreContentItem {
  const cleanedTitle = clamp(cleanText(raw.title), MAX_TITLE_CHARS);
  const title = cleanedTitle || `Untitled ${raw.source}`;
  const cleanedText = clamp(cleanText(raw.text ?? ""), MAX_TEXT_CHARS);
  const summaryCandidate = cleanText(raw.summary ?? "");
  const fallbackSummary = firstSentence(cleanedText || title);
  const summary = clamp(summaryCandidate || fallbackSummary || title, MAX_SUMMARY_CHARS);
  const country = cleanText(raw.country ?? "") || "Unknown";

  return {
    ...raw,
    id: cleanText(raw.id),
    language: cleanText(raw.language),
    source: raw.source,
    category: raw.category,
    country,
    title,
    summary,
    text: cleanedText || undefined,
    url: raw.url ? cleanText(raw.url) : undefined,
    audioUrl: raw.audioUrl ? cleanText(raw.audioUrl) : undefined,
    imageUrl: raw.imageUrl ? cleanText(raw.imageUrl) : undefined,
    publishedAt: raw.publishedAt ? cleanText(raw.publishedAt) : undefined,
    tags: normalizeTags(raw.tags, raw.source),
    extractedWords: raw.extractedWords?.map((word) => cleanText(word)).filter(Boolean),
    extractedPhrases: raw.extractedPhrases?.map((phrase) => cleanText(phrase)).filter(Boolean),
  };
}
