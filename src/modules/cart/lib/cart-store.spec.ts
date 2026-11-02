// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

type Store = typeof import("./cart-store");
let store: Store;
const market = { id: "au", currency: "AUD" };
const cart = {
  id: "cart-1",
  market: "au",
  revision: 1,
  lines: [
    {
      id: "line-1",
      productId: "sofa",
      variantId: "small",
      variantLabel: "Small",
      name: "Sofa",
      quantity: 1,
      unitPrice: { amount: 10, currency: "AUD" },
      lineTotal: { amount: 10, currency: "AUD" },
    },
  ],
  subtotal: { amount: 10, currency: "AUD" },
};
const response = (value: unknown) => new Response(JSON.stringify(value));
beforeEach(async () => {
  vi.resetModules();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: vi.fn(async (_: string, fn: () => unknown) => fn()) },
  });
  store = await import("./cart-store");
});
describe("server cart", () => {
  it("never imports or deletes the legacy local cart", () => {
    const legacy = '{"lines":[{"priceAmount":1}]}';
    localStorage.setItem(store.getCartStorageKey("au"), legacy);
    expect(store.getCartSnapshot(market).lines).toEqual([]);
    expect(localStorage.getItem(store.getCartStorageKey("au"))).toBe(legacy);
  });
  it("reuses the unresolved mutation key after a lost first response", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ cart: null, checkoutEnabled: true }))
      .mockRejectedValueOnce(new TypeError("network lost"))
      .mockResolvedValueOnce(response({ cart: null, checkoutEnabled: true }))
      .mockResolvedValueOnce(response({ cart, checkoutEnabled: true }));
    vi.stubGlobal("fetch", fetcher);
    const input = { productId: "sofa", variantId: "small", quantity: 1 };
    await expect(store.addCartItem(market, input)).rejects.toThrow(
      "network lost",
    );
    await store.addCartItem(market, input);
    const first = JSON.parse(fetcher.mock.calls[1][1].body);
    const retry = JSON.parse(fetcher.mock.calls[3][1].body);
    expect(retry.idempotencyKey).toBe(first.idempotencyKey);
    expect(retry).toEqual({
      action: "add",
      ...input,
      idempotencyKey: first.idempotencyKey,
    });
    expect(store.getCartSnapshot(market).lines[0].priceAmount).toBe(10);
  });
  it("blocks unsafe writes when cross-tab Web Locks are unavailable", async () => {
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: undefined,
    });
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      store.addCartItem(market, {
        productId: "sofa",
        variantId: "small",
        quantity: 1,
      }),
    ).rejects.toThrow(/browser.*Web Locks/i);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

it("does not let an older null GET replace a newly created server cart", async () => {
  let resolveOld!: (response: Response) => void;
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveOld = resolve;
        }),
    )
    .mockResolvedValueOnce(response({ cart: null, checkoutEnabled: true }))
    .mockResolvedValueOnce(response({ cart, checkoutEnabled: true }));
  vi.stubGlobal("fetch", fetcher);
  const stale = store.refreshCart(market);
  await store.addCartItem(market, {
    productId: "sofa",
    variantId: "small",
    quantity: 1,
  });
  resolveOld(response({ cart: null, checkoutEnabled: true }));
  await stale;
  expect(store.getCartSnapshot(market).cart?.id).toBe("cart-1");
  expect(store.getCartSnapshot(market).revision).toBe(1);
});

it("shares unresolved request data across tabs rather than creating a second first cart", async () => {
  const input = {
    action: "add",
    productId: "sofa",
    variantId: "small",
    quantity: 1,
  };
  localStorage.setItem(
    "e-pig:pending-cart:v1:au",
    JSON.stringify({ input, idempotencyKey: "existing-other-tab-key" }),
  );
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ cart: null, checkoutEnabled: true }))
    .mockResolvedValueOnce(response({ cart, checkoutEnabled: true }));
  vi.stubGlobal("fetch", fetcher);
  await store.addCartItem(market, {
    productId: "sofa",
    variantId: "small",
    quantity: 1,
  });
  expect(JSON.parse(fetcher.mock.calls[1][1].body).idempotencyKey).toBe(
    "existing-other-tab-key",
  );
  expect(localStorage.getItem("e-pig:pending-cart:v1:au")).toBeNull();
});

it("keeps a newer revision when an older server response arrives", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        response({ cart: { ...cart, revision: 5 }, checkoutEnabled: true }),
      )
      .mockResolvedValueOnce(
        response({
          cart: {
            ...cart,
            revision: 3,
            subtotal: { amount: 1, currency: "AUD" },
          },
          checkoutEnabled: true,
        }),
      ),
  );
  await store.refreshCart(market);
  await store.refreshCart(market);
  expect(store.getCartSnapshot(market).revision).toBe(5);
  expect(store.getCartSnapshot(market).cart?.subtotal.amount).toBe(10);
});
