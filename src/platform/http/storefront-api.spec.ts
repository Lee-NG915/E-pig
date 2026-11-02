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
    cart: { createCart: vi.fn().mockResolvedValue(cart), getCart: vi.fn().mockResolvedValue(cart), addItem: vi.fn().mockResolvedValue(cart), updateItem: vi.fn().mockResolvedValue(cart), removeItem: vi.fn(), applyCoupon: vi.fn() },
    checkout: { start: vi.fn(), get: vi.fn(), reconcile: vi.fn(), cancel: vi.fn() },
    orders: { list: vi.fn().mockResolvedValue([]), get: vi.fn() },
  };
  const dependencies: StorefrontApiDependencies = { market: "au", origin: configuredOrigin, cookieSecret: secret, secure: true, checkoutEnabled: true, getCommerce: () => ports };
  return { ...ports, api: createStorefrontApi(dependencies) };
}
function request(method = "GET", body?: unknown, cookie?: string, suppliedOrigin = origin) {
  return new Request(`${origin}/api/au/cart`, { method, headers: { origin: suppliedOrigin, "content-type": "application/json", ...(cookie ? { cookie: `epig_cart_au=${cookie}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
const add = { action: "add", productId: "chair", variantId: "chair-default", quantity: 1, idempotencyKey: "728fe92a-066f-48bd-9883-d13b858ebba9" };

describe("storefront HTTP boundary", () => {
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
