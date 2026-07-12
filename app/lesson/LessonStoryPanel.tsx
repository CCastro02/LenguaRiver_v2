"use client";

import Image from "next/image";
import type { LessonSceneStep, LessonStoryPhase, LessonStoryTier } from "@/lib/lesson-storyboard-types";
import { buildTextSceneCard } from "@/lib/text-scene-card";

export type LessonStoryPanelProps = {
  scene: LessonSceneStep | null;
  lessonTitle: string;
  tier: LessonStoryTier;
  phase: LessonStoryPhase;
};

const PHASE_LABEL: Record<LessonStoryPhase, string> = {
  exposure: "Exposure",
  breakdown: "Breakdown",
  active_recall: "Active recall",
  reinforcement: "Reinforcement",
};

export function LessonStoryPanel({ scene, lessonTitle, tier, phase }: LessonStoryPanelProps) {
  if (!scene) {
    return null;
  }

  const caption = scene.title ?? scene.semanticGoal;
  const textSceneCard = buildTextSceneCard(scene, lessonTitle);
  const imageAlt = scene.imageUrl
    ? scene.title
      ? `${scene.title}: ${scene.semanticGoal}`
      : scene.semanticGoal
    : textSceneCard.ariaLabel;

  // TODO: user settings — story images on/off; data-story-mode: standard | immersive | compact
  return (
    <section
      className="lr-lesson-story-panel lr-lesson-story-panel--standard"
      aria-label={`Story scene for ${lessonTitle}`}
      data-tier={tier}
      data-phase={phase}
      data-story-mode="standard"
    >
      <div className="lr-lesson-story-frame">
        <div className="lr-lesson-story-page">
          {scene.imageUrl ? (
            <Image
              src={scene.imageUrl}
              alt={imageAlt}
              width={1024}
              height={576}
              className="lr-lesson-story-image"
              sizes="(max-width: 599px) 100vw, min(860px, 100%)"
              priority={scene.order === 1}
            />
          ) : (
            <div className="lr-lesson-story-placeholder" role="img" aria-label={imageAlt}>
              <div className="lr-comic-scene-card lr-comic-scene-card--story">
                <span className="lr-comic-scene-card__icon" aria-hidden="true">
                  {textSceneCard.icon}
                </span>
                <span className="lr-comic-scene-card__eyebrow">{textSceneCard.eyebrow}</span>
                <strong className="lr-comic-scene-card__title">{textSceneCard.title}</strong>
                <span className="lr-comic-scene-card__description">
                  {textSceneCard.description}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      <figcaption className="lr-lesson-story-caption">
        <span className="lr-lesson-story-caption-title">{caption}</span>
        <span className="lr-lesson-story-caption-phase">{PHASE_LABEL[phase]}</span>
      </figcaption>
    </section>
  );
}
