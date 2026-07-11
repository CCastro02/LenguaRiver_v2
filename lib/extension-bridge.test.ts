/**
 * Run: `npx tsx lib/extension-bridge.test.ts`
 */
import assert from "node:assert/strict";

import {
  EXTENSION_BRIDGE_SCHEMA_VERSION,
  isExtensionBridgeMessage,
} from "./extension-bridge";

assert.equal(
  isExtensionBridgeMessage({
    type: "lenguariver:extension-word-saved",
    schemaVersion: EXTENSION_BRIDGE_SCHEMA_VERSION,
    word: { id: "w1", text: "learning" },
  }),
  true
);

assert.equal(
  isExtensionBridgeMessage({
    type: "lenguariver:extension-sync-response",
    schemaVersion: EXTENSION_BRIDGE_SCHEMA_VERSION,
    words: [{ id: "w1", text: "learning" }],
  }),
  true
);

assert.equal(
  isExtensionBridgeMessage({
    type: "lenguariver:extension-sync-response",
    schemaVersion: EXTENSION_BRIDGE_SCHEMA_VERSION,
    words: [],
  }),
  true
);

assert.equal(
  isExtensionBridgeMessage({
    type: "lenguariver:unknown-message",
    schemaVersion: EXTENSION_BRIDGE_SCHEMA_VERSION,
    words: [],
  }),
  false
);

assert.equal(
  isExtensionBridgeMessage({
    type: "lenguariver:extension-word-saved",
    schemaVersion: 2,
    word: { id: "w1" },
  }),
  false
);

assert.equal(
  isExtensionBridgeMessage({
    type: "lenguariver:extension-word-saved",
    schemaVersion: EXTENSION_BRIDGE_SCHEMA_VERSION,
    word: "not-an-object",
  }),
  false
);

assert.equal(
  isExtensionBridgeMessage({
    type: "lenguariver:extension-sync-response",
    schemaVersion: EXTENSION_BRIDGE_SCHEMA_VERSION,
    words: [{ id: "w1" }, "bad"],
  }),
  false
);

assert.equal(isExtensionBridgeMessage(null), false);
assert.equal(isExtensionBridgeMessage("hello"), false);

console.log("extension-bridge.test.ts: ok");
