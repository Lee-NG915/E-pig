import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentPort, PaymentRequest, PaymentSession } from "@/core/contracts/capabilities/payment";
import type { Cart } from "@/core/contracts/commerce/cart";
import type { CatalogPort, ProductDetail } from "@/core/contracts/commerce/catalog";
import type { Checkout, CheckoutInput } from "@/core/contracts/commerce/checkout";
import type { Order } from "@/core/contracts/commerce/order";
import { markets } from "@/platform/config/markets";
import { readCartCookie } from "@/platform/security/cart-cookie";
import { createPostgresCommerce } from "@/adapters/commerce/postgres/commerce";
import type { CommercePool } from "@/adapters/commerce/postgres/pool";
import { createStripePaymentAdapter } from "@/adapters/payment/stripe/payment";
import { POST as stripeWebhook } from "@/app/api/payments/stripe/route";
import { createStorefrontApi, type StorefrontResource } from "./storefront-api";

// Only replace the route's composition root: its transport, signature parser and SQL service are real.
const registry = vi.hoisted(() => ({ getCommerce: vi.fn(), getPayment: vi.fn(), isCheckoutEnabled: vi.fn(() => true) }));
vi.mock("@/platform/registry", () => registry);

const origin = "https://sandbox.example.test";
const cookieSecret = "integration-only-cookie-secret-at-least-32-characters";
const webhookSecret = "whsec_integration_fixture_not_a_real_secret";
const stripeClient = new Stripe("sk_test_integration_fixture_not_a_real_key");
const signatureParser = createStripePaymentAdapter({
  secretKey: "sk_test_integration_fixture_not_a_real_key", webhookSecret, client: stripeClient,
});
const key = () => crypto.randomUUID();
const product: ProductDetail = {
  id: "sandbox-sofa", slug: "sandbox-sofa", name: "Sandbox Sofa", category: "sofas", colour: "Grey", image: "/sofa.png",
  price: { amount: 12.34, currency: "AUD" }, description: "Test fixture", materials: [], gallery: [], colourOptions: [], availability: "in-stock",
  variants: [
    { id: "small", sku: "SANDBOX-S", label: "Small", image: "/small.png", price: { amount: 12.34, currency: "AUD" }, availability: "in-stock", maxQuantity: 10 },
    { id: "large", sku: "SANDBOX-L", label: "Large", image: "/large.png", price: { amount: 20, currency: "AUD" }, availability: "in-stock", maxQuantity: 10 },
  ],
};
const checkoutInput = (cart: Cart): CheckoutInput => ({
  revision: cart.revision, expectedTotal: cart.subtotal,
  contact: { name: "Sandbox Guest", email: "guest@example.test" },
  address: { line1: "1 Test Street", city: "Sydney", state: "NSW", postalCode: "2000", country: "AU" },
});
const json = <T>(response: Response) => response.json() as Promise<T>;
function cookieFrom(response: Response): string {
  const cookie = response.headers.get("set-cookie");
  expect(cookie).toBeTruthy();
  return cookie!.split(";")[0];
}

