export type SpeechRecordingDeviceInfo = {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  hasMediaRecording: boolean;
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

export function shouldStartBrowserSpeechRecognitionForDevice(
  input: SpeechRecordingDeviceInfo
): boolean {
  // On iPhone/iPad Safari/PWA, running Web Speech recognition and MediaRecorder
  // at the same time can leave the UI stuck in the recording state. Prefer the
  // recorded-audio → server transcription path there.
  if (input.hasMediaRecording && isAppleMobileSpeechDevice(input)) {
    return false;
  }

  return true;
}
