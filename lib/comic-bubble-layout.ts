import {
  comicBubbleTextsMatch,
  getComicBubbleCompletionKey,
  getComicBubbleSpeechTargetText,
  normalizeComicBubbleText,
} from "./comic-bubble-text";
import { isNameOnlyPracticeText } from "./lesson-chunk-filter";
import { getComicPanelRegions } from "./comic-panel-layout";
import type {
  ComicPanelPlacement,
  ComicPanelSlot,
  LessonScenePanel,
  LessonScenePanelPosition,
  LessonSceneSpeaker,
  LessonSceneStep,
  LessonStoryTier,
} from "./lesson-storyboard-types";
import type { ComicLayoutName } from "./comic-panel-layout";

export type { ComicPanelPlacement };

export type ComicBubbleView = {
  id: string;
  speaker: LessonSceneSpeaker;
  /** Visible bubble copy (may differ for active-recall blanks). */
  text: string;
  /** Normalized panel line for STT scoring. */
  speechTargetText: string;
  /** TTS line (defaults to speech target). */
  playText: string;
  /** Per-bubble exposure completion key. */
  completionKey: string;
  bubbleStyle: LessonScenePanel["bubbleStyle"];
  emphasis?: LessonScenePanel["emphasis"];
  anchor: LessonScenePanelPosition;
  panelSlot?: ComicPanelSlot;
  placement?: ComicPanelPlacement;
  isActive: boolean;
  isContext: boolean;
};

export type ComicBubblePageRect = {
  left: number;
  top: number;
  width: number;
  useAbsolutePosition: boolean;
};

function defaultAnchor(speaker: LessonSceneSpeaker): LessonScenePanelPosition {
  if (speaker === "learner") {
    return "top-left";
  }
  if (speaker === "stranger") {
    return "top-right";
  }
  return "bottom-right";
}

function filterNameOnlySpeechPanels(
  panels: LessonScenePanel[],
  excludeNameOnlyPanels: boolean
): LessonScenePanel[] {
  if (!excludeNameOnlyPanels) {
    return panels;
  }
  return panels.filter(
    (panel) =>
      panel.bubbleStyle === "caption" ||
      panel.speaker === "narration" ||
      !isNameOnlyPracticeText(panel.text)
  );
}

function defaultPlacement(speaker: LessonSceneSpeaker): ComicPanelPlacement {
  if (speaker === "learner") {
    return { x: 8, y: 14, width: 82 };
  }
  if (speaker === "stranger") {
    return { x: 6, y: 14, width: 86 };
  }
  return { x: 10, y: 72, width: 78 };
}

function inferPanelSlot(
  panel: LessonScenePanel,
  index: number,
  layout: ComicLayoutName | undefined
): ComicPanelSlot | undefined {
  if (panel.panelSlot) {
    return panel.panelSlot;
  }
  if (!layout) {
    return undefined;
  }
  if (layout === "four_grid") {
    const slots: ComicPanelSlot[] = ["panel-1", "panel-2", "panel-3", "panel-4"];
    return slots[index] ?? "panel-1";
  }
  if (panel.speaker === "stranger") {
    return layout === "two_plus_one" ? "panel-2" : "panel-3";
  }
  if (panel.speaker === "narration") {
    return "panel-1";
  }
  return "panel-1";
}

/**
 * Converts panel-relative placement into page-relative CSS percentages.
 * `placement` x/y/width are relative inside `panelSlot`; output is relative to the full page.
 */
export function bubblePageRect(
  layout: ComicLayoutName | undefined,
  panelSlot: ComicPanelSlot | undefined,
  placement: ComicPanelPlacement | undefined
): ComicBubblePageRect | null {
  if (!layout || !panelSlot) {
    return null;
  }
  const regions = getComicPanelRegions(layout);
  const region = regions[panelSlot];
  if (!region) {
    return null;
  }
  const coords = placement ?? { x: 10, y: 14, width: 80 };
  const widthPct = Math.min(95, Math.max(28, coords.width ?? 80));
  const x = Math.min(92, Math.max(2, coords.x));
  const y = Math.min(88, Math.max(2, coords.y));

  return {
    left: region.left + (region.width * x) / 100,
    top: region.top + (region.height * y) / 100,
    width: (region.width * widthPct) / 100,
    useAbsolutePosition: true,
  };
}

