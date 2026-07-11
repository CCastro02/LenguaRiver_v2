"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { resolveBubbleStyle, type ComicBubbleView } from "@/lib/comic-bubble-layout";
import { computeComicBubblePixelShift } from "@/lib/comic-bubble-safe-bounds";
import {
  buildComicDynamicHeightKey,
  calculateComicExtraHeight,
  comicBubbleNeedsScrollFallbackAfterGrow,
  readComicBasePanelHeightPx,
  stabilizeComicExtraHeight,
} from "@/lib/comic-dynamic-page-height";
import {
  estimateComicBubbleHeightPx,
  layoutStackedComicBubbles,
  type ComicBubbleStackOutput,
} from "@/lib/comic-bubble-stack-layout";
import {
  buildComicBubbleStackInputs,
  buildVisibleComicBubblesForPhase,
  findComicBubbleIndexByCompletionKey,
  shouldUseStackedComicBubbleLayout,
} from "@/lib/comic-visible-bubbles";
import { getComicInlineInputId } from "@/lib/comic-bubble-retry";
import { buildInlineBlankParts } from "@/lib/comic-inline-blank";
import {
  getComicPracticeDrawerTitle,
  shouldShowComicPracticeDrawer,
} from "@/lib/comic-practice-drawer";
import {
  canGoToNextComicPanel,
  canGoToPreviousComicPanel,
  clampComicPanelIndex,
  clampComicPanelIndexAfterCountChange,
  comicPanelNavLabel,
  getComicPanelIndexAfterNavReset,
  getComicPanelNavCountMismatchWarning,
  getComicPanelNavBubbleRenderMetadata,
  getNextComicPanelIndex,
  getPreviousComicPanelIndex,
  shouldFocusComicPanelFromBubbleClick,
} from "@/lib/comic-panel-navigation";
import type {
  LessonScenePanelPosition,
  LessonSceneSpeaker,
  LessonSceneStep,
  LessonStoryPhase,
  LessonStoryTier,
} from "@/lib/lesson-storyboard-types";

export type { ComicBubbleView };
export { buildVisibleComicBubblesForPhase };

const PHASE_LABEL: Record<LessonStoryPhase, string> = {
  exposure: "Exposure",
  breakdown: "Breakdown",
  active_recall: "Active recall",
  reinforcement: "Reinforcement",
};

export type ComicControlVisualState = "default" | "active" | "complete" | "blocked";

export type ComicBubbleControls = {
  sentenceKey?: string;
  /** STT scoring target (bubble line or full recall answer). */
  speechTargetText?: string;
  /** Per-bubble exposure completion key. */
  completionKey?: string;
  listenState?: ComicControlVisualState;
  speakState?: ComicControlVisualState;
  showSpeak?: boolean;
  speakSlot?: ReactNode;
  /** TTS source when display text differs (e.g. fill-in blank). */
  playText?: string;
  /** Override displayed sentence (e.g. fill-in prompt). */
  displayPrompt?: string;
  /** Rich prompt layout (e.g. chunk highlight + instruction). */
  displayPromptSlot?: ReactNode;
  showInlineInput?: boolean;
  inlineInputValue?: string;
  onInlineInputChange?: (value: string) => void;
  onInlineInputKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  inlineInputDisabled?: boolean;
  inlineInputPlaceholder?: string;
  showCheck?: boolean;
  onCheck?: () => void;
  checkDisabled?: boolean;
  checkState?: ComicControlVisualState;
  feedbackSlot?: ReactNode;
  /** Expanded practice UI rendered in the comic practice drawer (below art). */
  practiceDrawerSlot?: ReactNode;
  /** Typing hints for active recall / reinforcement (also shown in drawer when space is tight). */
  answerHintDrawerSlot?: ReactNode;
  showRetryButton?: boolean;
  onRetry?: () => void;
  retryDisabled?: boolean;
  retryLabel?: string;
};

