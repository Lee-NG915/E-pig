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
  it.each(["network", "server"] as const)("does not block a different update when the first preflight GET fails (%s)", async failure => {
    const fetcher = vi.fn();
    if (failure === "network") fetcher.mockRejectedValueOnce(new TypeError("Preflight offline"));
    else fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Preflight unavailable" } }), { status: 503 }));
    fetcher.mockImplementation(async () => response({ cart, checkoutEnabled: true }));
    vi.stubGlobal("fetch", fetcher);

    await expect(store.addCartItem(market, { productId: "sofa", variantId: "small", quantity: 1 })).rejects.toThrow(/Preflight/);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].method).toBe("GET");
    expect(localStorage.getItem("e-pig:pending-cart:v1:au")).toBeNull();
    expect(store.getCartSnapshot(market).pending).toBe(false);

    await store.applyCartCoupon(market, "DEMO10");
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({ action: "coupon", code: "DEMO10" });
    expect(localStorage.getItem("e-pig:pending-cart:v1:au")).toBeNull();
  });

  it("persists the request after preflight succeeds and before POST can be sent", async () => {
    let resolvePreflight!: (value: Response) => void;
    const preflight = new Promise<Response>(resolve => { resolvePreflight = resolve; });
    let savedAtPost: unknown;
    let sentBody: unknown;
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "GET") return preflight;
      savedAtPost = JSON.parse(localStorage.getItem("e-pig:pending-cart:v1:au")!);
      sentBody = JSON.parse(String(init?.body));
      return response({ cart, checkoutEnabled: true });
    });
    vi.stubGlobal("fetch", fetcher);
    const update = store.addCartItem(market, { productId: "sofa", variantId: "small", quantity: 1 });
    expect(localStorage.getItem("e-pig:pending-cart:v1:au")).toBeNull();
    expect(store.getCartSnapshot(market).pending).toBe(true);
    resolvePreflight(response({ cart, checkoutEnabled: true }));
    await update;
    expect(savedAtPost).toEqual({ input: { action: "add", productId: "sofa", variantId: "small", quantity: 1 }, idempotencyKey: expect.any(String) });
    const saved = savedAtPost as { input: object; idempotencyKey: string };
    expect(sentBody).toEqual({ ...saved.input, idempotencyKey: saved.idempotencyKey });
    expect(localStorage.getItem("e-pig:pending-cart:v1:au")).toBeNull();
    expect(store.getCartSnapshot(market).pending).toBe(false);
  });

  it("does not send a mutation if its recovery record cannot be saved", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ cart, checkoutEnabled: true }));
    vi.stubGlobal("fetch", fetcher);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Storage unavailable", "QuotaExceededError"); });
    await expect(store.addCartItem(market, { productId: "sofa", variantId: "small", quantity: 1 })).rejects.toThrow("Storage unavailable");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].method).toBe("GET");
    expect(localStorage.getItem("e-pig:pending-cart:v1:au")).toBeNull();
    expect(store.getCartSnapshot(market).pending).toBe(false);
    expect(store.getCartSnapshot(market).error).toBe("Your bag could not be updated. Please retry.");
  });

  it.each(["network", "server"] as const)("retains an existing ambiguous POST when its retry preflight fails (%s)", async failure => {
    const input = { productId: "sofa", variantId: "small", quantity: 1 };
    const posts: unknown[] = [];
    let preflightFails = false;
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        if (posts.length === 1) throw new TypeError("Response lost after POST");
      } else if (preflightFails) {
        if (failure === "network") throw new TypeError("Retry preflight offline");
        return new Response(JSON.stringify({ error: { message: "Retry preflight offline" } }), { status: 503 });
      }
      return response({ cart, checkoutEnabled: true });
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(store.addCartItem(market, input)).rejects.toThrow("Response lost after POST");
    const saved = localStorage.getItem("e-pig:pending-cart:v1:au");
    preflightFails = true;
    await expect(store.addCartItem(market, input)).rejects.toThrow("Retry preflight offline");
    expect(localStorage.getItem("e-pig:pending-cart:v1:au")).toBe(saved);
    await expect(store.applyCartCoupon(market, "DEMO10")).rejects.toBeInstanceOf(store.CartMutationNotSentError);
    expect(posts).toHaveLength(1);
    preflightFails = false;
    await store.addCartItem(market, input);
    expect(posts).toHaveLength(2);
    expect(posts[1]).toEqual(posts[0]);
    expect(localStorage.getItem("e-pig:pending-cart:v1:au")).toBeNull();
  });

  it.each(["single-to-bundle", "bundle-to-single", "bundle-to-coupon"] as const)("rejects an unsent conflicting mutation without replacing the original retry (%s)", async direction => {
    const item = { productId: "sofa", variantId: "small", quantity: 1 };
    const items = [item, { ...item, variantId: "large" }];
    const posts: Record<string, unknown>[] = [];
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        if (posts.length === 1) throw new TypeError("response lost");
      }
      return response({ cart, checkoutEnabled: true });
    });
    vi.stubGlobal("fetch", fetcher);
    const original = () => direction === "single-to-bundle" ? store.addCartItem(market, item) : store.addCartItems(market, items);
    const conflict = () => direction === "single-to-bundle" ? store.addCartItems(market, items)
      : direction === "bundle-to-single" ? store.addCartItem(market, item) : store.applyCartCoupon(market, "DEMO10");
    await expect(original()).rejects.toThrow("response lost");
    const saved = localStorage.getItem("e-pig:pending-cart:v1:au");
    const callCount = fetcher.mock.calls.length;
    await expect(conflict()).rejects.toMatchObject({ name: "CartMutationNotSentError", reason: "pending_conflict" });
    expect(fetcher).toHaveBeenCalledTimes(callCount);
    expect(posts).toHaveLength(1);
    expect(localStorage.getItem("e-pig:pending-cart:v1:au")).toBe(saved);
    await original();
    expect(posts).toHaveLength(2);
    expect(posts[1]).toEqual(posts[0]);
    expect(localStorage.getItem("e-pig:pending-cart:v1:au")).toBeNull();
  });
  it("captures bundle item identifiers before awaiting a refresh", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ cart, checkoutEnabled: true })).mockResolvedValueOnce(response({ cart, checkoutEnabled: true }));
    vi.stubGlobal("fetch", fetcher);
    const items = [{ productId: "sofa", variantId: "small", quantity: 1 }];
    const pending = store.addCartItems(market, items);
    items[0].variantId = "changed-after-submit";
    await pending;
    expect(JSON.parse(fetcher.mock.calls[1][1].body).items).toEqual([{ productId: "sofa", variantId: "small", quantity: 1 }]);
  });
  it.each(["addItems", "coupon"] as const)("replays one %s request and key after an ambiguous result", async action => {
    const items = [{ productId: "sofa", variantId: "small", quantity: 1 }, { productId: "sofa", variantId: "large", quantity: 1 }];
    const discounted = { ...cart, couponCode: "DEMO10", discount: { amount: 1, currency: "AUD" }, total: { amount: 9, currency: "AUD" } };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ cart, checkoutEnabled: true }))
      .mockRejectedValueOnce(new TypeError("response lost"))
      .mockResolvedValueOnce(response({ cart, checkoutEnabled: true }))
      .mockResolvedValueOnce(response({ cart: discounted, checkoutEnabled: true }));
    vi.stubGlobal("fetch", fetcher);
    const send = () => action === "addItems" ? store.addCartItems(market, items) : store.applyCartCoupon(market, "DEMO10");
    await expect(send()).rejects.toThrow("response lost");
    await expect(store.applyCartCoupon(market, "DIFFERENT")).rejects.toThrow(/previous bag update is unconfirmed/);
    await send();
    const first = JSON.parse(fetcher.mock.calls[1][1].body);
    const replay = JSON.parse(fetcher.mock.calls[3][1].body);
    expect(replay).toEqual(first);
    expect(first).toEqual({ action, ...(action === "addItems" ? { items } : { code: "DEMO10" }), idempotencyKey: expect.any(String) });
    expect(localStorage.getItem("e-pig:pending-cart:v1:au")).toBeNull();
    expect(store.getCartSnapshot(market).cart?.total).toEqual(discounted.total);
    expect(store.getCartSnapshot(market).open).toBe(action === "addItems");
  });
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
