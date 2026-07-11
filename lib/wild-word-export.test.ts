/**
 * Run: `npx tsx lib/wild-word-export.test.ts`
 */
import assert from "node:assert/strict";

import { wildWordImportDedupeKey } from "./wild-word-import-dedupe";
import {
  buildMyWordsExportJson,
  formatMyWordsExportFilename,
  prepareMyWordsExportRows,
} from "./wild-word-export";

const enrichedRow: Record<string, unknown> = {
  id: "row-1",
  text: "disculpe",
  language: "es",
  lexemeKey: "lr:v1|es|disculpe",
  translation: "Excuse me",
  translationTargetLanguage: "en",
  definition: "Used to get attention politely.",
  enrichmentVersion: 1,
  enrichmentStatus: "complete",
  enrichedAt: "2026-01-01T00:00:00.000Z",
  translationSource: "argos",
  customFutureField: "preserved",
};

const parsed = JSON.parse(buildMyWordsExportJson([enrichedRow])) as unknown;
assert.ok(Array.isArray(parsed));
assert.equal((parsed as Record<string, unknown>[]).length, 1);
const exported = (parsed as Record<string, unknown>[])[0];
assert.equal(exported.translation, "Excuse me");
assert.equal(exported.definition, "Used to get attention politely.");
assert.equal(exported.enrichmentStatus, "complete");
assert.equal(exported.customFutureField, "preserved");

assert.equal(
  wildWordImportDedupeKey(exported),
  wildWordImportDedupeKey(enrichedRow),
  "re-import dedupe key stable after export"
);

const userImageRow: Record<string, unknown> = {
  ...enrichedRow,
  id: "row-2",
  text: "mesa",
  imageSource: "user",
  imageAssetId: "asset-abc",
  imageAlt: "My table photo",
  imageUpdatedAt: "2026-02-01T00:00:00.000Z",
  imageBlob: "should-not-export",
};
const userExported = prepareMyWordsExportRows([userImageRow])[0];
assert.equal(userExported.imageAssetId, "asset-abc");
assert.equal(userExported.imageSource, "user");
assert.equal(userExported.imageBlob, undefined);

assert.equal(formatMyWordsExportFilename(new Date("2026-05-20T15:00:00")), "lenguariver-my-words-export-2026-05-20.json");

console.log("wild-word-export.test.ts: ok");
