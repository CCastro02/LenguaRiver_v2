import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LEIPZIG_SOURCE_CONFIG } from "./source-config";
import type { NormalizedVocabularyEntry, RawFrequencyEntry, SourceName, SupportedLanguage } from "./types";

type ImportOptions = {
  language: SupportedLanguage;
  source?: SourceName;
  sourceUrl?: string;
  delimiter?: "\t" | "," | ";";
};

type ValidationResult = {
  rows: RawFrequencyEntry[];
  warnings: string[];
};

export type RemoteFetchOptions = {
  language: SupportedLanguage;
  /** Requested rows; clamped to `LEIPZIG_SOURCE_CONFIG.maxBatchSize`. */
  maxEntries: number;
  /** Optional filter / topic passed to the remote endpoint as `q`. */
  topic?: string;
  source?: SourceName;
  /** If set, used instead of building URL from `LEIPZIG_SOURCE_CONFIG` (tests / custom mirrors). */
  overrideFetchUrl?: string;
  delimiter?: "\t" | "," | ";";
};

export type RemoteFetchResult = {
  raw: RawFrequencyEntry[];
  warnings: string[];
  /** Resolved URL (without secrets). */
  requestUrl: string;
  ok: boolean;
  statusMessage?: string;
};

export type LeipzigImportRequest =
  | { mode: "local"; filePath: string; options: ImportOptions }
  | { mode: "remote"; options: RemoteFetchOptions };

export type LeipzigImportResult = {
  normalized: NormalizedVocabularyEntry[];
  raw: RawFrequencyEntry[];
  warnings: string[];
  fromCache: boolean;
};

type NormalizedCachePayload = {
  version: 1;
  normalized: NormalizedVocabularyEntry[];
  warnings: string[];
  cachedAt: string;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, "cache");
const CACHE_VERSION = 1 as const;

function inferDelimiter(contents: string): "\t" | "," | ";" {
  if (contents.includes("\t")) {
    return "\t";
  }
  if (contents.includes(";")) {
    return ";";
  }
  return ",";
}