describe("storefront HTTP → actual PostgreSQL SQL (simulated Stripe network boundary)", () => {
  let db: PGlite;
  let pool: CommercePool;
  let catalog: CatalogPort;
  let simulatedStripe: PaymentPort;
  let sessions: Map<string, PaymentSession>;
  const service = () => createPostgresCommerce({ pool, catalog, payment: simulatedStripe, market: markets.au, origin });
  // Reconstructing both API and adapter for every request prevents in-memory commerce state hiding missing persistence.
  const send = (resource: StorefrontResource, options: { method?: string; cookie?: string; body?: unknown; id?: string; query?: string; suppliedOrigin?: string } = {}) => {
    const api = createStorefrontApi({ market: "au", origin, cookieSecret, secure: true, checkoutEnabled: true, getCommerce: service });
    const request = new Request(`${origin}/api/au/${resource}${options.id ? `/${options.id}` : ""}${options.query ?? ""}`, {
      method: options.method ?? "GET",
      headers: { origin: options.suppliedOrigin ?? origin, "content-type": "application/json", ...(options.cookie ? { cookie: options.cookie } : {}) },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    return api(request, "au", resource, options.id);
  };
  const add = (variantId = "small") => ({ action: "add", productId: product.id, variantId, quantity: 1, idempotencyKey: key() });
  async function bag() {
    const response = await send("cart", { method: "POST", body: add() });
    expect(response.status).toBe(200);
    return { cookie: cookieFrom(response), cart: (await json<{ cart: Cart }>(response)).cart };
  }
  async function begin(cookie: string, cart: Cart) {
    const response = await send("checkout", { method: "POST", cookie, body: { ...checkoutInput(cart), idempotencyKey: key() } });
    expect(response.status).toBe(200);
    return (await json<{ checkout: Checkout }>(response)).checkout;
  }
  const orderList = async (cookie: string) => {
    const response = await send("orders", { cookie });
    expect(response.status).toBe(200);
    return (await json<{ orders: Order[] }>(response)).orders;
  };
  beforeEach(async () => {
    db = new PGlite();
    await db.exec(await readFile("scripts/database/001-commerce.sql", "utf8"));
    // A PGlite instance has one physical connection; lease it for the complete SQL transaction.
    let tail = Promise.resolve();
    pool = {
      query: async (sql, values) => db.query(sql, values),
      connect: async () => {
        const previous = tail;
        let release!: () => void;
        tail = new Promise<void>((resolve) => { release = resolve; });
        await previous;
        return { query: async (sql, values) => db.query(sql, values), release };
      },
    };
    catalog = { getProduct: async () => structuredClone(product), listProducts: async () => [product], listCollections: async () => [], suggest: async () => [] };
    sessions = new Map();
    // Simulates the external provider only. This is not a real Stripe sandbox/cloud payment.
    simulatedStripe = {
      createSession: async (request: PaymentRequest, id: string) => {
        if (!sessions.has(id)) sessions.set(id, {
          id, checkoutId: request.checkoutId, cartId: request.cartId, market: request.market, total: structuredClone(request.total),
          status: "open", paid: false, livemode: false, url: "https://checkout.stripe.com/test",
        });
        return structuredClone(sessions.get(id)!);
      },
      retrieveSession: async (id) => structuredClone(sessions.get(id)!),
      expireSession: async (id) => { const session = sessions.get(id)!; session.status = "expired"; return structuredClone(session); },
      parseWebhook: signatureParser.parseWebhook,
    };
    registry.getCommerce.mockImplementation(service);
    registry.getPayment.mockImplementation(() => simulatedStripe);
  });
  afterEach(async () => { await db.close(); });

  it("round-trips the first signed cookie through variant checkout, trusted return and durable owned order reads", async () => {
    const first = await send("cart", { method: "POST", body: { ...add(), price: 0.01, cartId: "forged-cart" } });
    expect(first.status).toBe(200);
    const cookie = cookieFrom(first);
    const initial = (await json<{ cart: Cart }>(first)).cart;
    expect(readCartCookie(cookie.slice(cookie.indexOf("=") + 1), "au", cookieSecret)).toBe(initial.id);

    const addition = add("large");
    const second = await send("cart", { method: "POST", cookie, body: addition });
    expect(second.status).toBe(200);
    expect(second.headers.get("set-cookie")).toBeNull();
    expect((await send("cart", { method: "POST", cookie, body: addition })).status).toBe(200);
    const cart = (await json<{ cart: Cart }>(await send("cart", { cookie }))).cart;
    expect(cart.id).toBe(initial.id);
    expect(cart.lines.map((line) => [line.variantId, line.quantity])).toEqual([["small", 1], ["large", 1]]);
    expect(cart.subtotal).toEqual({ amount: 32.34, currency: "AUD" });

    const staleQuote = await send("checkout", { method: "POST", cookie, body: { ...checkoutInput(cart), expectedTotal: { amount: 0.01, currency: "AUD" }, idempotencyKey: key() } });
    expect(staleQuote.status).toBe(409);
    expect(sessions.size).toBe(0);
    const checkout = await begin(cookie, cart);
    expect(checkout.total).toEqual({ amount: 32.34, currency: "AUD" });
    const forgedReturn = await send("checkout", { cookie, id: checkout.id, query: "?paid=true&payment_status=paid" });
    expect((await json<{ checkout: Checkout }>(forgedReturn)).checkout.status).toBe("open");
    expect(await orderList(cookie)).toEqual([]);

    const session = [...sessions.values()][0];
    session.paid = true; session.status = "complete";
    const reconciled = await send("checkout", { cookie, id: checkout.id });
    expect(reconciled.status).toBe(200);
    const paid = (await json<{ checkout: Checkout }>(reconciled)).checkout;
    expect(paid.status).toBe("paid");
    const detail = await send("orders", { cookie, id: paid.orderId });
    expect(detail.status).toBe(200);
    const order = (await json<{ order: Order }>(detail)).order;
    expect(order).toMatchObject({ id: paid.orderId, checkoutId: checkout.id, cartId: initial.id, status: "paid", total: { amount: 32.34, currency: "AUD" } });
    expect(order.lines.map((line) => line.variantId)).toEqual(["small", "large"]);
    expect(await orderList(cookie)).toEqual([order]);
    expect((await json<{ cart: Cart }>(await send("cart", { cookie }))).cart).toMatchObject({ id: initial.id, lines: [], subtotal: { amount: 0, currency: "AUD" } });

    const other = await bag();
    expect(await orderList(other.cookie)).toEqual([]);
    expect((await send("orders", { cookie: other.cookie, id: order.id })).status).toBe(404);
    expect((await send("checkout", { cookie: other.cookie, id: checkout.id })).status).toBe(404);
    const invalidCookie = `${cookie.slice(0, -1)}!`;
    expect((await send("orders", { cookie: invalidCookie, id: order.id })).status).toBe(401);
    expect((await send("checkout", { cookie: invalidCookie, id: checkout.id })).status).toBe(401);
    expect((await send("cart", { method: "POST", cookie, body: add(), suppliedOrigin: "https://foreign.example.test" })).status).toBe(403);
    expect((await json<{ cart: Cart }>(await send("cart", { cookie }))).cart.lines).toEqual([]);
  });

  it("passes original signed webhook bytes into real verification and persists one order across duplicate deliveries", async () => {
    const { cookie, cart } = await bag();
    const checkout = await begin(cookie, cart);
    const session = [...sessions.values()][0];
    // Whitespace is intentional: parsing/re-serializing at the route would invalidate this signature.
    // The event's payment/amount fields are untrusted; only a retrieved provider session may settle the order.
    const raw = JSON.stringify({
      id: "evt_integration_paid", object: "event", livemode: false, type: "checkout.session.completed",
      data: { object: { id: session.id, livemode: false, payment_status: "paid", amount_total: 1,
        metadata: { checkoutId: checkout.id, cartId: cart.id, market: "au" } } },
    }, null, 2);
    const signature = stripeClient.webhooks.generateTestHeaderString({ payload: raw, secret: webhookSecret });
    const deliver = (body = raw) => stripeWebhook(new Request(`${origin}/api/payments/stripe`, {
      method: "POST", headers: { "stripe-signature": signature, "content-type": "application/json" }, body,
    }));

    // A signature for different bytes cannot modify commerce, even when the provider is already paid.
    session.paid = true; session.status = "complete";
    expect((await deliver(`${raw}\n`)).status).toBe(401);
    expect(await orderList(cookie)).toEqual([]);
    session.paid = false; session.status = "open";
    const unconfirmed = await deliver();
    expect(unconfirmed.status).toBe(200);
    expect(await json(unconfirmed)).toEqual({ received: true });
    expect(await orderList(cookie)).toEqual([]);

    session.paid = true; session.status = "complete";
    expect((await deliver()).status).toBe(200);
    const [order] = await orderList(cookie);
    expect(order).toMatchObject({ checkoutId: checkout.id, cartId: cart.id, total: { amount: 12.34, currency: "AUD" }, status: "paid" });
    const cleared = (await json<{ cart: Cart }>(await send("cart", { cookie }))).cart;
    expect(cleared).toMatchObject({ lines: [], revision: cart.revision + 1 });
    expect((await deliver()).status).toBe(200);
    expect((await deliver()).status).toBe(200);
    // Every read constructs a new SQL adapter, so these are durable results rather than cached DTOs.
    expect(await orderList(cookie)).toEqual([order]);
    expect((await json<{ cart: Cart }>(await send("cart", { cookie }))).cart).toEqual(cleared);
    const refreshed = (await json<{ checkout: Checkout }>(await send("checkout", { cookie, id: checkout.id }))).checkout;
    expect(refreshed).toMatchObject({ status: "paid", orderId: order.id });
  });
});
