/** Opt-in server-side logging for Argos translation routes (never logs in production). */

export function isTranslateDebugEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" && process.env.LR_DEBUG_TRANSLATE === "true"
  );
}

export function translateDebug(event: string, data: Record<string, unknown>): void {
  if (!isTranslateDebugEnabled()) {
    return;
  }
  console.info("[translate]", event, data);
}

/** Env vars passed to Python subprocess when debug is on. */
export function translateDebugEnv(): NodeJS.ProcessEnv {
  if (!isTranslateDebugEnabled()) {
    return process.env;
  }
  return { ...process.env, ARGOS_TRANSLATE_DEBUG: "1" };
}
