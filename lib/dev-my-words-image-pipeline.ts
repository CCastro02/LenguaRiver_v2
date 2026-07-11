import { isMyWordsDebugEnabled } from "@/lib/debug-flags";

export function devLogMyWordsImagePipeline(scope: string, payload: Record<string, unknown>): void {
  if (!isMyWordsDebugEnabled()) {
    return;
  }
  console.info(`[LR][my-words img pipeline][${scope}]`, payload);
}
