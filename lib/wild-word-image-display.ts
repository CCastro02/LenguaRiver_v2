/**
 * Resolve My Words card thumbnail URLs (user IndexedDB blobs vs lesson `imageUrl`).
 */

import { getWildWordImage } from "@/lib/wild-word-image-store";

export type ResolvedWildWordImage = {
  url?: string;
  revoke?: () => void;
  source?: string;
};

function trimString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** True when the row has a user-owned custom image (not lesson/enrichment URL). */
export function hasUserWildWordImage(rawRecord: Record<string, unknown>): boolean {
  const source = trimString(rawRecord.imageSource);
  const assetId = trimString(rawRecord.imageAssetId);
  return source === "user" && Boolean(assetId);
}

/**
 * Precedence: user IndexedDB image → `imageUrl` (lesson/enrichment) → none.
 * Caller must invoke `revoke()` when discarding a blob object URL.
 */
export async function resolveWildWordImageUrl(
  rawRecord: Record<string, unknown>
): Promise<ResolvedWildWordImage> {
  if (hasUserWildWordImage(rawRecord)) {
    const assetId = trimString(rawRecord.imageAssetId)!;
    const blob = await getWildWordImage(assetId);
    if (blob) {
      const url = URL.createObjectURL(blob);
      return {
        url,
        source: "user",
        revoke: () => {
          URL.revokeObjectURL(url);
        },
      };
    }
  }

  const imageUrl = trimString(rawRecord.imageUrl);
  if (imageUrl) {
    return { url: imageUrl, source: trimString(rawRecord.imageSource) ?? "url" };
  }

  return {};
}
