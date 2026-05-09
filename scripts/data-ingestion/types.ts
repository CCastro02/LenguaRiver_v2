export type SourceName = "leipzig" | "wiktionary" | "common-voice" | "manual";

export type SupportedLanguage = "es" | "ru";

export type RawFrequencyEntry = {
  language: SupportedLanguage;
  baseForm: string;
  frequencyRank: number;
  rawFrequency: number;
  translation?: string;
  partOfSpeech?: string;
  source: SourceName;
  sourceUrl?: string;
};

export type NormalizedVocabularyEntry = {
  language: SupportedLanguage;
  baseForm: string;
  frequencyRank: number;
  rawFrequency: number;
  translation?: string;
  partOfSpeech?: string;
  source: SourceName;
  sourceUrl?: string;
};
