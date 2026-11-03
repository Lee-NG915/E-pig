import { describe, expect, it, vi } from "vitest";
import type { Cart } from "@/core/contracts/commerce/cart";
import { AppError } from "@/core/errors/errors";
import { signCartCookie } from "@/platform/security/cart-cookie";
import { createStorefrontApi, type StorefrontApiDependencies } from "./storefront-api";

const origin = "https://sandbox.example.test";
const secret = "test-cookie-secret-32-characters-minimum";
const id = "e87cd5ec-2cea-49cf-ad35-5159c8830478";
const cart: Cart = { id, market: "au", revision: 0, lines: [], subtotal: { amount: 0, currency: "AUD" } };
function fixture(configuredOrigin = origin) {
  const ports = {
    cart: { createCart: vi.fn().mockResolvedValue(cart), findCartByCreationKey: vi.fn().mockResolvedValue(null), hasMutation: vi.fn().mockResolvedValue(false), getCart: vi.fn().mockResolvedValue(cart), addItem: vi.fn().mockResolvedValue(cart), addItems: vi.fn().mockResolvedValue(cart), updateItem: vi.fn().mockResolvedValue(cart), removeItem: vi.fn(), applyCoupon: vi.fn().mockResolvedValue(cart) },
    checkout: { start: vi.fn(), get: vi.fn(), reconcile: vi.fn(), cancel: vi.fn() },
    orders: { list: vi.fn().mockResolvedValue([]), get: vi.fn() },
  };
  const getCommerce = vi.fn(() => ports);
  const dependencies: StorefrontApiDependencies = { market: "au", origin: configuredOrigin, cookieSecret: secret, secure: true, checkoutEnabled: true, getCommerce };
  return { ...ports, getCommerce, api: createStorefrontApi(dependencies) };
}
function request(method = "GET", body?: unknown, cookie?: string, suppliedOrigin = origin) {
  return new Request(`${origin}/api/au/cart`, { method, headers: { origin: suppliedOrigin, "content-type": "application/json", ...(cookie ? { cookie: `epig_cart_au=${cookie}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
const add = { action: "add", productId: "chair", variantId: "chair-default", quantity: 1, idempotencyKey: "728fe92a-066f-48bd-9883-d13b858ebba9" };
const mutations = [
  add,
  { action: "addItems", items: [{ productId: "chair", variantId: "chair-default", quantity: 1 }], idempotencyKey: add.idempotencyKey },
  { action: "update", lineId: "line", quantity: 0, idempotencyKey: add.idempotencyKey },
  { action: "coupon", code: "DEMO10", idempotencyKey: add.idempotencyKey },
];
function receiptRequest(query: string, cookie?: string) {
  return new Request(`${origin}/api/au/cart?${query}`, { headers: cookie ? { cookie: `epig_cart_au=${cookie}` } : {} });
}
function expectNoCartWrites(port: ReturnType<typeof fixture>["cart"]) {
  for (const write of [port.createCart, port.addItem, port.addItems, port.updateItem, port.removeItem, port.applyCoupon]) expect(write).not.toHaveBeenCalled();
}

describe("storefront HTTP boundary", () => {
  it.each(mutations)("rejects a changed bag identity before any $action write", async body => {
    const { api, cart: port } = fixture();
    for (const token of [undefined, signCartCookie(id, "au", secret)]) {
      const response = await api(request("POST", { ...body, expectedCartId: "previous-bag", cartId: "posted-bag" }, token), "au", "cart");
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: { kind: "conflict", message: "Your bag session changed. Review your current bag before trying again." } });
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    expect(port.findCartByCreationKey).not.toHaveBeenCalled();
    expectNoCartWrites(port);
  });
  it.each(mutations)("accepts matching or omitted bag identity for $action using only the cookie", async body => {
    const { api, cart: port } = fixture();
    const token = signCartCookie(id, "au", secret);
    for (const expectedCartId of [id, undefined]) {
      expect((await api(request("POST", { ...body, expectedCartId, cartId: "posted-bag" }, token), "au", "cart")).status).toBe(200);
    }
    const write = body.action === "add" ? port.addItem : body.action === "addItems" ? port.addItems : body.action === "update" ? port.updateItem : port.applyCoupon;
    expect(write.mock.calls.map(call => call[0])).toEqual([id, id]);
    expect(port.findCartByCreationKey).not.toHaveBeenCalled();
    expect(port.createCart).not.toHaveBeenCalled();
  });
  it("preserves explicit null and permits first-add replay only for the cookie's original creation key", async () => {
    const { api, cart: port } = fixture();
    const body = { ...add, expectedCartId: null };
    const token = signCartCookie(id, "au", secret);
    for (const lookup of [null, { ...cart, id: "different-bag" }]) {
      port.findCartByCreationKey.mockResolvedValueOnce(lookup);
      expect((await api(request("POST", body, token), "au", "cart")).status).toBe(409);
    }
    expectNoCartWrites(port);
    port.findCartByCreationKey.mockResolvedValueOnce(cart);
    const response = await api(request("POST", body, token), "au", "cart");
    expect(response.status).toBe(200);
    expect(port.findCartByCreationKey).toHaveBeenLastCalledWith(`create:${add.idempotencyKey}`);
    expect(port.addItem).toHaveBeenCalledExactlyOnceWith(id, { productId: "chair", variantId: "chair-default", quantity: 1 }, { idempotencyKey: add.idempotencyKey });
    expect(port.createCart).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("creates a first bag with an explicit null precondition without a lookup", async () => {
    const { api, cart: port } = fixture();
    const response = await api(request("POST", { ...add, expectedCartId: null }), "au", "cart");
    expect(response.status).toBe(200);
    expect(port.createCart).toHaveBeenCalledExactlyOnceWith({ idempotencyKey: `create:${add.idempotencyKey}` });
    expect(port.findCartByCreationKey).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });
  it.each(["invalid", signCartCookie(id, "au", secret, 0)])("rejects reclaiming an old creation key after the cookie becomes invalid: %s", async token => {
    const { api, cart: port } = fixture();
    port.findCartByCreationKey.mockResolvedValue(cart);
    const response = await api(request("POST", { ...add, expectedCartId: null }, token), "au", "cart");
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { kind: "conflict", message: "Your bag session changed. Review your current bag before trying again." } });
    expect(port.findCartByCreationKey).toHaveBeenCalledExactlyOnceWith(`create:${add.idempotencyKey}`);
    expect(response.headers.get("set-cookie")).toBeNull();
    expectNoCartWrites(port);
  });
  it.each(["invalid", signCartCookie(id, "au", secret, 0)])("allows a new creation key after the cookie becomes invalid: %s", async token => {
    const { api, cart: port } = fixture();
    const response = await api(request("POST", { ...add, expectedCartId: null }, token), "au", "cart");
    expect(response.status).toBe(200);
    expect(port.findCartByCreationKey).toHaveBeenCalledExactlyOnceWith(`create:${add.idempotencyKey}`);
    expect(port.createCart).toHaveBeenCalledExactlyOnceWith({ idempotencyKey: `create:${add.idempotencyKey}` });
    expect(port.addItem).toHaveBeenCalledExactlyOnceWith(id, { productId: "chair", variantId: "chair-default", quantity: 1 }, { idempotencyKey: add.idempotencyKey });
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });
  it.each([12, "", "x".repeat(161)])("rejects invalid expected cart identity %j without writes", async expectedCartId => {
    const { api, cart: port } = fixture();
    expect((await api(request("POST", { ...add, expectedCartId }), "au", "cart")).status).toBe(400);
    expectNoCartWrites(port);
  });
  it("returns an unapplied receipt without loading commerce or creating a cart when the cookie is absent or invalid", async () => {
    const { api, getCommerce } = fixture();
    for (const token of [undefined, "invalid", signCartCookie(id, "sg", secret)]) {
      const response = await api(receiptRequest(`mutationKey=${add.idempotencyKey}`, token), "au", "cart");
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ cart: null, checkoutEnabled: true, mutationApplied: false, ...(token ? { sessionExpired: true } : {}) });
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
    expect(getCommerce).not.toHaveBeenCalled();
  });
  it.each([false, true])("reads receipt=%s only for the signed cookie and returns the newest snapshot", async mutationApplied => {
    const { api, cart: port } = fixture();
    const current = { ...cart, revision: 4 };
    port.hasMutation.mockImplementation(async () => {
      port.getCart.mockResolvedValue(current);
      return mutationApplied;
    });
    const response = await api(receiptRequest(`mutationKey=${add.idempotencyKey}&cartId=posted-bag`, signCartCookie(id, "au", secret)), "au", "cart");
    expect(await response.json()).toEqual({ cart: current, checkoutEnabled: true, mutationApplied });
    expect(port.hasMutation).toHaveBeenCalledExactlyOnceWith(id, add.idempotencyKey);
    expect(port.getCart).toHaveBeenCalledExactlyOnceWith(id);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expectNoCartWrites(port);
  });
  it.each(["mutationKey=", "mutationKey=not-a-uuid", `mutationKey=${add.idempotencyKey}&mutationKey=${add.idempotencyKey}`])("rejects invalid receipt query %s before accessing commerce", async query => {
    const { api, getCommerce } = fixture();
    for (const token of [undefined, signCartCookie(id, "au", secret)]) {
      expect((await api(receiptRequest(query, token), "au", "cart")).status).toBe(400);
    }
    expect(getCommerce).not.toHaveBeenCalled();
  });
  it("does not expose a receipt through an inactive market", async () => {
    const { api, getCommerce } = fixture();
    expect((await api(receiptRequest(`mutationKey=${add.idempotencyKey}`, signCartCookie(id, "au", secret)), "sg", "cart")).status).toBe(404);
    expect(getCommerce).not.toHaveBeenCalled();
  });
  it("validates every bundle item and creates a signed cart only for a valid first bundle", async () => {
    const { api, cart: port } = fixture();
    const item = { productId: "chair", variantId: "chair-default", quantity: 1 };
    for (const items of [[], [item, item, item], [item, { ...item, quantity: 0 }], [item, { ...item, variantId: "" }]]) {
      expect((await api(request("POST", { action: "addItems", items, idempotencyKey: add.idempotencyKey }), "au", "cart")).status).toBe(400);
    }
    expect(port.createCart).not.toHaveBeenCalled();
    const response = await api(request("POST", { action: "addItems", items: [item, { ...item, price: 1 }], idempotencyKey: add.idempotencyKey, cartId: "foreign" }), "au", "cart");
    expect(response.status).toBe(200);
    expect(port.addItems).toHaveBeenCalledExactlyOnceWith(id, [item, item], { idempotencyKey: add.idempotencyKey });
    expect(port.addItem).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });
  it("requires an existing owned cart for coupons and accepts an empty removal code", async () => {
    const { api, cart: port } = fixture();
    const body = { action: "coupon", code: "", idempotencyKey: add.idempotencyKey };
    expect((await api(request("POST", body), "au", "cart")).status).toBe(401);
    expect(port.createCart).not.toHaveBeenCalled();
    const response = await api(request("POST", body, signCartCookie(id, "au", secret)), "au", "cart");
    expect(response.status).toBe(200);
    expect(port.applyCoupon).toHaveBeenCalledWith(id, "", { idempotencyKey: add.idempotencyKey });
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("normalizes a valid configured origin before checking the browser Origin header", async () => {
    const { api } = fixture(`${origin}:443/`);
    expect((await api(request("POST", add), "au", "cart")).status).toBe(200);
  });
  it("does not create a cart or cookie on ordinary GET", async () => {
    const { api, cart: port } = fixture();
    const response = await api(request(), "au", "cart");
    expect(await response.json()).toEqual({ cart: null, checkoutEnabled: true });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(port.createCart).not.toHaveBeenCalled();
  });
  it("creates only on first add, signs an HttpOnly credential, and uses authoritative IDs", async () => {
    const { api, cart: port } = fixture();
    const response = await api(request("POST", { ...add, price: 1, cartId: "someone-else" }), "au", "cart");
    expect(response.status).toBe(200);
    expect(port.addItem).toHaveBeenCalledWith(id, { productId: "chair", variantId: "chair-default", quantity: 1 }, { idempotencyKey: add.idempotencyKey });
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });
  it("rejects cross-site writes, inactive markets and cartless mutations", async () => {
    const { api, cart: port } = fixture();
    expect((await api(request("POST", add, undefined, "https://evil.test"), "au", "cart")).status).toBe(403);
    expect((await api(request("POST", add), "sg", "cart")).status).toBe(404);
    expect((await api(request("POST", { ...add, action: "update", lineId: "line" }), "au", "cart")).status).toBe(401);
    expect(port.createCart).not.toHaveBeenCalled();
  });
  it("requires cookie ownership for checkout and order lookup", async () => {
    const { api, orders } = fixture();
    expect((await api(request(), "au", "orders", "guessed-id")).status).toBe(401);
    const token = signCartCookie(id, "au", secret);
    await api(request("GET", undefined, token), "au", "orders");
    expect(orders.list).toHaveBeenCalledWith(id);
    expect((await api(request("GET", undefined, signCartCookie(id, "sg", secret)), "au", "orders")).status).toBe(401);
  });
  it("queries trusted payment status and ignores a forged success query", async () => {
    const { api, checkout } = fixture();
    checkout.reconcile.mockResolvedValue({ status: "open" });
    const token = signCartCookie(id, "au", secret);
    const response = await api(new Request(`${origin}/api/au/checkout/c1?paid=true`, { headers: { cookie: `epig_cart_au=${token}` } }), "au", "checkout", "c1");
    expect(await response.json()).toEqual({ checkout: { status: "open" } });
    expect(checkout.reconcile).toHaveBeenCalledWith(id, "c1");
    expect(checkout.start).not.toHaveBeenCalled();
  });
  it("keeps provider errors private and never marks unknown payments successful", async () => {
    const { api, checkout } = fixture();
    checkout.reconcile.mockRejectedValue(new AppError("upstream", "secret provider payload"));
    const response = await api(request("GET", undefined, signCartCookie(id, "au", secret)), "au", "checkout", "c1");
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("secret provider");
  });
});
