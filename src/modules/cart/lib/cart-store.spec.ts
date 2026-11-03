// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Store = typeof import("./cart-store");
let store: Store;
const market = { id: "au", currency: "AUD" };
const storageKey = "e-pig:pending-cart:v1:au";
const input = { productId: "sofa", variantId: "small", quantity: 1 };
const cart = {
  id: "cart-1", market: "au", revision: 1,
  lines: [{ id: "line-1", ...input, variantLabel: "Small", name: "Sofa", unitPrice: { amount: 10, currency: "AUD" }, lineTotal: { amount: 10, currency: "AUD" } }],
  subtotal: { amount: 10, currency: "AUD" },
};
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const ok = (mutationApplied = false) => response({ cart, checkoutEnabled: true, mutationApplied });
function saved(extra: Record<string, unknown> = {}) {
  const record = { input: { action: "add", ...input }, idempotencyKey: crypto.randomUUID(), expectedCartId: cart.id, createdAt: Date.now(), autoAttempts: 0, ...extra };
  localStorage.setItem(storageKey, JSON.stringify(record));
  return record;
}
const pending = () => JSON.parse(localStorage.getItem(storageKey)!);
beforeEach(async () => {
  vi.resetModules(); vi.restoreAllMocks();
  localStorage.clear(); sessionStorage.clear();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: vi.fn(async (_: string, fn: () => unknown) => fn()) } });
  store = await import("./cart-store");
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("cart recovery", () => {
  it("automatically confirms a lost response from its receipt without adding again", async () => {
    const posts: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") { posts.push(JSON.parse(String(init.body))); throw new TypeError("Response lost"); }
      return response({ cart, checkoutEnabled: true, mutationApplied: url.includes("mutationKey=") });
    }));
    await expect(store.addCartItem(market, input)).resolves.toBeUndefined();
    expect(posts).toHaveLength(1);
    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(store.getCartSnapshot(market)).toMatchObject({ recovery: "idle", pending: false, open: true, resolution: { status: "confirmed" } });
  });

  it.each([null, cart.id])("safely replays an unconfirmed request with identical key and cart precondition (%s)", async expectedCartId => {
    const posts: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        if (posts.length === 1) throw new TypeError("Lost");
        return ok();
      }
      return response({ cart: expectedCartId ? cart : null, checkoutEnabled: true, mutationApplied: false });
    }));
    await store.addCartItem(market, input);
    expect(posts).toHaveLength(2);
    expect(posts[1]).toEqual(posts[0]);
    expect(posts[0]).toMatchObject({ action: "add", ...input, expectedCartId, idempotencyKey: expect.any(String) });
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it("bounds automatic retries across reloads, then lets a manual retry resolve the same key", async () => {
    const posts: Record<string, unknown>[] = [];
    let healthy = false;
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") { posts.push(JSON.parse(String(init.body))); if (!healthy) throw new TypeError("Offline"); }
      return ok();
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(store.addCartItem(market, input)).rejects.toBeInstanceOf(store.CartUpdateUnconfirmedError);
    const key = pending().idempotencyKey;
    expect(posts).toHaveLength(2);
    await expect(store.recoverCart(market, true)).rejects.toBeInstanceOf(store.CartUpdateUnconfirmedError);
    expect(posts).toHaveLength(3);
    vi.resetModules(); store = await import("./cart-store");
    const calls = fetcher.mock.calls.length;
    await store.recoverCart(market, true);
    await store.recoverCart(market, true);
    expect(fetcher).toHaveBeenCalledTimes(calls);
    expect(store.getCartSnapshot(market)).toMatchObject({ pending: false, recovery: "needs_retry" });
    healthy = true;
    await store.recoverCart(market, false, key);
    expect(posts).toHaveLength(4);
    expect(new Set(posts.map(post => post.idempotencyKey))).toEqual(new Set([key]));
    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(store.getCartSnapshot(market).recovery).toBe("idle");
  });

  it.each(["single-to-bundle", "bundle-to-single", "bundle-to-coupon"])("never replaces the saved input with an unsent conflicting intent (%s)", async direction => {
    const items = [input, { ...input, variantId: "large" }];
    const record = saved({ input: direction === "single-to-bundle" ? { action: "add", ...input } : { action: "addItems", items } });
    const posts: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") { posts.push(JSON.parse(String(init.body))); throw new TypeError("Offline"); }
      return ok();
    }));
    const conflict = direction === "single-to-bundle" ? () => store.addCartItems(market, items)
      : direction === "bundle-to-single" ? () => store.addCartItem(market, input) : () => store.applyCartCoupon(market, "DEMO10");
    await expect(conflict()).rejects.toBeInstanceOf(store.CartMutationNotSentError);
    expect(pending()).toMatchObject({ input: record.input, idempotencyKey: record.idempotencyKey });
    expect(posts).toEqual([{ ...record.input, idempotencyKey: record.idempotencyKey, expectedCartId: cart.id }]);
  });

  it.each(["addItems", "coupon"])("automatically resolves %s using the original payload", async action => {
    const items = [input, { ...input, variantId: "large" }];
    const posts: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") { posts.push(JSON.parse(String(init.body))); if (posts.length === 1) throw new TypeError("Lost"); }
      return ok();
    }));
    await (action === "addItems" ? store.addCartItems(market, items) : store.applyCartCoupon(market, "DEMO10"));
    expect(posts).toHaveLength(2); expect(posts[1]).toEqual(posts[0]);
    expect(posts[0]).toMatchObject({ action, ...(action === "addItems" ? { items } : { code: "DEMO10" }) });
  });

  it.each(["network", "server"])("does not create a pending record when fresh preflight fails (%s)", async failure => {
    const fetcher = vi.fn();
    if (failure === "network") fetcher.mockRejectedValueOnce(new TypeError("Preflight offline"));
    else fetcher.mockResolvedValueOnce(response({ error: { message: "Preflight unavailable" } }, 503));
    fetcher.mockImplementation(async () => ok()); vi.stubGlobal("fetch", fetcher);
    await expect(store.addCartItem(market, input)).rejects.toThrow(/Preflight/);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(storageKey)).toBeNull();
    await store.applyCartCoupon(market, "DEMO10");
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({ action: "coupon", code: "DEMO10" });
  });

  it("saves identity and original input only after preflight succeeds and before the POST", async () => {
    let resolve!: (value: Response) => void;
    const preflight = new Promise<Response>(done => { resolve = done; });
    let savedAtPost: unknown;
    let posted: unknown;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "GET") return preflight;
      savedAtPost = pending(); posted = JSON.parse(String(init?.body)); return ok();
    }));
    const task = store.addCartItem(market, input);
    expect(localStorage.getItem(storageKey)).toBeNull();
    resolve(ok()); await task;
    expect(savedAtPost).toMatchObject({ input: { action: "add", ...input }, expectedCartId: cart.id, autoAttempts: 0 });
    expect(posted).toMatchObject({ action: "add", ...input, expectedCartId: cart.id, idempotencyKey: (savedAtPost as { idempotencyKey: string }).idempotencyKey });
  });

  it("never sends a write when storage cannot save its recovery record", async () => {
    const fetcher = vi.fn(async () => ok()); vi.stubGlobal("fetch", fetcher);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
    await expect(store.addCartItem(market, input)).rejects.toThrow("Storage unavailable");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(store.getCartSnapshot(market).pending).toBe(false);
  });

  it.each(["network", "server"])("retains original key when receipt GET fails (%s)", async failure => {
    const record = saved();
    const fetcher = vi.fn(async () => { if (failure === "network") throw new TypeError("Offline"); return response({ error: { message: "Unavailable" } }, 503); });
    vi.stubGlobal("fetch", fetcher);
    await expect(store.recoverCart(market)).rejects.toBeInstanceOf(store.CartUpdateUnconfirmedError);
    expect(pending()).toEqual(record);
    expect(fetcher.mock.calls).toHaveLength(1);
    expect(store.getCartSnapshot(market).recovery).toBe("needs_retry");
  });

  it.each([408, 429, 503])("retains uncertain HTTP %s and allows a later manual retry", async status => {
    const record = saved();
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST" ? response({ error: { message: "Try later" } }, status) : ok()));
    await expect(store.recoverCart(market)).rejects.toBeInstanceOf(store.CartUpdateUnconfirmedError);
    expect(pending().idempotencyKey).toBe(record.idempotencyKey);
  });

  it("releases a definitively rejected update so a corrected change is possible", async () => {
    const record = saved();
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST" ? response({ error: { message: "This option is unavailable" } }, 400) : ok()));
    await store.recoverCart(market);
    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(store.getCartSnapshot(market)).toMatchObject({ recovery: "idle", error: "This option is unavailable", resolution: { key: record.idempotencyKey, status: "rejected" } });
  });

  it.each([undefined, Date.now() - 24 * 60 * 60_000])("only reads receipts automatically for legacy or old records (%s)", async createdAt => {
    const record = saved({ createdAt, ...(createdAt === undefined ? { expectedCartId: undefined } : {}) });
    const fetcher = vi.fn(async () => ok()); vi.stubGlobal("fetch", fetcher);
    await store.recoverCart(market, true).catch(() => {});
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]).toHaveLength(2);
    expect(pending().idempotencyKey).toBe(record.idempotencyKey);
    expect(store.getCartSnapshot(market).recovery).toBe("needs_retry");
  });

  it("confirms an old legacy record from the receipt and keeps current locked/revised data", async () => {
    const record = saved({ expectedCartId: undefined, createdAt: undefined });
    const current = { ...cart, revision: 8, lines: [], lockedCheckoutId: "payment-1" };
    const fetcher = vi.fn(async () => response({ cart: current, checkoutEnabled: true, mutationApplied: true })); vi.stubGlobal("fetch", fetcher);
    await store.recoverCart(market, true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(store.getCartSnapshot(market)).toMatchObject({ cart: current, resolution: { key: record.idempotencyKey, status: "confirmed" } });
    await store.recoverCart(market, false, record.idempotencyKey);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([null, { ...cart, id: "different-cart" }])("does not replay into a changed session and provides a reviewed escape (%s)", async current => {
    saved(); const fetcher = vi.fn(async () => response({ cart: current, checkoutEnabled: true, mutationApplied: false })); vi.stubGlobal("fetch", fetcher);
    await expect(store.recoverCart(market, true)).rejects.toBeInstanceOf(store.CartUpdateUnconfirmedError);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(storageKey)).not.toBeNull();
    expect(store.getCartSnapshot(market)).toMatchObject({ recovery: "needs_retry", recoveryCanReset: true });
    await store.useCurrentBag(market);
    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(store.getCartSnapshot(market).recovery).toBe("idle");
  });

  it("keeps a session-change rejection recoverable rather than treating it as an ordinary 409", async () => {
    saved({ expectedCartId: null });
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST" ? response({ error: { message: "Your bag session changed. Review your current bag before trying again." } }, 409) : ok()); vi.stubGlobal("fetch", fetcher);
    await expect(store.recoverCart(market, true)).rejects.toBeInstanceOf(store.CartUpdateUnconfirmedError);
    expect(localStorage.getItem(storageKey)).not.toBeNull();
    expect(store.getCartSnapshot(market).recoveryCanReset).toBe(true);
  });

  it("lets an unreadable record be retired only after a successful current-bag read", async () => {
    localStorage.setItem(storageKey, "not-json");
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("Offline")).mockImplementation(async () => ok()); vi.stubGlobal("fetch", fetcher);
    await expect(store.recoverCart(market, true)).rejects.toThrow(/could not be read/);
    expect(fetcher).not.toHaveBeenCalled();
    await expect(store.useCurrentBag(market)).rejects.toThrow("Offline");
    expect(localStorage.getItem(storageKey)).toBe("not-json");
    await store.useCurrentBag(market);
    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(store.getCartSnapshot(market).lines).toHaveLength(1);
  });

  it("never discards an ordinary unresolved update through useCurrentBag", async () => {
    const record = saved(); vi.stubGlobal("fetch", vi.fn(async () => ok()));
    await expect(store.useCurrentBag(market)).rejects.toThrow(/Retry your saved update/);
    expect(pending()).toEqual(record);
  });

  it("coalesces consumers and online events, synchronizes cross-tab completion without another POST", async () => {
    const record = saved();
    let resolve!: (value: Response) => void;
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; })).mockImplementation(async () => ok(true)); vi.stubGlobal("fetch", fetcher);
    const stopA = store.watchCartRecovery(market); const stopB = store.watchCartRecovery(market);
    window.dispatchEvent(new Event("online")); window.dispatchEvent(new Event("online"));
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolve(ok(true)); await store.recoverCart(market, true);
    expect(store.getCartSnapshot(market).resolution?.key).toBe(record.idempotencyKey);
    expect(fetcher).toHaveBeenCalledTimes(1);
    stopA(); stopB();
    window.dispatchEvent(new Event("online"));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not replay a newer update when a stale retry button supplies another key", async () => {
    const record = saved(); const fetcher = vi.fn(async () => ok(true)); vi.stubGlobal("fetch", fetcher);
    await store.recoverCart(market, false, crypto.randomUUID());
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("mutationKey="), expect.objectContaining({ method: "GET" })); expect(pending()).toEqual(record);
  });

  it("refreshing cart data cannot dismiss an unresolved recovery state", async () => {
    saved({ autoAttempts: 2 }); vi.stubGlobal("fetch", vi.fn(async () => ok()));
    await store.recoverCart(market, true); await store.refreshCart(market);
    expect(store.getCartSnapshot(market).recovery).toBe("needs_retry");
    expect(localStorage.getItem(storageKey)).not.toBeNull();
  });
});

