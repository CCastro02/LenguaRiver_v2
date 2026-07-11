/**
 * Run: `npx tsx lib/exercise-completion-gate.test.ts`
 */
import {
  getActiveRecallExerciseGateState,
  getActiveRecallPhaseGateState,
} from "./exercise-completion-gate";
import { getDefaultOpenScenarioTier } from "./lesson-tier-dropdown";
import type { ScenarioFamilyTierKey } from "@/lib/lesson-scenario-family";
import type { ScenarioTierGate } from "@/app/lesson/lesson-tier-gates";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

// Speaking + typing green → canComplete
{
  const gate = getActiveRecallExerciseGateState({
    exerciseId: "ex-1",
    voiceMarkedCorrect: true,
    typingStatus: "correct",
  });
  assert(gate.canComplete, "speaking+typing complete should pass");
}

// 80% speech eval ok → canComplete speaking
{
  const gate = getActiveRecallExerciseGateState({
    exerciseId: "ex-2",
    voiceMarkedCorrect: false,
    speechEvalOk: true,
    speechMatchPercent: 80,
    typingStatus: "correct",
  });
  assert(gate.canComplete, "80% speech with typing correct should pass");
}

// Typing ok, speaking incomplete
{
  const gate = getActiveRecallExerciseGateState({
    exerciseId: "ex-3",
    voiceMarkedCorrect: false,
    typingStatus: "correct",
  });
  assert(!gate.canComplete, "missing speaking should block");
  assert(gate.missing.includes("speaking"), "missing should list speaking");
}

// Speaking ok, typing incomplete
{
  const gate = getActiveRecallExerciseGateState({
    exerciseId: "ex-4",
    voiceMarkedCorrect: true,
    typingStatus: "partial",
  });
  assert(!gate.canComplete, "partial typing should block");
  assert(gate.missing.includes("typing"), "missing should list typing");
}

// Phase: all exercises complete
{
  const phase = getActiveRecallPhaseGateState([
    {
      exerciseId: "a",
      voiceMarkedCorrect: true,
      typingStatus: "correct",
    },
    {
      exerciseId: "b",
      voiceMarkedCorrect: true,
      typingStatus: "correct",
      speechMatchPercent: 82,
    },
  ]);
  assert(phase.canComplete, "all exercises complete enables phase");
}

function tierGate(easy: number, medium: number): Record<ScenarioFamilyTierKey, ScenarioTierGate> {
  return {
    easy: { unlocked: true, lockReason: null, completionPercent: easy },
    medium: {
      unlocked: easy >= 75,
      lockReason: easy >= 75 ? null : "locked",
      completionPercent: medium,
    },
    real: {
      unlocked: medium >= 75,
      lockReason: medium >= 75 ? null : "locked",
      completionPercent: null,
    },
    legacy: { unlocked: true, lockReason: null, completionPercent: null },
  };
}

// Easy 100%, Medium 0% → Medium open
{
  const ordered = [{ tier: "easy" as const }, { tier: "medium" as const }];
  const open = getDefaultOpenScenarioTier(ordered, tierGate(100, 0));
  assert(open === "medium", `expected medium, got ${open}`);
}

// Easy 100%, Medium 100%, Real 0% → Real open
{
  const ordered = [
    { tier: "easy" as const },
    { tier: "medium" as const },
    { tier: "real" as const },
  ];
  const open = getDefaultOpenScenarioTier(ordered, tierGate(100, 100));
  assert(open === "real", `expected real, got ${open}`);
}

// Easy incomplete → Easy open
{
  const ordered = [{ tier: "easy" as const }, { tier: "medium" as const }];
  const open = getDefaultOpenScenarioTier(ordered, tierGate(40, 0));
  assert(open === "easy", `expected easy, got ${open}`);
}

// All complete → last tier (stable fallback)
{
  const ordered = [{ tier: "easy" as const }, { tier: "medium" as const }];
  const open = getDefaultOpenScenarioTier(ordered, tierGate(100, 100));
  assert(open === "medium", `expected medium fallback, got ${open}`);
}

console.log("exercise-completion-gate.test.ts: ok");
