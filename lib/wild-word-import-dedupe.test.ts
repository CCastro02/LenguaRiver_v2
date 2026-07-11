/**
 * Run: `npx tsx lib/wild-word-import-dedupe.test.ts`
 */
import assert from "node:assert/strict";

import { buildLexemeKey } from "./lexeme-key";
import {
  applyWildWordsJsonImportToRows,
  canonicalWildWordSourceUrl,
  compareWildWordRowQuality,
  dedupeWildWordRows,
  mergeWildWordImportIntoExisting,
  wildWordImportDedupeKey,
  wildWordSemanticDedupeKeys,
} from "./wild-word-import-dedupe";

const PAGE = "https://Example.COM/path/?q=1#section";
const CANON = canonicalWildWordSourceUrl({ sourceUrl: PAGE });

assert.ok(CANON.includes("example.com/path"));
assert.ok(!CANON.includes("#"));
assert.equal(
  canonicalWildWordSourceUrl({ sourceItemId: "https://EXAMPLE.com/foo/" }),
  "https://example.com/foo"
);

function learningRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const clientId = "client-learning-1";
  return {
    id: "import-id-1",
    clientGeneratedId: clientId,
    text: "learning",
    language: "en",
    lexemeKey: buildLexemeKey("en", "learning"),
    sourceUrl: PAGE,
    sourceItemId: PAGE,
    sourceTitle: "Example",
    savedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const learningVariants = [
  learningRow({ id: "a1" }),
  learningRow({ id: "a2", lexemeKey: undefined }),
  learningRow({ id: "a3", clientGeneratedId: "client-learning-1" }),
  learningRow({ id: "a4", lexemeKey: buildLexemeKey("en", "learning") }),
];

const { rows: learningDeduped, mergedDuplicates: learningMerged } = dedupeWildWordRows(learningVariants);
assert.equal(learningDeduped.length, 1, "four learning rows collapse to one");
assert.equal(learningMerged, 3);
assert.equal(learningDeduped[0]!.clientGeneratedId, "client-learning-1");

const paidFreeTrialFixture: Record<string, unknown>[] = [
  {
    id: "p1",
    text: "paid",
    language: "en",
    lexemeKey: buildLexemeKey("en", "paid"),
    sourceUrl: PAGE,
    sourceItemId: PAGE,
    clientGeneratedId: "cid-paid",
  },
  {
    id: "p2",
    text: "paid",
    language: "en",
    sourceUrl: PAGE,
    sourceItemId: PAGE,
    clientGeneratedId: "cid-paid",
  },
  {
    id: "f1",
    text: "free",
    language: "en",
    lexemeKey: buildLexemeKey("en", "free"),
    sourceUrl: PAGE,
    translation: "libre",
    enrichedAt: "2026-02-01T00:00:00.000Z",
  },
  {
    id: "f2",
    text: "free",
    language: "en",
    lexemeKey: buildLexemeKey("en", "free"),
    sourceUrl: PAGE,
  },
  {
    id: "t1",
    text: "trial",
    language: "en",
    lexemeKey: buildLexemeKey("en", "trial"),
    sourceItemId: PAGE,
  },
  {
    id: "t2",
    text: "trial",
    language: "en",
    lexemeKey: buildLexemeKey("en", "trial"),
    sourceItemId: PAGE,
    savedAt: "2026-03-01T00:00:00.000Z",
  },
  {
    id: "tr1",
    text: "translation",
    language: "en",
    lexemeKey: buildLexemeKey("en", "translation"),
    sourceUrl: PAGE,
    imageSource: "user",
    imageAssetId: "asset-user-1",
    imageAlt: "mine",
  },
  {
    id: "tr2",
    text: "translation",
    language: "en",
    lexemeKey: buildLexemeKey("en", "translation"),
    sourceUrl: PAGE,
    translation: "traducción",
    definition: "gloss",
    enrichedAt: "2026-04-01T00:00:00.000Z",
  },
];

const beforeCount = paidFreeTrialFixture.length;
const collapsed = dedupeWildWordRows(paidFreeTrialFixture);
assert.equal(collapsed.rows.length, 4, "paid/free/trial/translation each one row");
assert.equal(collapsed.mergedDuplicates, beforeCount - 4);

const freeRow = collapsed.rows.find((r) => r.text === "free");
assert.equal(freeRow?.translation, "libre", "enriched free row wins");

const translationRow = collapsed.rows.find((r) => r.text === "translation");
assert.equal(translationRow?.imageAssetId, "asset-user-1", "user image row wins");
assert.equal(translationRow?.translation, "traducción", "merged enrichment from duplicate");
assert.equal(translationRow?.definition, "gloss");

const legacyOnly = {
  id: "legacy-1",
  text: "coffee",
  language: "es",
  sourceUrl: PAGE,
  sourceItemId: PAGE,
};
const withLexeme = {
  ...legacyOnly,
  id: "legacy-2",
  lexemeKey: buildLexemeKey("es", "coffee"),
  clientGeneratedId: "cid-coffee",
};
const { rows: coffeeRows } = dedupeWildWordRows([legacyOnly, withLexeme]);
assert.equal(coffeeRows.length, 1);
assert.ok(
  wildWordSemanticDedupeKeys(legacyOnly).some((k) => wildWordSemanticDedupeKeys(withLexeme).includes(k)) ||
    findSharedKey(legacyOnly, withLexeme),
  "legacy + lexeme rows share a semantic key"
);

function findSharedKey(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const setB = new Set(wildWordSemanticDedupeKeys(b));
  return wildWordSemanticDedupeKeys(a).some((k) => setB.has(k));
}

const existing = {
  id: "stable-id",
  text: "mesa",
  language: "es",
  lexemeKey: buildLexemeKey("es", "mesa"),
  translation: "table",
  definition: "furniture",
  enrichedAt: "2026-01-15T00:00:00.000Z",
};
const incoming = {
  id: "new-import-id",
  clientGeneratedId: "cid-mesa",
  text: "mesa",
  language: "es",
  lexemeKey: buildLexemeKey("es", "mesa"),
  translation: "",
  definition: undefined,
  contextSentence: "La mesa es grande.",
  customFutureField: "kept",
};
const { row: merged, changed } = mergeWildWordImportIntoExisting(existing, incoming);
assert.equal(changed, true);
assert.equal(merged.id, "stable-id");
assert.equal(merged.translation, "table");
assert.equal(merged.definition, "furniture");
assert.equal(merged.contextSentence, "La mesa es grande.");
assert.equal(merged.customFutureField, "kept");

const redundant = mergeWildWordImportIntoExisting(merged, incoming);
assert.equal(redundant.changed, false);

const userWinner = {
  id: "u1",
  text: "hola",
  language: "es",
  imageSource: "user",
  imageAssetId: "a1",
};
const enrichLoser = {
  id: "u2",
  text: "hola",
  language: "es",
  translation: "hello",
  enrichedAt: "2099-01-01T00:00:00.000Z",
};
assert.ok(compareWildWordRowQuality(userWinner, enrichLoser) < 0);

assert.ok(wildWordImportDedupeKey(learningRow()).startsWith("cid::"));

const exportFixture = [...learningVariants, ...paidFreeTrialFixture];
let idSeq = 0;
const firstImport = applyWildWordsJsonImportToRows([], exportFixture, {
  newId: () => `gen-${++idSeq}`,
});
assert.equal(firstImport.rows.length, 5, "learning + paid + free + trial + translation");
assert.equal(firstImport.imported, 5);

const secondImport = applyWildWordsJsonImportToRows(firstImport.rows, exportFixture, {
  newId: () => `gen-${++idSeq}`,
});
assert.equal(secondImport.rows.length, firstImport.rows.length, "re-import does not grow row count");
assert.equal(secondImport.imported, 0);
assert.ok(secondImport.skippedDuplicates > 0 || secondImport.mergedDuplicates === 0);

console.log("wild-word-import-dedupe.test.ts: ok");
