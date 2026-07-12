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

  // Chris does not want paid/cloud transcription right now. When the browser
  // can do speech recognition, use that direct/free path instead of recording
  // audio for server transcription. This also avoids Chrome/Safari conflicts
  // where MediaRecorder can grab the mic and leave browser recognition with no
  // usable transcript.
  if (input.hasBrowserSpeechRecognition) {
    return false;
  }

  return true;
}

export function shouldStartBrowserSpeechRecognitionForDevice(
  input: SpeechRecordingDeviceInfo
): boolean {
  return Boolean(input.hasBrowserSpeechRecognition ?? true);
}

export function browserSpeechRecognitionLocale(language: string): string {
  switch (language) {
    case "es":
      return "es-ES";
    case "en":
      return "en-US";
    case "ru":
      return "ru-RU";
    default:
      return language;
  }
}
