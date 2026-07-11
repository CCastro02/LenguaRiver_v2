/**
 * Run: `npx tsx lib/comic-inline-blank.test.ts`
 */
import assert from "node:assert/strict";

import { buildInlineBlankParts } from "./comic-inline-blank";

const withBlank = buildInlineBlankParts("Perdón, ¿este asiento está ____?");
assert.equal(withBlank.hasBlank, true);
assert.equal(withBlank.prefix, "Perdón, ¿este asiento está ");
assert.equal(withBlank.suffix, "?");

const noBlank = buildInlineBlankParts("Hola, ¿cómo estás?");
assert.equal(noBlank.hasBlank, false);
assert.equal(noBlank.prefix, "Hola, ¿cómo estás?");
assert.equal(noBlank.suffix, "");

const empty = buildInlineBlankParts("");
assert.equal(empty.hasBlank, false);
assert.equal(empty.prefix, "");

console.log("comic-inline-blank.test.ts: ok");
