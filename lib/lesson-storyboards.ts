import {
  comicLayoutForCoffeeScene,
  panelsForCoffeeScene,
  sentenceKeysFromPanels,
} from "./coffee-shop-story-dialogue";
import type { LessonStoryboard, LessonSceneStep } from "./lesson-storyboard-types";

const COFFEE_LOCATION = "coffee-shop-corner";
const COFFEE_CAST = "coffee-stranger-cast";
const COFFEE_SCENE_BASE = "/images/lesson-scenes/coffee-shop";

function coffeeSceneImage(tier: "easy" | "medium" | "real", filename: string): string {
  return `${COFFEE_SCENE_BASE}/${tier}/${filename}`;
}

function generatedScene(
  tier: "easy" | "medium" | "real",
  partial: Omit<LessonSceneStep, "sourceType" | "imageUrl" | "panels" | "sentenceKeys"> & {
    imageUrl: string;
    sourceType?: LessonSceneStep["sourceType"];
  }
): LessonSceneStep {
  const panels = panelsForCoffeeScene(tier, partial.imageUrl);
  const comicLayout = comicLayoutForCoffeeScene(tier, partial.imageUrl);
  return {
    sourceType: "generated",
    ...partial,
    comicLayout,
    panels,
    sentenceKeys: sentenceKeysFromPanels(panels),
  };
}

const EASY_SCENES: LessonSceneStep[] = [
  generatedScene("easy", {
    id: "easy-1-arrival",
    order: 1,
    title: "Finding a seat",
    semanticGoal: "Arrive at the coffee shop and ask if a chair is free",
    phaseKeys: ["exposure"],
    hintStrength: "strong",
    characterSetId: COFFEE_CAST,
    locationId: COFFEE_LOCATION,
    imageUrl: coffeeSceneImage("easy", "scene-01-arrival.png"),
  }),
  generatedScene("easy", {
    id: "easy-2-greeting",
    order: 2,
    title: "Casual greeting",
    semanticGoal: "Greet someone nearby and exchange a quick how-are-you",
    phaseKeys: ["exposure", "breakdown"],
    hintStrength: "strong",
    characterSetId: COFFEE_CAST,
    locationId: COFFEE_LOCATION,
    imageUrl: coffeeSceneImage("easy", "scene-02-greeting.png"),
  }),
  generatedScene("easy", {
    id: "easy-3-routine",
    order: 3,
    title: "Morning routine",
    semanticGoal: "Share that you come here before work and ask about their habit",
    phaseKeys: ["breakdown"],
    hintStrength: "strong",
    characterSetId: COFFEE_CAST,
    locationId: COFFEE_LOCATION,
    imageUrl: coffeeSceneImage("easy", "scene-03-ordering.png"),
  }),
  generatedScene("easy", {
    id: "easy-4-names",
    order: 4,
    title: "Introducing yourself",
    semanticGoal: "Introduce yourself and ask the other person's name",
    phaseKeys: ["active_recall"],
    hintStrength: "strong",
    characterSetId: COFFEE_CAST,
    locationId: COFFEE_LOCATION,
    imageUrl: coffeeSceneImage("easy", "scene-04-clarification.png"),
  }),
  generatedScene("easy", {
    id: "easy-5-close",
    order: 5,
    title: "Nice to meet you",
    semanticGoal: "Close the introduction warmly and confirm names",
    phaseKeys: ["reinforcement"],
    hintStrength: "strong",
    characterSetId: COFFEE_CAST,
    locationId: COFFEE_LOCATION,
    imageUrl: coffeeSceneImage("easy", "scene-05-closing.png"),
  }),
];

