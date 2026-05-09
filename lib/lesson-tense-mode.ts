/**
 * Tense continuation authoring model (Phase A).
 * Runtime UX and evaluators are not wired yet.
 */

export type TenseMode = "present" | "past-retell" | "future-plan" | "mixed";

export const DEFAULT_TENSE_MODE: TenseMode = "present";

const TENSE_MODES = new Set<TenseMode>(["present", "past-retell", "future-plan", "mixed"]);

export function isTenseMode(value: string | undefined): value is TenseMode {
  return value !== undefined && TENSE_MODES.has(value as TenseMode);
}

export function normalizeTenseMode(value: string | undefined): TenseMode {
  if (value && TENSE_MODES.has(value as TenseMode)) {
    return value as TenseMode;
  }
  return DEFAULT_TENSE_MODE;
}

export function isContinuationTenseMode(tenseMode: TenseMode): boolean {
  return tenseMode !== "present";
}