it("captures bundle identifiers before awaiting a refresh", async () => {
  const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => ok()); vi.stubGlobal("fetch", fetcher);
  const items = [{ ...input }]; const task = store.addCartItems(market, items); items[0].variantId = "changed"; await task;
  expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body)).items).toEqual([input]);
});
it("requires Web Locks before any cart write", async () => {
  Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(store.addCartItem(market, input)).rejects.toThrow(/Web Locks/); expect(fetcher).not.toHaveBeenCalled();
});
it("does not let an older null GET replace a newly created cart", async () => {
  let resolve!: (value: Response) => void;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; })).mockImplementation(async () => ok()); vi.stubGlobal("fetch", fetcher);
  const stale = store.refreshCart(market); await store.addCartItem(market, input); resolve(response({ cart: null, checkoutEnabled: true })); await stale;
  expect(store.getCartSnapshot(market).cart?.id).toBe(cart.id);
});
it("keeps a newer revision when an old server snapshot arrives", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response({ cart: { ...cart, revision: 5 }, checkoutEnabled: true })).mockResolvedValueOnce(ok()));
  await store.refreshCart(market); await store.refreshCart(market); expect(store.getCartSnapshot(market).revision).toBe(5);
});
it("does not import or delete the legacy demo cart", () => {
  localStorage.setItem(store.getCartStorageKey("au"), "legacy");
  expect(store.getCartSnapshot(market).lines).toEqual([]); expect(localStorage.getItem(store.getCartStorageKey("au"))).toBe("legacy");
});

