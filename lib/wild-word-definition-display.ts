/**
 * My Words card definition / explanation display contract (UI only).
 */

import {
  cleanWildWordTextForDisplay,
  WILD_WORD_TEXT_ENCODING_FALLBACK,
} from "@/lib/fix-common-mojibake";
import { hasRealDefinition, resolveDisplayDefinition } from "@/lib/wild-word-enrichment";
import { getLanguageDisplayName } from "@/lib/language-display-name";

/** Main card placeholder when no real definition is stored. */
export const WILD_WORD_DEFINITION_NOT_ADDED = "Not added yet";

/** Details note when dictionary/corpus enrichment has not produced a definition. */
export const WILD_WORD_DEFINITION_DETAILS_UNAVAILABLE =
  "No dictionary definition available yet.";

/** Details note when explanation text could not be repaired for display. */
export const WILD_WORD_EXPLANATION_ENCODING_DETAILS =
  "Explanation unavailable due to text encoding issue.";

export type DefinitionCardDisplay = {
  /** Text shown in the Definition row on the card. */
  text: string;
  /** True when showing the placeholder instead of a real definition. */
  isPlaceholder: boolean;
  /** Real definition for Details truncation, or null. */
  realDefinition: string | null;
};

export function resolveDefinitionCardDisplay(
  definition: string | undefined,
  definitionSource?: string
): DefinitionCardDisplay {
  const realDefinition = resolveDisplayDefinition(definition, definitionSource);
  if (realDefinition) {
    return { text: realDefinition, isPlaceholder: false, realDefinition };
  }
  return {
    text: WILD_WORD_DEFINITION_NOT_ADDED,
    isPlaceholder: true,
    realDefinition: null,
  };
}

/** Definition source for Details; hides legacy translation-fallback. */
export function resolveDefinitionSourceForDetails(definitionSource?: string): string | null {
  const source = definitionSource?.trim();
  if (!source || source === "translation-fallback") {
    return null;
  }
  return source;
}

export type LabeledFieldDisplay = {
  label: string;
  text: string;
  isPlaceholder: boolean;
  realText: string | null;
};

export function formatDefinitionFieldLabel(languageCode: string | undefined): string {
  const lang = languageCode?.trim();
  return lang ? `Definition (${getLanguageDisplayName(lang)})` : "Definition";
}

export function formatExplanationFieldLabel(languageCode: string | undefined): string {
  const lang = languageCode?.trim();
  return lang ? `Explanation (${getLanguageDisplayName(lang)})` : "Explanation";
}

/** True when stored explanation still has unrepaired encoding damage. */
export function explanationHasEncodingIssue(explanation: string | undefined): boolean {
  const text = explanation?.trim();
  if (!text) {
    return false;
  }
  const cleaned = cleanWildWordTextForDisplay(text);
  return cleaned === WILD_WORD_TEXT_ENCODING_FALLBACK;
}

/** Explanation text for UI; hidden when there is no real definition (orphan cleanup on refresh). */
export function resolveDisplayExplanation(
  rawRecord: Record<string, unknown>,
  explanation: string | undefined
): string | null {
  if (!hasRealDefinition(rawRecord)) {
    return null;
  }
  const text = explanation?.trim();
  if (!text) {
    return null;
  }
  const cleaned = cleanWildWordTextForDisplay(text);
  if (!cleaned || cleaned === WILD_WORD_TEXT_ENCODING_FALLBACK) {
    return null;
  }
  return cleaned;
}

export function resolveExplanationCardDisplay(
  rawRecord: Record<string, unknown>,
  explanation: string | undefined,
  explanationLanguage?: string
): LabeledFieldDisplay & { encodingIssueInDetails?: boolean } {
  const label = formatExplanationFieldLabel(explanationLanguage);
  const realText = resolveDisplayExplanation(rawRecord, explanation);
  if (realText) {
    return { label, text: realText, isPlaceholder: false, realText };
  }
  const encodingIssue = explanationHasEncodingIssue(explanation);
  return {
    label,
    text: WILD_WORD_DEFINITION_NOT_ADDED,
    isPlaceholder: true,
    realText: null,
    encodingIssueInDetails: encodingIssue,
  };
}

export function resolveDefinitionLabeledCardDisplay(
  definition: string | undefined,
  definitionSource: string | undefined,
  definitionLanguage?: string
): LabeledFieldDisplay {
  const card = resolveDefinitionCardDisplay(definition, definitionSource);
  return {
    label: formatDefinitionFieldLabel(definitionLanguage),
    text: card.text,
    isPlaceholder: card.isPlaceholder,
    realText: card.realDefinition,
  };
}
