import type { SupportedLanguage } from "./types";
import { normalizeChunkTextToBaseForm } from "./sentence-ingestion";
import type { SourcedChunkCandidate } from "./source-merger";

export type ChunkMatch = {
  inputText: string;
  normalizedBaseForm: string;
  matched: SourcedChunkCandidate | null;
};

function normalizeMatchKey(language: SupportedLanguage, value: string): string {
  return `${language}::${value.toLowerCase().trim()}`;
}

export function buildBaseFormIndex(
  chunks: SourcedChunkCandidate[]
): Map<string, SourcedChunkCandidate> {
  const index = new Map<string, SourcedChunkCandidate>();
  chunks.forEach((chunk) => {
    index.set(normalizeMatchKey(chunk.language, chunk.baseForm), chunk);
  });
  return index;
}

export function matchChunkByBaseForm(
  inputText: string,
  language: SupportedLanguage,
  chunks: SourcedChunkCandidate[]
): ChunkMatch {
  const index = buildBaseFormIndex(chunks);
  const normalizedBaseForm = normalizeChunkTextToBaseForm(language, inputText);
  const matched = index.get(normalizeMatchKey(language, normalizedBaseForm)) ?? null;

  return {
    inputText,
    normalizedBaseForm,
    matched,
  };
}

