export type SpeechRecordingDeviceInfo = {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  hasMediaRecording: boolean;
  hasBrowserSpeechRecognition?: boolean;
};

export function isAppleMobileSpeechDevice(input: SpeechRecordingDeviceInfo): boolean {
  const userAgent = input.userAgent ?? "";
  const platform = input.platform ?? "";
  const maxTouchPoints = input.maxTouchPoints ?? 0;

  if (/iPad|iPhone|iPod/i.test(userAgent) || /iPad|iPhone|iPod/i.test(platform)) {
    return true;
  }

  // iPadOS can report itself as Macintosh in Safari desktop mode.
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

export function shouldUseMediaRecorderForDevice(input: SpeechRecordingDeviceInfo): boolean {
  if (!input.hasMediaRecording) {
    return false;
  }

  // On iPhone/iPad Safari/PWA, running Web Speech recognition and MediaRecorder
  // at the same time can leave the UI stuck in the recording state. Chris wants
  // no paid/cloud transcription, so prefer the older/free browser recognition
  // path on Apple mobile when the browser exposes it.
  if (input.hasBrowserSpeechRecognition && isAppleMobileSpeechDevice(input)) {
    return false;
  }

  return true;
}

export function shouldStartBrowserSpeechRecognitionForDevice(
  input: SpeechRecordingDeviceInfo
): boolean {
  return Boolean(input.hasBrowserSpeechRecognition ?? true);
}
