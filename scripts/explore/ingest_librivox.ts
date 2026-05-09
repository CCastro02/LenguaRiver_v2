import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExploreContentItem, ExploreSeedFile } from "@/lib/explore-content";
import { normalizeExploreItem } from "@/lib/explore-normalize";

type LibrivoxAuthor = {
  id?: string;
  first_name?: string;
  last_name?: string;
};

type LibrivoxBook = {
  id: string;
  title: string;
  description?: string;
  language?: string;
  url_librivox?: string;
  url_rss?: string;
  authors?: LibrivoxAuthor[];
};

type LibrivoxBooksResponse = {
  books?: LibrivoxBook[];
};

type LibrivoxTrack = {
  listen_url?: string;
  language?: string;
};

type LibrivoxTracksResponse = {
  sections?: LibrivoxTrack[];
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_ROOT = resolve(__dirname);
const OUTPUT_FILE = join(SCRIPT_ROOT, "output", "es-explore-content.json");
const CACHE_FILE = join(SCRIPT_ROOT, "cache", "librivox-audiobooks.json");

const MAX_ITEMS = 5;

function cleanText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function firstSentence(value: string): string {
  const clean = cleanText(value);
  const sentence = clean.match(/.+?[.!?](?:\s|$)/);
  return sentence ? cleanText(sentence[0]) : clean;
}

function authorLabel(authors: LibrivoxAuthor[] | undefined): string | undefined {
  const first = authors?.[0];
  if (!first) {
    return undefined;
  }
  const combined = `${first.first_name ?? ""} ${first.last_name ?? ""}`.trim();
  return cleanText(combined) || undefined;
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

async function fetchSpanishBooks(): Promise<LibrivoxBook[]> {
  const json = await fetchJson<LibrivoxBooksResponse>(
    "https://librivox.org/api/feed/audiobooks/?format=json&limit=1200"
  );
  return (json.books ?? [])
    .filter((book) => (book.language ?? "").toLowerCase() === "spanish")
    .slice(0, MAX_ITEMS);
}

async function fetchFirstAudioUrl(bookId: string): Promise<string | undefined> {
  try {
    const json = await fetchJson<LibrivoxTracksResponse>(
      `https://librivox.org/api/feed/audiotracks/?project_id=${encodeURIComponent(bookId)}&format=json`
    );
    const firstPlayable = (json.sections ?? []).find((track) => Boolean(track.listen_url));
    return firstPlayable?.listen_url;
  } catch {
    return undefined;
  }
}

function toExploreItem(book: LibrivoxBook, audioUrl?: string): ExploreContentItem {
  const author = authorLabel(book.authors);
  const title = author ? `${book.title} — ${author}` : book.title;
  const summaryText = firstSentence(book.description ?? "Audiolibro en español de dominio público.");

  return normalizeExploreItem({
    id: `es-librivox-${book.id}`,
    language: "es",
    source: "librivox",
    category: "listening",
    country: "Unknown",
    title: cleanText(title),
    summary: summaryText,
    text: cleanText(book.description ?? summaryText),
    url: book.url_librivox ?? book.url_rss ?? `https://librivox.org/`,
    audioUrl,
    tags: ["listening", "audiobook", "librivox"],
  });
}

async function readSeed(): Promise<ExploreSeedFile> {
  const raw = await readFile(OUTPUT_FILE, "utf-8");
  return JSON.parse(raw) as ExploreSeedFile;
}

function mergeSeed(seed: ExploreSeedFile, listeningItems: ExploreContentItem[]): ExploreSeedFile {
  const preserved = seed.items.filter((item) => item.source !== "librivox");
  return {
    language: "es",
    generatedAt: new Date().toISOString(),
    items: [...preserved, ...listeningItems].map((item) => normalizeExploreItem(item)),
  };
}

async function main() {
  const books = await fetchSpanishBooks();
  const listeningItems: ExploreContentItem[] = [];
  for (const book of books) {
    const audioUrl = await fetchFirstAudioUrl(book.id);
    listeningItems.push(toExploreItem(book, audioUrl));
  }

  const seed = await readSeed();
  const nextSeed = mergeSeed(seed, listeningItems);

  await mkdir(dirname(CACHE_FILE), { recursive: true });
  await writeFile(
    CACHE_FILE,
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        source: "LibriVox API",
        itemsFetched: listeningItems.length,
        items: listeningItems,
      },
      null,
      2
    ),
    "utf-8"
  );
  await writeFile(OUTPUT_FILE, JSON.stringify(nextSeed, null, 2), "utf-8");

  console.log(`[librivox] items fetched: ${listeningItems.length}`);
  if (listeningItems[0]) {
    console.log("[librivox] first item:");
    console.log(JSON.stringify(listeningItems[0], null, 2));
  }
}

void main().catch((error: unknown) => {
  console.error("[librivox] ingestion failed");
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