const MEDIUM_SCENES: LessonSceneStep[] = [
  generatedScene("medium", {
    id: "medium-1-arrival",
    order: 1,
    title: "Joining the table",
    semanticGoal: "Ask politely if you can sit at a shared table",
    phaseKeys: ["exposure"],
    hintStrength: "medium",
    characterSetId: COFFEE_CAST,
    locationId: COFFEE_LOCATION,
    imageUrl: coffeeSceneImage("medium", "scene-01-arrival.png"),
  }),
  generatedScene("medium", {
    id: "medium-2-small-talk",
    order: 2,
    title: "How the day is going",
    semanticGoal: "Open with small talk about how the day is going",
    phaseKeys: ["exposure", "breakdown"],
    hintStrength: "medium",
    characterSetId: COFFEE_CAST,
    locationId: COFFEE_LOCATION,
    imageUrl: coffeeSceneImage("medium", "scene-02-greeting.png"),
  }),
  generatedScene("medium", {
    id: "medium-3-frequency",
    order: 3,
    title: "How often you come",
    semanticGoal: "Ask how often they visit and hear a routine detail",
    phaseKeys: ["breakdown"],
    hintStrength: "medium",
    characterSetId: COFFEE_CAST,
    locationId: COFFEE_LOCATION,
    imageUrl: coffeeSceneImage("medium", "scene-03-small-talk.png"),
  }),
  generatedScene("medium", {
    id: "medium-4-work-detail",
    order: 4,
    title: "Work nearby",
    semanticGoal: "Clarify where they work and respond with a follow-up detail",
    phaseKeys: ["active_recall"],
    hintStrength: "medium",
    characterSetId: COFFEE_CAST,
    locationId: COFFEE_LOCATION,
    imageUrl: coffeeSceneImage("medium", "scene-04-clarification.png"),
  }),
  generatedScene("medium", {
    id: "medium-5-close",
    order: 5,
    title: "Names and goodbye",
    semanticGoal: "Exchange names and close the conversation naturally",
    phaseKeys: ["reinforcement"],
    hintStrength: "medium",
    characterSetId: COFFEE_CAST,
    locationId: COFFEE_LOCATION,
    imageUrl: coffeeSceneImage("medium", "scene-05-closing.png"),
  }),
];

const REAL_SCENES: LessonSceneStep[] = [
  generatedScene("real", {
    id: "real-1-arrival",
    order: 1,
    title: "Quick excuse me",
    semanticGoal: "Interrupt briefly to ask if the seat is free in a busy shop",
    phaseKeys: ["exposure"],
    hintStrength: "light",
    characterSetId: COFFEE_CAST,
    locationId: COFFEE_LOCATION,
    imageUrl: coffeeSceneImage("real", "scene-01-arrival.png"),
  }),
  generatedScene("real", {
    id: "real-2-pace",
    order: 2,
    title: "Fast small talk",
    semanticGoal: "Keep pace with a short back-and-forth while people wait",
    phaseKeys: ["exposure", "breakdown"],
    hintStrength: "light",
    characterSetId: COFFEE_CAST,
    locationId: COFFEE_LOCATION,
    imageUrl: coffeeSceneImage("real", "scene-02-greeting.png"),
  }),
  generatedScene("real", {
    id: "real-3-commute",
    order: 3,
    title: "Commute context",
    semanticGoal: "Mention where you came from and why you only have a minute",
    phaseKeys: ["breakdown"],
    hintStrength: "light",
    characterSetId: COFFEE_CAST,
    locationId: COFFEE_LOCATION,
    imageUrl: coffeeSceneImage("real", "scene-03-ongoing-chat.png"),
  }),
  generatedScene("real", {
    id: "real-4-names",
    order: 4,
    title: "Names on the fly",
    semanticGoal: "Introduce yourself and ask their name without slowing the line",
    phaseKeys: ["active_recall"],
    hintStrength: "light",
    characterSetId: COFFEE_CAST,
    locationId: COFFEE_LOCATION,
    imageUrl: coffeeSceneImage("real", "scene-04-natural-response.png"),
  }),
  generatedScene("real", {
    id: "real-5-close",
    order: 5,
    title: "See you next time",
    semanticGoal: "Wrap up with a natural nice-to-meet-you and implied next visit",
    phaseKeys: ["reinforcement"],
    hintStrength: "light",
    characterSetId: COFFEE_CAST,
    locationId: COFFEE_LOCATION,
    imageUrl: coffeeSceneImage("real", "scene-05-closing.png"),
  }),
];

export const LESSON_STORYBOARDS: LessonStoryboard[] = [
  {
    lessonId: "es-intro-coffee-stranger",
    tier: "easy",
    module: "Introductions",
    characterSetId: COFFEE_CAST,
    locationId: COFFEE_LOCATION,
    scenes: EASY_SCENES,
  },
  {
    lessonId: "es-intro-coffee-stranger-02",
    tier: "medium",
    module: "Introductions",
    characterSetId: COFFEE_CAST,
    locationId: COFFEE_LOCATION,
    scenes: MEDIUM_SCENES,
  },
  {
    lessonId: "es-intro-coffee-stranger-03",
    tier: "real",
    module: "Introductions",
    characterSetId: COFFEE_CAST,
    locationId: COFFEE_LOCATION,
    scenes: REAL_SCENES,
  },
];

export function getLessonStoryboard(lessonId: string): LessonStoryboard | null {
  return LESSON_STORYBOARDS.find((board) => board.lessonId === lessonId) ?? null;
}
