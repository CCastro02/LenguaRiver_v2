/**
 * Helpers for merging user-image fields into wild-word storage patches.
 */

/** Sentinel: patch consumer deletes the key from the stored row. */
export const WILD_WORD_FIELD_CLEAR = null;

export function buildUserWildWordImagePatch(input: {
  imageAssetId: string;
  imageAlt: string;
  imageUpdatedAt?: string;
}): Record<string, unknown> {
  return {
    imageSource: "user",
    imageAssetId: input.imageAssetId,
    imageAlt: input.imageAlt,
    imageUpdatedAt: input.imageUpdatedAt ?? new Date().toISOString(),
    imageUrl: WILD_WORD_FIELD_CLEAR,
  };
}

/** Clears user image metadata only; lesson `imageUrl` can be restored via enrichment refresh. */
export function buildClearUserWildWordImagePatch(): Record<string, unknown> {
  return {
    imageSource: WILD_WORD_FIELD_CLEAR,
    imageAssetId: WILD_WORD_FIELD_CLEAR,
    imageAlt: WILD_WORD_FIELD_CLEAR,
    imageUpdatedAt: WILD_WORD_FIELD_CLEAR,
  };
}
