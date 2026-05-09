import type { SourcedChunkCandidate } from "./source-merger";
import type { SupportedLanguage } from "./types";

export type LessonDraft = {
  language: SupportedLanguage;
  topic: string;
  objective: string;
  targetChunks: string[];
  supportingChunks: string[];
  exampleSentences: string[];
  sentences: {
    text: string;
    translation: string;
    chunks: {
      text: string;
      baseForm: string;
      translation?: string;
      formality?: "formal" | "informal" | "neutral";
    }[];
  }[];
  notes: string[];
};

function isLikelyName(chunk: SourcedChunkCandidate): boolean {
  const tokenCount = chunk.text.trim().split(/\s+/).length;
  if (tokenCount !== 1) {
    return false;
  }
  const hasUppercase = /\p{Lu}/u.test(chunk.text);
  return hasUppercase && chunk.category !== "places";
}

function isPlace(chunk: SourcedChunkCandidate): boolean {
  return chunk.category === "places";
}

function priorityScore(priority: SourcedChunkCandidate["repetitionPriority"]): number {
  return priority === "high" ? 3 : priority === "medium" ? 2 : 1;
}

function tokenCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function isMultiWordPhrase(chunk: SourcedChunkCandidate): boolean {
  const count = tokenCount(chunk.text);
  return count >= 2 && count <= 3;
}

function isPronoun(chunk: SourcedChunkCandidate): boolean {
  return (chunk.partOfSpeech ?? "").toLowerCase().trim() === "pronoun";
}

function isStandaloneVerb(chunk: SourcedChunkCandidate): boolean {
  return tokenCount(chunk.text) === 1 && (chunk.partOfSpeech ?? "").toLowerCase().trim() === "verb";
}

function looksVerbOrCoreStructure(chunk: SourcedChunkCandidate): boolean {
  const tokens = chunk.text.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if ((chunk.partOfSpeech ?? "").toLowerCase().trim() === "verb") {
    return true;
  }
  if (chunk.repetitionPriority === "high" || chunk.repetitionPriority === "medium") {
    if (tokens.some((token) => /(ar|er|ir|o|as|a|amos|an|emos|en)$/u.test(token))) {
      return true;
    }
    if (tokens.some((token) => /(ть|ет|ут|ют|ит|ат|ят|аю|яю|у|ю)$/u.test(token))) {
      return true;
    }
  }
  return false;
}

function isPreferredPhraseTarget(chunk: SourcedChunkCandidate): boolean {
  if (!isMultiWordPhrase(chunk)) {
    return false;
  }
  const isHighOrMedium =
    chunk.repetitionPriority === "high" || chunk.repetitionPriority === "medium";
  return isHighOrMedium && looksVerbOrCoreStructure(chunk);
}

