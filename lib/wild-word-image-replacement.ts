/**
 * Rules for when My Words enrichment may replace an existing thumbnail.
 */

import { hasUserWildWordImage } from "@/lib/wild-word-image-display";

const PROVIDER_SOURCES = new Set(["wikimedia", "pexels", "pixabay"]);
const REPLACEABLE_SOURCES = new Set(["concept", "curated", ...PROVIDER_SOURCES]);

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function confidenceRank(value: string | undefined): number {
  const v = (value ?? "").toLowerCase();
  if (v === "high") {
    return 3;
  }
  if (v === "medium") {
    return 2;
  }
  if (v === "low") {
    return 1;
  }
  return 0;
}

function storedImageSource(rawRecord: Record<string, unknown>): string | undefined {
  return nonEmptyString(rawRecord.imageSource)?.toLowerCase();
}

/** Legacy rows: imageUrl without provider/attribution metadata. */
export function isUnknownLegacyImage(rawRecord: Record<string, unknown>): boolean {
  if (!nonEmptyString(rawRecord.imageUrl)) {
    return false;
  }
  const source = storedImageSource(rawRecord);
  if (source && source !== "lesson") {
    return false;
  }
  const hasProviderMeta =
    nonEmptyString(rawRecord.imageProvider) ||
    nonEmptyString(rawRecord.imageAttribution) ||
    nonEmptyString(rawRecord.imageLicense);
  return !hasProviderMeta;
}

/**
 * Old local/generated concept icons and weak provider rows that Refresh should upgrade.
 */
export function isStaleImage(rawRecord: Record<string, unknown>): boolean {
  if (hasUserWildWordImage(rawRecord)) {
    return false;
  }
  const source = storedImageSource(rawRecord);
  if (source === "concept") {
    return true;
  }
  if (!nonEmptyString(rawRecord.imageUrl)) {
    return false;
  }
  const confidence = nonEmptyString(rawRecord.imageConfidence)?.toLowerCase();
  if (confidence === "low") {
    return true;
  }
  if (source && PROVIDER_SOURCES.has(source) && !nonEmptyString(rawRecord.imageProvider)) {
    return true;
  }
  if (!nonEmptyString(rawRecord.imageReason)) {
    if (!source || source === "concept" || isUnknownLegacyImage(rawRecord)) {
      return true;
    }
  }
  if (!nonEmptyString(rawRecord.imageProvider) && (!source || source === "concept")) {
    return true;
  }
  return false;
}

/**
 * Whether Refresh may replace the stored image (non-user sources only).
 */
export function isReplaceableImageSource(
  rawRecord: Record<string, unknown>,
  options?: { force?: boolean }
): boolean {
  if (hasUserWildWordImage(rawRecord)) {
    return false;
  }
  const source = storedImageSource(rawRecord);
  if (source === "user") {
    return false;
  }
  if (!nonEmptyString(rawRecord.imageUrl)) {
    return true;
  }
  if (!options?.force) {
    return false;
  }
  if (source === "concept" || source === "curated") {
    return true;
  }
  if (isStaleImage(rawRecord) || isUnknownLegacyImage(rawRecord)) {
    return true;
  }
  if (source && REPLACEABLE_SOURCES.has(source)) {
    const confidence = nonEmptyString(rawRecord.imageConfidence)?.toLowerCase();
    if (!confidence || confidence === "low") {
      return true;
    }
    return true;
  }
  if (!source) {
    return true;
  }
  return false;
}

/** Skip re-applying curated/concept rows when force-refreshing a replaceable thumbnail. */
export function shouldSkipBundledImageOnForceRefresh(
  rawRecord: Record<string, unknown>,
  force: boolean
): boolean {
  if (!force || !nonEmptyString(rawRecord.imageUrl)) {
    return false;
  }
  const source = storedImageSource(rawRecord);
  return (
    source === "curated" ||
    source === "concept" ||
    isStaleImage(rawRecord) ||
    isUnknownLegacyImage(rawRecord)
  );
}

export type IncomingImagePatch = {
  imageUrl?: string | null;
  imageSource?: string | null;
  imageConfidence?: string | null;
  imageSearchQuery?: string | null;
};

/**
 * Whether finalizePatch should apply a new imageUrl over the stored one.
 */
export function shouldApplyIncomingImageReplacement(
  rawRecord: Record<string, unknown>,
  patch: IncomingImagePatch,
  force: boolean
): boolean {
  if (hasUserWildWordImage(rawRecord)) {
    return false;
  }
  if (patch.imageUrl === null) {
    return true;
  }
  const incomingUrl = nonEmptyString(patch.imageUrl);
  if (!incomingUrl) {
    return false;
  }
  const storedUrl = nonEmptyString(rawRecord.imageUrl);
  if (!storedUrl) {
    return true;
  }
  if (!force) {
    return false;
  }
  const storedSource = storedImageSource(rawRecord);
  if (storedSource === "user") {
    return false;
  }
  if (
    storedSource === "concept" ||
    storedSource === "curated" ||
    isStaleImage(rawRecord) ||
    isUnknownLegacyImage(rawRecord)
  ) {
    return true;
  }
  const incomingSource = nonEmptyString(patch.imageSource)?.toLowerCase();
  const incomingConf = nonEmptyString(patch.imageConfidence)?.toLowerCase();
  if (!storedSource || !REPLACEABLE_SOURCES.has(storedSource)) {
    return true;
  }
  if (storedSource && PROVIDER_SOURCES.has(storedSource)) {
    const storedConf = nonEmptyString(rawRecord.imageConfidence)?.toLowerCase();
    if (confidenceRank(incomingConf) > confidenceRank(storedConf)) {
      return true;
    }
    if (isStaleImage(rawRecord)) {
      return true;
    }
    const storedQuery = nonEmptyString(rawRecord.imageSearchQuery);
    const incomingQuery = nonEmptyString(patch.imageSearchQuery);
    if (
      incomingQuery &&
      storedQuery &&
      incomingQuery !== storedQuery &&
      confidenceRank(incomingConf) >= confidenceRank(storedConf)
    ) {
      return true;
    }
    if (incomingSource && PROVIDER_SOURCES.has(incomingSource) && confidenceRank(incomingConf) >= 2) {
      return storedConf !== "high" || incomingConf === "high";
    }
    return false;
  }
  return true;
}
