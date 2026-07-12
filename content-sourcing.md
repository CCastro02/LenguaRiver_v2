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

## 9. Life Situation Scenario Expansion Backlog

Chris wants LenguaRiver to eventually support **as many realistic practice scenarios as possible**, not only tourist basics. Treat broad life situations as scenario seeds that can become practical conversation lessons, roleplays, review prompts, and technical/domain expansions.

### Scenario design rule

Each life situation should become a **safe, useful communication task**, not a lecture about the problem. For sensitive situations, use supportive, practical language and avoid graphic detail, blame, shame, or punitive feedback.

A scenario seed should be converted into lessons with:

- setting and roles
- learner goal
- useful chunks/patterns
- gentle correction style
- safety/appropriateness notes
- contextual review prompts
- difficulty tier
- whether it is appropriate for beginner travel, daily life, work, school, emergency, or advanced practice

### Source list from Chris's life-situation reference

The attached reference listed common examples of difficult life situations. Add these as long-term scenario seeds:

| Scenario seed | Scenario seed |
| --- | --- |
| Accidents | Addiction |
| Aging | Arguments & Disagreements |
| Bad Habits | Breakups |
| Bullying | Career Setbacks |
| Champagne Problems | Debilitating Fears |
| Demanding Care Giving | Demanding Responsibilities |
| Discrimination | Displaced by War / Conflict |
| Divorce | Existential Angst / Feeling That Life Has No Meaning |
| Exposure to Pollution | Facing Disciplinary Actions / Punishments |
| Failing a Class / Test / Assignment | Failure to Reach a Goal |
| Family Instability | Family Stress |
| Financial Hardship | Flunking Out of School / Dismissed From School For Failure |
| Friendship Problems | Ghosted by Someone |
| Government Actions, e.g. lockdowns of a city | Harsh / Unfair Criticism |
| Homelessness / Insufficient Housing | Hunger / Lack of Food |
| Identity Crisis | Immigration Status, e.g. being deported from a country that you have lived in for a long time |
| Income Insecurity | Injuries |
| Insufficient Medical Care | Insufficient Transportation |
| Insults & Indignities | Investment Losses |
| Lack of Freedom | Lack of Opportunity |
| Lack of Parental Support | Lack of Rights |
| Legal Issues | Loneliness |
| Losing a Job | Loss of Loved Ones |
| Low Literacy | Low Quality of Life |
| Mental Health Issues | Midlife Crisis |
| Missing School / Missing Work / Absenteeism | Natural Disasters |
| Obesity | Oppression |
| Parenting Problems | Political Instability |
| Poor Health | Poor Working Conditions |
| Poverty | Project Failure |
| Racism | Regretting the Past |
| Relationship Stress | Sickness |
| Small Business Failure | Social Conflict |
| Social Isolation | Social Rejection |
| Social Stress | Student Stress |
| Substance Abuse | Tax Burden |
| Travel Stress | Unable to Pay Bills |
| Unemployment | Unfair Treatment |
| Vicious Rumors & Misinformation | Victim of a Crime |
| Work Stress | Workplace Conflict |

### Suggested scenario categories for LenguaRiver

Use categories so the app can scale without becoming a random list:

1. **Travel survival**: accidents, sickness, injuries, transportation, travel stress, lost items, asking for help.
2. **Food, housing, and basic needs**: hunger, insufficient housing, unable to pay bills, poverty, low quality of life.
3. **Health and care**: poor health, medical care, caregiving, mental health, addiction/substance abuse, aging.
4. **School and learning**: failing a class/test/assignment, student stress, flunking out, absenteeism, low literacy.
5. **Work and money**: losing a job, unemployment, work stress, workplace conflict, poor working conditions, project failure, small business failure, investment losses, tax burden.
6. **Relationships and family**: breakups, divorce, parenting problems, family stress, friendship problems, social rejection, loneliness.
7. **Conflict and safety**: arguments, bullying, unfair criticism, insults, victim of a crime, legal issues, discrimination, racism.
8. **Civic and crisis situations**: government actions, lack of rights/freedom/opportunity, oppression, political instability, war/conflict displacement, natural disasters, immigration status.
9. **Personal growth and identity**: identity crisis, existential angst, regretting the past, failure to reach a goal, bad habits, debilitating fears.

### MVP prioritization

Do not try to implement all scenarios at once. Use this backlog to pick realistic, high-utility scenes. Near-term Spanish should still prioritize polished beginner scenes first:

1. café / ordering
2. directions
3. hotel check-in
4. shopping / paying
5. asking for help
6. transportation problem
7. feeling sick / pharmacy
8. lost item / police or front desk
9. missed bus/train or travel delay
10. workplace or school introduction

Later, expand into emotionally complex and high-stakes scenarios with careful wording and safety review.
