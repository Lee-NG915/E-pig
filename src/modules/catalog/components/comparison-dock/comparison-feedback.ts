"use client";

import { useSyncExternalStore } from "react";

type Feedback = { message: string };
const feedback = new Map<string, Feedback>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** Ephemeral status only; never persisted alongside the shopper's selection. */
export function announceComparison(marketId: string, message: string) {
  feedback.set(marketId, { message });
  listeners.forEach(listener => listener());
}

export function dismissComparisonFeedback(marketId: string) {
  feedback.delete(marketId);
  listeners.forEach(listener => listener());
}

export function useComparisonFeedback(marketId: string) {
  return useSyncExternalStore(subscribe, () => feedback.get(marketId) ?? null, () => null);
}
