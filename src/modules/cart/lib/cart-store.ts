"use client";

import { useEffect, useSyncExternalStore } from "react";
import { QueryClient, useQuery } from "@tanstack/react-query";
import { z } from "zod";

import type { AddCartLineInput, Cart } from "@/core/contracts/commerce/cart";

export type CartMarketIdentity = { id: string; currency: string };
export type CartResponse = { cart: Cart | null; checkoutEnabled: boolean; mutationApplied?: boolean; sessionExpired?: boolean };
export type CartMutation =
  | ({ action: "add" } & AddCartLineInput)
  | { action: "addItems"; items: AddCartLineInput[] }
  | { action: "coupon"; code: string }
  | { action: "update"; lineId: string; quantity: number };
type PendingMutation = {
  input: CartMutation; idempotencyKey: string; expectedCartId?: string | null;
  createdAt?: number; autoAttempts?: number;
};
type Resolution = { key: string; input?: CartMutation; status: "confirmed" | "rejected" };
type UiState = {
  open: boolean; pending: boolean; error: string | null;
  recovery: "idle" | "checking" | "needs_retry";
  recoveryMessage: string | null; recoveryCanReset: boolean; resolution: Resolution | null;
};
const initialUi: UiState = { open: false, pending: false, error: null, recovery: "idle", recoveryMessage: null, recoveryCanReset: false, resolution: null };
const AUTO_ATTEMPTS = 2;
const AUTO_MAX_AGE = 10 * 60_000;
const recoveryJobs = new Map<string, Promise<void>>();
const watchers = new Map<string, { count: number; cleanup: () => void }>();
const knownPending = new Map<string, PendingMutation>();
const ui = new Map<string, UiState>();
const listeners = new Set<() => void>();
const subscribeHydration = () => () => {};
let browserClient: QueryClient | undefined;
const mutationVersions = new Map<string, number>();
const pendingCounts = new Map<string, number>();
// Browser-only drawer focus targets. Never part of persisted, server or Query data.
const cartOpeners = new Map<string, HTMLElement>();
function rememberCartOpener(market: CartMarketIdentity, opener?: HTMLElement) {
  if (typeof document === "undefined" || state(market).open) return;
  const candidate = opener ?? document.activeElement;
  if (candidate instanceof HTMLElement && candidate !== document.body)
    cartOpeners.set(market.id, candidate);
  else cartOpeners.delete(market.id);
}
export function restoreCartFocus(market: CartMarketIdentity) {
  if (typeof document === "undefined") return;
  const opener = cartOpeners.get(market.id);
  cartOpeners.delete(market.id);
  const fallback = Array.from(
    document.querySelectorAll<HTMLElement>("[data-cart-trigger]"),
  ).find((element) => element.dataset.cartTrigger === market.id);
  for (const target of [opener, fallback]) {
    if (
      !target?.isConnected ||
      target.matches(":disabled") ||
      target.closest("[hidden], [inert]")
    )
      continue;
    target.focus({ preventScroll: true });
    if (document.activeElement === target) return;
  }
}

/** Never share a private Query cache between server requests. */
export function getStorefrontQueryClient() {
  if (typeof window === "undefined") return new QueryClient();
  return (browserClient ??= new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 30 * 60_000 },
    },
  }));
}
export const cartQueryKey = (market: CartMarketIdentity) =>
  ["cart", market.id] as const;
export const getCartStorageKey = (marketId: string) =>
  `e-pig:demo-cart:v1:${marketId}`;
const pendingKey = (market: CartMarketIdentity) =>
  `e-pig:pending-cart:v1:${market.id}`;
const state = (market: CartMarketIdentity) => ui.get(market.id) ?? initialUi;
function updateUi(market: CartMarketIdentity, next: Partial<UiState>) {
  ui.set(market.id, { ...state(market), ...next });
  listeners.forEach((listener) => listener());
}
export function setCartOpen(
  market: CartMarketIdentity,
  open: boolean,
  opener?: HTMLElement,
) {
  if (open) rememberCartOpener(market, opener);
  updateUi(market, { open });
}