export type LessonComicPanelProps = {
  scene: LessonSceneStep;
  lessonTitle: string;
  tier: LessonStoryTier;
  phase: LessonStoryPhase;
  activeText?: string | null;
  visualHint?: string | null;
  showVisualHint?: boolean;
  showAllPanels?: boolean;
  onPlayText: (text: string) => void;
  getBubbleControls?: (
    bubble: ComicBubbleView,
    context: { bubbleIndex: number; isFocused: boolean }
  ) => ComicBubbleControls;
  scorePercent?: number;
  scoreLabel?: string;
  phaseAdvanceNote?: string | null;
  phaseAdvanceActionSlot?: ReactNode;
  feedbackSlot?: ReactNode;
  /** Changes when scene, phase, or focused exercise/target changes — not on Exposure recording. */
  panelNavResetKey: string;
  /** When set, focuses the bubble with this completion key (e.g. from “Go to missing bubble”). */
  focusCompletionKey?: string | null;
  onFocusCompletionKeyHandled?: () => void;
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

function positionClass(position: LessonScenePanelPosition, speaker: LessonSceneSpeaker): string {
  const resolved = position === "auto" ? defaultAnchor(speaker) : position;
  switch (resolved) {
    case "top":
      return "lr-comic-bubble--pos-top";
    case "top-left":
      return "lr-comic-bubble--pos-top-left";
    case "top-right":
      return "lr-comic-bubble--pos-top-right";
    case "bottom":
      return "lr-comic-bubble--pos-bottom";
    case "bottom-left":
      return "lr-comic-bubble--pos-bottom-left";
    case "bottom-right":
    default:
      return "lr-comic-bubble--pos-bottom-right";
  }
}

function speakerClass(speaker: LessonSceneSpeaker): string {
  if (speaker === "learner") {
    return "lr-comic-bubble--learner";
  }
  if (speaker === "stranger") {
    return "lr-comic-bubble--stranger";
  }
  return "lr-comic-bubble--caption";
}

function bubbleDesiredPageRect(
  bubble: ComicBubbleView,
  layout: LessonSceneStep["comicLayout"]
): { left: number; top: number; width: number } | null {
  const pageRect = resolveBubbleStyle(bubble, layout);
  if (!pageRect?.useAbsolutePosition) {
    return null;
  }
  return {
    left: pageRect.left,
    top: pageRect.top,
    width: pageRect.width,
  };
}

function bubbleInlineStyleFromRect(rect: {
  left: number;
  top: number;
  width: number;
  zIndex?: number;
}): CSSProperties {
  return {
    left: `${rect.left}%`,
    top: `${rect.top}%`,
    width: `${rect.width}%`,
    maxWidth: `${rect.width}%`,
    right: "auto",
    bottom: "auto",
    transform: "none",
    ...(rect.zIndex != null ? { zIndex: rect.zIndex } : {}),
  };
}

function focusedPanelSlot(focusedBubble: ComicBubbleView | undefined): string | undefined {
  return focusedBubble?.panelSlot;
}

function resolveControlVisualState(
  state: ComicControlVisualState | undefined,
  isFocused: boolean
): ComicControlVisualState {
  if (state === "complete" || state === "blocked") {
    return state;
  }
  if (isFocused) {
    return state ?? "active";
  }
  return state ?? "default";
}

function isBubbleFocusClick(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }
  return !target.closest("button, input, textarea, select, a");
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

export function LessonComicPanel({
  scene,
  lessonTitle,
  tier,
  phase,
  activeText,
  visualHint,
  showVisualHint = false,
  showAllPanels = false,
  onPlayText,
  getBubbleControls,
  scorePercent,
  scoreLabel,
  phaseAdvanceNote,
  phaseAdvanceActionSlot,
  feedbackSlot,
  panelNavResetKey,
  focusCompletionKey,
  onFocusCompletionKeyHandled,
}: LessonComicPanelProps) {
  const sceneLabel = scene.title ?? `Escena ${scene.order}`;
  const imageAlt = scene.title ? `${scene.title}: ${scene.semanticGoal}` : scene.semanticGoal;
  const visibleBubbles = useMemo(
    () =>
      buildVisibleComicBubblesForPhase({
        scene,
        phase,
        tier,
        showCaption: showVisualHint,
        showAllPanels,
        activeText,
      }),
    [activeText, phase, scene, showAllPanels, showVisualHint, tier]
  );
  const panelCount = visibleBubbles.length;
  const showPanelNav = panelCount > 1;
  const bubbleNavInputs = useMemo(
    () =>
      visibleBubbles.map((bubble, bubbleIndex) => {
        const controls = getBubbleControls?.(bubble, {
          bubbleIndex,
          isFocused: false,
        });
        return {
          text: bubble.text,
          sentenceKey: controls?.sentenceKey,
        };
      }),
    [getBubbleControls, visibleBubbles]
  );
  const [comicPanelIndex, setComicPanelIndex] = useState(0);
  const mainPanelRef = useRef<HTMLDivElement>(null);
  const bubbleRefs = useRef<Map<number, HTMLElement>>(new Map());
  const panelCountRef = useRef(panelCount);

  useLayoutEffect(() => {
    panelCountRef.current = panelCount;
  }, [panelCount]);
  const [comicExtraHeight, setComicExtraHeight] = useState(0);
  const comicExtraHeightRef = useRef(0);
  const basePanelHeightRef = useRef(0);
  const dynamicHeightKeyRef = useRef("");
  const focusedBubbleShiftRef = useRef({ shiftX: 0, shiftY: 0, needsScrollFallback: false });
  const [focusedBubbleShift, setFocusedBubbleShift] = useState<{
    shiftX: number;
    shiftY: number;
    needsScrollFallback: boolean;
  }>({ shiftX: 0, shiftY: 0, needsScrollFallback: false });
  const prevPanelCountRef = useRef(panelCount);
  const prevResetKeyRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (prevResetKeyRef.current === panelNavResetKey) {
      return;
    }
    prevResetKeyRef.current = panelNavResetKey;
    let nextIndex = getComicPanelIndexAfterNavReset(bubbleNavInputs, activeText ?? undefined, {
      phase,
      hasPanelNavigation: showPanelNav,
    });
    if (focusCompletionKey?.trim()) {
      const byKey = findComicBubbleIndexByCompletionKey(visibleBubbles, focusCompletionKey);
      if (byKey >= 0) {
        nextIndex = byKey;
      }
    }
    setComicPanelIndex(nextIndex);
    if (focusCompletionKey?.trim()) {
      onFocusCompletionKeyHandled?.();
    }
  }, [
    activeText,
    bubbleNavInputs,
    focusCompletionKey,
    onFocusCompletionKeyHandled,
    panelNavResetKey,
    phase,
    showPanelNav,
    visibleBubbles,
  ]);

  useLayoutEffect(() => {
    const prevCount = prevPanelCountRef.current;
    if (prevCount === panelCount) {
      return;
    }
    prevPanelCountRef.current = panelCount;
    setComicPanelIndex((prev) =>
      clampComicPanelIndexAfterCountChange(prev, prevCount, panelCount)
    );
  }, [panelCount]);

  const safePanelIndex = clampComicPanelIndex(comicPanelIndex, panelCount);
  const focusedBubble = visibleBubbles[safePanelIndex];
  const useStackedLayout = useMemo(
    () =>
      shouldUseStackedComicBubbleLayout(visibleBubbles, scene.comicLayout, {
        panelNavigation: showPanelNav,
      }),
    [scene.comicLayout, showPanelNav, visibleBubbles]
  );
  const [bubbleMeasuredHeights, setBubbleMeasuredHeights] = useState<Record<number, number>>({});
  const [panelBoundsPx, setPanelBoundsPx] = useState({ width: 0, height: 0 });

  const setBubbleRef = useCallback((bubbleIndex: number, element: HTMLElement | null) => {
    if (element) {
      bubbleRefs.current.set(bubbleIndex, element);
    } else {
      bubbleRefs.current.delete(bubbleIndex);
    }
  }, []);

  const measureBubbleHeights = useCallback(() => {
    const panelEl = mainPanelRef.current;
    if (!panelEl) {
      return;
    }
    const panelRect = panelEl.getBoundingClientRect();
    if (panelRect.width > 0 && panelRect.height > 0) {
      setPanelBoundsPx({ width: panelRect.width, height: panelRect.height });
    }
    const next: Record<number, number> = {};
    bubbleRefs.current.forEach((element, bubbleIndex) => {
      const height = element.getBoundingClientRect().height;
      if (height > 0) {
        next[bubbleIndex] = height;
      }
    });
    setBubbleMeasuredHeights((prev) => {
      const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
      for (const key of keys) {
        const index = Number(key);
        if (prev[index] !== next[index]) {
          return next;
        }
      }
      return prev;
    });
  }, []);

  useLayoutEffect(() => {
    measureBubbleHeights();
    const panelEl = mainPanelRef.current;
    if (!panelEl) {
      return;
    }
    const observer = new ResizeObserver(measureBubbleHeights);
    observer.observe(panelEl);
    bubbleRefs.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [measureBubbleHeights, visibleBubbles, safePanelIndex, phase, panelCount, focusedBubble?.id]);

  const stackLayoutByIndex = useMemo(() => {
    const map = new Map<number, ComicBubbleStackOutput>();
    if (!useStackedLayout) {
      return map;
    }
    const bounds =
      panelBoundsPx.width > 0 && panelBoundsPx.height > 0
        ? panelBoundsPx
        : { width: 600, height: 460 };

    const heightEstimates = new Map<number, number>();
    visibleBubbles.forEach((bubble, bubbleIndex) => {
      const controls =
        getBubbleControls?.(bubble, {
          bubbleIndex,
          isFocused: bubbleIndex === safePanelIndex,
        }) ?? {};
      heightEstimates.set(
        bubbleIndex,
        estimateComicBubbleHeightPx({
          isFocused: bubbleIndex === safePanelIndex,
          hasInlineInput: controls.showInlineInput,
          hasRetry: controls.showRetryButton,
        })
      );
    });

    const inputs = buildComicBubbleStackInputs(
      visibleBubbles,
      scene.comicLayout,
      safePanelIndex,
      heightEstimates
    ).map((input) => ({
      ...input,
      measuredHeightPx: bubbleMeasuredHeights[input.bubbleIndex],
    }));

    for (const output of layoutStackedComicBubbles({
      bubbles: inputs,
      panelBoundsPx: bounds,
    })) {
      map.set(output.bubbleIndex, output);
    }
    return map;
  }, [
    bubbleMeasuredHeights,
    getBubbleControls,
    panelBoundsPx,
    safePanelIndex,
    scene.comicLayout,
    useStackedLayout,
    visibleBubbles,
  ]);
  const canGoBack = canGoToPreviousComicPanel(safePanelIndex);
  const canGoNext = canGoToNextComicPanel(safePanelIndex, panelCount);
  const panelLabel = comicPanelNavLabel(safePanelIndex, panelCount);

  const goToPreviousPanel = useCallback(() => {
    setComicPanelIndex((prev) =>
      getPreviousComicPanelIndex(prev, panelCountRef.current)
    );
  }, []);

  const goToNextPanel = useCallback(() => {
    setComicPanelIndex((prev) => getNextComicPanelIndex(prev, panelCountRef.current));
  }, []);

  const focusBubbleAtIndex = useCallback((index: number) => {
    setComicPanelIndex(clampComicPanelIndex(index, panelCountRef.current));
  }, []);

  const onBubbleClick = useCallback(
    (bubbleIndex: number, event: MouseEvent<HTMLElement>) => {
      const targetIsInteractive = !isBubbleFocusClick(event.target);
      if (!shouldFocusComicPanelFromBubbleClick(targetIsInteractive, showPanelNav)) {
        return;
      }
      focusBubbleAtIndex(bubbleIndex);
    },
    [focusBubbleAtIndex, showPanelNav]
  );

  const panelNavBubbleMeta = useMemo(
    () => getComicPanelNavBubbleRenderMetadata(panelCount, showPanelNav),
    [panelCount, showPanelNav]
  );

  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !showPanelNav) {
      return;
    }
    const clickableCount = panelNavBubbleMeta.filter((meta) => meta.clickable).length;
    const warning = getComicPanelNavCountMismatchWarning(panelCount, clickableCount);
    if (warning) {
      console.warn(`[LessonComicPanel] ${warning}`);
    }
  }, [panelNavBubbleMeta, panelCount, showPanelNav]);

  useEffect(() => {
    if (!showPanelNav) {
      return;
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }
      if (event.key === "ArrowLeft" && canGoToPreviousComicPanel(safePanelIndex)) {
        event.preventDefault();
        goToPreviousPanel();
      } else if (event.key === "ArrowRight" && canGoToNextComicPanel(safePanelIndex, panelCount)) {
        event.preventDefault();
        goToNextPanel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goToNextPanel, goToPreviousPanel, panelCount, safePanelIndex, showPanelNav]);

  const focusPanel = focusedPanelSlot(focusedBubble);
  const focusedControls =
    focusedBubble != null
      ? getBubbleControls?.(focusedBubble, {
          bubbleIndex: safePanelIndex,
          isFocused: true,
        }) ?? {}
      : {};

  const structuralDynamicHeightKey = useMemo(
    () =>
      buildComicDynamicHeightKey({
        navResetKey: panelNavResetKey,
        sceneId: scene.id,
        phase,
        panelIndex: safePanelIndex,
        focusedBubbleId: focusedBubble?.id,
        showInlineInput: focusedControls.showInlineInput,
        showRetryButton: focusedControls.showRetryButton,
      }),
    [
      focusedBubble?.id,
      focusedControls.showInlineInput,
      focusedControls.showRetryButton,
      panelNavResetKey,
      phase,
      safePanelIndex,
      scene.id,
    ]
  );
  const prevStructuralDynamicHeightKeyRef = useRef(structuralDynamicHeightKey);

  useLayoutEffect(() => {
    comicExtraHeightRef.current = comicExtraHeight;
  }, [comicExtraHeight]);

  useLayoutEffect(() => {
    focusedBubbleShiftRef.current = focusedBubbleShift;
  }, [focusedBubbleShift]);

  useLayoutEffect(() => {
    const panelEl = mainPanelRef.current;
    let frameId = 0;

    const clearDynamicHeight = () => {
      comicExtraHeightRef.current = 0;
      basePanelHeightRef.current = 0;
      dynamicHeightKeyRef.current = "";
      focusedBubbleShiftRef.current = { shiftX: 0, shiftY: 0, needsScrollFallback: false };
      if (panelEl) {
        panelEl.style.setProperty("--lr-comic-extra-height", "0px");
      }
      setComicExtraHeight(0);
      setFocusedBubbleShift({ shiftX: 0, shiftY: 0, needsScrollFallback: false });
    };

    if (prevStructuralDynamicHeightKeyRef.current !== structuralDynamicHeightKey) {
      prevStructuralDynamicHeightKeyRef.current = structuralDynamicHeightKey;
      comicExtraHeightRef.current = 0;
      basePanelHeightRef.current = 0;
      dynamicHeightKeyRef.current = "";
      focusedBubbleShiftRef.current = { shiftX: 0, shiftY: 0, needsScrollFallback: false };
      if (panelEl) {
        panelEl.style.setProperty("--lr-comic-extra-height", "0px");
      }
    }

    if (!panelEl || !focusedBubble) {
      frameId = requestAnimationFrame(clearDynamicHeight);
      return () => cancelAnimationFrame(frameId);
    }

    const measure = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        const bubbleEl = panelEl.querySelector<HTMLElement>(".lr-comic-bubble--focused");
        if (!bubbleEl) {
          clearDynamicHeight();
          return;
        }

        const hintOpen = Boolean(bubbleEl.querySelector(".lr-comic-answer-hint"));
        const answerRevealed = Boolean(bubbleEl.querySelector(".lr-comic-expected-answer"));
        const fullDynamicHeightKey = buildComicDynamicHeightKey({
          navResetKey: panelNavResetKey,
          sceneId: scene.id,
          phase,
          panelIndex: safePanelIndex,
          focusedBubbleId: focusedBubble.id,
          showInlineInput: focusedControls.showInlineInput,
          showRetryButton: focusedControls.showRetryButton,
          hintOpen,
          answerRevealed,
        });

        const layoutKeyChanged = dynamicHeightKeyRef.current !== fullDynamicHeightKey;
        if (layoutKeyChanged) {
          dynamicHeightKeyRef.current = fullDynamicHeightKey;
          comicExtraHeightRef.current = 0;
          basePanelHeightRef.current = 0;
          panelEl.style.setProperty("--lr-comic-extra-height", "0px");
          setComicExtraHeight(0);
        }

        if (basePanelHeightRef.current <= 0) {
          basePanelHeightRef.current = readComicBasePanelHeightPx(
            panelEl,
            comicExtraHeightRef.current
          );
        }
        const basePanelHeight = basePanelHeightRef.current;
        if (basePanelHeight <= 0) {
          return;
        }

        const panelRect = panelEl.getBoundingClientRect();
        const bubbleRect = bubbleEl.getBoundingClientRect();
        const appliedShift = focusedBubbleShiftRef.current;
        const bubbleTop = bubbleRect.top - panelRect.top + appliedShift.shiftY;
        const bubbleLeft = bubbleRect.left - panelRect.left + appliedShift.shiftX;
        const bubbleBottom = bubbleRect.bottom - panelRect.top + appliedShift.shiftY;
        const bubbleRight = bubbleRect.right - panelRect.left + appliedShift.shiftX;
        const currentExtra = comicExtraHeightRef.current;

        const measuredExtra = calculateComicExtraHeight({
          bubbleBottomPx: bubbleBottom,
          basePanelHeightPx: basePanelHeight,
          isFocusedBubble: true,
        });

        const nextExtra = stabilizeComicExtraHeight({
          measuredExtraPx: measuredExtra,
          currentExtraPx: currentExtra,
          allowShrink: layoutKeyChanged,
        });

        if (nextExtra !== currentExtra) {
          comicExtraHeightRef.current = nextExtra;
          panelEl.style.setProperty("--lr-comic-extra-height", `${nextExtra}px`);
          setComicExtraHeight(nextExtra);
        }

        const effectivePanelHeight = basePanelHeight + nextExtra;
        const shift = computeComicBubblePixelShift(
          effectivePanelHeight,
          panelRect.width,
          bubbleTop,
          bubbleLeft,
          bubbleBottom,
          bubbleRight
        );
        const needsScrollFallback = comicBubbleNeedsScrollFallbackAfterGrow(
          {
            bubbleBottomPx: bubbleBottom,
            basePanelHeightPx: basePanelHeight,
            extraHeightPx: nextExtra,
          },
          shift
        );

        setFocusedBubbleShift((prev) => {
          if (
            prev.shiftX === shift.shiftX &&
            prev.shiftY === shift.shiftY &&
            prev.needsScrollFallback === needsScrollFallback
          ) {
            return prev;
          }
          const next = { ...shift, needsScrollFallback };
          focusedBubbleShiftRef.current = next;
          return next;
        });
      });
    };

    measure();
    const bubbleEl = panelEl.querySelector<HTMLElement>(".lr-comic-bubble--focused");
    if (!bubbleEl) {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(bubbleEl);
    observer.observe(panelEl);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [
    focusedBubble,
    focusedControls.showInlineInput,
    focusedControls.showRetryButton,
    panelNavResetKey,
    phase,
    safePanelIndex,
    scene.id,
    structuralDynamicHeightKey,
  ]);

  const hintText =
    visualHint ??
    (showVisualHint ? `Pista visual: ${scene.semanticGoal}` : null);
  const displayScore =
    typeof scorePercent === "number" && Number.isFinite(scorePercent)
      ? Math.round(Math.min(100, Math.max(0, scorePercent)))
      : null;
  const filledStars =
    displayScore === null ? 0 : Math.min(5, Math.round(displayScore / 20));
  const practiceDrawerContent =
    focusedControls.practiceDrawerSlot ?? focusedControls.answerHintDrawerSlot;
  const showPracticeDrawer = shouldShowComicPracticeDrawer(phase, {
    hasPracticeContent: Boolean(focusedControls.practiceDrawerSlot),
    hasAnswerHints: Boolean(focusedControls.answerHintDrawerSlot),
    needsLayoutFallback: focusedBubbleShift.needsScrollFallback,
  });
  const mainPanelStyle = {
    "--lr-comic-extra-height": `${comicExtraHeight}px`,
  } as CSSProperties;

  return (
    <section
      className="lr-comic-lesson"
      aria-label={`Comic lesson for ${lessonTitle}`}
      data-tier={tier}
      data-phase={phase}
      data-comic-layout={scene.comicLayout ?? "none"}
      data-focus-panel={focusPanel ?? "none"}
      data-panel-nav={showPanelNav ? "true" : "false"}
    >
      <div className="lr-comic-page">
        <div className="lr-comic-scene-label" aria-hidden="true">
          {scene.order}. {sceneLabel.toUpperCase()}
        </div>

        <div
          className="lr-comic-main-panel"
          ref={mainPanelRef}
          style={mainPanelStyle}
          data-comic-extra-height={comicExtraHeight > 0 ? "true" : undefined}
        >
          {scene.imageUrl ? (
            <Image
              src={scene.imageUrl}
              alt={imageAlt}
              fill
              className="lr-comic-scene-image"
              sizes="(max-width: 599px) 100vw, min(900px, 100%)"
              priority={scene.order === 1}
            />
          ) : (
            <div className="lr-comic-scene-placeholder" role="img" aria-label={imageAlt}>
              <span aria-hidden="true">☕</span>
            </div>
          )}

          <div className="lr-comic-bubbles" aria-live="polite">
            {visibleBubbles.map((bubble, bubbleIndex) => {
              const isFocused = bubbleIndex === safePanelIndex;
              const controls =
                getBubbleControls?.(bubble, { bubbleIndex, isFocused }) ?? {};
              const panelPositioned = Boolean(bubble.panelSlot && scene.comicLayout);
              const stackLayout = stackLayoutByIndex.get(bubbleIndex);
              const displayMode =
                stackLayout?.displayMode ?? (isFocused ? "focused" : showPanelNav ? "preview" : "focused");
              const isPreview = displayMode === "preview";
              const desiredRect = bubbleDesiredPageRect(bubble, scene.comicLayout);
              const baseRect = stackLayout
                ? {
                    left: stackLayout.left,
                    top: stackLayout.top,
                    width: stackLayout.width,
                    zIndex: stackLayout.zIndex,
                  }
                : desiredRect;
              const focusShift = isFocused ? focusedBubbleShift : null;
              const inlineStyle: CSSProperties | undefined = (() => {
                const shiftVars =
                  isFocused &&
                  focusShift &&
                  (focusShift.shiftX > 0 || focusShift.shiftY > 0)
                    ? ({
                        "--lr-comic-bubble-shift-x": `${-focusShift.shiftX}px`,
                        "--lr-comic-bubble-shift-y": `${-focusShift.shiftY}px`,
                      } as CSSProperties)
                    : undefined;
                if (!baseRect && !shiftVars) {
                  return shiftVars;
                }
                return {
                  ...(baseRect ? bubbleInlineStyleFromRect(baseRect) : {}),
                  ...(shiftVars ?? {}),
                };
              })();
              const isDimmed = showPanelNav && !isFocused;
              const isStacked = Boolean(stackLayout?.stacked);
              const listenState = resolveControlVisualState(controls.listenState, isFocused);
              const speakState = resolveControlVisualState(controls.speakState, isFocused);
              const displayText = controls.displayPrompt ?? bubble.text;
              const playText =
                controls.playText ?? bubble.playText ?? bubble.speechTargetText;
              const showActiveRecallInput =
                controls.showInlineInput && Boolean(controls.displayPromptSlot);
              const blankParts =
                controls.showInlineInput &&
                !controls.displayPromptSlot &&
                controls.displayPrompt
                  ? buildInlineBlankParts(controls.displayPrompt)
                  : null;
              const bubbleComplete =
                speakState === "complete" ||
                (listenState === "complete" && controls.showSpeak === false);
              return (
                <article
                  key={bubble.id}
                  ref={(element) => setBubbleRef(bubbleIndex, element)}
                  className={[
                    "lr-comic-bubble",
                    speakerClass(bubble.speaker),
                    panelPositioned
                      ? "lr-comic-bubble--panel-positioned"
                      : positionClass(bubble.anchor, bubble.speaker),
                    bubble.bubbleStyle === "caption" ? "lr-comic-bubble--style-caption" : "",
                    bubble.bubbleStyle === "thought" ? "lr-comic-bubble--style-thought" : "",
                    bubble.emphasis === "strong" ? "lr-comic-bubble--emphasis-strong" : "",
                    !showPanelNav && bubble.isActive ? "lr-comic-bubble--active" : "",
                    bubble.isContext ? "lr-comic-bubble--context" : "",
                    isFocused ? "lr-comic-bubble--focused lr-comic-bubble--size-active" : "lr-comic-bubble--size-context",
                    displayMode === "focused"
                      ? "lr-comic-bubble--display-focused"
                      : "lr-comic-bubble--display-preview",
                    isStacked ? "lr-comic-bubble--stacked" : "",
                    stackLayout?.shifted ? "lr-comic-bubble--stack-shifted" : "",
                    isFocused && focusedBubbleShift.needsScrollFallback
                      ? "lr-comic-bubble--scroll-fallback"
                      : "",
                    phase === "active_recall" && isFocused
                      ? "lr-comic-bubble--active-recall"
                      : "",
                    isDimmed ? "lr-comic-bubble--dimmed" : "",
                    listenState === "complete" ? "lr-comic-bubble--listen-complete" : "",
                    speakState === "complete" ? "lr-comic-bubble--speak-complete" : "",
                    bubbleComplete ? "lr-comic-bubble--done" : "",
                    speakState === "active" || listenState === "active"
                      ? "lr-comic-bubble--in-progress"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={inlineStyle}
                  data-panel-slot={bubble.panelSlot}
                  data-sentence-key={controls.sentenceKey}
                  data-bubble-index={bubbleIndex}
                  data-display-mode={displayMode}
                  data-clickable={
                    stackLayout?.clickable ?? panelNavBubbleMeta[bubbleIndex]?.clickable
                      ? "true"
                      : undefined
                  }
                  data-panel-clickable={panelNavBubbleMeta[bubbleIndex]?.clickable ? "true" : undefined}
                  aria-current={isFocused ? "true" : undefined}
                  onClick={(event) => onBubbleClick(bubbleIndex, event)}
                  role={showPanelNav ? "group" : undefined}
                  tabIndex={showPanelNav && isFocused ? 0 : showPanelNav ? -1 : undefined}
                >
                  <div className="lr-comic-bubble__sentence">
                    {controls.displayPromptSlot ? (
                      <>
                        {controls.displayPromptSlot}
                        {showActiveRecallInput ? (
                          <p className="lr-comic-bubble__text lr-comic-bubble__text--input-row">
                            <input
                              id={
                                controls.sentenceKey
                                  ? getComicInlineInputId(controls.sentenceKey)
                                  : undefined
                              }
                              className="lr-comic-bubble__inline-input text-input"
                              type="text"
                              value={controls.inlineInputValue ?? ""}
                              onChange={(event) =>
                                controls.onInlineInputChange?.(event.target.value)
                              }
                              onKeyDown={controls.onInlineInputKeyDown}
                              placeholder={controls.inlineInputPlaceholder}
                              disabled={controls.inlineInputDisabled}
                              autoComplete="off"
                              aria-label={controls.inlineInputPlaceholder ?? "Your answer"}
                            />
                          </p>
                        ) : null}
                      </>
                    ) : controls.showInlineInput && blankParts?.hasBlank ? (
                      <p className="lr-comic-bubble__text lr-comic-bubble__text--inline">
                        <span>{blankParts.prefix}</span>
                        <input
                          id={
                            controls.sentenceKey
                              ? getComicInlineInputId(controls.sentenceKey)
                              : undefined
                          }
                          className="lr-comic-bubble__inline-input text-input"
                          type="text"
                          value={controls.inlineInputValue ?? ""}
                          onChange={(event) =>
                            controls.onInlineInputChange?.(event.target.value)
                          }
                          onKeyDown={controls.onInlineInputKeyDown}
                          placeholder={controls.inlineInputPlaceholder}
                          disabled={controls.inlineInputDisabled}
                          autoComplete="off"
                          aria-label={controls.inlineInputPlaceholder ?? "Your answer"}
                        />
                        <span>{blankParts.suffix}</span>
                      </p>
                    ) : controls.showInlineInput ? (
                      <p className="lr-comic-bubble__text lr-comic-bubble__text--inline">
                        <span>{displayText}</span>
                        <input
                          id={
                            controls.sentenceKey
                              ? getComicInlineInputId(controls.sentenceKey)
                              : undefined
                          }
                          className="lr-comic-bubble__inline-input text-input"
                          type="text"
                          value={controls.inlineInputValue ?? ""}
                          onChange={(event) =>
                            controls.onInlineInputChange?.(event.target.value)
                          }
                          onKeyDown={controls.onInlineInputKeyDown}
                          placeholder={controls.inlineInputPlaceholder}
                          disabled={controls.inlineInputDisabled}
                          autoComplete="off"
                          aria-label={controls.inlineInputPlaceholder ?? "Your answer"}
                        />
                      </p>
                    ) : (
                      <p className="lr-comic-bubble__text">{displayText}</p>
                    )}
                  </div>

                  {bubble.bubbleStyle !== "caption" && bubble.speaker !== "narration" ? (
                    <div
                      className={[
                        "lr-comic-bubble__actions",
                        isDimmed ? "lr-comic-bubble__actions--compact" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      role="group"
                      aria-label="Bubble controls"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="lr-comic-bubble__play lr-comic-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          onPlayText(playText);
                        }}
                        aria-label={`Play: ${playText}`}
                      >
                        <span className="lr-comic-bubble__play-icon" aria-hidden="true">
                          ▶
                        </span>
                        Play
                      </button>
                      {!isPreview && controls.showSpeak !== false && controls.speakSlot ? (
                        <div className="lr-comic-bubble__speak">{controls.speakSlot}</div>
                      ) : null}
                      {!isPreview && controls.showCheck ? (
                        <button
                          type="button"
                          className="lr-comic-btn lr-comic-btn--primary"
                          onClick={(event) => {
                            event.stopPropagation();
                            controls.onCheck?.();
                          }}
                          disabled={controls.checkDisabled || !controls.onCheck}
                        >
                          Check
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {!isPreview && (controls.feedbackSlot || controls.showRetryButton) ? (
                    <div
                      className="lr-comic-bubble__feedback"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {controls.feedbackSlot}
                      {controls.showRetryButton ? (
                        <button
                          type="button"
                          className="lr-comic-retry-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            controls.onRetry?.();
                          }}
                          disabled={controls.retryDisabled || !controls.onRetry}
                        >
                          {controls.retryLabel ?? "Try again"}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          {hintText && showVisualHint ? (
            <aside className="lr-comic-visual-hint" aria-label="Pista visual">
              <span className="lr-comic-visual-hint__icon" aria-hidden="true">
                💡
              </span>
              <span className="lr-comic-visual-hint__text">{hintText}</span>
            </aside>
          ) : null}
        </div>

        {showPracticeDrawer && focusedBubble ? (
          <section
            className="lr-comic-practice-drawer"
            aria-label="Comic practice"
            data-panel-index={safePanelIndex}
          >
            <h3 className="lr-comic-practice-drawer__title">
              {getComicPracticeDrawerTitle(focusedBubble, phase)}
            </h3>
            <div className="lr-comic-practice-drawer__body">{practiceDrawerContent}</div>
          </section>
        ) : null}

        <footer className="lr-comic-footer">
          {showPanelNav ? (
            <nav className="lr-comic-panel-nav" aria-label="Comic panel navigation">
              <button
                type="button"
                className="lr-comic-panel-nav__button"
                onClick={goToPreviousPanel}
                disabled={!canGoBack}
                aria-label="Back panel"
              >
                ← Back panel
              </button>
              <span className="lr-comic-panel-nav__label">{panelLabel}</span>
              <button
                type="button"
                className="lr-comic-panel-nav__button"
                onClick={goToNextPanel}
                disabled={!canGoNext}
                aria-label="Next panel"
              >
                Next panel →
              </button>
            </nav>
          ) : null}
          <div className="lr-comic-footer__progress">
            <p className="lr-comic-score-card__score lr-comic-score-card__phase">
              {PHASE_LABEL[phase]}
              {displayScore !== null ? (
                <>
                  {" "}
                  · {scoreLabel ?? "Progreso"}: <strong>{displayScore}%</strong>
                </>
              ) : null}
            </p>
            <div className="lr-comic-score-card__stars" aria-hidden={displayScore === null}>
              {Array.from({ length: 5 }, (_, i) => (
                <span
                  key={i}
                  className={
                    i < filledStars ? "lr-comic-star lr-comic-star--filled" : "lr-comic-star"
                  }
                >
                  ★
                </span>
              ))}
            </div>
          </div>
          {phaseAdvanceNote ? (
            <p className="lr-comic-gate-note" role="status">
              {phaseAdvanceNote}
            </p>
          ) : null}
          {phaseAdvanceActionSlot ? (
            <div className="lr-comic-gate-actions">{phaseAdvanceActionSlot}</div>
          ) : null}
        </footer>

        {feedbackSlot ? <div className="lr-comic-feedback">{feedbackSlot}</div> : null}
      </div>
    </section>
  );
}
