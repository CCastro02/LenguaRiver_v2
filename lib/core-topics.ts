export const CORE_TOPICS = [
  "Introductions",
  "Ordering Food",
  "Directions",
  "Shopping",
  "Hotel",
  "Emergencies & Help",
  "Job & Hobbies",
] as const;

export type CoreTopic = (typeof CORE_TOPICS)[number];

/**
 * Maps varied lesson topic labels to canonical core topic buckets.
 * Keep this permissive for legacy lesson topic strings.
 */
export function toCoreTopic(topic: string): CoreTopic | null {
  const normalized = topic.toLowerCase();
  if (normalized.includes("introduc")) {
    return "Introductions";
  }
  if (normalized.includes("ordering food")) {
    return "Ordering Food";
  }
  if (normalized.includes("direction")) {
    return "Directions";
  }
  if (normalized.includes("shopping")) {
    return "Shopping";
  }
  if (normalized.includes("hotel") || normalized.includes("accommodation")) {
    return "Hotel";
  }
  if (normalized.includes("emergenc") || normalized.includes("help")) {
    return "Emergencies & Help";
  }
  if (normalized.includes("job") || normalized.includes("hobbies") || normalized.includes("work")) {
    return "Job & Hobbies";
  }
  return null;
}
