/**
 * Shared types for licensed external image providers (Wikimedia, Pexels, Pixabay, …).
 */

export type ImageSourceKind =
  | "wikimedia"
  | "pexels"
  | "pixabay"
  | "concept"
  | "lesson"
  | "curated"
  | "user";

export type ImageProviderKind = "wikimedia" | "pexels" | "pixabay";

export type ImageConfidence = "high" | "medium" | "low";

export type ImageLookupInput = {
  text: string;
  language: string;
  translation?: string;
  definition?: string;
  explanation?: string;
  partOfSpeech?: string;
};

export type ImageProviderResult = {
  imageUrl: string;
  thumbnailUrl?: string;
  imageSource: "wikimedia" | "pexels" | "pixabay" | "concept" | "lesson" | "curated" | "user";
  imageProvider?: ImageProviderKind;
  imageAlt: string;
  imageAttribution?: string;
  imageAttributionUrl?: string;
  imageLicense?: string;
  imageLicenseUrl?: string;
  imagePageUrl?: string;
  confidence: ImageConfidence;
  reason: string;
  imageSearchQuery?: string;
  imageTags?: string;
  imageSearchProviderRank?: string;
  wikidataEntityId?: string;
  wikidataEntityLabel?: string;
  commonsFileTitle?: string;
};

export interface ImageProvider {
  lookupImage(input: ImageLookupInput): Promise<ImageProviderResult | null>;
}
