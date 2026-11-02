import { Pool, neonConfig } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CatalogPort, ProductDetail } from "@/core/contracts/commerce/catalog";
import type { PaymentPort, PaymentSession } from "@/core/contracts/capabilities/payment";
import type { CheckoutInput } from "@/core/contracts/commerce/checkout";
import { markets } from "@/platform/config/markets";
import { createPostgresCommerce } from "@/adapters/commerce/postgres/commerce";

/** Opt-in: real migrated PostgreSQL, exclusively new random test rows, no real payment API calls. */
describe.skipIf(process.env.COMMERCE_DATABASE_TEST !== "1")("external PostgreSQL transaction concurrency", () => {
  let pool: Pool;
  beforeAll(() => {
    process.loadEnvFile(".env.local");
    if (!process.env.DATABASE_URL) throw new Error("A migrated DATABASE_URL is required");
    neonConfig.webSocketConstructor = WebSocket;
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 10_000 });
  });
  afterAll(async () => { await pool?.end(); });
  it("serializes independent connections into one cart revision, one payment and one durable order", async () => {
    const product = {
      id: "integration-test-product", name: "Concurrency test", price: { amount: 1, currency: "AUD" },
      variants: [{ id: "integration-test-variant", sku: "SANDBOX-TEST", label: "Test", image: "/test.png", price: { amount: 1, currency: "AUD" }, availability: "in-stock", maxQuantity: 10 }],
    } as ProductDetail;
    const catalog: CatalogPort = {
      getProduct: async () => structuredClone(product), listProducts: async () => [], listCollections: async () => [], suggest: async () => [],
    };
    const sessions = new Map<string, PaymentSession>();
    const payment: PaymentPort = {
      async createSession(request, key) {
        if (!sessions.has(key)) sessions.set(key, { id: `sql_test_${request.checkoutId}`, checkoutId: request.checkoutId, cartId: request.cartId, market: request.market, total: request.total, status: "open", paid: false, livemode: false, url: "https://checkout.stripe.com/test" });
        return structuredClone(sessions.get(key)!);
      },
      async retrieveSession(id) { return structuredClone([...sessions.values()].find((item) => item.id === id)!); },
      async expireSession() { throw new Error("Unused in this SQL-only test"); },
      parseWebhook() { return null; },
    };
    const make = () => createPostgresCommerce({ pool, catalog, payment, market: markets.au, origin: "https://sql-integration.example" });
    const app = make();
    const creation = { idempotencyKey: crypto.randomUUID() };
    const created = await Promise.all(Array.from({ length: 8 }, () => app.cart.createCart(creation)));
    expect(new Set(created.map((cart) => cart.id)).size).toBe(1);
    const cartId = created[0].id;
    const mutation = { idempotencyKey: crypto.randomUUID() };
    const line = { productId: product.id, variantId: product.variants[0].id, quantity: 1 };
    await Promise.all(Array.from({ length: 8 }, () => app.cart.addItem(cartId, line, mutation)));
    await Promise.all(Array.from({ length: 4 }, () => app.cart.addItem(cartId, line, { idempotencyKey: crypto.randomUUID() })));
    const cart = await app.cart.getCart(cartId);
    expect(cart.revision).toBe(5);
    expect(cart.lines[0].quantity).toBe(5);
    const input: CheckoutInput = {
      revision: cart.revision, expectedTotal: cart.subtotal,
      contact: { name: "SQL concurrency test", email: "database-test@example.invalid" },
      address: { line1: "1 Test St", city: "Sydney", state: "NSW", postalCode: "2000", country: "AU" },
    };
    const checkouts = await Promise.all(Array.from({ length: 8 }, () => make().checkout.start(cartId, input, { idempotencyKey: crypto.randomUUID() })));
    expect(new Set(checkouts.map((checkout) => checkout.id)).size).toBe(1);
    expect(sessions.size).toBe(1);
    await expect(app.cart.addItem(cartId, line, { idempotencyKey: crypto.randomUUID() })).rejects.toMatchObject({ kind: "conflict" });
    const session = [...sessions.values()][0]; session.status = "complete"; session.paid = true;
    const event = { id: "sql-test-event", sessionId: session.id, checkoutId: checkouts[0].id, market: "au" };
    await Promise.all(Array.from({ length: 8 }, () => make().handlePaymentEvent(event)));
    expect(await make().orders.list(cartId)).toHaveLength(1);
    const final = await app.cart.getCart(cartId);
    expect(final.revision).toBe(cart.revision + 1);
    expect(final.lines).toEqual([]);
    expect(final.lockedCheckoutId).toBeUndefined();
    const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM commerce_checkouts WHERE cart_id = $1", [cartId]);
    expect(rows[0].count).toBe(1);
    // New test rows intentionally remain as evidence. No existing records are modified or removed.
  }, 120_000);
});
