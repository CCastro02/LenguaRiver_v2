/**
 * Opt-in debug flags for My Words (client + shared modules).
 * Set in `.env.local`: `NEXT_PUBLIC_LR_DEBUG_MY_WORDS=true`
 */

export function isMyWordsDebugEnabled(): boolean {
  return process.env.NEXT_PUBLIC_LR_DEBUG_MY_WORDS === "true";
}