function getExampleSentencePool(chunks: SourcedChunkCandidate[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  chunks.forEach((chunk) => {
    chunk.exampleSentences.forEach((sentence) => {
      const normalized = sentence.trim().toLowerCase();
      if (!normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      out.push(sentence.trim());
    });
  });
  return out;
}

function detectSentenceFormality(
  language: SupportedLanguage,
  sentenceText: string
): "formal" | "informal" | "neutral" {
  const normalized = sentenceText.toLowerCase();
  if (language === "es") {
    if (/\busted(es)?\b/u.test(normalized)) {
      return "formal";
    }
    if (/\bt[uú]\b/u.test(normalized) || /\bte\b/u.test(normalized)) {
      return "informal";
    }
    return "neutral";
  }
  if (/\bздравствуйте\b/u.test(normalized) || /\bвас\b/u.test(normalized) || /\bвы\b/u.test(normalized)) {
    return "formal";
  }
  if (/\bпривет\b/u.test(normalized) || /\bтебя\b/u.test(normalized) || /\bты\b/u.test(normalized)) {
    return "informal";
  }
  return "neutral";
}

function containsChunkText(sentence: string, chunkText: string): boolean {
  return sentence.toLowerCase().includes(chunkText.toLowerCase());
}

function buildSentenceBlocks(
  language: SupportedLanguage,
  targets: SourcedChunkCandidate[],
  supporting: SourcedChunkCandidate[],
  exampleSentences: string[]
): LessonDraft["sentences"] {
  const sentenceSet = new Set<string>();
  const targetAndSupport = [...targets, ...supporting];
  const targetTexts = targets.map((chunk) => chunk.text);

  exampleSentences.forEach((sentence) => {
    if (targetTexts.some((targetText) => containsChunkText(sentence, targetText))) {
      sentenceSet.add(sentence);
    }
  });
  targetAndSupport.forEach((chunk) => {
    chunk.exampleSentences.forEach((sentence) => {
      if (targetTexts.some((targetText) => containsChunkText(sentence, targetText))) {
        sentenceSet.add(sentence);
      }
    });
  });

  let selected = Array.from(sentenceSet).slice(0, 4);
  if (selected.length < 2) {
    selected = Array.from(new Set([...selected, ...exampleSentences])).slice(0, 2);
  }

  const blocks = selected.map((sentence) => {
    const matchingChunks = targetAndSupport.filter((chunk) => containsChunkText(sentence, chunk.text));
    const uniqueByBase = new Map<string, SourcedChunkCandidate>();
    matchingChunks.forEach((chunk) => {
      if (!uniqueByBase.has(chunk.baseForm)) {
        uniqueByBase.set(chunk.baseForm, chunk);
      }
    });
    const formality = detectSentenceFormality(language, sentence);
    return {
      text: sentence,
      translation: "",
      chunks: Array.from(uniqueByBase.values()).map((chunk) => ({
        text: chunk.text,
        baseForm: chunk.baseForm,
        translation: chunk.translation,
        formality,
      })),
    };
  });

  const hasFormal = blocks.some((block) => detectSentenceFormality(language, block.text) === "formal");
  const hasInformal = blocks.some((block) => detectSentenceFormality(language, block.text) === "informal");
  if (!hasFormal || !hasInformal) {
    const fallback = targetAndSupport
      .flatMap((chunk) => chunk.exampleSentences)
      .filter(Boolean)
      .slice(0, 8);
    fallback.forEach((sentence) => {
      if (blocks.length >= 4) {
        return;
      }
      if (blocks.some((block) => block.text === sentence)) {
        return;
      }
      const formality = detectSentenceFormality(language, sentence);
      if ((!hasFormal && formality === "formal") || (!hasInformal && formality === "informal")) {
        const matchingChunks = targetAndSupport.filter((chunk) => containsChunkText(sentence, chunk.text));
        blocks.push({
          text: sentence,
          translation: "",
          chunks: matchingChunks.map((chunk) => ({
            text: chunk.text,
            baseForm: chunk.baseForm,
            translation: chunk.translation,
            formality,
          })),
        });
      }
    });
  }

  return blocks.slice(0, 4);
}

function normalizeSentenceKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildIntentClusters(chunks: SourcedChunkCandidate[]): SourcedChunkCandidate[][] {
  const sentenceToChunkIds = new Map<string, Set<number>>();
  chunks.forEach((chunk, index) => {
    chunk.exampleSentences.forEach((sentence) => {
      const key = normalizeSentenceKey(sentence);
      if (!key) {
        return;
      }
      const set = sentenceToChunkIds.get(key) ?? new Set<number>();
      set.add(index);
      sentenceToChunkIds.set(key, set);
    });
  });

  const adjacency = new Map<number, Set<number>>();
  chunks.forEach((_, index) => adjacency.set(index, new Set<number>()));
  sentenceToChunkIds.forEach((chunkIds) => {
    const ids = Array.from(chunkIds);
    ids.forEach((id, idx) => {
      for (let j = idx + 1; j < ids.length; j += 1) {
        adjacency.get(id)?.add(ids[j]);
        adjacency.get(ids[j])?.add(id);
      }
    });
  });

  const visited = new Set<number>();
  const clusters: SourcedChunkCandidate[][] = [];
  chunks.forEach((_, startId) => {
    if (visited.has(startId)) {
      return;
    }
    const stack = [startId];
    const clusterIds: number[] = [];
    visited.add(startId);
    while (stack.length > 0) {
      const current = stack.pop() as number;
      clusterIds.push(current);
      (adjacency.get(current) ?? new Set<number>()).forEach((next) => {
        if (visited.has(next)) {
          return;
        }
        visited.add(next);
        stack.push(next);
      });
    }
    clusters.push(clusterIds.map((id) => chunks[id]));
  });
  return clusters;
}

function scoreCluster(cluster: SourcedChunkCandidate[]): number {
  const phraseCount = cluster.filter((chunk) => isMultiWordPhrase(chunk)).length;
  const mediumHighCount = cluster.filter(
    (chunk) => chunk.repetitionPriority === "high" || chunk.repetitionPriority === "medium"
  ).length;
  const sentenceCount = getExampleSentencePool(cluster).length;
  return phraseCount * 5 + mediumHighCount * 3 + sentenceCount;
}

export function generateLessonDraft(
  language: SupportedLanguage,
  topic: string,
  objective: string,
  chunks: SourcedChunkCandidate[]
): LessonDraft {
  const languageChunks = chunks.filter((chunk) => chunk.language === language);
  const globalSelection = selectTargetChunksWithTopic(languageChunks, topic);
  const targetMin = 5;
  const clusters = buildIntentClusters(languageChunks).sort((a, b) => scoreCluster(b) - scoreCluster(a));
  const coherentCandidate = clusters[0] ? selectTargetChunksWithTopic(clusters[0], topic) : null;
  const usingCoherentCluster =
    coherentCandidate !== null &&
    coherentCandidate.targets.length >= targetMin &&
    coherentCandidate.targets.length <= 8;
  const selection = usingCoherentCluster ? coherentCandidate : globalSelection;
  if (!usingCoherentCluster) {
    selection.notes.push("low coherence: no single intent cluster had enough chunks; used global fallback.");
  } else {
    selection.notes.push("Targets selected from a single intent cluster for communicative coherence.");
  }
  const { targets, supporting, notes } = selection;
  const sentencePool = getExampleSentencePool([...targets, ...supporting]);
  const exampleSentences = sentencePool.slice(0, Math.max(2, Math.min(6, sentencePool.length)));
  const sentenceBlocks = buildSentenceBlocks(language, targets, supporting, exampleSentences);

  if (exampleSentences.length < 2) {
    notes.push("Fewer than 2 example sentences available in source data. Add more sentence sources.");
  }
  const hasFormal = sentenceBlocks.some(
    (block) => detectSentenceFormality(language, block.text) === "formal"
  );
  const hasInformal = sentenceBlocks.some(
    (block) => detectSentenceFormality(language, block.text) === "informal"
  );
  if (!hasFormal || !hasInformal) {
    notes.push("Formality balance incomplete in sentence draft (formal/informal).");
  }

  return {
    language,
    topic,
    objective,
    targetChunks: targets.map((chunk) => chunk.text),
    supportingChunks: supporting.map((chunk) => chunk.text),
    exampleSentences,
    sentences: sentenceBlocks,
    notes: [
      "Review-only draft. Do not publish directly to app lessons.",
      "Targets prioritize high/medium repetition priority and de-emphasize places.",
      ...notes,
    ],
  };
}

function selectTargetChunksWithTopic(
  chunks: SourcedChunkCandidate[],
  topic: string
): {
  targets: SourcedChunkCandidate[];
  supporting: SourcedChunkCandidate[];
  notes: string[];
} {
  const earlyStage = /introduc|basic/i.test(topic.toLowerCase());
  const notes: string[] = [];
  const nonNameChunks = chunks.filter((chunk) => !isLikelyName(chunk));
  const sorted = nonNameChunks
    .slice()
    .sort((a, b) => {
      const scoreDiff = priorityScore(b.repetitionPriority) - priorityScore(a.repetitionPriority);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      const rankA = a.frequencyRank ?? Number.MAX_SAFE_INTEGER;
      const rankB = b.frequencyRank ?? Number.MAX_SAFE_INTEGER;
      return rankA - rankB;
    });

  const nonPlace = sorted.filter((chunk) => !isPlace(chunk));
  const placeChunks = sorted.filter((chunk) => isPlace(chunk));
  const targetCount = Math.max(5, Math.min(8, nonPlace.length));
  const targets: SourcedChunkCandidate[] = [];
  const used = new Set<string>();
  let pronounCount = 0;
  let allowPronouns = earlyStage;

  const preferredPhraseTargets = nonPlace.filter((chunk) => isPreferredPhraseTarget(chunk));
  preferredPhraseTargets.forEach((chunk) => {
    if (targets.length >= targetCount || used.has(chunk.baseForm)) {
      return;
    }
    if (isPronoun(chunk) && !allowPronouns) {
      return;
    }
    targets.push(chunk);
    used.add(chunk.baseForm);
    if (isPronoun(chunk)) {
      pronounCount += 1;
    }
  });

  const fillFromPool = (pool: SourcedChunkCandidate[], allowStandaloneVerbs: boolean): void => {
    pool.forEach((chunk) => {
      if (targets.length >= targetCount || used.has(chunk.baseForm)) {
        return;
      }
      if (isPronoun(chunk)) {
        if (!allowPronouns || pronounCount >= 2) {
          return;
        }
      }
      if (!allowStandaloneVerbs && isStandaloneVerb(chunk)) {
        return;
      }
      targets.push(chunk);
      used.add(chunk.baseForm);
      if (isPronoun(chunk)) {
        pronounCount += 1;
      }
    });
  };

  fillFromPool(nonPlace, false);
  fillFromPool(nonPlace, true);

  if (targets.length < 5 && !allowPronouns) {
    allowPronouns = true;
    fillFromPool(nonPlace.filter((chunk) => isPronoun(chunk)), true);
  }

  if (targets.length < 5) {
    const needed = 5 - targets.length;
    const fallback = placeChunks.filter((chunk) => !used.has(chunk.baseForm)).slice(0, needed);
    fallback.forEach((chunk) => {
      targets.push(chunk);
      used.add(chunk.baseForm);
    });
    if (fallback.length > 0) {
      notes.push("Added place chunks as fallback targets due to limited non-place candidates.");
    }
  }

  const phraseCount = targets.filter((chunk) => isMultiWordPhrase(chunk)).length;
  const minPhraseTargets = Math.ceil(targets.length * 0.5);
  if (phraseCount < minPhraseTargets) {
    notes.push("Could not satisfy 50% phrase target ratio with current sourced chunks.");
  }
  if (pronounCount > 2) {
    notes.push("Pronoun targets exceed preferred cap; review target mix.");
  }

  const targetBaseForms = new Set(targets.map((chunk) => chunk.baseForm));
  const supporting = sorted
    .filter((chunk) => !targetBaseForms.has(chunk.baseForm))
    .slice(0, 6);

  const targetPlaces = targets.filter((chunk) => isPlace(chunk)).length;
  if (targetPlaces > 2) {
    notes.push("Target set contains more places than ideal; review before promoting to lesson content.");
  }
  if (targets.length < 5) {
    notes.push("Insufficient sourced chunks to fully meet the 5-8 target guideline.");
  }

  return { targets, supporting, notes };
}

