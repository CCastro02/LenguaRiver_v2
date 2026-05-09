# LenguaRiver Content Sourcing

This document defines how lesson content is sourced, structured, and validated for LenguaRiver.

## 1. Core Vocabulary Source

- Use [Leipzig Corpora Collection](https://corpora.uni-leipzig.de/) as the base frequency source.
- Start from a **top 1000 words strategy** per target language.
- Prioritize words that are:
  - high-frequency in real use
  - useful in everyday scenarios (food, hotel, directions, introductions, work)
- Keep vocabulary progression practical:
  - early lessons: high-frequency survival language
  - later lessons: add scenario-specific expansions

## 2. Data Ingestion Layer

This layer converts external datasets (Leipzig, Wiktionary, and future sources) into LenguaRiver's internal vocabulary schema before chunking and lesson usage.

### Normalized vocabulary format

Every ingested vocabulary entry should be normalized to this required format:

- `language`
- `baseForm`
- `translation`
- `partOfSpeech`
- `frequencyRank`
- `imageability`
- `repetitionPriority`
- `categories`
- `source`

### Source mapping rules

- **Leipzig Corpora** -> `frequencyRank` + `baseForm`
- **Wiktionary** -> `translation` + `partOfSpeech`
- **Common Voice** (future) -> audio linkage/metadata
- **ImageNet** (future) -> candidate image linkage/metadata

### Transformation rules

- Clean and normalize all raw source data before use.
- Do not pass raw source rows directly into lessons.
- Do not pass raw corpus sentences directly into lessons.
- Assign scenario categories before content enters chunk/lesson construction.

### Traceability

- Every normalized entry must include a `source` field.
- Keep source attribution so each entry can be audited and corrected later.

### Validation

- Validate normalized entries for correctness before they enter lesson/chunk pipelines.
- At minimum, verify:
  - base form validity
  - translation correctness
  - part-of-speech consistency
  - sensible category assignment

## 3. Chunk System

LenguaRiver teaches **chunks** (usable language units), not only isolated words.

- A chunk can be:
  - a single word (`menu`)
  - a phrase (`por favor`)
  - a patterned expression (`como llego`)

### How words become chunks

1. Start with frequent words from Leipzig.
2. Group them into high-utility units used in real communication.
3. Keep chunks reusable across multiple lessons.
4. Mark each chunk with required metadata.

### Required chunk fields

Each chunk must include:

- `text`
- `translation`
- `type` (`core` or `interest`)
- `partOfSpeech` (`noun`, `verb`, `adjective`, `phrase`, `preposition`, `pronoun`, `other`)
- `imageability` (`high`, `medium`, `low`)
- `repetitionPriority` (`high`, `medium`, `low`)

## 4. Lesson Construction

### Scenario-based lessons

- Build lessons around real tasks (restaurant order, hotel check-in, asking directions, etc.).
- Each lesson should feel like one coherent mini-situation, not disconnected examples.
- Do not generate lessons that duplicate existing scenario intent within the same topic.
- During lesson expansion, prioritize missing scenarios before adding another variant of an already-covered intent.

### Controlled repetition

- Reuse core chunks across multiple sentences in the same lesson.
- Recycle high-priority chunks across lessons.
- Keep interest chunks present but lower volume.

### DLI-style flow

Each lesson follows the structured flow:

1. **Exposure** - read/listen first
2. **Breakdown** - inspect chunk meaning and structure
3. **Active Recall** - produce from memory
4. **Reinforcement** - repeat important chunk patterns

## 5. Validation Layer

Before publishing lesson content:

- Validate form and meaning with **Wiktionary**.
- Validate usage patterns with corpora evidence.
- Confirm:
  - chunk translation is correct
  - part of speech label is reasonable
  - chunk is natural in the scenario sentence

## 6. Image Strategy

- Use images only for chunks with:
  - `imageability: high` or
  - `imageability: medium`
- Do not add images for low-imageability abstract/function chunks.
- Use **curated image assignments**, not bulk auto-assignment.
- Image should reinforce meaning quickly and clearly.

## 7. Audio Strategy (Future)

- Plan to use **Mozilla Common Voice** or a similar open speech source.
- Audio coverage goals:
  - chunk-level reference audio
  - sentence-level model audio
  - optional user recording playback for practice
- No speech scoring requirement in MVP.

## 8. Rules

- Do **not** import raw corpora sentences directly into lessons.
- Do **not** generate random, context-free sentence sets.
- Always prioritize **structured learning** over novelty.
- Keep lessons coherent, reusable, and progression-oriented.
