"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ExploreCategory, ExploreContentItem, UserWildWord } from "@/lib/explore-content";
import { WILD_WORDS_STORAGE_KEY } from "@/lib/explore-content";
import { lookupWord, type WiktionaryLookupResult } from "@/lib/wiktionary";
import { ensureTtsVoicesLoaded, speakTextWithPreferredVoice } from "@/lib/tts-voice";

const SECTION_ORDER: Array<{ key: ExploreCategory; title: string }> = [
  { key: "news", title: "Current Events" },
  { key: "culture", title: "Culture" },
  { key: "travel", title: "Travel" },
  { key: "reading", title: "Reading" },
  { key: "listening", title: "Listening" },
];

function speakText(text: string, language: string, rate = 0.9): void {
  speakTextWithPreferredVoice(text, language, rate);
}

function sourceLabel(source: ExploreContentItem["source"]): string {
  if (source === "wikinews") return "Wikinews";
  if (source === "wikivoyage") return "Wikivoyage";
  if (source === "wiktionary") return "Wiktionary";
  if (source === "gutenberg") return "Project Gutenberg";
  if (source === "librivox") return "LibriVox";
  return "Manual Seed";
}

export default function ExploreClient({ items }: { items: ExploreContentItem[] }) {
  const audioElementByItemId = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [openById, setOpenById] = useState<Record<string, boolean>>({});
  const [openSectionByKey, setOpenSectionByKey] = useState<Record<ExploreCategory, boolean>>({
    news: false,
    culture: false,
    travel: false,
    reading: false,
    listening: false,
  });
  const [selectionById, setSelectionById] = useState<Record<string, string>>({});
  const [translationById, setTranslationById] = useState<Record<string, string>>({});
  const [translationLoadingById, setTranslationLoadingById] = useState<Record<string, boolean>>({});
  const [translationErrorById, setTranslationErrorById] = useState<Record<string, string>>({});
  const [translateReady, setTranslateReady] = useState<boolean>(false);
  const [translateStatusLoaded, setTranslateStatusLoaded] = useState<boolean>(false);
  const [saveMessageById, setSaveMessageById] = useState<Record<string, string>>({});
  const [dictionaryById, setDictionaryById] = useState<Record<string, WiktionaryLookupResult>>({});
  const [dictionaryLoadingById, setDictionaryLoadingById] = useState<Record<string, boolean>>({});

  useEffect(() => {
    ensureTtsVoicesLoaded();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<ExploreCategory, ExploreContentItem[]>();
    SECTION_ORDER.forEach((section) => map.set(section.key, []));
    items.forEach((item) => {
      const list = map.get(item.category);
      if (list) {
        list.push(item);
      }
    });
    return map;
  }, [items]);

  function setSelectionFromHighlight(itemId: string) {
    const selected = typeof window !== "undefined" ? window.getSelection()?.toString().trim() ?? "" : "";
    if (!selected) {
      return;
    }
    setSelectionById((prev) => ({ ...prev, [itemId]: selected }));
  }

  function saveWildWord(item: ExploreContentItem) {
    const selectedText = selectionById[item.id]?.trim();
    if (!selectedText || typeof window === "undefined") {
      return;
    }
    const wildWord: UserWildWord = {
      id: `${item.language}-${Date.now()}`,
      language: item.language,
      text: selectedText,
      sourceItemId: item.id,
      sourceTitle: item.title,
      contextSentence: item.summary,
      translation: translationById[item.id],
      pronunciation: selectedText,
      savedAt: new Date().toISOString(),
    };
    const raw = window.localStorage.getItem(WILD_WORDS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as UserWildWord[]) : [];
    window.localStorage.setItem(WILD_WORDS_STORAGE_KEY, JSON.stringify([wildWord, ...parsed]));
    setSaveMessageById((prev) => ({ ...prev, [item.id]: `Saved to "${WILD_WORDS_STORAGE_KEY}"` }));
  }

  async function playPreview(itemId: string) {
    const audio = audioElementByItemId.current.get(itemId);
    if (!audio) {
      return;
    }
    try {
      const seekSeconds = 15;
      if (Number.isFinite(audio.duration) && audio.duration > seekSeconds + 5) {
        audio.currentTime = seekSeconds;
      }
      await audio.play();
    } catch {
      // Ignore blocked autoplay or seek issues; user can use native controls.
    }
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/translate/status", {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json()) as { ready?: boolean };
        if (!active) {
          return;
        }
        setTranslateReady(Boolean(payload.ready));
      } catch {
        if (!active) {
          return;
        }
        setTranslateReady(false);
      } finally {
        if (active) {
          setTranslateStatusLoaded(true);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="page">
      <section className="card">
        <h1>Explore</h1>
        <p className="muted">
          Spanish-first Explore feed scaffold. Lessons, scoring, progression, and GLOSS stay separate.
        </p>
      </section>

      {SECTION_ORDER.map((section) => {
        const sectionItems = grouped.get(section.key) ?? [];
        const isSectionOpen = openSectionByKey[section.key];
        return (
          <section className="card" key={section.key}>
            <button
              type="button"
              className="button"
              onClick={() =>
                setOpenSectionByKey((prev) => ({
                  ...prev,
                  [section.key]: !prev[section.key],
                }))
              }
              aria-expanded={isSectionOpen}
            >
              {isSectionOpen ? "▾" : "▸"} {section.title} ({sectionItems.length})
            </button>
            {isSectionOpen ? (
              sectionItems.length === 0 ? (
                <p className="muted">No items yet.</p>
              ) : (
                <ul className="sentence-list lesson-list" style={{ marginTop: "0.6rem" }}>
                  {sectionItems.map((item) => {
                    const isOpen = Boolean(openById[item.id]);
                    const selectedText = selectionById[item.id] ?? "";
                    return (
                      <li key={item.id}>
                        <p>
                          <strong>{item.title}</strong>
                        </p>
                        <p className="muted">
                          Source: {sourceLabel(item.source)} · {item.country ?? "General"} · {item.category}
                        </p>
                        {item.summary ? <p className="muted">{item.summary}</p> : null}
                        <button
                          type="button"
                          className="button"
                          onClick={() => setOpenById((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                        >
                          {isOpen ? "Close" : "Open / Read"}
                        </button>
                        {isOpen ? (
                          <div style={{ marginTop: "0.5rem" }}>
                            <p>{item.text ?? "No local text available yet. Use source link."}</p>
                            {item.source === "gutenberg" ? (
                              <p className="muted" style={{ marginTop: "0.35rem", marginBottom: "0.35rem" }}>
                                <strong>Reading + Listening pair:</strong> Highlight text to translate or look up words,
                                use TTS for pronunciation, then open Listening previews for audiobook context.
                              </p>
                            ) : null}
                            {item.audioUrl ? (
                              <div style={{ marginBottom: "0.5rem" }}>
                                <p className="muted" style={{ marginBottom: "0.25rem" }}>
                                  <strong>Preview listening</strong>
                                </p>
                                <button
                                  type="button"
                                  className="button"
                                  onClick={() => {
                                    void playPreview(item.id);
                                  }}
                                  style={{ marginBottom: "0.35rem" }}
                                >
                                  ▶ Play Preview
                                </button>
                                <audio
                                  controls
                                  src={item.audioUrl}
                                  style={{ maxWidth: "100%", display: "block" }}
                                  ref={(element) => {
                                    if (element) {
                                      audioElementByItemId.current.set(item.id, element);
                                    } else {
                                      audioElementByItemId.current.delete(item.id);
                                    }
                                  }}
                                />
                                <p className="muted" style={{ marginTop: "0.25rem", marginBottom: 0 }}>
                                  Preview from audiobook. Full listening recommended in chunks.
                                </p>
                              </div>
                            ) : null}
                            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                              <button
                                type="button"
                                className="button"
                                onClick={() => setSelectionFromHighlight(item.id)}
                              >
                                Use highlighted text
                              </button>
                              <button
                                type="button"
                                className="button"
                                disabled={!translateReady}
                                onClick={async () => {
                                  if (!translateReady) {
                                    setTranslationErrorById((prev) => ({
                                      ...prev,
                                      [item.id]: "Translation not installed. Run npm run translate:setup",
                                    }));
                                    return;
                                  }
                                  const textToTranslate = selectedText.trim();
                                  if (!textToTranslate) {
                                    setTranslationErrorById((prev) => ({
                                      ...prev,
                                      [item.id]: "Select text first, then Translate.",
                                    }));
                                    return;
                                  }

                                  setTranslationLoadingById((prev) => ({ ...prev, [item.id]: true }));
                                  setTranslationErrorById((prev) => ({ ...prev, [item.id]: "" }));
                                  try {
                                    const response = await fetch("/api/translate", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        text: textToTranslate,
                                        from: item.language,
                                        to: "en",
                                      }),
                                    });
                                    const payload = (await response.json()) as
                                      | { ok: true; translation: string }
                                      | { ok: false; error: string };
                                    if (response.ok && payload.ok) {
                                      setTranslationById((prev) => ({
                                        ...prev,
                                        [item.id]: payload.translation,
                                      }));
                                      setTranslationErrorById((prev) => ({ ...prev, [item.id]: "" }));
                                    } else {
                                      setTranslationErrorById((prev) => ({
                                        ...prev,
                                        [item.id]:
                                          !payload.ok && payload.error
                                            ? payload.error
                                            : "Translation unavailable right now.",
                                      }));
                                    }
                                  } catch {
                                    setTranslationErrorById((prev) => ({
                                      ...prev,
                                      [item.id]: "Translation unavailable right now.",
                                    }));
                                  } finally {
                                    setTranslationLoadingById((prev) => ({ ...prev, [item.id]: false }));
                                  }
                                }}
                              >
                                {translateReady ? "Translate" : "Translation not installed"}
                              </button>
                              <button
                                type="button"
                                className="button"
                                onClick={() => speakText(selectedText || item.title, item.language, 0.9)}
                              >
                                Hear pronunciation
                              </button>
                              <button type="button" className="button" onClick={() => saveWildWord(item)}>
                                Save to Seen in the Wild
                              </button>
                              <button
                                type="button"
                                className="button"
                                onClick={async () => {
                                  setDictionaryLoadingById((prev) => ({ ...prev, [item.id]: true }));
                                  try {
                                    const result = await lookupWord(item.language, selectedText || item.title);
                                    setDictionaryById((prev) => ({ ...prev, [item.id]: result }));
                                  } finally {
                                    setDictionaryLoadingById((prev) => ({ ...prev, [item.id]: false }));
                                  }
                                }}
                              >
                                Wiktionary lookup
                              </button>
                            </div>
                            <label
                              className="muted"
                              htmlFor={`selection-${item.id}`}
                              style={{ display: "block", marginTop: "0.5rem" }}
                            >
                              Selected text
                            </label>
                            <input
                              id={`selection-${item.id}`}
                              className="text-input"
                              value={selectedText}
                              onChange={(event) =>
                                setSelectionById((prev) => ({ ...prev, [item.id]: event.target.value }))
                              }
                              placeholder="Highlight text above, or type selection here."
                            />
                            {translationLoadingById[item.id] ? (
                              <p className="muted">Translating...</p>
                            ) : null}
                            {translationById[item.id] ? <p className="muted">Translation: {translationById[item.id]}</p> : null}
                            {translationErrorById[item.id] ? (
                              <p className="feedback-incorrect">{translationErrorById[item.id]}</p>
                            ) : null}
                            {!translateReady && translateStatusLoaded ? (
                              <p className="muted">Translation not installed. Run npm run translate:setup.</p>
                            ) : null}
                            {dictionaryLoadingById[item.id] ? (
                              <p className="muted">Looking up Wiktionary...</p>
                            ) : null}
                            {dictionaryById[item.id] ? (
                              <div className="muted" style={{ marginTop: "0.5rem" }}>
                                <p style={{ marginBottom: "0.2rem" }}>
                                  <strong>Word:</strong> {dictionaryById[item.id].word}
                                </p>
                                {dictionaryById[item.id].lookupWord &&
                                dictionaryById[item.id].lookupWord !== dictionaryById[item.id].word ? (
                                  <p style={{ marginBottom: "0.2rem" }}>
                                    <strong>Base form:</strong> {dictionaryById[item.id].lookupWord}
                                  </p>
                                ) : null}
                                <p style={{ marginBottom: "0.2rem" }}>
                                  <strong>Meaning:</strong> {dictionaryById[item.id].definition}
                                </p>
                                <p style={{ marginBottom: "0.2rem" }}>
                                  <strong>POS:</strong> {dictionaryById[item.id].partOfSpeech}
                                </p>
                                <p style={{ marginBottom: "0.2rem" }}>
                                  <strong>Pronunciation:</strong>{" "}
                                  {dictionaryById[item.id].pronunciation || "Not available"}
                                </p>
                                {dictionaryById[item.id].examples.length > 0 ? (
                                  <p style={{ marginBottom: 0 }}>
                                    <strong>Example:</strong> {dictionaryById[item.id].examples[0]}
                                  </p>
                                ) : null}
                                {dictionaryById[item.id].note ? (
                                  <p style={{ marginBottom: 0 }}>{dictionaryById[item.id].note}</p>
                                ) : null}
                              </div>
                            ) : null}
                            {saveMessageById[item.id] ? <p className="feedback-correct">{saveMessageById[item.id]}</p> : null}
                            {item.url ? (
                              <p style={{ marginTop: "0.35rem" }}>
                                <a href={item.url} target="_blank" rel="noreferrer">
                                  Open source
                                </a>
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
