import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExploreContentItem, ExploreSeedFile } from "@/lib/explore-content";
import { normalizeExploreItem } from "@/lib/explore-normalize";

type CuratedPage = {
  title: string;
  category: "culture" | "travel";
  country: string;
  tags: string[];
};

type WikivoyageQueryPage = {
  title?: string;
  missing?: boolean;
  extract?: string;
  original?: {
    source?: string;
  };
};

type WikivoyageParseResponse = {
  parse?: {
    wikitext?: string;
  };
};

type WikivoyageQueryResponse = {
  query?: {
    pages?: WikivoyageQueryPage[] | Record<string, WikivoyageQueryPage>;
  };
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_ROOT = resolve(__dirname);
const CACHE_DIR = join(SCRIPT_ROOT, "cache");
const OUTPUT_FILE = join(SCRIPT_ROOT, "output", "es-explore-content.json");

const API_URL = "https://es.wikivoyage.org/w/api.php";
const BASE_URL = "https://es.wikivoyage.org/wiki/";

const MAX_PAGES = 12;
const MAX_SUMMARY_CHARS = 240;
const MAX_TEXT_CHARS = 620;
const REQUEST_GAP_MS = 1200;
const MAX_WIKITEXT_FALLBACKS = 4;

const CURATED_PAGES: CuratedPage[] = [
  { title: "España", category: "culture", country: "Spain", tags: ["culture", "country"] },
  { title: "México", category: "culture", country: "Mexico", tags: ["culture", "country"] },
  { title: "Argentina", category: "culture", country: "Argentina", tags: ["culture", "country"] },
  { title: "Colombia", category: "culture", country: "Colombia", tags: ["culture", "country"] },
  { title: "Perú", category: "culture", country: "Peru", tags: ["culture", "country"] },
  { title: "Chile", category: "culture", country: "Chile", tags: ["culture", "country"] },
  { title: "Madrid", category: "travel", country: "Spain", tags: ["travel", "city"] },
  { title: "Ciudad de México", category: "travel", country: "Mexico", tags: ["travel", "city"] },
  { title: "Buenos Aires", category: "travel", country: "Argentina", tags: ["travel", "city"] },
  { title: "Bogotá", category: "travel", country: "Colombia", tags: ["travel", "city"] },
  { title: "Lima", category: "travel", country: "Peru", tags: ["travel", "city"] },
  { title: "Santiago de Chile", category: "travel", country: "Chile", tags: ["travel", "city"] },
];

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function trimToLimit(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars - 1).trimEnd()}…`;
}

function pageId(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (slug.length > 0) {
    return `es-wikivoyage-${slug.slice(0, 72)}`;
  }
  const hash = createHash("sha1").update(title).digest("hex").slice(0, 12);
  return `es-wikivoyage-${hash}`;
}

function pageUrl(title: string): string {
  return `${BASE_URL}${encodeURIComponent(title.replace(/\s+/g, "_"))}`;
}

function queryPages(response: WikivoyageQueryResponse): WikivoyageQueryPage[] {
  const pages = response.query?.pages;
  if (!pages) {
    return [];
  }
  return Array.isArray(pages) ? pages : Object.values(pages);
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

function cleanWikitextToParagraph(wikitext: string): string {
  const introMatch = wikitext.match(/\|\s*intro\s*=\s*([\s\S]*?)(?:\n\||\n\}\})/i);
  if (introMatch?.[1]) {
    const cleanedIntro = normalizeWhitespace(
      introMatch[1]
        .replace(/\{\{[^{}]*\}\}/g, " ")
        .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
        .replace(/\[\[([^\]]+)\]\]/g, "$1")
        .replace(/''+/g, "")
        .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, " ")
        .replace(/<ref[^/>]*\/>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    );
    if (cleanedIntro.length >= 40) {
      return cleanedIntro;
    }
  }

  const withoutTemplates = wikitext
    .replace(/\{\{[^{}]*\}\}/g, " ")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, " ")
    .replace(/<ref[^/>]*\/>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const lines = withoutTemplates
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("|"))
    .filter((line) => !line.startsWith("=="))
    .filter((line) => !line.startsWith("[[Archivo:"))
    .filter((line) => !line.startsWith("[[File:"))
    .filter((line) => !line.startsWith("[[Imagen:"))
    .filter((line) => !line.startsWith("*"))
    .filter((line) => !line.startsWith("#"))
    .filter((line) => !line.startsWith(":"));
  const plain = lines
    .map((line) =>
      line
        .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
        .replace(/\[\[([^\]]+)\]\]/g, "$1")
        .replace(/''+/g, "")
        .replace(/\{\{[^{}]*\}\}/g, " ")
    )
    .map(normalizeWhitespace)
    .filter((line) => line.length >= 40);
  return plain[0] ?? "";
}

async function fetchWikitextIntro(title: string): Promise<string> {
  try {
    const url = new URL(API_URL);
    url.searchParams.set("action", "parse");
    url.searchParams.set("page", title);
    url.searchParams.set("prop", "wikitext");
    url.searchParams.set("format", "json");
    url.searchParams.set("formatversion", "2");
    const json = await fetchJson<WikivoyageParseResponse>(url.toString());
    return cleanWikitextToParagraph(json.parse?.wikitext ?? "");
  } catch {
    return "";
  }
}

async function fetchCuratedPages(): Promise<ExploreContentItem[]> {
  const curated = CURATED_PAGES.slice(0, MAX_PAGES);
  const queryData = new Map<
    string,
    {
      intro: string;
      imageUrl?: string;
    }
  >();

  for (const sourcePage of curated) {
    await sleep(REQUEST_GAP_MS);
    const queryUrl = new URL(API_URL);
    queryUrl.searchParams.set("action", "query");
    queryUrl.searchParams.set("prop", "extracts|pageimages");
    queryUrl.searchParams.set("exintro", "1");
    queryUrl.searchParams.set("explaintext", "1");
    queryUrl.searchParams.set("piprop", "original");
    queryUrl.searchParams.set("redirects", "1");
    queryUrl.searchParams.set("titles", sourcePage.title);
    queryUrl.searchParams.set("format", "json");
    queryUrl.searchParams.set("formatversion", "2");

    let page: WikivoyageQueryPage | undefined;
    try {
      const queryJson = await fetchJson<WikivoyageQueryResponse>(queryUrl.toString());
      page = queryPages(queryJson).find((entry) => Boolean(entry.title && !entry.missing));
    } catch {
      page = undefined;
    }
    queryData.set(sourcePage.title, {
      intro: normalizeWhitespace(page?.extract ?? ""),
      imageUrl: page?.original?.source,
    });
  }

  const items: ExploreContentItem[] = [];
  let fallbackAttempts = 0;
  for (const sourcePage of curated) {
    const existing = queryData.get(sourcePage.title);
    const queryIntro = existing?.intro ?? "";
    let intro = queryIntro;
    if (intro.length < 30 && fallbackAttempts < MAX_WIKITEXT_FALLBACKS) {
      await sleep(REQUEST_GAP_MS);
      intro = normalizeWhitespace(await fetchWikitextIntro(sourcePage.title));
      fallbackAttempts += 1;
    }
    if (!intro || intro.length < 30) {
      continue;
    }
    items.push(
      normalizeExploreItem({
      id: pageId(sourcePage.title),
      language: "es",
      source: "wikivoyage",
      category: sourcePage.category,
      country: sourcePage.country,
      title: sourcePage.title,
      summary: trimToLimit(intro, MAX_SUMMARY_CHARS),
      text: trimToLimit(intro, MAX_TEXT_CHARS),
      url: pageUrl(sourcePage.title),
      imageUrl: existing?.imageUrl,
      tags: [...sourcePage.tags, "wikivoyage"],
      })
    );
  }

  if (!items.some((item) => item.category === "culture")) {
    await sleep(REQUEST_GAP_MS);
    const spainIntro = normalizeWhitespace(await fetchWikitextIntro("España"));
    if (spainIntro.length >= 30) {
      const spainExisting = queryData.get("España");
      items.push(
        normalizeExploreItem({
        id: pageId("España"),
        language: "es",
        source: "wikivoyage",
        category: "culture",
        country: "Spain",
        title: "España",
        summary: trimToLimit(spainIntro, MAX_SUMMARY_CHARS),
        text: trimToLimit(spainIntro, MAX_TEXT_CHARS),
        url: pageUrl("España"),
        imageUrl: spainExisting?.imageUrl,
        tags: ["culture", "country", "wikivoyage"],
        })
      );
    }
  }

  if (!items.some((item) => item.category === "travel")) {
    const baExisting = queryData.get("Buenos Aires");
    let travelIntro = baExisting?.intro ?? "";
    if (travelIntro.length < 30) {
      await sleep(REQUEST_GAP_MS);
      travelIntro = normalizeWhitespace(await fetchWikitextIntro("Buenos Aires"));
    }
    if (travelIntro.length >= 30) {
      items.push(
        normalizeExploreItem({
        id: pageId("Buenos Aires"),
        language: "es",
        source: "wikivoyage",
        category: "travel",
        country: "Argentina",
        title: "Buenos Aires",
        summary: trimToLimit(travelIntro, MAX_SUMMARY_CHARS),
        text: trimToLimit(travelIntro, MAX_TEXT_CHARS),
        url: pageUrl("Buenos Aires"),
        imageUrl: baExisting?.imageUrl,
        tags: ["travel", "city", "wikivoyage"],
        })
      );
    }
  }

  const deduped = items.filter(
    (item, index, all) => all.findIndex((one) => one.source === item.source && one.id === item.id) === index
  );
  return deduped.slice(0, MAX_PAGES);
}

async function readSeed(): Promise<ExploreSeedFile> {
  const raw = await readFile(OUTPUT_FILE, "utf-8");
  return JSON.parse(raw) as ExploreSeedFile;
}

function mergeSeed(seed: ExploreSeedFile, wikivoyageItems: ExploreContentItem[]): ExploreSeedFile {
  const kept = seed.items.filter((item) => item.source !== "wikivoyage");
  return {
    language: "es",
    generatedAt: new Date().toISOString(),
    items: [...kept, ...wikivoyageItems].map((item) => normalizeExploreItem(item)),
  };
}

async function main() {
  const wikivoyageItems = await fetchCuratedPages();
  const seed = await readSeed();
  const nextSeed = mergeSeed(seed, wikivoyageItems);

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(
    join(CACHE_DIR, "wikivoyage-pages.json"),
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        sourceUrl: "https://es.wikivoyage.org/",
        requestedPages: CURATED_PAGES.slice(0, MAX_PAGES).map((page) => page.title),
        count: wikivoyageItems.length,
        items: wikivoyageItems,
      },
      null,
      2
    ),
    "utf-8"
  );
  await writeFile(OUTPUT_FILE, JSON.stringify(nextSeed, null, 2), "utf-8");

  console.log(`[wikivoyage] fetched ${wikivoyageItems.length} page(s).`);
  const withImages = wikivoyageItems.filter((item) => Boolean(item.imageUrl)).length;
  console.log(`[wikivoyage] pages with images: ${withImages}.`);
  if (wikivoyageItems[0]) {
    console.log("[wikivoyage] first item:");
    console.log(JSON.stringify(wikivoyageItems[0], null, 2));
  }
}

void main().catch((error: unknown) => {
  console.error("[wikivoyage] ingestion failed");
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
