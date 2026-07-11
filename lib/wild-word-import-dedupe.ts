/**
 * Semantic dedupe + merge for My Words import and local row cleanup.
 * Multiple keys per row so legacy/generated-id variations collapse to one card.
 */

/** Aligns with extension `normalizeDedupeText` (whitespace collapse + trim + lower case). */
export function normalizeWildWordImportText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

const USER_IMAGE_KEYS = [
  "imageSource",
  "imageAssetId",
  "imageAlt",
  "imageUpdatedAt",
  "imageUrl",
] as const;

const ENRICHMENT_KEYS = [
  "translation",
  "definition",
  "imageUrl",
  "phonetic",
  "partOfSpeech",
  "enrichmentStatus",
  "enrichedAt",
  "enrichmentVersion",
  "translationSource",
  "definitionSource",
  "imageSource",
  "wiktionaryLookupWord",
] as const;

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isNonempty(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim() !== "";
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return Object.keys(value as object).length > 0;
  }
  return true;
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/** Canonical page URL for dedupe (host lowercased, trailing slash + hash trimmed). */
export function canonicalWildWordSourceUrl(row: Record<string, unknown>): string {
  const sourceUrl = trimString(row.sourceUrl);
  const sourceItemId = trimString(row.sourceItemId);
  const raw = sourceUrl || (looksLikeUrl(sourceItemId) ? sourceItemId : "");
  if (!raw) {
    return "";
  }
  try {
    const url = new URL(raw);
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    let path = url.pathname;
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    url.pathname = path;
    return url.href;
  } catch {
    return raw.replace(/#.*$/, "").replace(/\/+$/, "");
  }
}

function rowLanguage(row: Record<string, unknown>): string {
  return trimString(row.language);
}

function rowNormText(row: Record<string, unknown>): string {
  const text = typeof row.text === "string" ? row.text : "";
  return normalizeWildWordImportText(text);
}

/** All semantic dedupe keys for a row (priority order: A → E). */
export function wildWordSemanticDedupeKeys(row: Record<string, unknown>): string[] {
  const keys: string[] = [];
  const clientId = trimString(row.clientGeneratedId);
  if (clientId) {
    keys.push(`cid::${clientId}`);
  }

  const lex = trimString(row.lexemeKey);
  const canonUrl = canonicalWildWordSourceUrl(row);
  if (lex) {
    if (canonUrl) {
      keys.push(`lexurl::${lex}|${canonUrl}`);
    }
    keys.push(`lex::${lex}`);
  }

  const lang = rowLanguage(row);
  const norm = rowNormText(row);
  if (lang && norm) {
    if (canonUrl) {
      keys.push(`txturl::${lang}|${norm}|${canonUrl}`);
    }
    const item = trimString(row.sourceItemId);
    if (item) {
      keys.push(`txtitem::${lang}|${norm}|${item}`);
    }
    keys.push(`txt::${lang}|${norm}`);
  }

  return keys;
}

/** Primary key (highest-priority semantic key) for backward-compatible callers. */
export function wildWordImportDedupeKey(row: Record<string, unknown>): string {
  const keys = wildWordSemanticDedupeKeys(row);
  if (keys.length > 0) {
    return keys[0]!;
  }
  return `fb::${rowLanguage(row)}|${rowNormText(row)}`;
}

export function wildWordRowHasUserImage(row: Record<string, unknown>): boolean {
  return trimString(row.imageSource) === "user" && trimString(row.imageAssetId) !== "";
}

function enrichmentScore(row: Record<string, unknown>): number {
  let score = 0;
  for (const key of ENRICHMENT_KEYS) {
    if (key === "imageUrl" && wildWordRowHasUserImage(row)) {
      continue;
    }
    if (isNonempty(row[key])) {
      score += 1;
    }
  }
  return score;
}

function rowTimestamp(row: Record<string, unknown>): number {
  for (const key of ["updatedAt", "enrichedAt", "savedAt"]) {
    const raw = row[key];
    if (typeof raw === "string") {
      const t = Date.parse(raw);
      if (!Number.isNaN(t)) {
        return t;
      }
    }
  }
  return 0;
}

/** Negative if `a` is preferred over `b`. */
export function compareWildWordRowQuality(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): number {
  const userA = wildWordRowHasUserImage(a) ? 1 : 0;
  const userB = wildWordRowHasUserImage(b) ? 1 : 0;
  if (userA !== userB) {
    return userB - userA;
  }
  const enrichA = enrichmentScore(a);
  const enrichB = enrichmentScore(b);
  if (enrichA !== enrichB) {
    return enrichB - enrichA;
  }
  const timeA = rowTimestamp(a);
  const timeB = rowTimestamp(b);
  if (timeA !== timeB) {
    return timeB - timeA;
  }
  const idA = trimString(a.id);
  const idB = trimString(b.id);
  return idA.localeCompare(idB);
}

function isEnrichmentField(key: string): boolean {
  return (ENRICHMENT_KEYS as readonly string[]).includes(key);
}

/**
 * Fill missing fields on `existing` from `incoming`. Never replaces nonempty values or user images.
 * Returns whether any field changed.
 */
export function mergeWildWordImportIntoExisting(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>
): { row: Record<string, unknown>; changed: boolean } {
  const out: Record<string, unknown> = { ...existing };
  let changed = false;
  const preserveUserImage = wildWordRowHasUserImage(existing);

  for (const [key, value] of Object.entries(incoming)) {
    if (key === "id") {
      continue;
    }
    if (preserveUserImage && (USER_IMAGE_KEYS as readonly string[]).includes(key as (typeof USER_IMAGE_KEYS)[number])) {
      continue;
    }
    if (!isNonempty(value)) {
      continue;
    }
    if (isEnrichmentField(key) && isNonempty(existing[key]) && !isNonempty(value)) {
      continue;
    }
    if (isNonempty(existing[key])) {
      continue;
    }
    if (out[key] !== value) {
      out[key] = value;
      changed = true;
    }
  }

  return { row: out, changed };
}

export type WildWordDedupeIndex = {
  keyToRowIndex: Map<string, number>;
};

export function buildWildWordDedupeIndex(rows: Record<string, unknown>[]): WildWordDedupeIndex {
  const keyToRowIndex = new Map<string, number>();
  rows.forEach((row, index) => {
    for (const key of wildWordSemanticDedupeKeys(row)) {
      if (!keyToRowIndex.has(key)) {
        keyToRowIndex.set(key, index);
      }
    }
  });
  return { keyToRowIndex };
}

export function findWildWordRowIndexBySemanticKeys(
  index: WildWordDedupeIndex,
  row: Record<string, unknown>
): number | undefined {
  for (const key of wildWordSemanticDedupeKeys(row)) {
    const hit = index.keyToRowIndex.get(key);
    if (hit !== undefined) {
      return hit;
    }
  }
  return undefined;
}

export function registerWildWordRowInDedupeIndex(
  index: WildWordDedupeIndex,
  rowIndex: number,
  row: Record<string, unknown>
): void {
  for (const key of wildWordSemanticDedupeKeys(row)) {
    if (!index.keyToRowIndex.has(key)) {
      index.keyToRowIndex.set(key, rowIndex);
    }
  }
}

export type DedupeWildWordRowsResult = {
  rows: Record<string, unknown>[];
  mergedDuplicates: number;
};

export type WildWordsImportApplyResult = {
  rows: Record<string, unknown>[];
  imported: number;
  mergedDuplicates: number;
  skippedDuplicates: number;
  invalidRows: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Pure import merge (no localStorage). Used by tests and {@link importWildWordsFromExtensionJsonArray}.
 */
export function applyWildWordsJsonImportToRows(
  current: Record<string, unknown>[],
  data: unknown[],
  options?: {
    languageFallback?: string;
    newId?: () => string;
  }
): WildWordsImportApplyResult {
  const languageFallback = options?.languageFallback ?? "und";
  const newId = options?.newId ?? (() => `import-${Math.random().toString(36).slice(2)}`);

  const cleaned = dedupeWildWordRows(current.map((row) => ({ ...row })));
  const rows = cleaned.rows;
  let index = buildWildWordDedupeIndex(rows);
  const usedIds = new Set<string>();
  for (const row of rows) {
    const id = trimString(row.id);
    if (id) {
      usedIds.add(id);
    }
  }

  let imported = 0;
  let mergedDuplicates = cleaned.mergedDuplicates;
  let skippedDuplicates = 0;
  let invalidRows = 0;

  for (const item of data) {
    if (!isRecord(item)) {
      invalidRows += 1;
      continue;
    }
    const rawText = item.text;
    if (typeof rawText !== "string" || rawText.trim() === "") {
      invalidRows += 1;
      continue;
    }

    const incoming: Record<string, unknown> = { ...item };
    incoming.text = rawText.replace(/\s+/g, " ").trim();

    const langRaw = item.language;
    if (typeof langRaw !== "string" || langRaw.trim() === "") {
      incoming.language = languageFallback;
    } else {
      incoming.language = langRaw.trim();
    }

    const existingIndex = findWildWordRowIndexBySemanticKeys(index, incoming);
    if (existingIndex !== undefined) {
      const { row: mergedRow, changed } = mergeWildWordImportIntoExisting(rows[existingIndex]!, incoming);
      if (changed) {
        rows[existingIndex] = mergedRow;
        index = buildWildWordDedupeIndex(rows);
        mergedDuplicates += 1;
      } else {
        skippedDuplicates += 1;
      }
      continue;
    }

    let id = trimString(item.id) || newId();
    while (usedIds.has(id)) {
      id = newId();
    }
    incoming.id = id;

    rows.unshift(incoming);
    index = buildWildWordDedupeIndex(rows);
    usedIds.add(id);
    imported += 1;
  }

  return {
    rows,
    imported,
    mergedDuplicates,
    skippedDuplicates,
    invalidRows,
  };
}

/**
 * Collapse duplicate rows already in storage (same semantic identity, different ids).
 */
export function dedupeWildWordRows(rows: Record<string, unknown>[]): DedupeWildWordRowsResult {
  if (rows.length <= 1) {
    return { rows, mergedDuplicates: 0 };
  }

  const parent = rows.map((_, i) => i);

  function find(i: number): number {
    let root = i;
    while (parent[root] !== root) {
      root = parent[root]!;
    }
    let cur = i;
    while (parent[cur] !== cur) {
      const next = parent[cur]!;
      parent[cur] = root;
      cur = next;
    }
    return root;
  }

  function unite(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent[rb] = ra;
    }
  }

  const keyOwner = new Map<string, number>();
  for (let i = 0; i < rows.length; i++) {
    for (const key of wildWordSemanticDedupeKeys(rows[i]!)) {
      const owner = keyOwner.get(key);
      if (owner === undefined) {
        keyOwner.set(key, find(i));
      } else {
        unite(owner, i);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < rows.length; i++) {
    const root = find(i);
    const list = groups.get(root);
    if (list) {
      list.push(i);
    } else {
      groups.set(root, [i]);
    }
  }

  const working = rows.map((row) => ({ ...row }));
  let mergedDuplicates = 0;
  const keptIndices: number[] = [];

  for (const indices of groups.values()) {
    if (indices.length === 1) {
      keptIndices.push(indices[0]!);
      continue;
    }
    mergedDuplicates += indices.length - 1;
    let bestIdx = indices[0]!;
    for (let j = 1; j < indices.length; j++) {
      const idx = indices[j]!;
      if (compareWildWordRowQuality(working[bestIdx]!, working[idx]!) > 0) {
        bestIdx = idx;
      }
    }
    let merged = { ...working[bestIdx]! };
    for (const idx of indices) {
      if (idx === bestIdx) {
        continue;
      }
      merged = mergeWildWordImportIntoExisting(merged, working[idx]!).row;
    }
    working[bestIdx] = merged;
    keptIndices.push(bestIdx);
  }

  keptIndices.sort((a, b) => a - b);
  return { rows: keptIndices.map((i) => working[i]!), mergedDuplicates };
}
