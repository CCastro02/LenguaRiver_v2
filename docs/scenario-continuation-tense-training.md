# Scenario Continuation Tense Training — Design Document

> Status: Design only. No code yet. Implementation order is in §10.
>
> Audience: anyone (human or agent) about to author content or write code for
> tense training. Read §1, §2, and §9 first.

---

## 0. Goal & Philosophy

Teach Spanish (and later Russian) tense **through continuation of scenarios
the learner has already lived in present tense**, not through a "past tense
lesson" or "future tense lesson".

The user-facing language is always communicative, never grammatical:

- Not "Past tense practice" → "Tell your friend what happened."
- Not "Future tense lesson" → "Make plans for next time."
- Not "Mixed tense" → "Talk about what you'll do this time."

Design philosophy follows DLIFLC / GLOSS:

```
same scenario  →  reused vocabulary  →  reused chunks
        →  increasing communicative complexity
        →  natural grammar acquisition through repetition + variation
```

Tense is a side-effect of communication, not the subject of the lesson.

---

## 1. Data Model Changes

The unit of authoring stays the same: one `Lesson` (in `lib/lesson-data.ts`).
We are adding a new dimension — **tense mode** — to the scenario family.

### 1.1 New / extended fields on `Lesson`

```
tenseMode:           "present" | "past-retell" | "future-plan" | "mixed"
                     // Default "present" if absent (back-compat for all existing lessons).

continuationOf?:     string         // scenarioFamily of the present-tense parent
                                    // Required for any non-"present" tenseMode.
                                    // Used to enforce unlock rules and reuse vocab.

discourseGoal?:      string         // Short, learner-facing goal:
                                    //   "Tell your friend what happened."
                                    //   "Make plans for next time."
                                    //   "Talk about what you will do."
                                    // This is what the UI shows; never "past tense".

connectors:          LessonConnector[]   // §1.2
targetVerbs:         LessonTargetVerb[]  // §1.3
expectedStructures:  ExpectedStructure[] // §1.4
requiredChunks?:     string[]            // surface forms that MUST appear in
                                         // the learner's answer for medium/real
                                         // (e.g. ["fui", "pedí", "después"])
```

`tenseMode` lives alongside the existing `tier` field. The two are
**orthogonal**: a continuation lesson can still be Easy / Medium / Real.
Tier controls strictness and length; `tenseMode` controls what the learner
is communicatively doing.

### 1.2 Connector metadata

Connectors are a first-class type, not buried in chunks, because they are
the lever the curriculum uses to make tense feel natural.

```
type LessonConnector = {
  text: string;                       // "primero", "después", "ayer", "mañana"
  translation: string;
  role: "sequence" | "time-anchor" | "contrast" | "cause" | "softener";
  tenseAffinity:                      // hints, not constraints
    | "past"
    | "future"
    | "present"
    | "any";
  repetitionPriority: "high" | "medium" | "low";
};
```

Connectors are surfaced in:
- Exposure (highlighted in the model dialogue)
- Breakdown (taught explicitly with example pairings)
- Active Recall (one expected-structure slot per connector)

### 1.3 Target verbs

```
type LessonTargetVerb = {
  infinitive: string;        // "ir"
  meaning: string;           // "to go"
  forms: {
    surface: string;         // "fui"
    person: "yo" | "tú" | "él/ella/ud" | "nosotros" | "ellos/ellas/uds";
    tense: "preterite" | "imperfect" | "future" | "ir-a" | "present"
         | "subjunctive-pres" | "conditional";
    isFocus: boolean;        // true => MUST appear in medium/real answers
  }[];
};
```

The runtime keeps a tiny "focus form" set per lesson (usually 3–5 surface
forms). `requiredChunks` is the projection of `forms.surface` for `isFocus
=== true`.

### 1.4 Expected structures

```
type ExpectedStructure = {
  id: string;                           // stable id for grading + correction
  promptHint: string;                   // "Tell what you ordered"
  template: string;                     // "<TIME-ANCHOR> <PRET-yo> <NP>"
                                        //   shown only to authors, not user
  exampleAnswers: string[];             // 2–3 acceptable phrasings
  acceptedPatterns: AcceptedPattern[];  // §4.2
  connectorIds?: string[];              // optional explicit connector slots
  verbIds?: string[];                   // verbs from §1.3 that satisfy this
};
```

