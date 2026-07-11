import type { ScenarioTierGate } from "@/app/lesson/lesson-tier-gates";
import type { ScenarioFamilyTierKey } from "@/lib/lesson-scenario-family";

export type ScenarioTierSnapshot = {
  scenarioKey: string;
  orderedTiers: { tier: ScenarioFamilyTierKey }[];
  tierGate: Record<ScenarioFamilyTierKey, ScenarioTierGate>;
};

function tierCompletionPercent(
  tier: ScenarioFamilyTierKey,
  gate: ScenarioTierGate
): number {
  if (gate.completionPercent !== null) {
    return gate.completionPercent;
  }
  // Real / legacy tiers omit percent in gates — treat as incomplete until lessons are done.
  return 0;
}

/**
 * First tier under 100% completion opens by default.
 * When every tier is 100%, open the last tier (stay on latest progress — least disruptive).
 */
export function getDefaultOpenScenarioTier(
  orderedTiers: { tier: ScenarioFamilyTierKey }[],
  tierGate: Record<ScenarioFamilyTierKey, ScenarioTierGate>
): ScenarioFamilyTierKey {
  if (orderedTiers.length === 0) {
    return "easy";
  }
  const firstIncomplete = orderedTiers.find(
    (bucket) => tierCompletionPercent(bucket.tier, tierGate[bucket.tier]) < 100
  );
  if (firstIncomplete) {
    return firstIncomplete.tier;
  }
  return orderedTiers[orderedTiers.length - 1]!.tier;
}

/** Stable signature for auto-open when tier completion crosses 100%. */
export function buildScenarioTierCompletionSignature(
  snapshots: ScenarioTierSnapshot[]
): string {
  return snapshots
    .map((s) => {
      const parts = s.orderedTiers.map((t) => {
        const g = s.tierGate[t.tier];
        return `${t.tier}:${g.completionPercent ?? "na"}`;
      });
      return `${s.scenarioKey}=${parts.join(",")}`;
    })
    .sort()
    .join("|");
}
