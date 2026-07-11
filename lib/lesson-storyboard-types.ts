export type LessonStoryTier = "easy" | "medium" | "real";

export type LessonStoryPhase =
  | "exposure"
  | "breakdown"
  | "active_recall"
  | "reinforcement";

export type LessonSceneHintStrength = "strong" | "medium" | "light";

export type LessonSceneSpeaker = "learner" | "stranger" | "narration";

export type LessonSceneBubbleStyle = "speech" | "thought" | "caption";

export type LessonSceneEmphasis = "normal" | "strong";

export type LessonScenePanelPosition =
  | "auto"
  | "top"
  | "top-left"
  | "top-right"
  | "bottom"
  | "bottom-left"
  | "bottom-right";

/** Comic page layout — matches scene generator and dialogue JSON `layout`. */
export type ComicLayoutName =
  | "three_strip"
  | "two_plus_one"
  | "four_grid"
  | "wide_top";

/** Visual panel region on the comic page (maps to generator panel index). */
export type ComicPanelSlot = "panel-1" | "panel-2" | "panel-3" | "panel-4";

/**
 * Panel-relative bubble coordinates (0–100) inside the `panelSlot` region.
 * Page CSS position = panel region + placement offset (see `bubblePageRect`).
 */
export type ComicPanelPlacement = {
  x: number;
  y: number;
  width?: number;
};

export type LessonScenePanel = {
  speaker: LessonSceneSpeaker;
  text: string;
  bubbleStyle: LessonSceneBubbleStyle;
  emphasis?: LessonSceneEmphasis;
  /** Page-level anchor fallback when `panelSlot` / `placement` are absent. */
  position?: LessonScenePanelPosition;
  /** Target comic panel region on the page image. */
  panelSlot?: ComicPanelSlot;
  /** Position inside `panelSlot` (not the full page). */
  placement?: ComicPanelPlacement;
};

export type LessonSceneSourceType =
  | "curated"
  | "internet"
  | "generated"
  | "fallback";

export type LessonSceneStep = {
  id: string;
  order: number;
  title?: string;
  semanticGoal: string;
  sentenceKeys?: string[];
  phaseKeys?: LessonStoryPhase[];
  imageUrl?: string;
  thumbnailUrl?: string;
  sourceType: LessonSceneSourceType;
  attribution?: {
    provider?: string;
    creator?: string;
    pageUrl?: string;
    license?: string;
    licenseUrl?: string;
  };
  hintStrength: LessonSceneHintStrength;
  /** Layout of visual panels on the comic page image (percent regions via `getComicPanelRegions`). */
  comicLayout?: ComicLayoutName;
  /** Comic-panel dialogue baked into the scene image (also used by the generator). */
  panels?: LessonScenePanel[];
  characterSetId?: string;
  locationId?: string;
};

export type LessonStoryboard = {
  lessonId: string;
  tier: LessonStoryTier;
  module?: string;
  characterSetId?: string;
  locationId?: string;
  scenes: LessonSceneStep[];
};