it("never manually replays a legacy request with unknown original identity into the current bag", async () => {
  saved({ expectedCartId: undefined, createdAt: undefined });
  const fetcher = vi.fn(async () => ok()); vi.stubGlobal("fetch", fetcher);
  await expect(store.recoverCart(market)).rejects.toBeInstanceOf(store.CartUpdateUnconfirmedError);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(store.getCartSnapshot(market).recoveryCanReset).toBe(true);
  await store.useCurrentBag(market);
  expect(localStorage.getItem(storageKey)).toBeNull();
  expect(store.getCartSnapshot(market).resolution?.status).toBe("rejected");
});
it("restores a visible recovery state offline and resumes on reconnect", async () => {
  saved(); Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  const fetcher = vi.fn(async () => ok(true)); vi.stubGlobal("fetch", fetcher);
  const stop = store.watchCartRecovery(market);
  expect(fetcher).not.toHaveBeenCalled();
  expect(store.getCartSnapshot(market).recovery).toBe("needs_retry");
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  window.dispatchEvent(new Event("online")); await store.recoverCart(market, true);
  expect(localStorage.getItem(storageKey)).toBeNull(); stop();
});
it("does not let an old null GET overwrite a receipt-confirmed first creation", async () => {
  saved({ expectedCartId: null }); let resolve!: (value: Response) => void;
  vi.stubGlobal("fetch", vi.fn().mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; })).mockImplementation(async () => ok(true)));
  const stale = store.refreshCart(market); await store.recoverCart(market, true);
  resolve(response({ cart: null, checkoutEnabled: true })); await stale;
  expect(store.getCartSnapshot(market).cart?.id).toBe(cart.id);
});