function parseNumber(value: string): number {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function stripHeader(lines: string[]): string[] {
  if (lines.length === 0) {
    return [];
  }
  const first = lines[0].toLowerCase();
  if (first.includes("rank") || first.includes("baseform") || first.includes("word")) {
    return lines.slice(1);
  }
  return lines;
}

/** Single source of truth for remote batch size limits and user-facing warnings. */
export function resolveRemoteEntryLimit(requested: number): { limit: number; warnings: string[] } {
  const warnings: string[] = [];
  const cap = LEIPZIG_SOURCE_CONFIG.maxBatchSize;
  if (!Number.isFinite(requested) || requested <= 0) {
    warnings.push(`Invalid maxEntries (${requested}); using 1.`);
    return { limit: 1, warnings };
  }
  const rounded = Math.floor(requested);
  if (rounded > cap) {
    warnings.push(`maxEntries ${rounded} exceeds configured maxBatchSize (${cap}); clamping to ${cap}.`);
    return { limit: cap, warnings };
  }
  return { limit: rounded, warnings };
}

function limitContentToBatchLines(contents: string, maxDataRows: number): string {
  const lines = contents.split(/\r?\n/);
  const headroom = 5;
  return lines.slice(0, maxDataRows + headroom).join("\n");
}

function cacheKeyParts(options: RemoteFetchOptions, effectiveLimit: number): string {
  const base = options.overrideFetchUrl ?? `${LEIPZIG_SOURCE_CONFIG.baseUrl}${LEIPZIG_SOURCE_CONFIG.remoteFrequencyPath}`;
  return [
    CACHE_VERSION,
    base,
    options.language,
    String(effectiveLimit),
    options.topic?.trim() ?? "",
    options.delimiter ?? "",
    options.source ?? LEIPZIG_SOURCE_CONFIG.sourceName,
  ].join("|");
}

function normalizedCachePath(options: RemoteFetchOptions, effectiveLimit: number): string {
  const hash = createHash("sha256").update(cacheKeyParts(options, effectiveLimit)).digest("hex").slice(0, 20);
  return join(CACHE_DIR, `norm-${hash}.json`);
}

async function readNormalizedCache(path: string): Promise<NormalizedCachePayload | null> {
  try {
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw) as NormalizedCachePayload;
    if (parsed?.version !== 1 || !Array.isArray(parsed.normalized)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeNormalizedCache(
  path: string,
  normalized: NormalizedVocabularyEntry[],
  warnings: string[]
): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const payload: NormalizedCachePayload = {
    version: 1,
    normalized,
    warnings,
    cachedAt: new Date().toISOString(),
  };
  await writeFile(path, JSON.stringify(payload, null, 2), "utf-8");
}

function buildRemoteFetchUrl(language: SupportedLanguage, maxEntries: number, topic?: string): string {
  const u = new URL(LEIPZIG_SOURCE_CONFIG.remoteFrequencyPath, LEIPZIG_SOURCE_CONFIG.baseUrl);
  u.searchParams.set("lang", language);
  u.searchParams.set("limit", String(maxEntries));
  const corp = LEIPZIG_SOURCE_CONFIG.corpusDatasetIdByLanguage[language];
  if (corp) {
    u.searchParams.set("corp", corp);
  }
  const q = topic?.trim();
  if (q) {
    u.searchParams.set("q", q);
  }
  return u.toString();
}

/**
 * Parse in-memory frequency TSV/CSV (same shape as local files).
 * When `maxDataRows` is set, only that many logical data rows are produced after the header strip.
 */
export function parseFrequencyText(contents: string, options: ImportOptions & { maxDataRows?: number }): RawFrequencyEntry[] {
  const trimmed = contents.trim();
  if (!trimmed) {
    return [];
  }
  const delimiter = options.delimiter ?? inferDelimiter(trimmed);
  let lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  lines = stripHeader(lines);
  if (options.maxDataRows !== undefined) {
    lines = lines.slice(0, options.maxDataRows);
  }
  const source: SourceName = options.source ?? "leipzig";

  return lines.map((line, index) => {
    const cols = line.split(delimiter).map((col) => col.trim());
    const rank = parseNumber(cols[0] ?? "");
    const baseForm = cols[1] ?? "";
    const rawFrequency = parseNumber(cols[2] ?? "");
    const translation = cols[3] || undefined;
    const partOfSpeech = cols[4] || undefined;

    return {
      language: options.language,
      baseForm,
      frequencyRank: rank || index + 1,
      rawFrequency,
      translation,
      partOfSpeech,
      source,
      sourceUrl: options.sourceUrl ?? LEIPZIG_SOURCE_CONFIG.baseUrl,
    };
  });
}

export function parseLocalFrequencyFile(filePath: string, options: ImportOptions): RawFrequencyEntry[] {
  const resolvedPath = resolve(filePath);
  const contents = readFileSync(resolvedPath, "utf-8");
  return parseFrequencyText(contents, options);
}

export function validateRawEntries(entries: RawFrequencyEntry[]): ValidationResult {
  const warnings: string[] = [];
  const rows: RawFrequencyEntry[] = [];
  const seenByBaseForm = new Set<string>();

  entries.forEach((entry, index) => {
    const rowLabel = `row ${index + 1}`;
    if (!entry.language) {
      warnings.push(`${rowLabel}: missing language`);
      return;
    }
    if (!entry.baseForm || entry.baseForm.trim().length === 0) {
      warnings.push(`${rowLabel}: missing baseForm`);
      return;
    }
    if (!entry.frequencyRank || entry.frequencyRank <= 0) {
      warnings.push(`${rowLabel}: missing frequencyRank`);
      return;
    }
    if (!entry.source) {
      warnings.push(`${rowLabel}: missing source`);
      return;
    }

    const key = `${entry.language}::${entry.baseForm.toLowerCase().trim()}`;
    if (seenByBaseForm.has(key)) {
      warnings.push(`${rowLabel}: duplicate baseForm dropped (${entry.baseForm})`);
      return;
    }
    seenByBaseForm.add(key);
    rows.push({
      ...entry,
      baseForm: entry.baseForm.trim().toLowerCase(),
    });
  });

  return { rows, warnings };
}

export function normalizeVocabularyEntries(rawEntries: RawFrequencyEntry[]): {
  entries: NormalizedVocabularyEntry[];
  warnings: string[];
} {
  const { rows, warnings } = validateRawEntries(rawEntries);
  const entries: NormalizedVocabularyEntry[] = rows
    .slice()
    .sort((a, b) => a.frequencyRank - b.frequencyRank)
    .map((row) => ({
      language: row.language,
      baseForm: row.baseForm,
      frequencyRank: row.frequencyRank,
      rawFrequency: row.rawFrequency,
      translation: row.translation,
      partOfSpeech: row.partOfSpeech,
      source: row.source,
      sourceUrl: row.sourceUrl,
    }));
  return { entries, warnings };
}

/**
 * Internal fetch using a pre-resolved row limit (see `resolveRemoteEntryLimit`).
 * Does not persist raw HTTP bodies.
 */
async function executeRemoteFrequencyFetch(options: RemoteFetchOptions, limit: number): Promise<RemoteFetchResult> {
  const warnings: string[] = [];
  const requestUrl = options.overrideFetchUrl ?? buildRemoteFetchUrl(options.language, limit, options.topic);
  const importOpts: ImportOptions = {
    language: options.language,
    source: options.source ?? LEIPZIG_SOURCE_CONFIG.sourceName,
    sourceUrl: options.overrideFetchUrl ? options.overrideFetchUrl : LEIPZIG_SOURCE_CONFIG.baseUrl,
    delimiter: options.delimiter,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LEIPZIG_SOURCE_CONFIG.fetchTimeoutMs);

  try {
    const response = await fetch(requestUrl, {
      signal: controller.signal,
      headers: {
        Accept: "text/plain,text/tab-separated-values,text/csv,application/json;q=0.1,*/*;q=0.05",
      },
    });
    clearTimeout(timer);

    if (!response.ok) {
      warnings.push(`Remote frequency request failed (${response.status} ${response.statusText}). No entries imported.`);
      return { raw: [], warnings, requestUrl, ok: false, statusMessage: `${response.status} ${response.statusText}` };
    }

    const buf = await response.arrayBuffer();
    const byteLength = buf.byteLength;
    if (byteLength > LEIPZIG_SOURCE_CONFIG.maxResponseBytes) {
      warnings.push(
        `Remote response is large (${byteLength} bytes, soft limit ${LEIPZIG_SOURCE_CONFIG.maxResponseBytes}); only the first ${limit} candidate lines will be parsed.`
      );
    }

    const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    const safeText = limitContentToBatchLines(text, limit);
    const raw = parseFrequencyText(safeText, { ...importOpts, maxDataRows: limit });

    if (raw.length === 0 && byteLength > 0) {
      warnings.push(
        "Remote body was received but no frequency rows matched the expected rank/baseForm/frequency TSV or CSV shape."
      );
    }

    return { raw, warnings, requestUrl, ok: true };
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`Remote frequency fetch unavailable: ${message}. No entries imported.`);
    const requestUrl = options.overrideFetchUrl ?? buildRemoteFetchUrl(options.language, limit, options.topic);
    return { raw: [], warnings, requestUrl, ok: false, statusMessage: message };
  }
}

/**
 * Fetch a small frequency batch from the configured remote URL (or `overrideFetchUrl`).
 * Does not persist raw HTTP bodies; callers should run `normalizeVocabularyEntries` and optional disk cache.
 */
export async function fetchRemoteFrequencyBatch(options: RemoteFetchOptions): Promise<RemoteFetchResult> {
  const { limit, warnings: limitWarnings } = resolveRemoteEntryLimit(options.maxEntries);
  const result = await executeRemoteFrequencyFetch({ ...options, maxEntries: limit }, limit);
  return { ...result, warnings: [...limitWarnings, ...result.warnings] };
}

/**
 * Local file import or remote batch import with optional normalized JSON cache (remote only).
 * Downstream: `normalizeVocabularyEntries` output matches the existing chunk → sentence → lesson pipeline.
 */
export async function importLeipzigVocabulary(request: LeipzigImportRequest): Promise<LeipzigImportResult> {
  if (request.mode === "local") {
    const raw = parseLocalFrequencyFile(request.filePath, request.options);
    const { entries, warnings } = normalizeVocabularyEntries(raw);
    return { raw, normalized: entries, warnings, fromCache: false };
  }

  const remoteOpts = request.options;
  const { limit, warnings: limitWarnings } = resolveRemoteEntryLimit(remoteOpts.maxEntries);
  const allWarnings: string[] = [...limitWarnings];

  const useCache = LEIPZIG_SOURCE_CONFIG.cacheEnabled;
  const cachePath = normalizedCachePath(remoteOpts, limit);

  if (useCache) {
    const cached = await readNormalizedCache(cachePath);
    if (cached) {
      return {
        normalized: cached.normalized,
        raw: [],
        warnings: [
          ...allWarnings,
          ...cached.warnings,
          "Returned normalized entries from local cache (no raw replay).",
        ],
        fromCache: true,
      };
    }
  }

  const fetchResult = await executeRemoteFrequencyFetch({ ...remoteOpts, maxEntries: limit }, limit);
  allWarnings.push(...fetchResult.warnings);

  const { entries, warnings: normWarnings } = normalizeVocabularyEntries(fetchResult.raw);
  allWarnings.push(...normWarnings);

  if (useCache && fetchResult.ok && entries.length > 0) {
    try {
      await writeNormalizedCache(cachePath, entries, allWarnings);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      allWarnings.push(`Could not write normalized cache: ${message}`);
    }
  }

  return {
    normalized: entries,
    raw: fetchResult.raw,
    warnings: allWarnings,
    fromCache: false,
  };
}
