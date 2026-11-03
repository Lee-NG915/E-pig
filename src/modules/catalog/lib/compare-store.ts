"use client";

import { useEffect, useSyncExternalStore } from "react";

import { MAX_COMPARE_ITEMS, parseCompareQuery, type CompareItem } from "./compare-query";

export type CompareSelection = { items: CompareItem[]; hydrated: boolean };
export type AddCompareResult = "added" | "updated" | "exists" | "full";
const STORAGE_PREFIX = "e-pig:compare:v1:";
const serverSnapshot: CompareSelection = { items: [], hydrated: false };
const snapshots = new Map<string, CompareSelection>();
const listeners = new Map<string, Set<() => void>>();
let listening = false;

const copyItem = ({ productId, variantId }: CompareItem): CompareItem => ({ productId, ...(variantId === undefined ? {} : { variantId }) });

function readSaved(value: string | null): CompareItem[] {
  if (!value) return [];
  try {
    const saved: unknown = JSON.parse(value);
    if (!Array.isArray(saved) || saved.length > MAX_COMPARE_ITEMS) return [];
    const items: CompareItem[] = [];
    for (const raw of saved) {
      if (!raw || typeof raw !== "object" || typeof raw.productId !== "string" || (raw.variantId !== undefined && typeof raw.variantId !== "string")) return [];
      const parsed = parseCompareQuery(`${encodeURIComponent(raw.productId)}${raw.variantId === undefined ? "" : `:${encodeURIComponent(raw.variantId)}`}`);
      if (parsed.issues.length || parsed.items.length !== 1 || items.some(item => item.productId === parsed.items[0].productId)) return [];
      items.push(parsed.items[0]);
    }
    return items;
  } catch { return []; }
}

function publish(marketId: string, items: CompareItem[]) {
  const previous = snapshots.get(marketId);
  if (previous?.hydrated && JSON.stringify(previous.items) === JSON.stringify(items)) return;
  snapshots.set(marketId, { items, hydrated: true });
  listeners.get(marketId)?.forEach(listener => listener());
}

function onStorage(event: StorageEvent) {
  try {
    if (event.storageArea && event.storageArea !== window.localStorage) return;
  } catch { return; }
  const refresh = (marketId: string) => {
    // Events can arrive after a newer write; read current storage rather than the event's stale value.
    try { publish(marketId, readSaved(window.localStorage.getItem(`${STORAGE_PREFIX}${marketId}`))); } catch { /* Keep memory when storage access becomes unavailable. */ }
  };
  if (event.key === null) {
    snapshots.forEach((_, marketId) => refresh(marketId));
  } else if (event.key.startsWith(STORAGE_PREFIX)) {
    const marketId = event.key.slice(STORAGE_PREFIX.length);
    if (snapshots.has(marketId)) refresh(marketId);
  }
}

function initialize(marketId: string): CompareSelection {
  if (typeof window === "undefined") return serverSnapshot;
  if (!listening) {
    window.addEventListener("storage", onStorage);
    listening = true;
  }
  if (!snapshots.has(marketId)) {
    let items: CompareItem[] = [];
    try { items = readSaved(window.localStorage.getItem(`${STORAGE_PREFIX}${marketId}`)); } catch { /* Storage can be blocked; keep a usable in-memory selection. */ }
    publish(marketId, items);
  }
  return snapshots.get(marketId)!;
}

function commit(marketId: string, items: CompareItem[]) {
  // Never mutate process-global selection state during server rendering.
  if (typeof window === "undefined") return;
  publish(marketId, items);
  try { window.localStorage.setItem(`${STORAGE_PREFIX}${marketId}`, JSON.stringify(items)); } catch { /* Quota/privacy restrictions do not discard the current tab's selection. */ }
}

export function useCompareSelection(marketId: string): CompareSelection {
  const selection = useSyncExternalStore(
    listener => {
      const group = listeners.get(marketId) ?? new Set<() => void>();
      group.add(listener);
      listeners.set(marketId, group);
      return () => { group.delete(listener); if (!group.size) listeners.delete(marketId); };
    },
    () => snapshots.get(marketId) ?? serverSnapshot,
    () => serverSnapshot,
  );
  useEffect(() => { initialize(marketId); }, [marketId]);
  return selection;
}

export function addCompareItem(marketId: string, item: CompareItem): AddCompareResult {
  const { items } = initialize(marketId);
  const index = items.findIndex(previous => previous.productId === item.productId);
  if (index >= 0) {
    if (items[index].variantId === item.variantId) return "exists";
    commit(marketId, items.map((previous, position) => position === index ? copyItem(item) : previous));
    return "updated";
  }
  if (items.length >= MAX_COMPARE_ITEMS) return "full";
  commit(marketId, [...items, copyItem(item)]);
  return "added";
}

export function removeCompareItem(marketId: string, productId: string): void {
  const { items } = initialize(marketId);
  if (items.some(item => item.productId === productId)) commit(marketId, items.filter(item => item.productId !== productId));
}

export function clearCompareSelection(marketId: string): void {
  initialize(marketId);
  commit(marketId, []);
}

/** Test isolation only. Persisted identifiers are intentionally retained to exercise reloads. */
export function resetCompareStoreForTests(): void {
  if (typeof window !== "undefined" && listening) window.removeEventListener("storage", onStorage);
  listening = false;
  snapshots.clear();
  listeners.clear();
}