`acceptedPatterns` is what the evaluator actually matches against (see §4).

### 1.5 Scenario family grouping

`lib/lesson-scenario-family.ts` already groups lessons by `scenarioFamily`
and `tier`. We extend the grouping to include `tenseMode` as a sub-bucket
inside each scenario family:

```
ScenarioGroup
├─ tenseMode: "present"
│   ├─ tier: easy   → [LessonA]
│   ├─ tier: medium → [LessonB]
│   └─ tier: real   → [LessonC]
├─ tenseMode: "past-retell"
│   ├─ tier: easy   → [LessonD]
│   └─ tier: medium → [LessonE]
├─ tenseMode: "future-plan"
│   └─ tier: easy   → [LessonF]
└─ tenseMode: "mixed"
    └─ tier: real   → [LessonG]
```

Continuation lessons (everything that is not `tenseMode === "present"`) are
hidden by the lesson tree until the unlock rule (§7.1) fires for the
present scenario.

### 1.6 Migration / back-compat

- All existing lessons get `tenseMode: "present"` injected at load time
  (in the `RawLesson → Lesson` normalizer in `lib/lesson-data.ts`) if the
  field is missing. No content rewrite required.
- `connectors`, `targetVerbs`, `expectedStructures`, `requiredChunks`
  default to empty arrays. Lessons without them keep the existing
  evaluation behavior.
- `continuationOf` is required only when `tenseMode !== "present"`. A
  load-time validator (dev only, fail-loud) enforces this.

---

## 2. Lesson Structure (Tier × Tense Mode Matrix)

Each scenario family is a 3×4 matrix. Not every cell needs to be authored;
the curriculum is content-driven and a cell is simply absent if not
authored. The matrix per scenario family:

|             | **Present**          | **Past Retelling**          | **Future Planning**          | **Mixed**                       |
|-------------|----------------------|-----------------------------|------------------------------|---------------------------------|
| **Easy**    | live the scenario    | one-line "what happened"    | one-line "what you'll do"    | (rarely authored)               |
| **Medium**  | longer present       | 3–5 line retelling          | 3–5 line plan                | short turn-taking, mixed tense  |
| **Real**    | natural present      | natural retelling           | natural planning             | full conversation, mixed tense  |

### 2.1 Present (existing — unchanged)

Already authored. The `present` mode keeps doing what it does today: live
the scenario, learn chunks, build mastery. **No changes** to existing
content. We only flag it with `tenseMode: "present"` at load time.

### 2.2 Past Retelling

Discourse goal (always): **"Tell your friend what happened."**

| Tier   | Length     | What the learner does                                           | Strictness                       |
|--------|------------|-----------------------------------------------------------------|----------------------------------|
| Easy   | 1 sentence | One-shot: "Yesterday I went to the coffee shop and ordered…"    | meaning accepted                 |
| Medium | 3–5 lines  | Sequenced retelling with `primero / después / luego`           | requires ≥1 focus past form      |
| Real   | 5–8 lines  | Natural retelling with reactions ("estuvo bien", "qué pena")   | requires ≥3 focus past forms + ≥2 connectors |

Tense bias: preterite for actions, imperfect for background and feelings.
Both are taught implicitly through the example dialogue and connectors.

### 2.3 Future Planning

Discourse goal (always): **"Make plans for next time."**

| Tier   | Length     | What the learner does                                          | Strictness                              |
|--------|------------|----------------------------------------------------------------|-----------------------------------------|
| Easy   | 1 sentence | "Mañana voy a pedir un café."                                 | meaning accepted                        |
| Medium | 3–5 lines  | Plan + preference + invitation                                 | requires ≥1 future / `ir+a` form        |
| Real   | 5–8 lines  | Plan + alternatives + soft commitment                          | requires ≥2 future forms + ≥2 connectors|

Tense bias: `ir + a + infinitive` first (high-frequency, easy to acquire),
simple future (`pediré`) second, conditional (`pediría`) only at Real tier.

### 2.4 Mixed

Discourse goal: **"Talk about what you'll do this time, like last time."**
Or: **"Catch up — what happened, and what's next."**

