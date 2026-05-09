"use client";

import { useEffect, useState } from "react";

export type InterestTopic = "engineering" | "fitness" | "business" | "travel";

const INTEREST_STORAGE_KEY = "lenguariver_selected_interest";
const DEFAULT_INTEREST: InterestTopic = "engineering";

export const INTEREST_OPTIONS: Array<{ value: InterestTopic; label: string }> = [
  { value: "engineering", label: "Engineering" },
  { value: "fitness", label: "Fitness" },
  { value: "business", label: "Business" },
  { value: "travel", label: "Travel" },
];

function isInterestTopic(value: string): value is InterestTopic {
  return INTEREST_OPTIONS.some((option) => option.value === value);
}

function loadSelectedInterest(): InterestTopic {
  if (typeof window === "undefined") {
    return DEFAULT_INTEREST;
  }
  const raw = window.localStorage.getItem(INTEREST_STORAGE_KEY);
  if (!raw || !isInterestTopic(raw)) {
    return DEFAULT_INTEREST;
  }
  return raw;
}

export function useSelectedInterest(): [InterestTopic, (next: InterestTopic) => void] {
  const [selectedInterest, setSelectedInterest] = useState<InterestTopic>(DEFAULT_INTEREST);
  const [interestHydrated, setInterestHydrated] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- hydrate from localStorage after mount; initial DEFAULT matches SSR */
    setSelectedInterest(loadSelectedInterest());
    setInterestHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!interestHydrated) {
      return;
    }
    window.localStorage.setItem(INTEREST_STORAGE_KEY, selectedInterest);
  }, [selectedInterest, interestHydrated]);

  return [selectedInterest, setSelectedInterest];
}
