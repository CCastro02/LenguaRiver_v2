/**
 * Run: `npx tsx lib/web-bridge.test.ts` (from extension root)
 */
import assert from "node:assert/strict";

import {
  getAllowedLenguaRiverOrigins,
  getLenguaRiverOriginFromUrl,
  isLenguaRiverWebUrl,
  LOCAL_DEV_LENGUARIVER_ORIGINS,
  PRODUCTION_LENGUARIVER_ORIGIN_PLACEHOLDERS,
} from "./web-bridge";

const allowed = new Set(getAllowedLenguaRiverOrigins());

for (const origin of LOCAL_DEV_LENGUARIVER_ORIGINS) {
  assert.ok(allowed.has(origin), `local dev origin should be allowed: ${origin}`);
}

assert.equal(isLenguaRiverWebUrl("http://localhost:3000/my-words"), true);
assert.equal(isLenguaRiverWebUrl("http://localhost:3001/my-words"), true);
assert.equal(getLenguaRiverOriginFromUrl("http://localhost:3000/explore"), "http://localhost:3000");

for (const placeholder of PRODUCTION_LENGUARIVER_ORIGIN_PLACEHOLDERS) {
  assert.equal(
    isLenguaRiverWebUrl(`${placeholder}/my-words`),
    false,
    `production placeholder must stay inactive until configured: ${placeholder}`,
  );
  assert.ok(!allowed.has(placeholder), `placeholder must not be in active allowlist: ${placeholder}`);
}

assert.equal(isLenguaRiverWebUrl("https://lenguariver.com/my-words"), false);
assert.equal(isLenguaRiverWebUrl("https://example.vercel.app/my-words"), false);
assert.equal(isLenguaRiverWebUrl("https://reddit.com"), false);
assert.equal(isLenguaRiverWebUrl("https://cnn.com"), false);
assert.equal(isLenguaRiverWebUrl(undefined), false);
assert.equal(isLenguaRiverWebUrl(null), false);
assert.equal(isLenguaRiverWebUrl(""), false);
assert.equal(isLenguaRiverWebUrl("file:///tmp/index.html"), false);
assert.equal(isLenguaRiverWebUrl("chrome://extensions"), false);
assert.equal(isLenguaRiverWebUrl("https://localhost:3000/my-words"), false);

console.log("web-bridge.test.ts: ok");
