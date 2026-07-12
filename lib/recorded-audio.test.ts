/**
 * Run: `npx tsx lib/recorded-audio.test.ts`
 */
import assert from "node:assert/strict";

import { chooseRecordedAudioMimeType, extensionForAudioMimeType } from "./recorded-audio";

assert.equal(
  chooseRecordedAudioMimeType({ recorderMimeType: "audio/webm", chunkTypes: ["audio/mp4"] }),
  "audio/mp4"
);
assert.equal(
  chooseRecordedAudioMimeType({ recorderMimeType: "audio/mp4", chunkTypes: [""] }),
  "audio/mp4"
);
assert.equal(chooseRecordedAudioMimeType({ chunkTypes: [] }), "audio/webm");

assert.equal(extensionForAudioMimeType("audio/webm;codecs=opus"), ".webm");
assert.equal(extensionForAudioMimeType("audio/mp4"), ".mp4");
assert.equal(extensionForAudioMimeType("video/mp4"), ".mp4");
assert.equal(extensionForAudioMimeType("audio/mpeg"), ".mp3");
assert.equal(extensionForAudioMimeType("audio/wav"), ".wav");
assert.equal(extensionForAudioMimeType("audio/ogg"), ".ogg");
assert.equal(extensionForAudioMimeType(""), ".webm");

console.log("recorded-audio.test.ts: ok");
