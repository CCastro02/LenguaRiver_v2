import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExploreContentItem, ExploreSeedFile } from "@/lib/explore-content";
import { normalizeExploreItem } from "@/lib/explore-normalize";

type GutenbergAuthor = {
  name: string;
};

type GutenbergBook = {
  id: number;
  title: string;
  authors: GutenbergAuthor[];
  formats: Record<string, string>;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_ROOT = resolve(__dirname);
const OUTPUT_FILE = join(SCRIPT_ROOT, "output", "es-explore-content.json");
const CACHE_FILE = join(SCRIPT_ROOT, "cache", "gutenberg-books.json");

const CURATED_BOOK_IDS = [2000, 61851, 58221, 55514];
const MAX_EXCERPTS_PER_BOOK = 2;
const MIN_EXCERPT_CHARS = 300;
const MAX_EXCERPT_CHARS = 800;

function cleanWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildBookPageUrl(bookId: number): string {
  return `https://www.gutenberg.org/ebooks/${bookId}`;
}

function choosePlainTextUrl(formats: Record<string, string>): string | null {
  const candidates = Object.entries(formats)
    .filter(([key, value]) => key.startsWith("text/plain") && value.endsWith(".txt.utf-8"))
    .map(([, value]) => value);
  if (candidates.length > 0) {
    return candidates[0] ?? null;
  }
  const fallback = Object.entries(formats)
    .filter(([key]) => key.startsWith("text/plain"))
    .map(([, value]) => value)
    .find((value) => !value.endsWith(".zip"));
  return fallback ?? null;
}

function stripGutenbergWrapper(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n");
  const startMarkers = [
    "*** START OF THE PROJECT GUTENBERG EBOOK",
    "*** START OF THIS PROJECT GUTENBERG EBOOK",
  ];
  const endMarkers = [
    "*** END OF THE PROJECT GUTENBERG EBOOK",
    "*** END OF THIS PROJECT GUTENBERG EBOOK",
  ];

  let body = normalized;
  for (const marker of startMarkers) {
    const markerIndex = body.indexOf(marker);
    if (markerIndex >= 0) {
      const firstBreak = body.indexOf("\n", markerIndex);
      body = firstBreak >= 0 ? body.slice(firstBreak + 1) : body;
      break;
    }
  }
  for (const marker of endMarkers) {
    const markerIndex = body.indexOf(marker);
    if (markerIndex >= 0) {
      body = body.slice(0, markerIndex);
      break;
    }
  }
  return body;
}

function dropFrontMatter(text: string): string {
  const markers = [
    /\n\s*cap[ií]tulo\s+(primero|i)\b/i,
    /\n\s*cap[ií]tulo\s+[ivxlcdm]+\b/i,
    /\n\s*libro\s+primero\b/i,
    /\n\s*parte\s+primera\b/i,
  ];
  for (const marker of markers) {
    const match = marker.exec(text);
    if (match && match.index > 0 && match.index < text.length * 0.45) {
      return text.slice(match.index);
    }
  }
  return text;
}

function looksLikeMetadata(paragraph: string): boolean {
  const lower = paragraph.toLowerCase();
  if (
    lower.includes("project gutenberg") ||
    lower.includes("table of contents") ||
    lower.includes("contenido") ||
    lower.includes("índice") ||
    lower.includes("indice") ||
    lower.includes("escribano de cámara") ||
    lower.includes("licencia para que") ||
    lower.includes("privilegio") ||
    lower.includes("tasaron cada pliego") ||
    lower.startsWith("chapter ") ||
    lower.startsWith("capítulo ") ||
    lower.startsWith("capitulo ")
  ) {
    return true;
  }
  const letters = paragraph.replace(/[^a-záéíóúñü]/gi, "");
  const upper = letters.replace(/[^A-ZÁÉÍÓÚÑÜ]/g, "");
  if (letters.length >= 30 && upper.length / letters.length > 0.75) {
    return true;
  }
  return false;
}

function trimExcerpt(paragraph: string): string {
  const clean = cleanWhitespace(paragraph);
  if (clean.length <= MAX_EXCERPT_CHARS) {
    return clean;
  }
  const sliced = clean.slice(0, MAX_EXCERPT_CHARS - 1);
  const lastPeriod = sliced.lastIndexOf(". ");
  const bounded = lastPeriod > 180 ? sliced.slice(0, lastPeriod + 1) : sliced;
  return `${bounded.trimEnd()}…`;
}

function splitExcerpts(text: string): string[] {
  const body = dropFrontMatter(stripGutenbergWrapper(text));
  return body
    .split(/\n\s*\n/g)
    .map((part) => cleanWhitespace(part))
    .filter((part) => part.length >= MIN_EXCERPT_CHARS)
    .filter((part) => !looksLikeMetadata(part))
    .map(trimExcerpt)
    .filter((part) => part.length >= MIN_EXCERPT_CHARS && part.length <= MAX_EXCERPT_CHARS + 1);
}

function firstSentence(text: string): string {
  const clean = cleanWhitespace(text);
  const sentence = clean.match(/.+?[.!?](?:\s|$)/);
  return sentence ? cleanWhitespace(sentence[0]) : clean;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "LenguaRiverExploreIngest/1.0 (manual refresh)",
    },
  });
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText} (${url})`);
  }
  return (await response.json()) as T;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "LenguaRiverExploreIngest/1.0 (manual refresh)",
    },
  });
  if (!response.ok) {
    throw new Error(`Text fetch failed: ${response.status} ${response.statusText} (${url})`);
  }
  return response.text();
}

async function fetchCuratedBooks(): Promise<GutenbergBook[]> {
  const books: GutenbergBook[] = [];
  for (const id of CURATED_BOOK_IDS) {
    try {
      const book = await fetchJson<GutenbergBook>(`https://gutendex.com/books/${id}`);
      books.push(book);
    } catch {
      // Keep ingestion resilient: skip unavailable books.
    }
  }
  return books;
}