/** Read-only overlay coordination; subscribing must not fetch or mutate a cart. */
export function useCartDrawerOpen(market: CartMarketIdentity) {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => state(market).open,
    () => false,
  );
}

export class StorefrontHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
/** The attempted mutation was not sent; a different saved request still needs resolution. */
export class CartMutationNotSentError extends Error {
  readonly reason = "pending_conflict";
  constructor() {
    super("Your saved bag update needs attention. Open your bag to finish recovering it before making this change.");
    this.name = "CartMutationNotSentError";
  }
}
export async function storefrontRequest<T>(
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    signal,
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new StorefrontHttpError(
      result.error?.message ?? "The request failed. Please retry.",
      response.status,
    );
  return result as T;
}
function newestCart(previous: unknown, incoming: CartResponse): CartResponse {
  const old = previous as CartResponse | undefined;
  if (
    old?.cart &&
    incoming.cart?.id === old.cart.id &&
    (incoming.cart.revision < old.cart.revision ||
      // Terminal unlocks increment revision; an equal-revision unlocked GET is stale.
      (incoming.cart.revision === old.cart.revision &&
        !!old.cart.lockedCheckoutId &&
        !incoming.cart.lockedCheckoutId))
  )
    return old;
  return incoming;
}
function acceptCart(market: CartMarketIdentity, result: CartResponse) {
  getStorefrontQueryClient().setQueryData<CartResponse>(
    cartQueryKey(market),
    (old) => newestCart(old, result),
  );
}
async function readCart(market: CartMarketIdentity) {
  const version = mutationVersions.get(market.id) ?? 0;
  const result = await cartRequest(market);
  if (version !== (mutationVersions.get(market.id) ?? 0))
    return (
      getStorefrontQueryClient().getQueryData<CartResponse>(
        cartQueryKey(market),
      ) ?? result
    );
  return result;
}
export async function refreshCart(market: CartMarketIdentity) {
  const result = await readCart(market);
  acceptCart(market, result);
  updateUi(market, { error: null });
  return result;
}
export function getCartSnapshot(market: CartMarketIdentity) {
  const response = getStorefrontQueryClient().getQueryData<CartResponse>(
    cartQueryKey(market),
  );
  return {
    ...state(market),
    cart: response?.cart ?? null,
    revision: response?.cart?.revision ?? 0,
    lockedCheckoutId: response?.cart?.lockedCheckoutId,
    checkoutEnabled: response?.checkoutEnabled ?? false,
    lines: (response?.cart?.lines ?? []).map((line) => ({
      ...line,
      colour: line.colour ?? "",
      image: line.image ?? "",
      priceAmount: line.unitPrice.amount,
      priceCurrency: line.unitPrice.currency,
    })),
  };
}
const itemSchema = z.object({ productId: z.string().min(1).max(160), variantId: z.string().min(1).max(160), quantity: z.number().int().min(1).max(10) });
const pendingSchema = z.object({
  idempotencyKey: z.string().uuid(),
  input: z.discriminatedUnion("action", [
    itemSchema.extend({ action: z.literal("add") }),
    z.object({ action: z.literal("addItems"), items: z.array(itemSchema).min(1).max(2) }),
    z.object({ action: z.literal("coupon"), code: z.string().max(40) }),
    z.object({ action: z.literal("update"), lineId: z.string().min(1).max(160), quantity: z.number().int().min(0).max(10) }),
  ]),
  expectedCartId: z.string().min(1).nullable().optional(),
  createdAt: z.number().finite().optional(), autoAttempts: z.number().int().min(0).optional(),
});
class UnreadableRecoveryError extends Error {
  constructor() { super("Your saved update could not be read. Review your current bag before adding items again."); }
}
class UnboundRecoveryError extends Error {
  constructor() { super("This saved update is from an older session. Review your current bag before adding items again."); }
}
class ChangedCartError extends Error {
  constructor() { super("Your bag session changed. Review your current bag; the saved update will not be sent to a different bag."); }
}
export class CartUpdateUnconfirmedError extends Error {
  constructor(public readonly idempotencyKey: string) {
    super("We couldn’t confirm your bag update. Open your bag to retry the saved update safely.");
    this.name = "CartUpdateUnconfirmedError";
  }
}
function readPending(market: CartMarketIdentity): PendingMutation | null {
  const stored = window.localStorage.getItem(pendingKey(market));
  if (!stored) return null;
  try { return pendingSchema.parse(JSON.parse(stored)); }
  catch { throw new UnreadableRecoveryError(); }
}
function savePending(market: CartMarketIdentity, pending: PendingMutation) {
  window.localStorage.setItem(pendingKey(market), JSON.stringify(pending));
  knownPending.set(market.id, pending);
}
function finishPending(market: CartMarketIdentity, pending: PendingMutation, status: Resolution["status"]) {
  window.localStorage.removeItem(pendingKey(market));
  knownPending.delete(market.id);
  updateUi(market, { recovery: "idle", recoveryMessage: null, recoveryCanReset: false,
    resolution: { key: pending.idempotencyKey, input: pending.input, status }, error: null });
}
const definitive = (error: unknown): error is StorefrontHttpError => error instanceof StorefrontHttpError && error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status);
function recoveryFailure(market: CartMarketIdentity, error: unknown) {
  const review = error instanceof UnreadableRecoveryError || error instanceof ChangedCartError || error instanceof UnboundRecoveryError;
  updateUi(market, { recovery: "needs_retry", recoveryCanReset: review,
    recoveryMessage: review ? error.message : "Your update is saved, but we couldn’t confirm it. Retry the saved update when you’re connected — you don’t need to add the items again.",
    error: review ? error.message : "We couldn’t confirm your bag update. Open your bag to retry the saved update safely." });
}
function isRecent(pending: PendingMutation) {
  return pending.createdAt !== undefined && Date.now() >= pending.createdAt && Date.now() - pending.createdAt < AUTO_MAX_AGE;
}
function cartRequest(market: CartMarketIdentity, body?: unknown, key?: string) {
  return storefrontRequest<CartResponse>(`/api/${market.id}/cart${key ? `?mutationKey=${encodeURIComponent(key)}` : ""}`, body, AbortSignal.timeout(8_000));
}
async function sendPending(market: CartMarketIdentity, pending: PendingMutation) {
  const result = await cartRequest(market, { ...pending.input, idempotencyKey: pending.idempotencyKey,
    ...(pending.expectedCartId !== undefined ? { expectedCartId: pending.expectedCartId } : {}) });
  mutationVersions.set(market.id, (mutationVersions.get(market.id) ?? 0) + 1);
  acceptCart(market, result);
  finishPending(market, pending, "confirmed");
}
/** Called inside the market Web Lock. A missing receipt is never permission to generate a new key. */
async function reconcilePending(market: CartMarketIdentity, pending: PendingMutation, automatic: boolean) {
  knownPending.set(market.id, pending);
  updateUi(market, { recovery: "checking", recoveryCanReset: false, recoveryMessage: "Checking your bag…", error: null });
  try {
    if (automatic && (pending.autoAttempts ?? 0) >= AUTO_ATTEMPTS) {
      recoveryFailure(market, new Error("Automatic checks exhausted"));
      return;
    }
    if (automatic) {
      pending = { ...pending, autoAttempts: (pending.autoAttempts ?? 0) + 1 };
      savePending(market, pending);
    }
    const current = await cartRequest(market, undefined, pending.idempotencyKey);
    if (current.mutationApplied === true) mutationVersions.set(market.id, (mutationVersions.get(market.id) ?? 0) + 1);
    acceptCart(market, current);
    if (current.mutationApplied === true) {
      finishPending(market, pending, "confirmed");
      return;
    }
    if (current.sessionExpired) throw new ChangedCartError();
    if (pending.expectedCartId === undefined) throw new UnboundRecoveryError();
    if (pending.expectedCartId !== null && current.cart?.id !== pending.expectedCartId)
      throw new ChangedCartError();
    // New first-cart records with a cookie may be their own lost creation. The API verifies that binding.
    if (pending.expectedCartId === null && !current.cart && !isRecent(pending)) throw new UnboundRecoveryError();
    if (automatic && !isRecent(pending)) {
      recoveryFailure(market, new Error("Manual review needed"));
      return;
    }
    try { await sendPending(market, pending); }
    catch (error) {
      if (error instanceof StorefrontHttpError && error.status === 409 && /bag session changed/i.test(error.message)) throw new ChangedCartError();
      if (definitive(error)) {
        finishPending(market, pending, "rejected");
        updateUi(market, { error: error.message });
        return;
      }
      throw error;
    }
  } catch (error) {
    recoveryFailure(market, error);
    throw new CartUpdateUnconfirmedError(pending.idempotencyKey);
  }
}
async function withCartLock(market: CartMarketIdentity, work: () => Promise<void>) {
  if (!navigator.locks?.request) {
    const message = "This browser needs Web Locks for safe bag updates. Use a current browser over HTTPS.";
    updateUi(market, { error: message });
    throw new Error(message);
  }
  pendingCounts.set(market.id, (pendingCounts.get(market.id) ?? 0) + 1);
  updateUi(market, { pending: true });
  try { await navigator.locks.request(`e-pig:cart:${market.id}`, work); }
  finally {
    const count = Math.max(0, (pendingCounts.get(market.id) ?? 1) - 1);
    pendingCounts.set(market.id, count);
    updateUi(market, { pending: count > 0 });
  }
}
/** Recovery never creates a new mutation, even if an old retry button is clicked after resolution. */
export function recoverCart(market: CartMarketIdentity, automatic = false, expectedKey?: string): Promise<void> {
  const existing = recoveryJobs.get(market.id);
  if (existing) return existing;
  try {
    if (!window.localStorage.getItem(pendingKey(market)) && !knownPending.has(market.id) && (!expectedKey || state(market).resolution?.key === expectedKey)) {
      updateUi(market, { recovery: "idle", recoveryMessage: null, recoveryCanReset: false });
      return Promise.resolve();
    }
  } catch { /* Report storage errors through the locked recovery path below. */ }
  const job = withCartLock(market, async () => {
    try {
      const pending = readPending(market);
      if (expectedKey && pending?.idempotencyKey !== expectedKey) {
        if (state(market).resolution?.key === expectedKey) return;
        // Another tab may have resolved this key and moved on before this tab saw its result.
        // Only read its receipt; do not touch a newer saved request or its recovery state.
        const current = await cartRequest(market, undefined, expectedKey);
        if (current.mutationApplied) mutationVersions.set(market.id, (mutationVersions.get(market.id) ?? 0) + 1);
        acceptCart(market, current);
        if (knownPending.get(market.id)?.idempotencyKey === expectedKey) knownPending.delete(market.id);
        updateUi(market, { resolution: { key: expectedKey, status: current.mutationApplied ? "confirmed" : "rejected" },
          ...(!pending ? { recovery: "idle", recoveryMessage: null, recoveryCanReset: false, error: null } as const : {}) });
        return;
      }
      if (!pending) {
        const previous = knownPending.get(market.id);
        if (previous) {
          const current = await cartRequest(market, undefined, previous.idempotencyKey);
          if (current.mutationApplied) mutationVersions.set(market.id, (mutationVersions.get(market.id) ?? 0) + 1);
          acceptCart(market, current);
          finishPending(market, previous, current.mutationApplied ? "confirmed" : "rejected");
        } else updateUi(market, { recovery: "idle", recoveryMessage: null, recoveryCanReset: false });
        return;
      }
      await reconcilePending(market, pending, automatic);
    } catch (error) {
      if (!(error instanceof CartUpdateUnconfirmedError)) recoveryFailure(market, error);
      throw error;
    }
  }).finally(() => { recoveryJobs.delete(market.id); });
  recoveryJobs.set(market.id, job);
  return job;
}
/** Only an unreadable record or a different session can be retired after reviewing a fresh bag. */
export async function useCurrentBag(market: CartMarketIdentity) {
  try { await withCartLock(market, async () => {
    const raw = window.localStorage.getItem(pendingKey(market));
    let pending: PendingMutation | null = null;
    let unreadable = false;
    try { pending = readPending(market); } catch (error) { if (error instanceof UnreadableRecoveryError) unreadable = true; else throw error; }
    const current = await cartRequest(market);
    acceptCart(market, current);
    const changed = current.sessionExpired || (pending?.expectedCartId !== undefined && (pending.expectedCartId ?? null) !== (current.cart?.id ?? null));
    const oldAnonymous = pending?.expectedCartId === null && !current.cart && !isRecent(pending);
    if (!unreadable && pending?.expectedCartId !== undefined && !changed && !oldAnonymous) throw new Error("Retry your saved update to confirm it first.");
    if (raw !== window.localStorage.getItem(pendingKey(market))) throw new Error("Your bag changed in another tab. Review it again.");
    mutationVersions.set(market.id, (mutationVersions.get(market.id) ?? 0) + 1);
    if (pending) finishPending(market, pending, "rejected");
    else {
      window.localStorage.removeItem(pendingKey(market));
      knownPending.delete(market.id);
      updateUi(market, { recovery: "idle", recoveryMessage: null, recoveryCanReset: false, error: null });
    }
  }); } catch (error) {
    updateUi(market, { recoveryMessage: "We couldn’t load your current bag. Check your connection and try Use current bag again.", error: error instanceof Error ? error.message : "Could not load your bag." });
    throw error;
  }
}
/** One listener set per market, even when header, PDP and drawer mount separate React islands. */
export function watchCartRecovery(market: CartMarketIdentity) {
  const existing = watchers.get(market.id);
  if (existing) { existing.count += 1; return () => releaseRecoveryWatcher(market.id); }
  const resume = () => {
    // Do not contend with an active user action or launch work while offline.
    if (state(market).pending) return;
    if (navigator.onLine === false) {
      try { if (readPending(market)) recoveryFailure(market, new Error("Offline")); }
      catch (error) { recoveryFailure(market, error); }
      return;
    }
    void recoverCart(market, true).catch(() => {});
  };
  const storage = (event: StorageEvent) => { if (event.key === pendingKey(market) || event.key === null) resume(); };
  window.addEventListener("online", resume);
  window.addEventListener("storage", storage);
  watchers.set(market.id, { count: 1, cleanup: () => { window.removeEventListener("online", resume); window.removeEventListener("storage", storage); } });
  resume();
  return () => releaseRecoveryWatcher(market.id);
}
function releaseRecoveryWatcher(id: string) {
  const watcher = watchers.get(id);
  if (watcher && --watcher.count === 0) { watcher.cleanup(); watchers.delete(id); }
}
async function mutateCart(market: CartMarketIdentity, input: CartMutation) {
  if (input.action === "add" || input.action === "addItems") rememberCartOpener(market);
  try {
    await withCartLock(market, async () => {
      updateUi(market, { error: null });
      let pending = readPending(market);
      if (pending) {
        const same = JSON.stringify(input) === JSON.stringify(pending.input);
        try { await reconcilePending(market, pending, true); }
        catch (error) { if (!same) throw new CartMutationNotSentError(); throw error; }
        if (state(market).recovery !== "idle") {
          if (same) throw new CartUpdateUnconfirmedError(pending.idempotencyKey);
          throw new CartMutationNotSentError();
        }
        if (same) {
          if (state(market).resolution?.status === "rejected") throw new Error(state(market).error ?? "The saved update could not be applied.");
          return;
        }
        // Quantity clicks were based on an older snapshot. Ask for a fresh choice after reconciliation.
        if (input.action === "update") throw new Error("Your saved update is confirmed. Review the quantity and try this change again.");
      }
      const current = await refreshCart(market);
      pending = { input, idempotencyKey: crypto.randomUUID(), expectedCartId: current.cart?.id ?? null, createdAt: Date.now(), autoAttempts: 0 };
      savePending(market, pending);
      try { await sendPending(market, pending); }
      catch (error) {
        if (definitive(error)) { finishPending(market, pending, "rejected"); throw error; }
        // One bounded immediate reconciliation. Lifecycle retries share a persisted budget.
        await reconcilePending(market, pending, true);
        if (state(market).recovery !== "idle") throw new CartUpdateUnconfirmedError(pending.idempotencyKey);
      }
      if (state(market).resolution?.status === "rejected") throw new Error(state(market).error ?? "This update could not be applied. Review your bag and try again.");
      updateUi(market, { open: input.action === "add" || input.action === "addItems" ? true : state(market).open });
    });
  } catch (error) {
    if (error instanceof UnreadableRecoveryError) recoveryFailure(market, error);
    updateUi(market, { error: error instanceof Error ? error.message : "Your bag could not be updated. Please retry." });
    throw error;
  }
}
export function addCartItem(
  market: CartMarketIdentity,
  input: AddCartLineInput,
) {
  return mutateCart(market, { action: "add", ...input });
}
export function addCartItems(market: CartMarketIdentity, items: AddCartLineInput[]) {
  return mutateCart(market, { action: "addItems", items: items.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity })) });
}
export function applyCartCoupon(market: CartMarketIdentity, code: string) {
  return mutateCart(market, { action: "coupon", code });
}
export function useCartStore(market: CartMarketIdentity) {
  const { id: marketId, currency: marketCurrency } = market;
  useEffect(() => watchCartRecovery({ id: marketId, currency: marketCurrency }), [marketId, marketCurrency]);
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  const visibleUi = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state(market),
    () => initialUi,
  );
  const query = useQuery<CartResponse>(
    {
      queryKey: cartQueryKey(market),
      queryFn: () => readCart(market),
      enabled: hydrated,
      structuralSharing: (old, incoming) =>
        newestCart(old, incoming as CartResponse),
    },
    getStorefrontQueryClient(),
  );
  let legacyCart = false;
  try {
    legacyCart =
      hydrated && !!window.localStorage.getItem(getCartStorageKey(market.id));
  } catch {
    /* Legacy storage is optional and never changed. */
  }
  return {
    ...getCartSnapshot(market),
    ...visibleUi,
    loading: query.isPending,
    error: visibleUi.error ?? query.error?.message ?? null,
    legacyCart,
    refresh: async () => {
      const result = await query.refetch();
      if (!result.error) updateUi(market, { error: null });
      return result;
    },
  };
}
export function useCartActions(market: CartMarketIdentity) {
  const cart = useCartStore(market);
  return {
    addItem: (input: AddCartLineInput) => addCartItem(market, input),
    addItems: (items: AddCartLineInput[]) => addCartItems(market, items),
    applyCoupon: (code: string) => applyCartCoupon(market, code),
    updateItem: (lineId: string, quantity: number) =>
      mutateCart(market, { action: "update", lineId, quantity }),
    retry: (expectedKey?: string) => recoverCart(market, false, expectedKey),
    useCurrentBag: () => useCurrentBag(market),
    recovery: cart.recovery,
    recoveryMessage: cart.recoveryMessage,
    recoveryCanReset: cart.recoveryCanReset,
    resolution: cart.resolution,
    pending: cart.pending,
    error: cart.error,
  };
}
