export function chooseRecordedAudioMimeType(input: {
  recorderMimeType?: string | null;
  chunkTypes?: readonly (string | undefined | null)[];
}): string {
  const chunkType = input.chunkTypes?.find(
    (type): type is string => typeof type === "string" && type.trim().length > 0
  );
  const recorderType = input.recorderMimeType?.trim();
  return chunkType?.trim() || recorderType || "audio/webm";
}

export function extensionForAudioMimeType(mimeType: string | null | undefined): string {
  const normalized = mimeType?.split(";")[0]?.trim().toLowerCase() ?? "";
  switch (normalized) {
    case "audio/mp4":
    case "video/mp4":
      return ".mp4";
    case "audio/mpeg":
    case "audio/mp3":
      return ".mp3";
    case "audio/wav":
    case "audio/wave":
    case "audio/x-wav":
      return ".wav";
    case "audio/ogg":
    case "video/ogg":
      return ".ogg";
    case "audio/webm":
    case "video/webm":
    default:
      return ".webm";
  }
}