it.each([true, false])("does not reclaim an expired anonymous bag during automatic=%s recovery", async automatic => {
  saved({ expectedCartId: null });
  const fetcher = vi.fn(async () => response({ cart: null, checkoutEnabled: true, mutationApplied: false, sessionExpired: true })); vi.stubGlobal("fetch", fetcher);
  await expect(store.recoverCart(market, automatic)).rejects.toBeInstanceOf(store.CartUpdateUnconfirmedError);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(store.getCartSnapshot(market).recoveryCanReset).toBe(true);
  await store.useCurrentBag(market);
  expect(localStorage.getItem(storageKey)).toBeNull();
});
it("keeps the reviewed new bag when an older GET from another session arrives last", async () => {
  saved(); let resolve!: (value: Response) => void;
  vi.stubGlobal("fetch", vi.fn().mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; })).mockImplementation(async () => response({ cart: { ...cart, id: "new-session" }, checkoutEnabled: true })));
  const stale = store.refreshCart(market); await store.useCurrentBag(market); resolve(ok()); await stale;
  expect(store.getCartSnapshot(market).cart?.id).toBe("new-session");
});

it("stops a timed-out recovery without dropping the original request", async () => {
  const record = saved(); const controller = new AbortController();
  const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
  vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Timed out", "TimeoutError")));
  })));
  const recovery = store.recoverCart(market);
  expect(timeout).toHaveBeenCalledWith(8000);
  controller.abort();
  await expect(recovery).rejects.toBeInstanceOf(store.CartUpdateUnconfirmedError);
  expect(store.getCartSnapshot(market)).toMatchObject({ recovery: "needs_retry", pending: false });
  expect(pending()).toEqual(record);
});