function buildReadingItems(books: GutenbergBook[], excerptsByBookId: Map<number, string[]>): ExploreContentItem[] {
  const items: ExploreContentItem[] = [];
  books.forEach((book) => {
    const excerpts = (excerptsByBookId.get(book.id) ?? []).slice(0, MAX_EXCERPTS_PER_BOOK);
    const author = book.authors[0]?.name ? cleanWhitespace(book.authors[0].name) : undefined;
    excerpts.forEach((excerpt, index) => {
      const title = author ? `${book.title} — ${author}` : book.title;
      items.push(
        normalizeExploreItem({
          id: `es-gutenberg-${book.id}-excerpt-${index + 1}`,
          language: "es",
          source: "gutenberg",
          category: "reading",
          country: "Unknown",
          title,
          summary: firstSentence(excerpt),
          text: excerpt,
          url: buildBookPageUrl(book.id),
          tags: ["reading", "book", "gutenberg"],
        })
      );
    });
  });
  return items;
}

async function readSeed(): Promise<ExploreSeedFile> {
  const raw = await readFile(OUTPUT_FILE, "utf-8");
  return JSON.parse(raw) as ExploreSeedFile;
}

function mergeSeed(seed: ExploreSeedFile, readingItems: ExploreContentItem[]): ExploreSeedFile {
  const preserved = seed.items.filter((item) => item.source !== "gutenberg");
  return {
    language: "es",
    generatedAt: new Date().toISOString(),
    items: [...preserved, ...readingItems].map((item) => normalizeExploreItem(item)),
  };
}

async function main() {
  const books = await fetchCuratedBooks();
  const excerptsByBookId = new Map<number, string[]>();

  for (const book of books) {
    const textUrl = choosePlainTextUrl(book.formats);
    if (!textUrl) {
      excerptsByBookId.set(book.id, []);
      continue;
    }
    try {
      const text = await fetchText(textUrl);
      excerptsByBookId.set(book.id, splitExcerpts(text));
    } catch {
      excerptsByBookId.set(book.id, []);
    }
  }

  const readingItems = buildReadingItems(books, excerptsByBookId);
  const seed = await readSeed();
  const nextSeed = mergeSeed(seed, readingItems);

  await mkdir(dirname(CACHE_FILE), { recursive: true });
  await writeFile(
    CACHE_FILE,
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        source: "Project Gutenberg",
        booksFetched: books.length,
        excerptsCreated: readingItems.length,
        books: books.map((book) => ({
          id: book.id,
          title: book.title,
          author: book.authors[0]?.name ?? null,
          url: buildBookPageUrl(book.id),
          excerptCount: (excerptsByBookId.get(book.id) ?? []).slice(0, MAX_EXCERPTS_PER_BOOK).length,
        })),
      },
      null,
      2
    ),
    "utf-8"
  );
  await writeFile(OUTPUT_FILE, JSON.stringify(nextSeed, null, 2), "utf-8");

  console.log(`[gutenberg] books fetched: ${books.length}`);
  console.log(`[gutenberg] excerpts created: ${readingItems.length}`);
  if (readingItems[0]) {
    console.log("[gutenberg] first item:");
    console.log(JSON.stringify(readingItems[0], null, 2));
  }
}

void main().catch((error: unknown) => {
  console.error("[gutenberg] ingestion failed");
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
