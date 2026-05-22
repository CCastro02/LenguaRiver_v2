import { browser } from "wxt/browser";

import { DEFAULT_SETTINGS, getSettings, setSettings } from "../../lib/storage";

const LANGUAGES: { value: string; label: string }[] = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "ru", label: "Russian" },
  { value: "ja", label: "Japanese" },
  { value: "zh", label: "Chinese (generic)" },
];

const form = document.getElementById("form") as HTMLFormElement;
const sourceLanguage = document.getElementById("sourceLanguage") as HTMLSelectElement;
const targetLanguage = document.getElementById("targetLanguage") as HTMLSelectElement;
const ttsRate = document.getElementById("ttsRate") as HTMLInputElement;
const ttsRateValue = document.getElementById("ttsRateValue") as HTMLSpanElement;
const status = document.getElementById("status") as HTMLParagraphElement;
const sameLanguageWarning = document.getElementById(
  "sameLanguageWarning",
) as HTMLParagraphElement;

for (const lang of LANGUAGES) {
  sourceLanguage.add(new Option(lang.label, lang.value));
  targetLanguage.add(new Option(lang.label, lang.value));
}

function showStatus(msg: string) {
  status.textContent = msg;
  window.setTimeout(() => {
    status.textContent = "";
  }, 1600);
}

function pickSelectValue(sel: HTMLSelectElement, value: string, fallback: string) {
  sel.value = LANGUAGES.some((l) => l.value === value) ? value : fallback;
}

function updateSameLanguageWarning() {
  sameLanguageWarning.hidden = sourceLanguage.value !== targetLanguage.value;
}

async function init() {
  const s = await getSettings();

  pickSelectValue(sourceLanguage, s.sourceLanguage, DEFAULT_SETTINGS.sourceLanguage);
  pickSelectValue(targetLanguage, s.targetLanguage, DEFAULT_SETTINGS.targetLanguage);
  ttsRate.value = String(s.ttsRate);
  ttsRateValue.textContent = Number(ttsRate.value).toFixed(1);
  updateSameLanguageWarning();

  sourceLanguage.addEventListener("change", async () => {
    await setSettings({ sourceLanguage: sourceLanguage.value });
    updateSameLanguageWarning();
    showStatus("Saved.");
  });

  targetLanguage.addEventListener("change", async () => {
    await setSettings({ targetLanguage: targetLanguage.value });
    updateSameLanguageWarning();
    showStatus("Saved.");
  });

  ttsRate.addEventListener("input", () => {
    ttsRateValue.textContent = Number(ttsRate.value).toFixed(1);
  });

  ttsRate.addEventListener("change", async () => {
    await setSettings({ ttsRate: Number(ttsRate.value) });
    showStatus("Saved.");
  });

  form.addEventListener("submit", (ev) => ev.preventDefault());
}

void init();