| Tier   | Length     | What the learner does                                                    | Strictness                       |
|--------|------------|--------------------------------------------------------------------------|----------------------------------|
| Easy   | (skip)     | —                                                                         | —                                |
| Medium | 3–5 turns  | Two turns retelling, two turns planning                                  | ≥1 past + ≥1 future form         |
| Real   | 6–10 turns | Full natural exchange: greeting, retelling, planning, soft commitment    | ≥2 past + ≥2 future + connectors |

Mixed lessons always sit at the end of a scenario family's progression.

---

## 3. Exercise Flow (per phase)

The four runtime phases stay the same (`Exposure → Breakdown → Active
Recall → Reinforcement`). Each phase gets a tense-aware variant. The
**speech-first** rule applies in Active Recall and Reinforcement.

### 3.1 Exposure (`Exposure`)

UX is the existing model-dialogue exposure, with three additions:

1. The discourse goal banner at the top:
   > "Tell your friend what happened at the coffee shop."
2. Connector chips below the dialogue, tappable for translation:
   `[primero]` `[después]` `[ayer]`
3. A "What changes here" callout at the end (one line):
   > "We're using the past today. Notice `fui`, `pedí`, `me senté`."

No grammatical jargon. The callout is content-authored, not generated.

### 3.2 Breakdown (`Breakdown`)

Existing chunk-by-chunk breakdown, with an extra row per `targetVerb`:

```
fui  ←  ir (yo, past) ←  "I went"
pedí ←  pedir (yo, past) ←  "I ordered"
```

Connectors get their own row block at the top:

```
primero  →  first
después  →  after / then
luego    →  later / then
```

No conjugation tables. Forms are taught as **chunks tied to a verb**, not
as paradigms.

### 3.3 Active Recall (`Active Recall`)

This is where tense is actually produced. The existing four exercise types
(`chunk-to-meaning`, `meaning-to-chunk`, `contextual-fill-in`,
`full-sentence-recall`) stay. We add one new type:

```
"discourse-turn"
```

Used only in continuation lessons. The user is given a prompt slot in the
discourse goal (e.g. "Now tell what happened next") and produces 1–3
sentences that must satisfy the lesson's `expectedStructures`.

#### Per-tier flow

**Easy (past or future):**
1. Show prompt: "Now tell your friend what happened at the coffee shop."
2. Speech-first: tap to speak (existing `useSpeechRecognition` hook).
3. Evaluate communicatively (§4.1).
4. Show correction inline (§6) regardless of pass/fail.
5. Type-follow-up: optional 1-line typed answer to consolidate.

**Medium / Real:**
1. Show prompt + visible connector chips and 3–5 example chunk hints.
2. Speech-first.
3. Evaluate against `expectedStructures` and `requiredChunks` (§4.2).
4. If fail: show structured correction, **retry required** (max 3 retries).
5. After pass: type-follow-up captures the same answer in writing.

The retry budget caps at 3; after that we accept the closest attempt and
log it as a weak-point for spaced reinforcement (§7.4).

### 3.4 Reinforcement (`Reinforcement`)

Two micro-drills, each ≤30s:

1. **Connector cloze** — fill `<sentence with ___ slot>` with the right
   connector, picked from the lesson's connector set.
2. **Verb form cloze** — fill `<sentence with ___ slot>` with the right
   form from the lesson's `targetVerbs.forms`. Speech-first input.

Both feed `chunkProgress` so existing mastery / decay logic in
`lib/mastery.ts` keeps working unchanged.

---

## 4. Evaluation Strategy

There are two layers: **communicative** (does the meaning come through?)
and **structural** (did the right tense / connector show up?). Easy uses
only the first. Medium and Real require both.

### 4.1 Communicative correctness (Easy)

Reuse `evaluateSpeechAnswer` in `lib/speech-evaluation.ts` against the
`exampleAnswers` of the matched `expectedStructure`, using the existing
`acceptedSpokenTexts` mechanism. Pass = `matchPercent ≥ 70` against any
example.

We DO NOT use open-ended LLM grading. The lesson author owns the
acceptable phrasings; the evaluator just measures distance.

### 4.2 Structural correctness (Medium / Real)

We add a thin layer on top of the speech evaluator: **accepted patterns**.

