"use client";

import { useSyncExternalStore } from "react";
import { QueryClient, useQuery } from "@tanstack/react-query";

import type { AddCartLineInput, Cart } from "@/core/contracts/commerce/cart";

export type CartMarketIdentity = { id: string; currency: string };
export type CartResponse = { cart: Cart | null; checkoutEnabled: boolean };
type CartMutation =
  | ({ action: "add" } & AddCartLineInput)
  | { action: "update"; lineId: string; quantity: number };
type PendingMutation = { input: CartMutation; idempotencyKey: string };
type UiState = { open: boolean; pending: boolean; error: string | null };
const initialUi: UiState = { open: false, pending: false, error: null };
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

export class StorefrontHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
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
  const result = await storefrontRequest<CartResponse>(
    `/api/${market.id}/cart`,
  );
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
function readPending(market: CartMarketIdentity): PendingMutation | null {
  const stored = window.localStorage.getItem(pendingKey(market));
  if (!stored) return null;
  const value = JSON.parse(stored) as PendingMutation;
  if (
    !value.idempotencyKey ||
    !value.input ||
    !["add", "update"].includes(value.input.action)
  )
    throw new Error(
      "An unresolved bag request needs this browser session. Please retry in the original tab.",
    );
  return value;
}
async function mutateCart(market: CartMarketIdentity, input?: CartMutation) {
  // Capture synchronously before pending disables the original add button.
  if (!input || input.action === "add") rememberCartOpener(market);
  if (!navigator.locks?.request) {
    const message =
      "This browser needs Web Locks for safe bag updates. Use a current browser over HTTPS.";
    updateUi(market, { error: message });
    throw new Error(message);
  }
  pendingCounts.set(market.id, (pendingCounts.get(market.id) ?? 0) + 1);
  updateUi(market, { pending: true, error: null });
  try {
    await navigator.locks.request(`e-pig:cart:${market.id}`, async () => {
      let pending = readPending(market);
      if (
        pending &&
        input &&
        JSON.stringify(input) !== JSON.stringify(pending.input)
      )
        throw new Error(
          "Your previous bag update is unconfirmed. Retry that update before making another change.",
        );
      if (!pending) {
        if (!input) return;
        pending = { input, idempotencyKey: crypto.randomUUID() };
        // Shared storage plus Web Locks keeps an unresolved first creation key consistent across tabs.
        // Only product IDs, quantities and the request key are stored; prices and identity cookies are never persisted.
        window.localStorage.setItem(
          pendingKey(market),
          JSON.stringify(pending),
        );
      }
      // Cookie identity may have changed in a different tab while this lock was queued.
      await refreshCart(market);
      try {
        const result = await storefrontRequest<CartResponse>(
          `/api/${market.id}/cart`,
          { ...pending.input, idempotencyKey: pending.idempotencyKey },
        );
        mutationVersions.set(
          market.id,
          (mutationVersions.get(market.id) ?? 0) + 1,
        );
        acceptCart(market, result);
        window.localStorage.removeItem(pendingKey(market));
        updateUi(market, {
          open: pending.input.action === "add" ? true : state(market).open,
        });
      } catch (error) {
        // 5xx/network results are ambiguous; keep the request for a safe replay.
        if (error instanceof StorefrontHttpError && error.status < 500)
          window.localStorage.removeItem(pendingKey(market));
        throw error;
      }
    });
  } catch (error) {
    updateUi(market, {
      error:
        error instanceof Error
          ? error.message
          : "Your bag could not be updated. Please retry.",
    });
    throw error;
  } finally {
    const count = Math.max(0, (pendingCounts.get(market.id) ?? 1) - 1);
    pendingCounts.set(market.id, count);
    updateUi(market, { pending: count > 0 });
  }
}
export function addCartItem(
  market: CartMarketIdentity,
  input: AddCartLineInput,
) {
  return mutateCart(market, { action: "add", ...input });
}
export function useCartStore(market: CartMarketIdentity) {
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
    updateItem: (lineId: string, quantity: number) =>
      mutateCart(market, { action: "update", lineId, quantity }),
    retry: () => mutateCart(market),
    pending: cart.pending,
    error: cart.error,
  };
}
