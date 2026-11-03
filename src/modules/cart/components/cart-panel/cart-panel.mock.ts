import type { Cart } from "@/core/contracts/commerce/cart";
import { cartQueryKey, getStorefrontQueryClient, recoverCart, refreshCart } from "../../lib/cart-store";
export const marketFixture = { id: "au", currency: "AUD" };
export const cartFixture: Cart = {
  id: "cart-1",
  market: "au",
  revision: 2,
  lines: [
    {
      id: "line-1",
      productId: "alto",
      variantId: "alto-small",
      variantLabel: "Compact / sandbox",
      name: "Alto Sofa",
      quantity: 2,
      unitPrice: { amount: 10, currency: "AUD" },
      lineTotal: { amount: 20, currency: "AUD" },
    },
  ],
  subtotal: { amount: 20, currency: "AUD" },
};

/** Story-only network boundary. Saved intent contains identifiers, never prices. */
export async function installCartRecoveryStory(mode: "checking" | "needs_retry" | "unreadable") {
  const originalFetch = window.fetch;
  const storageKey = "e-pig:pending-cart:v1:au";
  const previous = localStorage.getItem(storageKey);
  let cleaning = true;
  let ready = false;
  let finishCheck: (() => void) | undefined;
  const mockFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    if (url.pathname !== "/api/au/cart") return originalFetch(input, init);
    if (!cleaning && url.searchParams.has("mutationKey") && mode === "checking") return new Promise<Response>((resolve, reject) => {
      finishCheck = () => resolve(new Response(JSON.stringify({ cart: cartFixture, checkoutEnabled: true, mutationApplied: true })));
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
    if (init?.method === "POST") ready = true;
    return new Response(JSON.stringify({ cart: cartFixture, checkoutEnabled: true, mutationApplied: cleaning || ready }));
  };
  window.fetch = mockFetch;
  localStorage.removeItem(storageKey);
  await recoverCart(marketFixture); await refreshCart(marketFixture);
  getStorefrontQueryClient().setQueryData(cartQueryKey(marketFixture), { cart: cartFixture, checkoutEnabled: true });
  localStorage.setItem(storageKey, mode === "unreadable" ? "unreadable-story-record" : JSON.stringify({
    idempotencyKey: "22222222-2222-4222-8222-222222222222",
    expectedCartId: cartFixture.id, createdAt: Date.now(), autoAttempts: mode === "needs_retry" ? 2 : 0,
    input: { action: "update", lineId: "line-1", quantity: 3 },
  }));
  cleaning = false;
  return async () => {
    cleaning = true;
    localStorage.removeItem(storageKey);
    finishCheck?.();
    await recoverCart(marketFixture).catch(() => {}); await refreshCart(marketFixture).catch(() => {});
    if (previous === null) localStorage.removeItem(storageKey); else localStorage.setItem(storageKey, previous);
    if (window.fetch === mockFetch) window.fetch = originalFetch;
  };
}
