# Safari + Chrome extension release plan

LenguaRiver should focus only on the browsers Chris actually uses right now: Safari on Apple devices and Chrome where needed. Do not spend time on Edge or Firefox unless Chris asks later.

## Source of truth

Extension source:

```text
extensions/lenguariver-extension
```

Web app / extension bridge allowlist:

```text
extensions/lenguariver-extension/lib/web-bridge.ts
lib/extension-bridge.ts
```

## Build scripts

Run from `extensions/lenguariver-extension`.

```bash
npm run build:chrome
npm run build:safari
npm run check:target-browsers
```

Current WXT output folders:

```text
.output/chrome-mv3
.output/safari-mv2
```

ZIP scripts:

```bash
npm run zip:chrome
npm run zip:safari
```

## Distribution targets

### Safari — priority

Safari does not install from the Chrome Web Store. Safari distribution requires Apple's Safari Web Extension / App Store flow.

Current WXT Safari build outputs:

```text
.output/safari-mv2
.output/lenguariver-extension-0.1.0-safari.zip
```

Before Apple submission:

- Confirm whether Chris wants Mac Safari only, iOS/iPadOS Safari, or both.
- Package/convert the Safari extension using Apple’s current Safari Web Extension flow.
- Prepare App Store Connect metadata, privacy disclosures, screenshots, and review notes.
- Use Apple Developer credentials only after Chris explicitly approves.

### Chrome — secondary

Chrome can use the WXT Chrome MV3 build.

Current Chrome build outputs:

```text
.output/chrome-mv3
.output/lenguariver-extension-0.1.0-chrome.zip
```

Chrome Web Store can wait until Safari is working unless Chris asks for it sooner.

## Language routing behavior

When a user highlights and saves a word, the extension stores the source/list language in the `language` field and the learner/explanation language in `targetLanguage`.

Current save path:

1. Content script captures selected text and nearest context sentence.
2. Background save handler calls `upsertWildWord`.
3. `upsertWildWord` calls `resolveSaveLanguage(text, settings.sourceLanguage, contextSentence)`.
4. `resolveSaveLanguage` uses selected-text detection first, context detection second, and source-language setting fallback last.
5. The saved record gets `language`, `targetLanguage`, and a language-based `lexemeKey`.

Regression command:

```bash
cd extensions/lenguariver-extension
npx tsx lib/language-detect.test.ts
npm run verify:language-detect-sync
```

Current tested routing examples include English, Spanish, French, German, Italian, Russian, Arabic, Japanese-kana, and Chinese-ideograph saves.

## Approval gates

Chris approval is required before:

- Adding/changing extension permissions or host matches.
- Using Apple or Google developer credentials.
- Uploading/submitting to Safari/App Store or Chrome Web Store.
- Publishing public or unlisted listings.
- Committing or pushing release-prep changes.
