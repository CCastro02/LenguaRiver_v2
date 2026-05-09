import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExploreContentItem, ExploreSeedFile } from "@/lib/explore-content";
import { normalizeExploreItem } from "@/lib/explore-normalize";

type PortadaLink = {
  ns?: number;
  exists?: boolean | string;
  title?: string;
  "*"?: string;
};

type PortadaLinksResponse = {
  parse?: {
    links?: PortadaLink[];
  };
};

type QueryPage = {
  title?: string;
  missing?: boolean;
  extract?: string;
  revisions?: Array<{ timestamp?: string }>;
};

type QueryPagesResponse = {
  query?: {
    pages?: QueryPage[] | Record<string, QueryPage>;
  };
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_ROOT = resolve(__dirname);
const CACHE_DIR = join(SCRIPT_ROOT, "cache");
const OUTPUT_FILE = join(SCRIPT_ROOT, "output", "es-explore-content.json");

const PORTADA_URL = "https://es.wikinews.org/wiki/Portada";
const API_URL = "https://es.wikinews.org/w/api.php";

const MAX_ARTICLES = 12;
const CANDIDATE_LINK_LIMIT = 60;
const MAX_SUMMARY_CHARS = 260;
const MAX_TEXT_CHARS = 700;

const COUNTRY_HINTS: Array<{ country: string; tokens: string[] }> = [
  { country: "Spain", tokens: ["espana", "espanol", "madrid", "barcelona"] },
  { country: "Mexico", tokens: ["mexico", "cdmx", "ciudad de mexico"] },
  { country: "Argentina", tokens: ["argentina", "buenos aires"] },
  { country: "Chile", tokens: ["chile", "santiago"] },
  { country: "Peru", tokens: ["peru", "lima"] },
  { country: "Colombia", tokens: ["colombia", "bogota"] },
  { country: "Venezuela", tokens: ["venezuela", "caracas"] },
  { country: "Ecuador", tokens: ["ecuador", "quito"] },
  { country: "Uruguay", tokens: ["uruguay", "montevideo"] },
  { country: "Paraguay", tokens: ["paraguay", "asuncion"] },
  { country: "Bolivia", tokens: ["bolivia", "la paz"] },
  { country: "Cuba", tokens: ["cuba", "la habana"] },
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

function linkTitle(link: PortadaLink): string {
  return normalizeWhitespace(link.title ?? link["*"] ?? "");
}

function linkExists(link: PortadaLink): boolean {
  if (typeof link.exists === "boolean") {
    return link.exists;
  }
  return link.exists === "";
}

function queryPages(json: QueryPagesResponse): QueryPage[] {
  const pages = json.query?.pages;
  if (!pages) {
    return [];
  }
  return Array.isArray(pages) ? pages : Object.values(pages);
}

function buildArticleUrl(title: string): string {
  const encoded = encodeURIComponent(title.replace(/\s+/g, "_"));
  return `https://es.wikinews.org/wiki/${encoded}`;
}

function inferCountry(title: string, summary: string): string | undefined {
  const haystack = `${title} ${summary}`.toLowerCase();
  for (const hint of COUNTRY_HINTS) {
    if (hint.tokens.some((token) => haystack.includes(token))) {
      return hint.country;
    }
  }
  return undefined;
}

function articleIdFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (slug.length > 0) {
    return `es-news-wikinews-${slug.slice(0, 72)}`;
  }
  const hash = createHash("sha1").update(title).digest("hex").slice(0, 12);
  return `es-news-wikinews-${hash}`;
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

async function fetchPortadaRecentTitles(): Promise<string[]> {
  const url = new URL(API_URL);
  url.searchParams.set("action", "parse");
  url.searchParams.set("page", "Portada");
  url.searchParams.set("prop", "links");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");

  const json = await fetchJson<PortadaLinksResponse>(url.toString());
  const links = json.parse?.links ?? [];
  const titles = links
    .filter((link) => link.ns === 0 && linkExists(link))
    .map(linkTitle)
    .filter(Boolean)
    .filter((title) => !title.includes(":"))
    .filter((title) => title.toLowerCase() !== "portada")
    .slice(0, CANDIDATE_LINK_LIMIT);

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(
    join(CACHE_DIR, "wikinews-portada-links.json"),
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        sourceUrl: PORTADA_URL,
        linksCount: links.length,
        candidateTitles: titles,
      },
      null,
      2
    ),
    "utf-8"
  );
  return titles;
}

async function fetchArticleDetails(titles: string[]): Promise<ExploreContentItem[]> {
  const items: ExploreContentItem[] = [];
  for (let index = 0; index < titles.length; index += 10) {
    const batch = titles.slice(index, index + 10);
    if (batch.length === 0) {
      continue;
    }
    const url = new URL(API_URL);
    url.searchParams.set("action", "query");
    url.searchParams.set("prop", "extracts|revisions");
    url.searchParams.set("exintro", "1");
    url.searchParams.set("explaintext", "1");
    url.searchParams.set("rvprop", "timestamp");
    url.searchParams.set("redirects", "1");
    url.searchParams.set("titles", batch.join("|"));
    url.searchParams.set("format", "json");
    url.searchParams.set("formatversion", "2");

    const json = await fetchJson<QueryPagesResponse>(url.toString());
    const pages = queryPages(json);
    pages.forEach((page) => {
      if (!page.title || page.missing) {
        return;
      }
      const cleanExtract = normalizeWhitespace(page.extract ?? "");
      if (!cleanExtract || cleanExtract.length < 40) {
        return;
      }
      const title = normalizeWhitespace(page.title);
      const summary = trimToLimit(cleanExtract, MAX_SUMMARY_CHARS);
      const excerpt = trimToLimit(cleanExtract, MAX_TEXT_CHARS);
      items.push(
        normalizeExploreItem({
        id: articleIdFromTitle(title),
        language: "es",
        source: "wikinews",
        category: "news",
        country: inferCountry(title, summary),
        title,
        summary,
        text: excerpt,
        url: buildArticleUrl(title),
        publishedAt: page.revisions?.[0]?.timestamp,
        tags: ["news"],
        })
      );
    });
  }
  return items.slice(0, MAX_ARTICLES);
}

async function readExistingSeed(): Promise<ExploreSeedFile> {
  const raw = await readFile(OUTPUT_FILE, "utf-8");
  return JSON.parse(raw) as ExploreSeedFile;
}

function mergeIntoSeed(seed: ExploreSeedFile, newsItems: ExploreContentItem[]): ExploreSeedFile {
  const nonWikinews = seed.items.filter((item) => item.source !== "wikinews");
  return {
    language: "es",
    generatedAt: new Date().toISOString(),
    items: [...newsItems, ...nonWikinews].map((item) => normalizeExploreItem(item)),
  };
}

async function main() {
  const titles = await fetchPortadaRecentTitles();
  const newsItems = await fetchArticleDetails(titles);
  const seed = await readExistingSeed();
  const nextSeed = mergeIntoSeed(seed, newsItems);

  await mkdir(dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, JSON.stringify(nextSeed, null, 2), "utf-8");
  await writeFile(
    join(CACHE_DIR, "wikinews-articles.json"),
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        sourceUrl: PORTADA_URL,
        count: newsItems.length,
        items: newsItems,
      },
      null,
      2
    ),
    "utf-8"
  );

  console.log(`[wikinews] fetched ${newsItems.length} article(s).`);
  if (newsItems[0]) {
    console.log("[wikinews] first item:");
    console.log(JSON.stringify(newsItems[0], null, 2));
  }
}

void main().catch((error: unknown) => {
  console.error("[wikinews] ingestion failed");
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
