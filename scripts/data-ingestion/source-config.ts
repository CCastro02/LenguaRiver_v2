import type { SupportedLanguage } from "./types";

/**
 * Leipzig / Wortschatz ingestion defaults.
 * Replace `baseUrl` and `remoteFrequencyPath` when wiring a real batch endpoint
 * (e.g. corpora API or a small hosted TSV slice). The importer never requests full corpora.
 */
export const LEIPZIG_SOURCE_CONFIG = {
  sourceName: "leipzig" as const,
  /** Base origin for remote batch requests (placeholder until a stable URL is configured). */
  baseUrl: "https://wortschatz.uni-leipzig.de",
  /**
   * Path appended to `baseUrl` for remote frequency batches.
   * Query params `lang`, `limit`, and optional `q` (topic) are appended by the importer.
   */
  remoteFrequencyPath: "/downloads/example-frequency-batch.tsv",
  /** Hard cap per remote request (clamped against caller `maxEntries`). */
  maxBatchSize: 200,
  /** Persist only normalized vocabulary JSON under `scripts/data-ingestion/cache/`. */
  cacheEnabled: true,
  /** Warn when the raw HTTP body exceeds this size (bytes); body may still be partially parsed. */
  maxResponseBytes: 384_000,
  fetchTimeoutMs: 20_000,
  /** Optional corpus or dataset id sent as `corp` when non-empty. */
  corpusDatasetIdByLanguage: {
    es: "spa_news_2011_1M-freq",
    ru: "rus_news_2011_1M-freq",
  } satisfies Record<SupportedLanguage, string>,
} as const;

export type LeipzigSourceConfig = typeof LEIPZIG_SOURCE_CONFIG;
