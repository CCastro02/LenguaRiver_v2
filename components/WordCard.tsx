"use client";

import { useEffect, useRef, useState } from "react";
import type { WildWordLanguagePresentation } from "@/lib/wild-word-extension-display";
import { isMyWordsDebugEnabled } from "@/lib/debug-flags";
import { devLogMyWordsImagePipeline } from "@/lib/dev-my-words-image-pipeline";
import type { UserWildWord } from "@/lib/explore-content";
import {
  playCardSourceAudio,
  playCardTranslationAudio,
  type WildWordCardAudioContext,
} from "@/lib/wild-word-card-audio";
import { hasUserWildWordImage, resolveWildWordImageUrl } from "@/lib/wild-word-image-display";
import {
  cleanContextForDisplay,
  highlightSavedTextInContext,
} from "@/lib/text-context-cleanup";
import { ensureTtsVoicesLoaded } from "@/lib/tts-voice";
import { cleanWildWordTextForDisplay } from "@/lib/fix-common-mojibake";
import {
  resolveDefinitionLabeledCardDisplay,
  resolveDefinitionSourceForDetails,
  resolveExplanationCardDisplay,
  WILD_WORD_EXPLANATION_ENCODING_DETAILS,
  WILD_WORD_DEFINITION_DETAILS_UNAVAILABLE,
} from "@/lib/wild-word-definition-display";

/** Fields that may appear on stored rows beyond `UserWildWord` (extension / future payloads). */
export type WildWordDisplayExtras = {
  definition?: string;
  /** ISO code for the language of `definition` (source-language dictionary gloss). */
  definitionLanguage?: string;
  phonetic?: string;
  partOfSpeech?: string;
  imageUrl?: string;
  translationTargetLanguage?: string;
  definitionSource?: string;
  explanation?: string;
  explanationLanguage?: string;
  explanationSource?: string;
  targetLanguage?: string;
  sourceDomain?: string;
  /** From extension-imported rows (`sourceUrl`); display-only, not part of persisted web schema edits here. */
  sourceUrl?: string;
};

/** Read-only hints from bundled lesson corpus (never written back to storage). */
export type LexemeWordEnrichment = {
  translation?: string;
  context?: string;
  phonetic?: string;
};

export type WordCardProps = {
  wildWord: UserWildWord;
  /** Full stored row (for user image resolution from IndexedDB). */
  rawRecord: Record<string, unknown>;
  extras?: WildWordDisplayExtras | null;
  lexemeHints?: LexemeWordEnrichment | null;
  languagePresentation?: WildWordLanguagePresentation;
  enrichmentPending?: boolean;
  enrichmentError?: string | null;
  canDelete?: boolean;
  onDelete?: () => void;
  onRefreshEnrichment?: () => void;
  onUploadImage?: (file: File) => void | Promise<void>;
  onRemoveCustomImage?: () => void | Promise<void>;
};

const TRANSLATION_MISSING_PLACEHOLDER = "Translation not added yet";
const TRANSLATION_UNAVAILABLE = "Translation unavailable";

function toUserFacingTranslationError(technical: string | null): string | null {
  if (!technical?.trim()) {
    return null;
  }
  return TRANSLATION_UNAVAILABLE;
}

