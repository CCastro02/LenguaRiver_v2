import type { LessonSceneStep } from "./lesson-storyboard-types";

export type TextSceneCard = {
  icon: string;
  eyebrow: string;
  title: string;
  description: string;
  ariaLabel: string;
};

const DEFAULT_DESCRIPTION = "Watch the dialogue, then tap each bubble to understand the chunks.";

export function buildTextSceneCard(scene: LessonSceneStep, lessonTitle: string): TextSceneCard {
  const title = scene.title?.trim() || lessonTitle.trim() || `Scene ${scene.order}`;
  const semanticGoal = scene.semanticGoal.trim();
  const description =
    semanticGoal && semanticGoal.toLowerCase() !== title.toLowerCase()
      ? semanticGoal
      : DEFAULT_DESCRIPTION;

  return {
    icon: "☕",
    eyebrow: scene.imageUrl ? "Scene" : "Text scene",
    title,
    description,
    ariaLabel: `${title}: ${description}`,
  };
}
