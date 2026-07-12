/**
 * Run: `npx tsx lib/speech-recording-strategy.test.ts`
 */
import assert from "node:assert/strict";

import {
  isAppleMobileSpeechDevice,
  shouldStartBrowserSpeechRecognitionForDevice,
} from "./speech-recording-strategy";

const iphoneSafari = {
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
  platform: "iPhone",
  maxTouchPoints: 5,
  hasMediaRecording: true,
};

const ipadDesktopMode = {
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
  platform: "MacIntel",
  maxTouchPoints: 5,
  hasMediaRecording: true,
};

const desktopChrome = {
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
  platform: "Win32",
  maxTouchPoints: 0,
  hasMediaRecording: true,
};

assert.equal(isAppleMobileSpeechDevice(iphoneSafari), true);
assert.equal(isAppleMobileSpeechDevice(ipadDesktopMode), true);
assert.equal(isAppleMobileSpeechDevice(desktopChrome), false);
assert.equal(shouldStartBrowserSpeechRecognitionForDevice(iphoneSafari), false);
assert.equal(shouldStartBrowserSpeechRecognitionForDevice(ipadDesktopMode), false);
assert.equal(shouldStartBrowserSpeechRecognitionForDevice(desktopChrome), true);
assert.equal(
  shouldStartBrowserSpeechRecognitionForDevice({ ...iphoneSafari, hasMediaRecording: false }),
  true
);

console.log("speech-recording-strategy.test.ts: ok");