export function selectVisibleComicPanels(
  panels: LessonScenePanel[],
  activeText: string,
  tier: LessonStoryTier,
  showCaption: boolean,
  showAllPanels = false,
  excludeNameOnlyPanels = false
): LessonScenePanel[] {
  const practicePanels = filterNameOnlySpeechPanels(panels, excludeNameOnlyPanels);
  const normalizedActive = normalizeComicBubbleText(activeText.trim());
  if (practicePanels.length === 0 && !normalizedActive) {
    return [];
  }

  if (showAllPanels) {
    const speechPanels = practicePanels.filter(
      (p) => p.bubbleStyle !== "caption" && p.speaker !== "narration"
    );
    const base = speechPanels.length > 0 ? speechPanels : practicePanels;
    const captionPanel =
      showCaption && tier !== "real"
        ? panels.find((p) => p.bubbleStyle === "caption" || p.speaker === "narration")
        : null;
    const selected = [...base];
    if (captionPanel && !selected.includes(captionPanel)) {
      selected.push(captionPanel);
    }
    return selected.slice(0, 4);
  }

  const activeIndex = practicePanels.findIndex((p) =>
    comicBubbleTextsMatch(p.text, normalizedActive)
  );
  const activePanel = activeIndex >= 0 ? practicePanels[activeIndex] : null;

  const contextCandidates = practicePanels.filter(
    (p, i) =>
      i !== activeIndex && !comicBubbleTextsMatch(p.text, normalizedActive)
  );
  const contextPanel =
    contextCandidates.find((p) => p.speaker !== activePanel?.speaker) ??
    contextCandidates[0] ??
    null;

  const captionPanel =
    showCaption && tier !== "real"
      ? panels.find((p) => p.bubbleStyle === "caption" || p.speaker === "narration")
      : null;

  const selected: LessonScenePanel[] = [];
  if (activePanel) {
    selected.push(activePanel);
  } else if (normalizedActive && !isNameOnlyPracticeText(normalizedActive)) {
    selected.push({
      speaker: "learner",
      text: normalizedActive,
      bubbleStyle: "speech",
      emphasis: "strong",
      panelSlot: "panel-1",
      placement: defaultPlacement("learner"),
    });
  } else if (practicePanels[0]) {
    selected.push(practicePanels[0]);
  }

  if (contextPanel && contextPanel !== selected[0]) {
    selected.push(contextPanel);
  }
  if (captionPanel && !selected.includes(captionPanel)) {
    selected.push(captionPanel);
  }

  return selected.slice(0, 3);
}

export type BuildComicBubblesOptions = {
  tier?: LessonStoryTier;
  showCaption?: boolean;
  /** Exposure: show every dialogue panel in the scene, not only active + context. */
  showAllPanels?: boolean;
  /** Panel nav owns focus — do not highlight bubbles from activeText. */
  suppressActiveHighlight?: boolean;
  /** Omit name-only speech panels (Active Recall, Breakdown, Reinforcement). */
  excludeNameOnlyPanels?: boolean;
};

export function buildComicBubbles(
  scene: LessonSceneStep,
  activeText: string | null | undefined,
  options?: BuildComicBubblesOptions
): ComicBubbleView[] {
  const tier = options?.tier ?? "easy";
  const showCaption = options?.showCaption ?? tier !== "real";
  const showAllPanels = options?.showAllPanels ?? false;
  const suppressActiveHighlight = options?.suppressActiveHighlight ?? false;
  const excludeNameOnlyPanels = options?.excludeNameOnlyPanels ?? false;
  const normalizedActive = activeText ? normalizeComicBubbleText(activeText.trim()) : "";
  const panels = scene.panels ?? [];
  const layout = scene.comicLayout;
  const visiblePanels = selectVisibleComicPanels(
    panels,
    normalizedActive,
    tier,
    showCaption,
    showAllPanels,
    excludeNameOnlyPanels
  );

  if (visiblePanels.length === 0 && normalizedActive) {
    const speechTargetText = getComicBubbleSpeechTargetText(normalizedActive);
    const completionKey = getComicBubbleCompletionKey(normalizedActive);
    return [
      {
        id: "active",
        speaker: "learner",
        text: normalizedActive,
        speechTargetText,
        playText: speechTargetText,
        completionKey,
        bubbleStyle: "speech",
        emphasis: "strong",
        anchor: "top-left",
        panelSlot: "panel-1",
        placement: defaultPlacement("learner"),
        isActive: true,
        isContext: false,
      },
    ];
  }

  const hasActiveInPanels = visiblePanels.some((p) =>
    comicBubbleTextsMatch(p.text, normalizedActive)
  );

  return visiblePanels.map((panel, index) => {
    const speechTargetText = getComicBubbleSpeechTargetText(panel.text);
    const completionKey = getComicBubbleCompletionKey(panel.text);
    const isActive =
      !suppressActiveHighlight &&
      normalizedActive.length > 0 &&
      (comicBubbleTextsMatch(panel.text, normalizedActive) ||
        (!hasActiveInPanels && index === 0));
    const text =
      isActive && normalizedActive.length > 0
        ? normalizeComicBubbleText(normalizedActive)
        : speechTargetText;
    const panelSlot = inferPanelSlot(panel, panels.indexOf(panel), layout);
    return {
      id: `${panel.speaker}-${panels.indexOf(panel)}`,
      speaker: panel.speaker,
      text,
      speechTargetText,
      playText: speechTargetText,
      completionKey,
      bubbleStyle: panel.bubbleStyle,
      emphasis: panel.emphasis,
      anchor: panel.position ?? defaultAnchor(panel.speaker),
      panelSlot,
      placement: panel.placement ?? defaultPlacement(panel.speaker),
      isActive,
      isContext: !isActive,
    };
  });
}

export function resolveBubbleStyle(
  bubble: ComicBubbleView,
  layout: ComicLayoutName | undefined
): ComicBubblePageRect | null {
  return bubblePageRect(layout, bubble.panelSlot, bubble.placement);
}