```
type AcceptedPattern = {
  // Surface forms whose presence (anywhere in the answer) counts as a hit.
  anyOf: string[];            // ["fui", "me fui"]
  // Optional ordering constraint — a follow-up token that must come AFTER.
  before?: string[];          // ["a la cafetería", "al café"]
  weight: "required" | "preferred";
};
```

Grading rule (Medium / Real):

1. Tokenize the spoken/typed answer with the same normalizer used by
   `lib/speech-evaluation.ts` (`normalizeForSpeechCompare`).
2. For each `expectedStructure`, count how many `required` patterns hit.
3. Lesson-level pass = ≥ `requiredHitsThreshold` of the required patterns
   matched, where the threshold is:
   - Medium: ≥ 60% of required patterns
   - Real:   ≥ 80% of required patterns
4. Independently, every `requiredChunks` surface form that is missing
   becomes a `MissingChunkCorrection` (§6).

Crucially, **structural failure does not say "wrong tense"**. It says, via
the correction UI: `"Use 'fui' here."` That is the only grammatical
vocabulary the user ever sees.

### 4.3 Why no open-ended LLM evaluation (yet)

- Lessons must be deterministic to be testable.
- Authoring is auditable: the patterns ARE the rubric.
- We can layer LLM evaluation later as a "soft pass" route, but the
  guided expected-structure layer must come first.

---

## 5. Speech Evaluation Implications

The existing speech engine in `lib/speech-evaluation.ts` already gives us
99% of what we need. Required additions are non-invasive.

### 5.1 What we reuse unchanged

- `normalizeForSpeechCompare`, `tokenizeAndRepair` — handle accents,
  encoding artifacts, fuzzy near-misses.
- `evaluateSpeechAnswer` with `acceptedSpokenTexts` — direct fit for the
  Easy tier's `exampleAnswers` list.
- `useSpeechRecognition` hook — speech-first capture.
- Token classification (filler / grammar-critical / content) — used
  inside `AcceptedPattern.anyOf` matching.

### 5.2 What we add (thin layer, does not modify the engine)

A new helper, conceptually:

```
evaluateDiscourseTurn(input: {
  spokenText: string;
  language: string;
  expectedStructures: ExpectedStructure[];
  requiredChunks: string[];
  tier: "easy" | "medium" | "real";
}): DiscourseTurnEvaluation
```

It calls `evaluateSpeechAnswer` once per `exampleAnswer` and once per
`AcceptedPattern.anyOf`, then assembles a single result with:

- `passed: boolean`
- `matchedStructures: string[]` (ids)
- `missingRequiredPatterns: AcceptedPattern[]`
- `missingRequiredChunks: string[]`
- `bestExampleAnswer: string` (for the "Show more" full-sentence reveal)
- `feedbackHint: string | null`

It lives in `lib/discourse-evaluation.ts` (new file) so the existing
speech evaluator stays focused.

### 5.3 ASR caveats we already handle

- Spanish accents corrupted by Whisper on Windows (`fui` ↔ `f\uFFFDi`) —
  already covered by the dev-mode normalization checks at the bottom of
  `speech-evaluation.ts`. Add similar checks for new high-frequency
  forms: `fue`, `fuimos`, `pedí`, `pediré`, `voy`, `iré`.

### 5.4 Speech-first → typed-after handoff

The runner currently has speech and typed paths that share a result
structure. The new flow is:

1. User speaks → `evaluateDiscourseTurn` runs.
2. Result + correction is shown (regardless of pass/fail).
3. The typed-input box pre-fills with the user's transcript so they can
   tweak it. Submitting the typed answer re-runs `evaluateDiscourseTurn`
   on the typed text — but its purpose at this point is **practice**, not
   pass-gating. The earlier speech result owns pass/fail.

This satisfies the speech-first rule and keeps writing as a free-form
consolidation.

---

## 6. Correction System Design

### 6.1 Two-level correction surface

**Default level — chunk-level correction** (always shown):

```
┌──────────────────────────────────────┐
│  Use "fui" here.                     │
│  ▸ Show more                         │
└──────────────────────────────────────┘
```

The default is a **single chunk fix** in plain English ("Use X here"),
and **never** uses grammatical terminology.

