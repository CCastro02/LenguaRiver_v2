# GLOSS Ingestion (reviewable JSON only)

This parser turns pasted/manual GLOSS-style content into structured scenario JSON.

## Input

- Default input file: `scripts/gloss/input/gloss_raw.txt`
- Expected useful headings:
  - `Scenario: ...`
  - `Context: ...`
- Dialogue lines can be speaker-tagged:
  - `A: ...`
  - `B: ...`
  - `Speaker1: ...`

## Output

The parser writes reviewable JSON files to `scripts/gloss/output`:

- `gloss_parsed_turns.json` (scenario + context + extracted speaker turns + pattern hits)
- `gloss_scenarios.json` (compact shape for lesson ideation):

```json
{
  "scenario": "string",
  "context": "string",
  "phrases": ["string"]
}
```

## Run

```bash
npm run ingest:gloss
```

Or custom paths:

```bash
npx tsx scripts/gloss/parse_gloss.ts --input path/to/raw.txt --output-dir path/to/output
```

## Draft generation diversity constraints

When generating lesson drafts from scored scenarios, keep batch diversity constraints:

- Do not generate lessons that share the same dominant pattern or intent within the same topic batch.
- Prioritize underrepresented intents over common patterns like `quiero ___` or `dónde está ___`.
