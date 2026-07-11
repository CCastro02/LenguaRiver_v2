export type InlineBlankParts = {
  prefix: string;
  suffix: string;
  hasBlank: boolean;
};

/**
 * Splits a fill-in prompt (with `____`) into prefix/suffix for inline input rendering.
 * Falls back to full prompt as prefix when no blank marker is present.
 */
export function buildInlineBlankParts(prompt: string): InlineBlankParts {
  const blankIndex = prompt.indexOf("____");
  if (blankIndex === -1) {
    return {
      prefix: prompt,
      suffix: "",
      hasBlank: false,
    };
  }
  return {
    prefix: prompt.slice(0, blankIndex),
    suffix: prompt.slice(blankIndex + 4),
    hasBlank: true,
  };
}