Generation rule: pick the highest-weight `missingRequiredPatterns[0]` and
emit `"Use '<anyOf[0]>' here."`. If none, fall back to the lowest-cost
chunk from `missingRequiredChunks`. If still none and the answer passed,
no correction is shown.

**Expanded level — full corrected sentence**:

```
┌──────────────────────────────────────┐
│  Use "fui" here.                     │
│  ▾ Show less                         │
│                                       │
│  You said:                           │
│   "Yo voy al café y pido un café"    │
│                                       │
│  Try:                                │
│   "Ayer fui al café y pedí un café." │
│                                       │
│  Why:                                │
│   You're telling what happened —      │
│   so use "fui" (went) and "pedí"     │
│   (ordered).                         │
└──────────────────────────────────────┘
```

The "Why" line is content-authored on each `expectedStructure` (a single
optional `whyLine: string` field) and stays communicative, not
grammatical.

### 6.2 Correction text is content, not generated

We do not synthesize sentences. The full corrected version is the
`expectedStructure.exampleAnswers[0]` matched to the user's attempt,
adjusted for the user's slot fill (`<NP>` placeholder substitution
happens at content time, not runtime).

### 6.3 Visual treatment

- Default state: small inline hint card under the recording panel.
- Expansion: in-place expand, no modal, no new screen.
- Color: not a failure red. Use a coaching color (existing
  "info / track-badge" hue).
- Always shown at Easy tier, even on pass, since Easy's stance is
  "communicative meaning accepted, correction shown".

---

## 7. Progression System

### 7.1 Unlock rule

Continuation lessons (`tenseMode !== "present"`) are gated on the present
scenario. For a learner to see any continuation lesson in scenario family
`X`, ALL of the following must be true:

1. At least one `tenseMode === "present"` lesson in `X` is `Complete`
   per `getLessonCompletionStatus` (existing).
2. That lesson has `phasesDone === 4`.
3. That lesson's `activeRecallAccuracy ≥ 70` (existing
   `ACTIVE_RECALL_TARGET_PERCENT`).

This combines the existing tier gate (75% completion of Easy unlocks
Medium, etc., in `lesson-tier-gates.ts`) with a new **mode gate**. The
tier gate continues to apply *within* a `tenseMode`.

### 7.2 Recommended order

When unlocked, continuation lessons appear in this order in the lesson
tree (one accordion per mode under the scenario):

1. Past Retelling (most natural — "what just happened")
2. Future Planning (high-frequency `ir + a` forms)
3. Mixed (only if both above are at least Easy-complete)

The order is content-recommended, not enforced — except Mixed, which is
mode-gated on Past Retelling AND Future Planning each having ≥ 1 lesson
complete.

### 7.3 Mastery

Reuse `getMasteryTier` and `getLessonMasteryScore` from `lib/mastery.ts`
**without modification**. Continuation lessons feed the same chunk and
phase signals. Two consequences:

- A scenario family's mastery is a weighted average across all of its
  authored lessons regardless of `tenseMode`. This is what we want: a
  family is mastered when the learner can live the scenario in any tense.
- Speech accuracy on past/future forms flows into the same
  `chunkProgress[<form>]` slot, so future mixed lessons benefit from
  past-retell practice automatically.

### 7.4 Weak-point reinforcement

Each failed `expectedStructure` and each `MissingChunkCorrection` writes a
record to a new `weakPointStore` (or extends `chunkProgress`):

```
{
  chunkText: "fui",
  context: "intro-coffee-stranger / past-retell / medium",
  failures: 2,
  lastFailedAt: "...",
}
```

The Reinforcement phase and the existing Review page surface the top N
weak points first. No spaced-repetition algorithm change is needed; we
just feed the existing chunk decay model.

### 7.5 Retakes

Retakes use the existing per-lesson retake button. New rule: retaking a
continuation lesson does NOT reset the parent present-tense mastery. The
two are independent rows in `topicProgress`.

---

## 8. Content Authoring Rules

These are guardrails for whoever writes the next lessons.

### 8.1 Hard rules (CI-checked)

1. A lesson with `tenseMode !== "present"` MUST set `continuationOf` to
   the `scenarioFamily` of an existing present lesson in the same
   `language`.
2. Every `expectedStructure` MUST have `≥ 2` `exampleAnswers`.
3. Every `expectedStructure.acceptedPatterns` with
   `weight === "required"` MUST be present in at least one
   `exampleAnswer`.