function formatDetailsEnrichmentErrors(
  summaryError: string | null,
  rawRecord: Record<string, unknown>
): string | null {
  const lines: string[] = [];
  const summary = summaryError?.trim();
  if (summary) {
    lines.push(summary);
  }
  const errors = rawRecord.enrichmentErrors;
  if (errors && typeof errors === "object" && !Array.isArray(errors)) {
    for (const [key, value] of Object.entries(errors as Record<string, unknown>)) {
      if (typeof value !== "string" || !value.trim()) {
        continue;
      }
      const line = `${key}: ${value.trim()}`;
      if (!lines.some((existing) => existing.includes(value.trim()))) {
        lines.push(line);
      }
    }
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

function buildImageMetadataLines(rawRecord: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const push = (label: string, value: unknown) => {
    if (typeof value === "string" && value.trim()) {
      lines.push(`${label}: ${value.trim()}`);
    }
  };
  const imageSource =
    typeof rawRecord.imageSource === "string" ? rawRecord.imageSource.trim().toLowerCase() : "";
  if (imageSource === "wikimedia") {
    lines.push("Image source: Wikimedia Commons");
    push("License", rawRecord.imageLicense);
    push("Attribution", rawRecord.imageAttribution);
    const pageUrl =
      typeof rawRecord.imagePageUrl === "string" ? rawRecord.imagePageUrl.trim() : "";
    if (pageUrl) {
      lines.push(`Image page: ${shortenUrlForDisplay(pageUrl, 72)}`);
    }
  } else if (imageSource === "pexels") {
    lines.push("Image source: Pexels");
    lines.push("Photos provided by Pexels");
    push("Photographer", rawRecord.imageAttribution);
    push("License", rawRecord.imageLicense);
    const attributionUrl =
      typeof rawRecord.imageAttributionUrl === "string"
        ? rawRecord.imageAttributionUrl.trim()
        : "";
    if (attributionUrl) {
      lines.push(`Photographer link: ${shortenUrlForDisplay(attributionUrl, 72)}`);
    }
    const pageUrl =
      typeof rawRecord.imagePageUrl === "string" ? rawRecord.imagePageUrl.trim() : "";
    if (pageUrl) {
      lines.push(`Photo page: ${shortenUrlForDisplay(pageUrl, 72)}`);
    }
    const licenseUrl =
      typeof rawRecord.imageLicenseUrl === "string" ? rawRecord.imageLicenseUrl.trim() : "";
    if (licenseUrl) {
      lines.push(`License link: ${shortenUrlForDisplay(licenseUrl, 72)}`);
    }
    push("Search query", rawRecord.imageSearchQuery);
    push("Tags", rawRecord.imageTags);
    push("Confidence", rawRecord.imageConfidence);
    push("Reason", rawRecord.imageReason);
    push("Provider rank", rawRecord.imageSearchProviderRank);
  } else if (imageSource === "pixabay") {
    lines.push("Image source: Pixabay");
    push("Creator", rawRecord.imageAttribution);
    push("License", rawRecord.imageLicense);
    const pageUrl =
      typeof rawRecord.imagePageUrl === "string" ? rawRecord.imagePageUrl.trim() : "";
    if (pageUrl) {
      lines.push(`Image page: ${shortenUrlForDisplay(pageUrl, 72)}`);
    }
    const licenseUrl =
      typeof rawRecord.imageLicenseUrl === "string" ? rawRecord.imageLicenseUrl.trim() : "";
    if (licenseUrl) {
      lines.push(`License link: ${shortenUrlForDisplay(licenseUrl, 72)}`);
    }
    push("Search query", rawRecord.imageSearchQuery);
    push("Tags", rawRecord.imageTags);
    push("Confidence", rawRecord.imageConfidence);
    push("Reason", rawRecord.imageReason);
    push("Provider rank", rawRecord.imageSearchProviderRank);
  } else if (imageSource === "concept") {
    lines.push("Image source: LenguaRiver concept icon");
    push("Confidence", rawRecord.imageConfidence);
    push("Reason", rawRecord.imageReason);
  } else {
    push("Image source", rawRecord.imageSource);
  }
  push("Asset id", rawRecord.imageAssetId);
  push("Alt text", rawRecord.imageAlt);
  push("Updated", rawRecord.imageUpdatedAt);
  const imageUrl = typeof rawRecord.imageUrl === "string" ? rawRecord.imageUrl.trim() : "";
  if (
    imageUrl &&
    !imageUrl.startsWith("blob:") &&
    imageSource !== "wikimedia" &&
    imageSource !== "pexels" &&
    imageSource !== "pixabay" &&
    imageSource !== "concept"
  ) {
    lines.push(`URL: ${shortenUrlForDisplay(imageUrl, 72)}`);
  }
  return lines;
}

function buildEnrichmentMetadataLines(rawRecord: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const push = (label: string, value: unknown) => {
    if (typeof value === "string" && value.trim()) {
      lines.push(`${label}: ${value.trim()}`);
    }
  };
  push("Status", rawRecord.enrichmentStatus);
  push("Enriched at", rawRecord.enrichedAt);
  push("Translation source", rawRecord.translationSource);
  const definitionSource = resolveDefinitionSourceForDetails(
    typeof rawRecord.definitionSource === "string" ? rawRecord.definitionSource : undefined
  );
  if (definitionSource) {
    lines.push(`Definition source: ${definitionSource}`);
  }
  push("Explanation source", rawRecord.explanationSource);
  return lines;
}

export function WordCard({
  wildWord,
  rawRecord,
  extras,
  lexemeHints,
  languagePresentation,
  enrichmentPending,
  enrichmentError,
  canDelete,
  onDelete,
  onRefreshEnrichment,
  onUploadImage,
  onRemoveCustomImage,
}: WordCardProps) {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [thumbSrc, setThumbSrc] = useState<string | undefined>(undefined);
  const [imageUploadBusy, setImageUploadBusy] = useState(false);

  const imageRecordKey = [
    rawRecord.imageSource,
    rawRecord.imageAssetId,
    rawRecord.imageUrl,
    rawRecord.imageUpdatedAt,
  ].join("|");

  useEffect(() => {
    ensureTtsVoicesLoaded();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let revoke: (() => void) | undefined;

    void resolveWildWordImageUrl(rawRecord).then((resolved) => {
      if (cancelled) {
        resolved.revoke?.();
        return;
      }
      revoke = resolved.revoke;
      setThumbSrc(resolved.url);
    });

    return () => {
      cancelled = true;
      revoke?.();
    };
  }, [imageRecordKey, rawRecord]);

  const lang = languagePresentation ?? {
    displayCode: wildWord.language,
    speechCode: wildWord.language,
    note: null,
  };

  const translationMerged = cleanWildWordTextForDisplay(
    mergeText(wildWord.translation, lexemeHints?.translation)
  );
  const hasTranslation = Boolean(translationMerged?.trim());

  const audioContext: WildWordCardAudioContext = {
    wildWord,
    rawRecord,
    languagePresentation: lang,
    extras,
  };
  const translationErrorTechnical = enrichmentError?.trim() || null;
  const translationErrorUser = toUserFacingTranslationError(translationErrorTechnical);
  const detailsEnrichmentErrors = formatDetailsEnrichmentErrors(translationErrorTechnical, rawRecord);
  const imageMetadataLines = buildImageMetadataLines(rawRecord);
  const enrichmentMetadataLines = buildEnrichmentMetadataLines(rawRecord);

  const phoneticMerged = cleanWildWordTextForDisplay(mergeText(extras?.phonetic, lexemeHints?.phonetic));
  const definitionSourceRaw =
    extras?.definitionSource?.trim() ||
    (typeof rawRecord.definitionSource === "string" ? rawRecord.definitionSource.trim() : undefined);
  const definitionLanguage =
    extras?.definitionLanguage?.trim() ||
    (typeof rawRecord.definitionLanguage === "string" ? rawRecord.definitionLanguage.trim() : "") ||
    lang.displayCode;

  const definitionCard = resolveDefinitionLabeledCardDisplay(
    extras?.definition,
    definitionSourceRaw,
    definitionLanguage
  );
  const displayDefinition = definitionCard.realText;
  const definitionCardText = definitionCard.text;
  const definitionIsPlaceholder = definitionCard.isPlaceholder;
  const shortDefinition = definitionIsPlaceholder
    ? null
    : truncateText(definitionCardText, 140);
  const definitionTruncated = Boolean(
    displayDefinition && shortDefinition && displayDefinition !== shortDefinition
  );

  const explanationLanguage =
    extras?.explanationLanguage?.trim() ||
    (typeof rawRecord.explanationLanguage === "string" ? rawRecord.explanationLanguage.trim() : "") ||
    extras?.translationTargetLanguage?.trim() ||
    (typeof rawRecord.translationTargetLanguage === "string"
      ? rawRecord.translationTargetLanguage.trim()
      : "") ||
    undefined;

  const explanationCard = resolveExplanationCardDisplay(
    rawRecord,
    extras?.explanation,
    explanationLanguage
  );
  const displayExplanation = explanationCard.realText;
  const explanationIsPlaceholder = explanationCard.isPlaceholder;
  const shortExplanation = explanationIsPlaceholder
    ? null
    : truncateText(explanationCard.text, 140);
  const explanationTruncated = Boolean(
    displayExplanation && shortExplanation && displayExplanation !== shortExplanation
  );
  const hasCustomImage = hasUserWildWordImage(rawRecord);
  const refreshLabel =
    enrichmentPending
      ? "Refreshing…"
      : !hasTranslation || definitionIsPlaceholder || explanationIsPlaceholder
        ? "Enrich missing"
        : "Refresh enrichment";

  useEffect(() => {
    if (!isMyWordsDebugEnabled()) {
      return;
    }
    devLogMyWordsImagePipeline("WordCard.props-path", {
      wordText: wildWord.text,
      receivedExtrasImageUrl: extras?.imageUrl ?? null,
      resolvedThumbSrc: thumbSrc ?? null,
    });
  }, [extras?.imageUrl, thumbSrc, wildWord.text]);

  const sourcePrimary = buildPrimarySourceLine(wildWord, extras);
  const sourceRefId = wildWord.sourceItemId?.trim();
  const sourceHref = extras?.sourceUrl?.trim();

  const extraPronunciation =
    wildWord.pronunciation?.trim() && wildWord.pronunciation.trim() !== wildWord.text.trim()
      ? wildWord.pronunciation.trim()
      : null;

  const lessonContextExtra =
    lexemeHints?.context?.trim() && lexemeHints.context.trim() !== wildWord.contextSentence?.trim()
      ? lexemeHints.context.trim()
      : null;

  const contextRaw = wildWord.contextSentence?.trim() || null;
  const contextForCard = contextRaw
    ? cleanContextForDisplay(contextRaw, { savedWord: wildWord.text })
    : null;
  const contextFull = contextForCard?.full?.trim() || null;

  const translationDirection = extras?.translationTargetLanguage
    ? `${lang.displayCode} → ${extras.translationTargetLanguage}`
    : null;

  const hasDetails =
    Boolean(sourcePrimary) ||
    Boolean(sourceRefId) ||
    Boolean(sourceHref) ||
    Boolean(wildWord.lexemeKey) ||
    Boolean(translationDirection) ||
    Boolean(definitionLanguage) ||
    Boolean(explanationLanguage) ||
    Boolean(definitionTruncated) ||
    Boolean(explanationTruncated) ||
    definitionIsPlaceholder ||
    explanationIsPlaceholder ||
    Boolean(extras?.partOfSpeech?.trim()) ||
    Boolean(detailsEnrichmentErrors) ||
    Boolean(imageMetadataLines.length) ||
    Boolean(enrichmentMetadataLines.length) ||
    Boolean(onRefreshEnrichment) ||
    Boolean(onUploadImage) ||
    Boolean(extraPronunciation) ||
    Boolean(lessonContextExtra) ||
    Boolean(contextFull) ||
    Boolean(lang.note);

  return (
    <article className="lr-word-card card" aria-label={`Saved word: ${wildWord.text}`}>
      <div className="lr-word-card-layout">
        <div className="lr-word-card-main">
          <div className="lr-word-fields lr-word-fields--card">
            <div className="lr-word-field lr-word-field--word">
              <span className="lr-word-field-label">Word</span>
              <div className="lr-word-field-value-row">
                <button
                  type="button"
                  className="button lr-word-audio-btn"
                  onClick={() => playCardSourceAudio(audioContext)}
                  aria-label={`Play word: ${wildWord.text}`}
                  title={`Play word: ${wildWord.text}`}
                >
                  <span aria-hidden="true">▶</span>
                </button>
                <div className="lr-word-card-headline">
                  <span className="lr-word-field-value lr-word-card-text">{wildWord.text}</span>
                  <span className="lr-lang-pill lr-lang-pill--compact" title={`Language: ${lang.displayCode}`}>
                    {lang.displayCode}
                  </span>
                </div>
              </div>
              {phoneticMerged ? <span className="lr-word-card-phonetic muted">{phoneticMerged}</span> : null}
            </div>

            <div className="lr-word-field lr-word-field--translation">
              <span className="lr-word-field-label">Translation</span>
              <div className="lr-word-field-value-row">
                <button
                  type="button"
                  className="button lr-word-audio-btn"
                  disabled={!hasTranslation || enrichmentPending}
                  onClick={() => playCardTranslationAudio(audioContext, translationMerged!.trim())}
                  aria-label={
                    hasTranslation
                      ? `Play translation: ${translationMerged!.trim()}`
                      : "Play translation (unavailable)"
                  }
                  title={
                    hasTranslation
                      ? `Play translation: ${translationMerged!.trim()}`
                      : "Play translation (unavailable)"
                  }
                >
                  <span aria-hidden="true">▶</span>
                </button>
                <span
                  className={`lr-word-field-value lr-word-card-translation${hasTranslation || enrichmentPending ? "" : " muted lr-word-placeholder"}`}
                  role={!hasTranslation && translationErrorUser ? "status" : undefined}
                >
                  {enrichmentPending
                    ? hasTranslation
                      ? translationMerged!.trim()
                      : "Enriching…"
                    : hasTranslation
                      ? translationMerged!.trim()
                      : translationErrorUser ?? TRANSLATION_MISSING_PLACEHOLDER}
                </span>
              </div>
              {enrichmentPending ? (
                <p className="lr-word-enrich-pending muted" role="status" aria-live="polite">
                  Refreshing…
                </p>
              ) : null}
            </div>

            <div className="lr-word-field lr-word-field--definition">
              <span className="lr-word-field-label">{definitionCard.label}</span>
              <p
                className={`lr-word-field-value lr-word-def lr-word-def--card${definitionIsPlaceholder ? " muted lr-word-placeholder" : " muted"}`}
              >
                {definitionIsPlaceholder ? definitionCardText : shortDefinition}
              </p>
            </div>

            <div className="lr-word-field lr-word-field--explanation">
              <span className="lr-word-field-label">{explanationCard.label}</span>
              <p
                className={`lr-word-field-value lr-word-def lr-word-def--card${explanationIsPlaceholder ? " muted lr-word-placeholder" : " muted"}`}
              >
                {explanationIsPlaceholder ? explanationCard.text : shortExplanation}
              </p>
            </div>

            {contextForCard ? (
              <div className="lr-word-field lr-word-field--context">
                <span className="lr-word-field-label">Context</span>
                <blockquote className="lr-word-quote muted">
                  &ldquo;
                  {highlightSavedTextInContext(contextForCard.display, wildWord.text).map((segment, index) =>
                    segment.highlight ? (
                      <strong key={index} className="lr-context-hit">
                        {segment.text}
                      </strong>
                    ) : (
                      <span key={index}>{segment.text}</span>
                    )
                  )}
                  &rdquo;
                </blockquote>
              </div>
            ) : null}
          </div>

          <div className="lr-word-card-actions lr-word-card-actions--below">
            {canDelete ? (
              <button type="button" className="button lr-word-card-remove" onClick={onDelete} title="Remove card">
                Remove card
              </button>
            ) : null}
          </div>
        </div>

        <div className="lr-word-card-thumb">
          <div className="lr-word-thumb-frame">
            {thumbSrc ? (
              /* eslint-disable-next-line @next/next/no-img-element -- user blob URLs + lesson paths */
              <img
                src={thumbSrc}
                alt={typeof rawRecord.imageAlt === "string" ? rawRecord.imageAlt : wildWord.text}
                className="lr-word-thumb-img"
                loading="lazy"
                onLoad={() => {
                  if (isMyWordsDebugEnabled()) {
                    devLogMyWordsImagePipeline("WordCard.img-event", {
                      phase: "load",
                      renderedImgSrc: thumbSrc,
                      wordText: wildWord.text,
                    });
                  }
                }}
                onError={() => {
                  if (isMyWordsDebugEnabled()) {
                    devLogMyWordsImagePipeline("WordCard.img-event", {
                      phase: "error",
                      renderedImgSrc: thumbSrc,
                      wordText: wildWord.text,
                    });
                  }
                }}
              />
            ) : (
              <ThumbPlaceholderIcon />
            )}
          </div>
        </div>
      </div>

      {isMyWordsDebugEnabled() ? (
        <p className="muted lr-word-img-dev-debug lr-word-debug-image-url-caption">
          Image URL: {thumbSrc || "none"}
        </p>
      ) : null}

      {hasDetails ? (
        <details className="lr-word-card-details">
          <summary className="lr-word-details-sum">Details</summary>
          <div className="lr-word-details-body">
            {onRefreshEnrichment ? (
              <p className="lr-word-details-line">
                <button
                  type="button"
                  className="button lr-word-card-refresh"
                  disabled={enrichmentPending}
                  onClick={onRefreshEnrichment}
                  title={refreshLabel}
                >
                  {refreshLabel}
                </button>
              </p>
            ) : null}

            {onUploadImage ? (
              <div className="lr-word-details-line lr-word-image-upload">
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/*"
                  className="lr-word-image-upload-input"
                  aria-hidden="true"
                  tabIndex={-1}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) {
                      return;
                    }
                    setImageUploadBusy(true);
                    void Promise.resolve(onUploadImage(file)).finally(() => {
                      setImageUploadBusy(false);
                    });
                  }}
                />
                <button
                  type="button"
                  className="button lr-word-card-upload"
                  disabled={imageUploadBusy || enrichmentPending}
                  onClick={() => uploadInputRef.current?.click()}
                  title="Upload image"
                >
                  {imageUploadBusy ? "Uploading…" : "Upload image"}
                </button>
                {hasCustomImage && onRemoveCustomImage ? (
                  <button
                    type="button"
                    className="button lr-word-card-remove-image"
                    disabled={imageUploadBusy || enrichmentPending}
                    onClick={() => {
                      setImageUploadBusy(true);
                      void Promise.resolve(onRemoveCustomImage()).finally(() => {
                        setImageUploadBusy(false);
                      });
                    }}
                    title="Remove image"
                  >
                    Remove image
                  </button>
                ) : null}
              </div>
            ) : null}

            {detailsEnrichmentErrors ? (
              <div className="lr-word-details-block">
                <div className="lr-word-details-k">Enrichment</div>
                <pre className="lr-word-details-pre muted">{detailsEnrichmentErrors}</pre>
              </div>
            ) : null}

            {imageMetadataLines.length > 0 ? (
              <div className="lr-word-details-block">
                <div className="lr-word-details-k">Image</div>
                {imageMetadataLines.map((line) => (
                  <p key={line} className="lr-word-details-line muted">
                    {line}
                  </p>
                ))}
              </div>
            ) : null}

            {enrichmentMetadataLines.length > 0 ? (
              <div className="lr-word-details-block">
                <div className="lr-word-details-k">Enrichment data</div>
                {enrichmentMetadataLines.map((line) => (
                  <p key={line} className="lr-word-details-line muted">
                    {line}
                  </p>
                ))}
              </div>
            ) : null}

            {lang.note ? <p className="lr-word-details-line muted">{lang.note}</p> : null}

            {sourcePrimary || sourceRefId || sourceHref ? (
              <div className="lr-word-details-block">
                <div className="lr-word-details-k">Source</div>
                {sourcePrimary ? <p className="lr-word-details-line">{sourcePrimary}</p> : null}
                {wildWord.savedAt?.trim() ? (
                  <p className="lr-word-details-line muted">Saved: {wildWord.savedAt.trim()}</p>
                ) : null}
                {sourceRefId ? (
                  <p className="lr-word-details-line muted lr-word-src-id">
                    Ref <code className="lr-word-card-code">{sourceRefId}</code>
                  </p>
                ) : null}
                {sourceHref ? (
                  <p className="lr-word-details-line">
                    <a className="lr-word-details-link" href={sourceHref} target="_blank" rel="noopener noreferrer">
                      {shortenUrlForDisplay(sourceHref, 72)}
                    </a>
                  </p>
                ) : null}
              </div>
            ) : null}

            {wildWord.lexemeKey ? (
              <p className="lr-word-details-line muted lr-word-card-meta">
                Lexeme{" "}
                <code className="lr-word-card-code" title={wildWord.lexemeKey}>
                  {shorten(wildWord.lexemeKey, 48)}
                </code>
              </p>
            ) : null}

            {translationDirection ? (
              <p className="lr-word-details-line muted">Translation direction: {translationDirection}</p>
            ) : null}

            {definitionLanguage ? (
              <p className="lr-word-details-line muted">Definition language: {definitionLanguage}</p>
            ) : null}

            {explanationLanguage ? (
              <p className="lr-word-details-line muted">Explanation language: {explanationLanguage}</p>
            ) : null}

            {extras?.partOfSpeech?.trim() ? (
              <p className="lr-word-details-line muted">Part of speech: {extras.partOfSpeech.trim()}</p>
            ) : null}

            {extraPronunciation ? <p className="lr-word-card-phonetic muted">{extraPronunciation}</p> : null}

            {displayDefinition && definitionTruncated ? (
              <div className="lr-word-details-block">
                <div className="lr-word-details-k">{definitionCard.label}</div>
                <p className="lr-word-def muted">{displayDefinition}</p>
              </div>
            ) : null}

            {displayExplanation && explanationTruncated ? (
              <div className="lr-word-details-block">
                <div className="lr-word-details-k">{explanationCard.label}</div>
                <p className="lr-word-def muted">{displayExplanation}</p>
              </div>
            ) : null}

            {definitionIsPlaceholder ? (
              <p className="lr-word-details-line muted">{WILD_WORD_DEFINITION_DETAILS_UNAVAILABLE}</p>
            ) : null}

            {explanationCard.encodingIssueInDetails ? (
              <p className="lr-word-details-line muted">{WILD_WORD_EXPLANATION_ENCODING_DETAILS}</p>
            ) : null}

            {lessonContextExtra ? <p className="lr-word-lesson muted">Lesson example: {lessonContextExtra}</p> : null}

            {contextFull ? (
              <div className="lr-word-details-block">
                <div className="lr-word-details-k">Full context</div>
                <blockquote className="lr-word-quote muted">&ldquo;{contextFull}&rdquo;</blockquote>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </article>
  );
}

function ThumbPlaceholderIcon() {
  return (
    <div className="lr-word-thumb-placeholder">
      <svg width="22" height="22" viewBox="0 0 24 24" className="lr-word-thumb-svg" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="1.25" />
        <path
          d="M8 17l4-6 5 9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="16" cy="9" r="1.85" fill="currentColor" />
      </svg>
    </div>
  );
}

function truncateText(value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxChars).trim()}…`;
}

function shortenUrlForDisplay(rawUrl: string, maxChars: number): string {
  const s = rawUrl.trim();
  if (!s.length) {
    return s;
  }
  try {
    const u = new URL(s);
    const path = `${u.pathname}${u.search}`.replace(/\/+$/, "");
    let out = `${u.hostname}${path && path !== "/" ? path : ""}`;
    out = out.length > maxChars ? `${out.slice(0, maxChars)}…` : out;
    return out;
  } catch {
    return s.length > maxChars ? `${s.slice(0, maxChars)}…` : s;
  }
}

function buildPrimarySourceLine(wildWord: UserWildWord, extras?: WildWordDisplayExtras | null): string | null {
  const titled = mergeSource(wildWord.sourceTitle, extras?.sourceDomain?.trim());
  if (titled) {
    return titled;
  }
  const u = extras?.sourceUrl?.trim();
  if (u) {
    return shortenUrlForDisplay(u, 80);
  }
  return null;
}

function mergeSource(title: string, domain?: string): string | null {
  const t = title?.trim();
  const d = domain?.trim();
  if (t && d && t !== d) {
    return `${t} · ${d}`;
  }
  return t || d || null;
}

function mergeText(primary?: string, secondary?: string): string | undefined {
  const a = primary?.trim();
  if (a) {
    return a;
  }
  const b = secondary?.trim();
  return b || undefined;
}

function shorten(s: string, max: number): string {
  if (s.length <= max) {
    return s;
  }
  return `${s.slice(0, max)}…`;
}
