import { shouldUseComicLesson } from "./comic-lesson";
import type { LessonSceneStep } from "./lesson-storyboard-types";
import type { LessonDisplayMode } from "./user-lesson-settings";

export function shouldRenderComicLesson({
  lessonDisplayMode,
  lessonId,
  scene,
}: {
  lessonDisplayMode: LessonDisplayMode;
  lessonId: string;
  scene: LessonSceneStep | null | undefined;
}): boolean {
  return lessonDisplayMode === "comic" && shouldUseComicLesson(lessonId, scene);
}