4. `requiredChunks` MUST be a subset of forms appearing in the union of
   `exampleAnswers`.
5. `connectors[].text` MUST appear in at least one `exampleAnswer` for
   the lesson (else why is it a connector?).
6. `tier === "easy"` MUST NOT set `requiredChunks` (Easy is communicative
   only).
7. `tier === "real"` MUST set `≥ 3` `expectedStructures` and `≥ 2`
   connectors.
8. Lessons must NOT use grammatical terminology in any user-visible
   string (`title`, `objective`, `discourseGoal`, `expectedStructure
   .promptHint`, `expectedStructure.whyLine`). A lint rule blocks
   `/preterite|imperfect|conjugat|subjunctive|past tense|future tense/i`.

### 8.2 Soft rules (style)

- Reuse 70%+ of the parent present-tense lesson's chunks. New chunks
  should mostly be tense forms of already-known verbs.
- Heavy use of connectors at every tier: `primero`, `después`, `luego`,
  `ayer`, `mañana`, `la próxima vez`, `entonces`.
- Discourse goal sentences are conversational and present-tense in
  English even when teaching past Spanish:
  - "Tell your friend what happened."
  - "Make plans for next time."
- Easy lessons stay short — 1 expected sentence. Medium 3–5. Real 5–8.
- Prefer `ir + a + infinitive` over simple future at Easy/Medium.
  Simple future (`pediré`) and conditional (`pediría`) are Real-only.

### 8.3 Per-mode authoring checklist

Past Retelling:
- 1+ time anchor (`ayer`, `el lunes`, `esta mañana`)
- 2+ sequence connectors (`primero`, `después`, `luego`)
- Focus forms: yo-preterite for actions, imperfect for setting/feelings.

Future Planning:
- 1+ time anchor (`mañana`, `la próxima vez`, `el viernes`)
- 1+ commitment softener (`creo que`, `quizás`, `tal vez`)
- Focus forms: `voy a + inf.`, `vas a + inf.`, simple future at Real.

Mixed:
- Authored as a back-and-forth dialogue, with the user playing one side.
- Must include at least one explicit topic shift (`y mañana...`,
  `bueno, ayer...`).

---

## 9. Example Walkthrough — Coffee Shop

Existing scenario family in `lib/lesson-data.ts`:
`scenarioFamily: "intro-coffee-stranger"` with three present-tense
lessons: Easy (`es-intro-coffee-stranger`), Medium
(`es-intro-coffee-stranger-02`), Real (`es-intro-coffee-stranger-03`).

This walkthrough designs four new lessons added to the same family. None
of the existing three change.

### 9.1 Present (already authored — for reference)

Discourse goal: implicit ("have a casual conversation at a coffee shop").
Forms used: `vengo`, `me llamo`, `¿cómo te llamas?`, `mucho gusto`,
`trabajo`. All present tense.

### 9.2 Past Retelling — Easy

```
id:                "es-intro-coffee-stranger-past-easy"
scenarioFamily:    "intro-coffee-stranger"
tier:              "easy"
tenseMode:         "past-retell"
continuationOf:    "intro-coffee-stranger"
discourseGoal:     "Tell your friend what happened at the coffee shop."
```

**Exposure dialogue (1 short turn shown to user):**

> Coffee shop. Yesterday you met someone named María.
> Now you're telling your friend Tomás about it.
>
> You: "Ayer fui a la cafetería antes del trabajo y conocí a una chica
> que se llama María."

**Connectors:**
`ayer` (time-anchor, past), `y` (sequence, any).

**Target verbs:**
- `ir` → `fui` (yo, preterite, focus: true)
- `conocer` → `conocí` (yo, preterite, focus: true)

**Expected structures (one):**

```
id:           "retelling-coffee-easy-1"
promptHint:   "Tell what you did and who you met."
exampleAnswers:
  - "Ayer fui a la cafetería y conocí a María."
  - "Fui al café antes del trabajo y conocí a una chica."
acceptedPatterns:
  - { anyOf: ["fui", "fuí"], weight: "preferred" }
  - { anyOf: ["conocí", "conoci"], weight: "preferred" }
whyLine:      "You're telling what happened — so 'fui' (went) and 'conocí' (met)."
```

