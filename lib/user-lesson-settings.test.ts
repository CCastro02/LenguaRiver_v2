/**
 * Run: `npx tsx lib/user-lesson-settings.test.ts`
 */
import assert from "node:assert/strict";

import {
  DEFAULT_LESSON_UI_SETTINGS,
  LENGUARIVER_LESSON_UI_SETTINGS_STORAGE_KEY,
  coerceLessonUiSettings,
  getLessonUiSettingsFromBrowser,
  resolveLessonDisplayMode,
  setLessonUiSettingsInBrowser,
} from "./user-lesson-settings";

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

const storage = new MemoryStorage();
const g = globalThis as typeof globalThis & { window?: Window };
const prevWindow = g.window;
g.window = { localStorage: storage } as unknown as Window;

try {
  storage.clear();

  assert.deepEqual(DEFAULT_LESSON_UI_SETTINGS, { lessonDisplayMode: "comic" });
  assert.equal(getLessonUiSettingsFromBrowser().lessonDisplayMode, "comic");
  assert.equal(resolveLessonDisplayMode("classic"), "classic");
  assert.equal(resolveLessonDisplayMode("comic"), "comic");
  assert.equal(resolveLessonDisplayMode("invalid"), "comic");
  assert.equal(resolveLessonDisplayMode(null), "comic");

  storage.setItem(LENGUARIVER_LESSON_UI_SETTINGS_STORAGE_KEY, "{not-json");
  assert.equal(getLessonUiSettingsFromBrowser().lessonDisplayMode, "comic");

  storage.setItem(
    LENGUARIVER_LESSON_UI_SETTINGS_STORAGE_KEY,
    JSON.stringify({ lessonDisplayMode: "bogus", futureField: "keep-me" })
  );
  assert.equal(getLessonUiSettingsFromBrowser().lessonDisplayMode, "comic");
  const rawAfterInvalid = JSON.parse(
    storage.getItem(LENGUARIVER_LESSON_UI_SETTINGS_STORAGE_KEY)!
  ) as Record<string, unknown>;
  assert.equal(rawAfterInvalid.futureField, "keep-me");

  const classic = setLessonUiSettingsInBrowser({ lessonDisplayMode: "classic" });
  assert.equal(classic.lessonDisplayMode, "classic");
  assert.equal(getLessonUiSettingsFromBrowser().lessonDisplayMode, "classic");

  const comic = setLessonUiSettingsInBrowser({ lessonDisplayMode: "comic" });
  assert.equal(comic.lessonDisplayMode, "comic");
  assert.equal(getLessonUiSettingsFromBrowser().lessonDisplayMode, "comic");

  assert.equal(coerceLessonUiSettings({ lessonDisplayMode: "nope" }).lessonDisplayMode, "comic");
} finally {
  if (prevWindow) {
    g.window = prevWindow;
  } else {
    delete g.window;
  }
}

console.log("user-lesson-settings.test.ts: ok");
