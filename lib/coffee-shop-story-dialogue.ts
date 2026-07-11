import type {
  ComicLayoutName,
  LessonScenePanel,
  LessonStoryTier,
} from "./lesson-storyboard-types";
import rawDialogue from "./coffee-shop-story-dialogue.json";

export type CoffeeShopSceneDialogueSpec = {
  layout: ComicLayoutName;
  hint: "strong" | "medium" | "light";
  busy?: boolean;
  visualBeats: string[];
  panels: LessonScenePanel[];
};

export type CoffeeShopDialogueByTier = Record<string, CoffeeShopSceneDialogueSpec>;

const DIALOGUE = rawDialogue as Record<LessonStoryTier, CoffeeShopDialogueByTier>;

export function getCoffeeShopSceneDialogue(
  tier: LessonStoryTier,
  imageFilename: string
): CoffeeShopSceneDialogueSpec | null {
  return DIALOGUE[tier]?.[imageFilename] ?? null;
}

export function imageFilenameFromUrl(imageUrl: string): string | null {
  const parts = imageUrl.split("/");
  const last = parts[parts.length - 1];
  return last?.endsWith(".png") ? last : null;
}

export function panelsForCoffeeScene(
  tier: LessonStoryTier,
  imageUrl: string
): LessonScenePanel[] {
  const filename = imageFilenameFromUrl(imageUrl);
  if (!filename) {
    return [];
  }
  return getCoffeeShopSceneDialogue(tier, filename)?.panels ?? [];
}

export function comicLayoutForCoffeeScene(
  tier: LessonStoryTier,
  imageUrl: string
): ComicLayoutName | undefined {
  const filename = imageFilenameFromUrl(imageUrl);
  if (!filename) {
    return undefined;
  }
  return getCoffeeShopSceneDialogue(tier, filename)?.layout;
}

/** Sentence keys derived from panel text for storyboard metadata. */
export function sentenceKeysFromPanels(panels: LessonScenePanel[]): string[] {
  return panels.map((panel) => panel.text.trim()).filter(Boolean);
}

export const COFFEE_SHOP_DIALOGUE = DIALOGUE;