**Sample correction (user said "Yo voy al café y conozco a María"):**

Default:
> Use "fui" here.

Expanded:
> You said: "Yo voy al café y conozco a María"
> Try:      "Ayer fui al café y conocí a María."
> Why:      You're telling what happened — so "fui" (went) and "conocí"
>           (met).

Pass behavior (Easy = communicative): the answer above passes because
its meaning matches an `exampleAnswer` ≥ 70% under the speech evaluator.
The correction is shown anyway. No retry required.

### 9.3 Past Retelling — Medium

```
id:                "es-intro-coffee-stranger-past-medium"
tier:              "medium"
tenseMode:         "past-retell"
discourseGoal:     "Tell your friend what happened at the coffee shop."
```

**Connectors:** `primero`, `después`, `luego`, `ayer`.

**Target verbs (focus = required at this tier):**
- `ir` → `fui`
- `pedir` → `pedí`
- `sentar(se)` → `me senté`
- `conocer` → `conocí`
- `gustar` → `me gustó` (preferred, not required)

**`requiredChunks`** (must appear): `["fui", "pedí", "conocí"]`.

**Expected prompt to the user:**

> "Tell your friend what happened yesterday at the coffee shop. Use
> *primero*, *después*, and *luego* to put it in order."

**Expected structures (3):**

1. *Arrival.* required: `fui` + time anchor (`ayer` or similar).
   Example: "Ayer fui a la cafetería antes del trabajo."
2. *Action.* required: `pedí` (or `me senté`).
   Example: "Primero pedí un café y me senté."
3. *Outcome.* required: `conocí`.
   Example: "Después conocí a una chica que se llama María."

**Pass rule (Medium):** ≥ 60% of required patterns matched (= 2 of 3),
AND ≥ 2 of the 3 `requiredChunks` present. Up to 3 retries.

**Failure correction example (user only used present):**

Default:
> Use "fui" here.

After retry, if `conocí` still missing:

> Use "conocí" here.

Each correction targets ONE structure at a time so the user is not
overwhelmed.

### 9.4 Future Planning — Easy

```
id:                "es-intro-coffee-stranger-future-easy"
tier:              "easy"
tenseMode:         "future-plan"
discourseGoal:     "Make plans for next time."
```

**Connectors:** `mañana`, `la próxima vez`.

**Target verbs:**
- `ir` → `voy a ir` (focus, ir+a form)
- `pedir` → `voy a pedir` (focus, ir+a form)

**Expected structure:**

```
promptHint:   "Say what you'll order tomorrow at the coffee shop."
exampleAnswers:
  - "Mañana voy a pedir un café con leche."
  - "La próxima vez voy a pedir té y un sándwich."
acceptedPatterns:
  - { anyOf: ["voy a"], weight: "preferred" }
  - { anyOf: ["mañana", "la próxima vez"], weight: "preferred" }
whyLine:      "You're making plans — 'voy a' lets you say what you'll do."
```

### 9.5 Mixed — Real

```
id:                "es-intro-coffee-stranger-mixed-real"
tier:              "real"
tenseMode:         "mixed"
discourseGoal:     "Catch up with María — what happened, and what's next."
```

**Conversation skeleton (user plays "you"):**

```
María: ¡Hola! ¿Cómo va todo?
You:   <turn 1 — present, greeting>
María: ¿Y al final, qué hiciste ayer cuando saliste del café?
You:   <turn 2 — past retelling, ≥ 1 preterite>
María: Qué bien. Oye, ¿tienes planes para el viernes?
You:   <turn 3 — future planning, ≥ 1 ir+a or future>
María: ¡Perfecto, nos vemos!
You:   <turn 4 — closing, present>
```

**Required (Real, ≥ 80% of required patterns):**
- ≥ 2 past forms across turns 2 + 4 (e.g. `fui`, `pedí`, `conocí`,
  `me senté`).
- ≥ 2 future forms across turns 3 (e.g. `voy a`, `iré`, `pediré`).
- ≥ 2 connectors total from `[primero, después, luego, ayer, mañana, la
  próxima vez, entonces]`.

