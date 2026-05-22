import { browser } from "wxt/browser";

import { speakWithBrowserTts } from "../../lib/pronounce";
import { getSettings, getWildWords, removeWildWordById, STORAGE_KEYS } from "../../lib/storage";
import type { ExtensionWildWord } from "../../lib/types";

const listEl = document.getElementById("list") as HTMLDivElement;
const emptyEl = document.getElementById("empty-state") as HTMLParagraphElement;
const searchEl = document.getElementById("search") as HTMLInputElement;
const exportJsonBtn = document.getElementById("export-json") as HTMLButtonElement | null;
const hintEl = document.getElementById("hint") as HTMLDivElement;
const toastEl = document.getElementById("toast") as HTMLDivElement;

let allWords: ExtensionWildWord[] = [];
let filterQuery = "";
let toastTimeout = 0;

function formatSavedDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function wordMatches(row: ExtensionWildWord, q: string): boolean {
  if (!q.trim()) {
    return true;
  }
  const s = q.toLowerCase().trim();
  return (
    row.text.toLowerCase().includes(s) ||
    row.language.toLowerCase().includes(s) ||
    (row.targetLanguage?.toLowerCase().includes(s) ?? false) ||
    row.sourceDomain.toLowerCase().includes(s) ||
    row.sourceTitle.toLowerCase().includes(s)
  );
}

function visibleWords(): ExtensionWildWord[] {
  return allWords.filter((w) => wordMatches(w, filterQuery));
}

function showToast(msg: string) {
  window.clearTimeout(toastTimeout);
  toastEl.textContent = msg;
  if (!msg) {
    return;
  }
  toastTimeout = window.setTimeout(() => {
    toastEl.textContent = "";
  }, 4000);
}

function updateHint(words: ExtensionWildWord[], total: number) {
  if (total === 0) {
    hintEl.textContent = "";
    return;
  }
  const q = filterQuery.trim();
  if (q) {
    hintEl.textContent =
      words.length === total ? `Showing all ${total} saved` : `Showing ${words.length} of ${total} saved`;
  } else {
    hintEl.textContent = `Showing ${total} saved`;
  }
}

function createRow(word: ExtensionWildWord): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.id = word.id;

  const textP = document.createElement("p");
  textP.className = "row-text";
  textP.textContent = word.text;
  row.appendChild(textP);

  const meta = document.createElement("div");
  meta.className = "row-meta";

  const langSpan = document.createElement("span");
  langSpan.textContent = word.targetLanguage
    ? `Word: ${word.language} · Learning: ${word.targetLanguage}`
    : `Word: ${word.language}`;

  const dateSpan = document.createElement("span");
  dateSpan.textContent = formatSavedDate(word.savedAt);

  const domainSpan = document.createElement("span");
  domainSpan.textContent = word.sourceDomain || "—";

  meta.append(langSpan, dateSpan, domainSpan);
  row.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "row-actions";

  const pronounceBtn = document.createElement("button");
  pronounceBtn.type = "button";
  pronounceBtn.textContent = "Pronounce";
  pronounceBtn.setAttribute("aria-label", `Pronounce ${word.text.slice(0, 40)}`);
  pronounceBtn.addEventListener("click", () => {
    void pronounceWord(word);
  });

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "danger";
  delBtn.textContent = "Delete";
  delBtn.setAttribute("aria-label", `Delete ${word.text.slice(0, 40)}`);
  delBtn.addEventListener("click", () => {
    void deleteWord(word.id);
  });

  actions.append(pronounceBtn, delBtn);
  row.appendChild(actions);

  return row;
}

async function pronounceWord(word: ExtensionWildWord) {
  showToast("");
  const settings = await getSettings();
  const res = await speakWithBrowserTts(word.text, word.language, settings.ttsRate);
  if (!res.ok) {
    showToast(res.error);
  }
}

async function deleteWord(id: string) {
  showToast("");
  const removed = await removeWildWordById(id);
  if (!removed) {
    showToast("Could not delete.");
    return;
  }
  await loadAndRender();
}

function render() {
  const words = visibleWords();
  const total = allWords.length;

  listEl.replaceChildren();
  updateHint(words, total);

  if (total === 0) {
    emptyEl.hidden = false;
    listEl.hidden = true;
    return;
  }

  emptyEl.hidden = true;
  listEl.hidden = false;

  if (words.length === 0) {
    const note = document.createElement("p");
    note.className = "empty";
    note.textContent = filterQuery.trim()
      ? "No matches. Try another search."
      : "Nothing to show.";
    listEl.appendChild(note);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const w of words) {
    frag.appendChild(createRow(w));
  }
  listEl.appendChild(frag);
}

async function loadAndRender() {
  allWords = await getWildWords();
  render();
}

function downloadWildWordsExportJson(words: ExtensionWildWord[]) {
  const blob = new Blob([JSON.stringify(words, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "lenguariver-wild-words-export.json";
  a.rel = "nofollow";
  a.click();
  URL.revokeObjectURL(url);
}

async function exportWildWordsJson() {
  showToast("");
  const words = await getWildWords();
  downloadWildWordsExportJson(words);
  showToast(words.length ? `Exported ${words.length} saved word${words.length === 1 ? "" : "s"}.` : "Exported empty list.");
}

searchEl.addEventListener("input", () => {
  filterQuery = searchEl.value;
  render();
});

exportJsonBtn?.addEventListener("click", () => {
  void exportWildWordsJson();
});

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }
  if (Object.prototype.hasOwnProperty.call(changes, STORAGE_KEYS.wildWords)) {
    void loadAndRender();
  }
});

void loadAndRender();
