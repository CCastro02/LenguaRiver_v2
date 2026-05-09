export type ExploreCategory = "news" | "culture" | "travel" | "reading" | "listening";

export type ExploreSource =
  | "wikinews"
  | "wikivoyage"
  | "wiktionary"
  | "gutenberg"
  | "librivox"
  | "manual-seed";

export type ExploreContentItem = {
  id: string;
  language: string;
  source: ExploreSource;
  category: ExploreCategory;
  country?: string;
  title: string;
  summary?: string;
  text?: string;
  url?: string;
  audioUrl?: string;
  imageUrl?: string;
  publishedAt?: string;
  difficultyEstimate?: number;
  tags: string[];
  extractedWords?: string[];
  extractedPhrases?: string[];
};

export type UserWildWord = {
  id: string;
  language: string;
  text: string;
  sourceItemId: string;
  sourceTitle: string;
  contextSentence?: string;
  translation?: string;
  pronunciation?: string;
  savedAt: string;
};

export type ExploreSeedFile = {
  language: string;
  generatedAt: string;
  items: ExploreContentItem[];
};

export const WILD_WORDS_STORAGE_KEY = "lenguariver_wild_words";