**Evaluation:** each turn is graded as its own `expectedStructure`. The
lesson passes when 3 of 4 turns pass at ≥ 80% required-pattern coverage.

This is the highest-fidelity lesson in the family and should feel like a
real conversation, not a drill.

---

## 10. Technical Implementation Order

Build in this order. Each step should ship to the dev branch before the
next begins.

### Phase A — Data plumbing (no UX yet)

1. Add `tenseMode`, `continuationOf`, `discourseGoal`, `connectors`,
   `targetVerbs`, `expectedStructures`, `requiredChunks` to the
   `Lesson` and `RawLesson` types in `lib/lesson-data.ts`. Default
   values for back-compat.
2. Add a load-time validator (dev-only) that checks the §8.1 hard rules
   and logs `console.warn` with lesson id + violation.
3. Extend `lib/lesson-scenario-family.ts` to bucket by
   `tenseMode` inside each `ScenarioGroup`. Existing UI keeps working
   because the default mode is `"present"` for all current lessons.

### Phase B — Authoring infrastructure

4. Author **one** new lesson end-to-end as a fixture:
   `es-intro-coffee-stranger-past-easy` from §9.2. Use it to validate
   the type system and the validator. Land it dev-only behind a feature
   flag (`process.env.NEXT_PUBLIC_ENABLE_TENSE_CONTINUATION === "1"`).
5. Add a unit-test layer over the validator covering all §8.1 rules.

### Phase C — Evaluation layer

6. Implement `lib/discourse-evaluation.ts` with `evaluateDiscourseTurn`
   per §5.2. Uses `evaluateSpeechAnswer` internally — does NOT modify
   it.
7. Add dev-mode normalization checks for the high-frequency new forms
   (§5.3).

### Phase D — Lesson tree + unlock

8. Extend `app/lesson/lesson-tier-gates.ts` (or sibling
   `lesson-mode-gates.ts`) with the mode unlock rule from §7.1.
9. Update `app/lesson/page.tsx` to render a tense-mode accordion under
   each scenario, with the existing tier rows nested inside. Use the
   scenario family grouping from step 3. Mode rows are hidden until the
   present mode unlock fires.

### Phase E — Runtime UX

10. Add the `discourse-turn` exercise type to `LessonRunner.tsx`.
    Speech-first; type-after; correction card per §6.
11. Add the discourse goal banner and connector chips to Exposure.
12. Add the connector cloze and verb-form cloze drills to Reinforcement.

### Phase F — Correction system

13. Build the correction card component (default + expanded states),
    consuming the `evaluateDiscourseTurn` result.
14. Wire `whyLine` from `expectedStructure` into the expanded view.

### Phase G — Progression

15. Wire weak-point logging (§7.4) into the existing chunk progress
    store. No new SR algorithm.
16. Surface weak points in the Review page (existing).

### Phase H — Content scale-up

17. Ship the remaining three lessons of the Coffee Shop family
    (§9.3–9.5) as the canonical content reference.
18. Author Past Retelling Easy + Medium for Clarification Basics next
    (it has no `scenarioFamily` set yet — set it to
    `intro-clarification` first).
19. Then Park, Office, and one Food family.

### Phase I — Optional later

20. Soft LLM "extra credit" pass route on top of the rubric (graded as
    bonus mastery, never as a fail-gate).
21. Russian-language continuation: same model, separate target-verb and
    connector tables.

---

## 11. Open Questions (defer until after Phase E)

- Should `discourse-turn` exercises count toward `activeRecallAttempts`
  the same way as existing recall types? Likely yes — they're just
  longer recall tasks — but worth confirming with real usage.
- Do we want to expose the discourse goal in the lesson tile on the
  overview page (e.g. "Tell what happened" instead of the lesson title)?
  Lean yes, but only after the visual hierarchy is in place.
- Mixed-tense lessons may want a per-turn TTS playback button so the
  conversation feels live. Track separately.

---

## 12. Non-Goals (explicit)

- No grammar tables, no conjugation drills, no terminology in the UI.
- No open-ended LLM evaluation in Phases A–G. The rubric is the rubric.
- No replacement of the existing tier system. Tense modes coexist with
  tiers; they do not replace them.
- No changes to the speech engine internals (`lib/speech-evaluation.ts`)
  beyond adding regression checks for new high-frequency forms.
