/**
 * Run: `npx tsx lib/speech-recording-strategy.test.ts`
 */
import assert from "node:assert/strict";

import {
  browserSpeechRecognitionLocale,
  isAppleMobileSpeechDevice,
  shouldStartBrowserSpeechRecognitionForDevice,
  shouldUseMediaRecorderForDevice,
} from "./speech-recording-strategy";

const iphoneSafari = {
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
  platform: "iPhone",
  maxTouchPoints: 5,
  hasMediaRecording: true,
  hasBrowserSpeechRecognition: true,
};

const ipadDesktopMode = {
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
  platform: "MacIntel",
  maxTouchPoints: 5,
  hasMediaRecording: true,
  hasBrowserSpeechRecognition: true,
};

const desktopChrome = {
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
  platform: "Win32",
  maxTouchPoints: 0,
  hasMediaRecording: true,
  hasBrowserSpeechRecognition: true,
};

assert.equal(isAppleMobileSpeechDevice(iphoneSafari), true);
assert.equal(isAppleMobileSpeechDevice(ipadDesktopMode), true);
assert.equal(isAppleMobileSpeechDevice(desktopChrome), false);

assert.equal(shouldUseMediaRecorderForDevice(iphoneSafari), false);
assert.equal(shouldUseMediaRecorderForDevice(ipadDesktopMode), false);
assert.equal(shouldUseMediaRecorderForDevice(desktopChrome), false);
assert.equal(
  shouldUseMediaRecorderForDevice({ ...desktopChrome, hasBrowserSpeechRecognition: false }),
  false
);
assert.equal(
  shouldUseMediaRecorderForDevice({
    ...desktopChrome,
    hasBrowserSpeechRecognition: false,
    allowServerTranscription: true,
  }),
  true
);
assert.equal(shouldUseMediaRecorderForDevice({ ...desktopChrome, hasMediaRecording: false }), false);

assert.equal(shouldStartBrowserSpeechRecognitionForDevice(iphoneSafari), true);
assert.equal(
  shouldStartBrowserSpeechRecognitionForDevice({ ...iphoneSafari, hasBrowserSpeechRecognition: false }),
  false
);

assert.equal(browserSpeechRecognitionLocale("es"), "es-ES");
assert.equal(browserSpeechRecognitionLocale("en"), "en-US");
assert.equal(browserSpeechRecognitionLocale("ru"), "ru-RU");
assert.equal(browserSpeechRecognitionLocale("de-DE"), "de-DE");

console.log("speech-recording-strategy.test.ts: ok");
