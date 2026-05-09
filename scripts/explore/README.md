# Explore Content Sourcing (Spanish-first)

This folder scaffolds the Explore content pipeline separately from lessons.

## Source Roles

- **Wikinews**: Spanish-speaking country current events and short news summaries.
- **Wikivoyage**: Travel and culture material (places, social norms, practical travel context).
- **Wiktionary**: Word metadata for definitions, part of speech, pronunciation, and example usage.
- **Project Gutenberg / Open Library (later)**: Reading library candidates (public-domain/open-license).
- **LibriVox (later)**: Listening library candidates (public-domain audio).
- **GLOSS**: Lessons only. Not part of Explore ingestion.
- **Leipzig**: Frequency weighting only. Not a direct Explore source.

## MVP Refresh Method

1. Start with manual JSON seed files in `scripts/explore/output/`.
2. Cache fetched source snapshots under `scripts/explore/cache/`.
3. Keep refresh scripts manual and rate-limited.
4. Add live refresh only after schema, moderation, and dedupe rules are stable.

## Safety Boundaries

- Do not auto-generate lessons from Explore content.
- Do not inject Explore content into lesson progression or scoring.
- Do not scrape sources aggressively.
- Keep source attribution and links in every Explore item.
