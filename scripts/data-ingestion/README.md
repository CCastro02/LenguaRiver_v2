# Data Ingestion Scaffold

This folder is an isolated scaffold for importing vocabulary source data.

It does not change the live app behavior and is not wired into lesson generation yet.

## Current Focus

- **Leipzig/Wortschatz** is the first source for word frequency data.
- **Wiktionary** will later help validate meanings, forms, and part of speech.
- **Common Voice** will later support audio alignment.
- **Image sources** will be added later.

## Structure

- `types.ts`  
  Shared source and normalized entry types.
- `leipzig-importer.ts`  
  Local-file importer scaffold (CSV/TSV/text) with parsing + normalization + validation.
- `chunk-generator.ts`  
  Transforms normalized vocabulary entries into chunk-like objects for lesson usage later.
- `samples/es-frequency-sample.tsv`  
  Sample source input file with frequency rows.
- `samples/ru-frequency-sample.tsv`  
  Sample Russian source input file with frequency rows.
- `output/sample-normalized-vocab.json`  
  Example normalized output produced by the scaffold.
- `output/sample-chunks.json`  
  Example generated chunks from normalized vocabulary rows.
- `sentence-ingestion.ts`  
  Sentence parser + validator + chunk-candidate extractor scaffold.
- `samples/es-sentences-sample.tsv`  
  Sample Spanish sentence input.
- `samples/ru-sentences-sample.tsv`  
  Sample Russian sentence input.
- `output/sample-sentence-chunks.json`  
  Example sentence candidates output.
- `source-merger.ts`  
  Merges frequency-derived entries and sentence-derived candidates.
- `output/sample-sourced-chunks.json`  
  Example merged chunk candidates for future lessons.
- `chunk-matcher.ts`  
  Base-form matcher utility for future comparison paths (matching by normalized base form, not only observed variants).
- `lesson-draft-generator.ts`  
  Generates review-only lesson drafts from merged sourced chunks.
- `output/sample-lesson-draft.json`  
  Example Spanish and Russian lesson drafts for human review.

## Data Path (Local File -> Normalized Vocabulary)

1. Read a local frequency file path (TSV/CSV/text).
2. Parse each line into `RawFrequencyEntry`.
3. Validate required fields:
   - `language` required
   - `baseForm` required
   - `frequencyRank` required
   - `source` required
4. Remove duplicate `baseForm` entries (warn and keep first).
5. Normalize rows into `NormalizedVocabularyEntry`.

## Sentence Ingestion Scaffold

Sentence ingestion is separate from vocabulary-frequency ingestion:

1. Parse local sentence files into `RawSentenceEntry`.
2. Validate and normalize into `NormalizedSentenceEntry`.
3. Extract `ExtractedChunkCandidate` values from sentence tokens and 2-3 token phrases.
4. Keep output as candidate chunks only (no lesson sentence generation yet).

This separation keeps pipeline responsibilities clear:

- **Frequency data gives priority** (what to repeat more often).
- **Sentence data gives context** (how words and short phrases are used naturally).
- Final chunk selection should come from **both frequency + real sentence usage**.

## Source Merger Scaffold

The merger combines:

- `NormalizedVocabularyEntry[]` from frequency ingestion
- `ExtractedChunkCandidate[]` from sentence ingestion

Merge behavior:

- Match by `language + baseForm`
- Keep original sentence examples in `exampleSentences`
- If frequency exists, apply its rank-derived repetition priority
- If sentence-only, default repetition priority to `low`
- Deduplicate by base form per language and combine `sources` + `exampleSentences`

Merged chunks are the future lesson source candidates.

## Example Usage (Scaffold)

```ts
import { normalizeVocabularyEntries, parseLocalFrequencyFile } from "./leipzig-importer";

const raw = parseLocalFrequencyFile("./scripts/data-ingestion/samples/es-frequency-sample.tsv", {
  language: "es",
  source: "leipzig",
  sourceUrl: "https://wortschatz.uni-leipzig.de",
});

const { entries, warnings } = normalizeVocabularyEntries(raw);
console.log("warnings", warnings);
console.log("normalized entries", entries);
```

This scaffold is intentionally simple and local-file based until live-source ingestion is added.
