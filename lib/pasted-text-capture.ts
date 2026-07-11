import { buildLexemeKey } from "@/lib/lexeme-key";
import { resolveWildWordDetectLanguage } from "@/lib/language-detect";

export type PastedTextCandidate = {
  text: string;
  language: string;
  contextSentence?: string;
};

export type PastedTextWildWordRow = {
  id: string;
  language: string;
  text: string;
  lexemeKey: string;
  targetLanguage: string;
  sourceItemId: string;
  sourceTitle: string;
  contextSentence?: string;
  savedAt: string;
  updatedAt: string;
  sourceKind: "paste";
  clientGeneratedId: string;
  syncStatus: "local";
};

type ExtractOptions = {
  maxCandidates?: number;
  minTokenLength?: number;
};

type BuildRowsOptions = ExtractOptions & {
  idPrefix: string;
  nowIso: string;
  targetLanguage: string;
  sourceTitle: string;
  sourceItemId: string;
};

const DEFAULT_MAX_CANDIDATES = 24;
const DEFAULT_MIN_TOKEN_LENGTH = 2;
const CJK_OR_KANA_RUN = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]+/gu;
const WORD_RUN = /[\p{L}\p{M}][\p{L}\p{M}'’-]*/gu;
const BORING_ENGLISH_WORDS = new Set([
  "the",
  "and",
  "are",
  "you",
  "with",
  "this",
  "that",
  "from",
  "have",
  "will",
  "your",
  "into",
  "about",
  "for",
  "can",
  "am",
]);

function normalizeCandidateText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[’]/gu, "'")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .toLowerCase();
}

function dedupeKey(text: string): string {
  const normalized = normalizeCandidateText(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .normalize("NFC");
  return normalized;
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/gu, " ")
    .split(/(?<=[.!?。！？])\s+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

function sentenceForToken(sentences: string[], token: string): string | undefined {
  const lower = token.toLowerCase();
  return sentences.find((sentence) => sentence.toLowerCase().includes(lower));
}

function rawTokens(text: string): string[] {
  const cjkRuns = text.match(CJK_OR_KANA_RUN) ?? [];
  const wordRuns = text.match(WORD_RUN) ?? [];
  const cjkSet = new Set(cjkRuns);
  return wordRuns.filter((token) => !cjkSet.has(token));
}

export function extractPastedTextCandidates(
  text: string,
  options: ExtractOptions = {},
): PastedTextCandidate[] {
  const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const minTokenLength = options.minTokenLength ?? DEFAULT_MIN_TOKEN_LENGTH;
  const sentences = splitSentences(text);
  const cjkRuns = text.match(CJK_OR_KANA_RUN) ?? [];
  const tokens = [...rawTokens(text), ...cjkRuns]
    .map(normalizeCandidateText)
    .filter((token) => token.length >= minTokenLength);

  const out: PastedTextCandidate[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    if (BORING_ENGLISH_WORDS.has(token)) {
      continue;
    }
    const contextSentence = sentenceForToken(sentences, token);
    const detected = resolveWildWordDetectLanguage(token, contextSentence);
    if (!detected) {
      continue;
    }
    const key = dedupeKey(token);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({ text: token, language: detected.language, contextSentence });
    if (out.length >= maxCandidates) {
      break;
    }
  }

  return out;
}

export function buildPastedTextWildWordRows(
  text: string,
  options: BuildRowsOptions,
): PastedTextWildWordRow[] {
  return extractPastedTextCandidates(text, options).map((candidate, index) => {
    const id = `${options.idPrefix}-${index}`;
    return {
      id,
      language: candidate.language,
      text: candidate.text,
      lexemeKey: buildLexemeKey(candidate.language, candidate.text),
      targetLanguage: options.targetLanguage,
      sourceItemId: options.sourceItemId,
      sourceTitle: options.sourceTitle,
      contextSentence: candidate.contextSentence,
      savedAt: options.nowIso,
      updatedAt: options.nowIso,
      sourceKind: "paste",
      clientGeneratedId: id,
      syncStatus: "local",
    };
  });
}
