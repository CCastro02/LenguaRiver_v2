import type { LessonSceneStep } from "./lesson-storyboard-types";

/** Coffee Shop story lessons that use the interactive comic lesson UI. */
export const COMIC_LESSON_IDS = new Set([
  "es-intro-coffee-stranger",
  "es-intro-coffee-stranger-02",
  "es-intro-coffee-stranger-03",
  "es-cafe-ordering-v1",
]);

export function shouldUseComicLesson(
  lessonId: string,
  scene: LessonSceneStep | null | undefined
): boolean {
  return Boolean(scene) && COMIC_LESSON_IDS.has(lessonId);
}