it("does not reclaim an old first bag after the browser has removed its expired cookie", async () => {
  saved({ expectedCartId: null, createdAt: Date.now() - 31 * 24 * 60 * 60_000 });
  const fetcher = vi.fn(async () => response({ cart: null, checkoutEnabled: true, mutationApplied: false })); vi.stubGlobal("fetch", fetcher);
  await expect(store.recoverCart(market)).rejects.toBeInstanceOf(store.CartUpdateUnconfirmedError);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(store.getCartSnapshot(market).recoveryCanReset).toBe(true);
  await store.useCurrentBag(market);
  expect(localStorage.getItem(storageKey)).toBeNull();
});
it.each([false, true])("looks up a stale key even if another operation has replaced its shared result (new pending=%s)", async hasNewPending => {
  const oldKey = crypto.randomUUID();
  const newer = saved({ autoAttempts: 2 });
  const fetcher = vi.fn(async () => ok(true)); vi.stubGlobal("fetch", fetcher);
  if (hasNewPending) await store.recoverCart(market, true);
  else await store.recoverCart(market);
  const before = fetcher.mock.calls.length;
  await store.recoverCart(market, false, oldKey);
  expect(fetcher).toHaveBeenCalledTimes(before + 1);
  expect(fetcher.mock.calls.at(-1)).toEqual([expect.stringContaining(`mutationKey=${oldKey}`), expect.objectContaining({ method: "GET" })]);
  expect(store.getCartSnapshot(market).resolution).toMatchObject({ key: oldKey, status: "confirmed" });
  if (hasNewPending) {
    expect(pending()).toEqual(newer);
    expect(store.getCartSnapshot(market).recovery).toBe("needs_retry");
  } else expect(localStorage.getItem(storageKey)).toBeNull();
});
