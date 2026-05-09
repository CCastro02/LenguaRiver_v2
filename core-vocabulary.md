# LenguaRiver Core Vocabulary System

This document defines how LenguaRiver selects, structures, and uses the top 1000 most important words across lessons, chunks, and dashboard readiness categories.

It is designed to align with `content-sourcing.md`.

## 1. Vocabulary Source

- Use [Leipzig Corpora Collection](https://corpora.uni-leipzig.de/) frequency lists per language.
- Build a **top 1000 core vocabulary list** as the foundation set.
- Selection principles:
  - high corpus frequency
  - high communicative value in real-world beginner scenarios
  - strong reuse potential across multiple lesson packs

## 2. Word Fields

Each core vocabulary entry should include:

- `baseForm` - canonical dictionary form (lemma)
- `translation` - practical default translation
- `partOfSpeech` - one of:
  - `noun`
  - `verb`
  - `adjective`
  - `phrase`
  - `preposition`
  - `pronoun`
  - `other`
- `imageability` - one of:
  - `high`
  - `medium`
  - `low`
- `repetitionPriority` - one of:
  - `high`
  - `medium`
  - `low`
- `categories` - one or more scenario tags (for example: `food`, `hotel`, `directions`, `introductions`, `job-hobbies`)

## 3. Priority Rules

- **High priority**
  - very frequent in corpora
  - essential for survival communication
  - broadly reusable across scenarios
- **Medium priority**
  - common and useful
  - less central than high-priority items
- **Low priority**
  - less frequent or mostly context-specific
  - useful for enrichment after core patterns are stable

## 4. Category Mapping

Map each word to real-world dashboard categories used in LenguaRiver:

- `food`
- `hotel`
- `directions`
- `introductions`
- `job-hobbies`

Guidelines:

- Allow multiple categories when realistic.
- Keep one primary category for reporting clarity.
- Use category mapping to drive readiness cards and lesson-pack progress views.

## 5. Connection to Chunks

Words are transformed into lesson chunks used in actual practice.

- A chunk can be:
  - one word (`menu`)
  - multi-word phrase (`por favor`)
  - useful expression pattern (`como llego`)
- Keep a link from chunk to core base form when possible.
- Allow chunk variation forms when natural:
  - example: `voda` -> `vodu` (inflected use in sentence context)
- Variation policy:
  - base form anchors vocabulary tracking
  - chunk form reflects real usage in scenario dialogue

## 6. Lesson Integration

- Lessons must reuse core vocabulary deliberately.
- Introduce new vocabulary in controlled amounts.
- Reinforcement expectations:
  - high-priority words repeat early and often
  - medium-priority words appear steadily
  - low-priority words appear selectively
- Avoid too many new words in one lesson.
  - default guideline: prioritize reuse over expansion in beginner lessons

## 7. Rules

- Do not exceed core vocabulary scope randomly.
- Do not inject unrelated low-frequency words without clear scenario need.
- Always reinforce previously introduced high-priority words.
- Keep vocabulary progression structured, scenario-driven, and cumulative.

## 8. Category Normalization Examples

- **Pronouns -> `general`**
  - Example: `yo` / `ya` starts with conversation relevance, but normalizes to `categories: ["general"]`.

- **Greetings/function phrases -> `general` (or `introductions` before normalization)**
  - Example: `buenas tardes` may be authored with `introductions`, but normalization treats it as a general greeting/function phrase for reuse across scenarios.

- **Scenario-specific nouns keep domain categories**
  - Example: `pasaporte` keeps `hotel`, `menu` keeps `food`, `semaforo` keeps `directions`.

- **Avoid unrelated multi-category assignment**
  - Example: `menu` should not be tagged with `hotel` or `job-hobbies`; keep one relevant domain category after normalization.

- **Survival phrases get high repetition priority**
  - Example: `por favor`, `gracias`, `donde esta`, `ya hochu` normalize to `repetitionPriority: "high"` because they are high-frequency survival language.
