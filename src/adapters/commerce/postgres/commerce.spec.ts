import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogPort, ProductDetail } from "@/core/contracts/commerce/catalog";
import type { PaymentPort, PaymentRequest, PaymentSession } from "@/core/contracts/capabilities/payment";
import type { CheckoutInput } from "@/core/contracts/commerce/checkout";
import { markets } from "@/platform/config/markets";
import { createMockCatalogAdapter } from "@/adapters/commerce/mock/catalog";
import { createPostgresCommerce } from "./commerce";
import type { CommercePool } from "./pool";

const key = () => crypto.randomUUID();
const product = {
  id: "sofa", name: "Sofa", price: { amount: 12.34, currency: "AUD" },
  variants: [
    { id: "small", sku: "TEST-S", label: "Small", image: "/s.png", price: { amount: 12.34, currency: "AUD" }, availability: "in-stock", maxQuantity: 10 },
    { id: "large", sku: "TEST-L", label: "Large", image: "/l.png", price: { amount: 20, currency: "AUD" }, availability: "in-stock", maxQuantity: 10 },
  ],
} as ProductDetail;
const input = (revision: number, amount = 12.34): CheckoutInput => ({
  revision, expectedTotal: { amount, currency: "AUD" },
  contact: { name: "Test Guest", email: "guest@example.com" },
  address: { line1: "1 Test St", city: "Sydney", state: "NSW", postalCode: "2000", country: "AU" },
});

describe("durable sandbox commerce (actual PostgreSQL SQL)", () => {
  let db: PGlite;
  let pool: CommercePool;
  let catalog: CatalogPort;
  let payment: PaymentPort;
  let sessions: Map<string, PaymentSession>;
  let time: number;
  const service = () => createPostgresCommerce({ pool, catalog, payment, market: markets.au, origin: "https://shop.example", now: () => new Date(time) });
  beforeEach(async () => {
    time = Date.parse("2026-11-02T00:00:00Z");
    db = new PGlite();
    await db.exec(await readFile("scripts/database/001-commerce.sql", "utf8"));
    // PGlite has one physical connection: serialize connection leases, not service calls.
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
    catalog = { getProduct: vi.fn(async () => structuredClone(product)), listProducts: vi.fn(), listCollections: vi.fn(), suggest: vi.fn() };
    sessions = new Map();
    payment = {
      createSession: vi.fn(async (request: PaymentRequest, id: string) => {
        let session = sessions.get(id);
        if (!session) {
          session = { id, checkoutId: request.checkoutId, cartId: request.cartId, market: request.market, total: request.total, status: "open", paid: false, livemode: false, url: "https://checkout.stripe.com/test" };
          sessions.set(id, session);
        }
        return structuredClone(session);
      }),
      retrieveSession: vi.fn(async (id: string) => structuredClone(sessions.get(id)!)),
      expireSession: vi.fn(async (id: string) => { const session = sessions.get(id)!; if (session.status === "open") session.status = "expired"; return structuredClone(session); }),
      parseWebhook: vi.fn(),
    };
  });
  afterEach(async () => { await db.close(); });
  async function populated() {
    const app = service();
    const created = await app.cart.createCart({ idempotencyKey: key() });
    const cart = await app.cart.addItem(created.id, { productId: "sofa", variantId: "small", quantity: 1 }, { idempotencyKey: key() });
    return { app, cart };
  }
  it("looks up existing creation identity and committed receipts without creating or crossing carts/markets", async () => {
    const app = service();
    const creationKey = `create:${key()}`;
    const mutationKey = key();
    expect(await app.cart.findCartByCreationKey(creationKey)).toBeNull();
    const created = await app.cart.createCart({ idempotencyKey: creationKey });
    const other = await app.cart.createCart({ idempotencyKey: key() });
    expect(await app.cart.hasMutation(created.id, mutationKey)).toBe(false);
    const added = await app.cart.addItem(created.id, { productId: "sofa", variantId: "small", quantity: 1 }, { idempotencyKey: mutationKey });
    expect(await service().cart.findCartByCreationKey(creationKey)).toEqual(added);
    expect(await service().cart.hasMutation(created.id, mutationKey)).toBe(true);
    expect(await app.cart.hasMutation(other.id, mutationKey)).toBe(false);
    expect(await app.cart.findCartByCreationKey(`create:${key()}`)).toBeNull();
    for (const market of [markets.sg, markets.us]) {
      const scoped = createPostgresCommerce({ pool, catalog, payment, market, origin: "https://shop.example" });
      expect(await scoped.cart.findCartByCreationKey(creationKey)).toBeNull();
      expect(await scoped.cart.hasMutation(created.id, mutationKey)).toBe(false);
      const own = await scoped.cart.createCart({ idempotencyKey: creationKey });
      expect((await scoped.cart.findCartByCreationKey(creationKey))?.id).toBe(own.id);
      expect(own.id).not.toBe(created.id);
    }
    expect(await app.cart.getCart(created.id)).toEqual(added);
  });

  it("does not report receipts for a rolled-back bundle", async () => {
    const { app, cart } = await populated();
    const mutationKey = key();
    await expect(app.cart.addItems(cart.id, [{ productId: "sofa", variantId: "large", quantity: 1 }, { productId: "sofa", variantId: "missing", quantity: 1 }], { idempotencyKey: mutationKey })).rejects.toMatchObject({ kind: "validation" });
    expect(await app.cart.hasMutation(cart.id, mutationKey)).toBe(false);
    expect(await app.cart.getCart(cart.id)).toEqual(cart);
  });

  it("persists creation/retries, separates variants, ignores client price and caps quantity", async () => {
    const app = service();
    const creationKey = key();
    const cart = await app.cart.createCart({ idempotencyKey: creationKey });
    expect((await service().cart.createCart({ idempotencyKey: creationKey })).id).toBe(cart.id);
    const options = { idempotencyKey: key() };
    const line = { productId: "sofa", variantId: "small", quantity: 1, price: 0.01 };
    await app.cart.addItem(cart.id, line, options);
    await service().cart.addItem(cart.id, line, options);
    const result = await app.cart.addItem(cart.id, { productId: "sofa", variantId: "large", quantity: 1 }, { idempotencyKey: key() });
    expect(result.lines.map((line) => [line.variantId, line.quantity])).toEqual([["small", 1], ["large", 1]]);
    expect(result.subtotal.amount).toBe(32.34);
    await expect(app.cart.addItem(cart.id, { ...line, quantity: 2 }, options)).rejects.toMatchObject({ kind: "conflict" });
    await expect(app.cart.addItem(cart.id, { ...line, quantity: 10 }, { idempotencyKey: key() })).rejects.toMatchObject({ kind: "validation" });
  });
  it("carries real Tamarama variants and merged quantities into the durable checkout and payment total", async () => {
    catalog = createMockCatalogAdapter({ market: markets.au });
    const app = service();
    const created = await app.cart.createCart({ idempotencyKey: key() });
    const productId = "tamarama-modular-sofa";
    const defaultVariantId = "tamarama-modular-sofa-default";
    const greenVariantId = "tamarama-modular-sofa-forest-walk-3-sections";
    await app.cart.addItem(created.id, { productId, variantId: defaultVariantId, quantity: 1 }, { idempotencyKey: key() });
    await app.cart.addItem(created.id, { productId, variantId: greenVariantId, quantity: 1 }, { idempotencyKey: key() });
    await app.cart.addItem(created.id, { productId, variantId: greenVariantId, quantity: 1 }, { idempotencyKey: key() });

    const cart = await service().cart.getCart(created.id);
    expect(cart.lines).toHaveLength(2);
    expect(cart.lines[0]).toMatchObject({
      productId,
      variantId: defaultVariantId,
      variantLabel: "2 Sections / Regular / Winter Cream",
      image: expect.stringContaining("TAM_WC_2S_R_01_PRODUCT"),
      quantity: 1,
      unitPrice: { amount: 2600, currency: "AUD" },
      lineTotal: { amount: 2600, currency: "AUD" },
    });
    expect(cart.lines[1]).toMatchObject({
      productId,
      variantId: greenVariantId,
      variantLabel: "3 Sections / Regular / Forest Walk",
      image: expect.stringContaining("TAM_FW_3S_R_01_PRODUCT"),
      quantity: 2,
      unitPrice: { amount: 3550, currency: "AUD" },
      lineTotal: { amount: 7100, currency: "AUD" },
    });
    expect(cart.lines[0].id).not.toBe(cart.lines[1].id);
    expect(cart.subtotal).toEqual({ amount: 9700, currency: "AUD" });

    const checkout = await app.checkout.start(cart.id, input(cart.revision, 9700), { idempotencyKey: key() });
    expect(checkout.status).toBe("open");
    expect(checkout.revision).toBe(cart.revision);
    expect(checkout.lines).toEqual(cart.lines);
    expect(checkout.total).toEqual(cart.subtotal);
    expect(await service().checkout.get(cart.id, checkout.id)).toEqual(checkout);
    expect(payment.createSession).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        checkoutId: checkout.id,
        cartId: cart.id,
        market: "au",
        total: { amount: 9700, currency: "AUD" },
        email: "guest@example.com",
      }),
      `checkout:${checkout.id}`,
    );
    const locked = await service().cart.getCart(cart.id);
    expect(locked.lockedCheckoutId).toBe(checkout.id);
    expect(locked.lines).toEqual(checkout.lines);
  });
  it("removes one real Tamarama variant without changing the other variant", async () => {
    catalog = createMockCatalogAdapter({ market: markets.au });
    const app = service();
    const created = await app.cart.createCart({ idempotencyKey: key() });
    const productId = "tamarama-modular-sofa";
    await app.cart.addItem(created.id, { productId, variantId: "tamarama-modular-sofa-default", quantity: 1 }, { idempotencyKey: key() });
    const cart = await app.cart.addItem(created.id, { productId, variantId: "tamarama-modular-sofa-forest-walk-3-sections", quantity: 2 }, { idempotencyKey: key() });

    const remaining = await app.cart.removeItem(cart.id, cart.lines[1].id, { idempotencyKey: key() });
    expect(remaining.lines).toEqual([cart.lines[0]]);
    expect(remaining.subtotal).toEqual({ amount: 2600, currency: "AUD" });
    expect((await service().cart.getCart(cart.id)).lines).toEqual(remaining.lines);
    expect(payment.createSession).not.toHaveBeenCalled();
  });
  it("keeps unavailable and removed product lines readable and independently removable", async () => {
    const { app, cart } = await populated();
    const two = await app.cart.addItem(cart.id, { productId: "sofa", variantId: "large", quantity: 1 }, { idempotencyKey: key() });
    const unavailable = structuredClone(product); unavailable.variants.forEach((variant) => { variant.availability = "out-of-stock"; });
    vi.mocked(catalog.getProduct).mockResolvedValue(unavailable);
    const readable = await app.cart.getCart(cart.id);
    expect(readable.lines).toHaveLength(2);
    expect(readable.lines.every((line) => line.availability === "out-of-stock")).toBe(true);
    const remaining = await app.cart.removeItem(cart.id, two.lines[0].id, { idempotencyKey: key() });
    expect(remaining.lines.map((line) => line.variantId)).toEqual(["large"]);
    await expect(app.checkout.start(cart.id, input(remaining.revision, 20), { idempotencyKey: key() })).rejects.toMatchObject({ kind: "validation" });
    const { AppError } = await import("@/core/errors/errors");
    vi.mocked(catalog.getProduct).mockRejectedValue(new AppError("not_found", "Removed product"));
    expect((await app.cart.getCart(cart.id)).lines[0].problem).toBeTruthy();
    expect((await app.cart.updateItem(cart.id, remaining.lines[0].id, 0, { idempotencyKey: key() })).lines).toEqual([]);
  });
  it("atomically adds a real two-variant bundle and freezes DEMO10 through payment and order", async () => {
    catalog = createMockCatalogAdapter({ market: markets.au });
    const app = service();
    const empty = await app.cart.createCart({ idempotencyKey: key() });
    expect(empty.total).toEqual(empty.subtotal);
    const items = [
      { productId: "tamarama-modular-sofa", variantId: "tamarama-modular-sofa-default", quantity: 1 },
      { productId: "tamarama-modular-sofa", variantId: "tamarama-modular-sofa-forest-walk-3-sections", quantity: 2 },
    ];
    const options = { idempotencyKey: key() };
    const added = await app.cart.addItems(empty.id, items, options);
    expect(added.revision).toBe(1);
    expect(added.lines.map(line => line.quantity)).toEqual([1, 2]);
    expect(added.subtotal).toEqual({ amount: 9700, currency: "AUD" });
    expect(added.total).toEqual(added.subtotal);
    expect(await service().cart.addItems(empty.id, items, options)).toEqual(added);
    await expect(app.cart.addItems(empty.id, items.slice(0, 1), options)).rejects.toMatchObject({ kind: "conflict" });
    const cart = await app.cart.applyCoupon(empty.id, " demo10 ", { idempotencyKey: key() });
    expect(cart).toMatchObject({ couponCode: "DEMO10", discount: { amount: 970, currency: "AUD" }, total: { amount: 8730, currency: "AUD" } });
    expect(cart.subtotal).toEqual(added.subtotal);
    expect(cart.lines).toEqual(added.lines);
    await expect(app.checkout.start(cart.id, input(cart.revision, 9700), { idempotencyKey: key() })).rejects.toMatchObject({ kind: "conflict" });
    const checkout = await app.checkout.start(cart.id, input(cart.revision, 8730), { idempotencyKey: key() });
    expect(checkout).toMatchObject({ subtotal: cart.subtotal, discount: cart.discount, couponCode: "DEMO10", total: cart.total, lines: cart.lines });
    expect(vi.mocked(payment.createSession).mock.calls[0][0].total).toEqual(cart.total);
    await expect(app.cart.applyCoupon(cart.id, "", { idempotencyKey: key() })).rejects.toMatchObject({ kind: "conflict" });
    await expect(app.cart.addItems(cart.id, items, { idempotencyKey: key() })).rejects.toMatchObject({ kind: "conflict" });
    const session = [...sessions.values()][0]; session.status = "complete"; session.paid = true;
    const paid = await app.checkout.reconcile(cart.id, checkout.id);
    expect(await app.orders.get(cart.id, paid.orderId!)).toMatchObject({ subtotal: cart.subtotal, discount: cart.discount, couponCode: "DEMO10", total: cart.total });
    const cleared = await app.cart.getCart(cart.id);
    expect(cleared.lines).toEqual([]);
    expect(cleared.couponCode).toBeUndefined();
    expect(cleared.discount).toBeUndefined();
    expect(cleared.total).toEqual({ amount: 0, currency: "AUD" });
  });
  it("rolls back an entire bundle on invalid, unavailable or over-limit items", async () => {
    catalog = createMockCatalogAdapter({ market: markets.au });
    const app = service();
    const empty = await app.cart.createCart({ idempotencyKey: key() });
    const base = { productId: "tamarama-modular-sofa", variantId: "tamarama-modular-sofa-default", quantity: 1 };
    const green = { ...base, variantId: "tamarama-modular-sofa-forest-walk-3-sections" };
    const before = await app.cart.addItem(empty.id, base, { idempotencyKey: key() });
    for (const invalid of [
      { ...base, variantId: "missing" },
      { productId: "bangalow-modular-sofa", variantId: "bangalow-modular-sofa-unavailable-test", quantity: 1 },
      { ...base, quantity: 5 },
      { ...base, quantity: 0 },
    ]) {
      await expect(app.cart.addItems(empty.id, [green, invalid], { idempotencyKey: key() })).rejects.toMatchObject({ kind: "validation" });
      expect(await app.cart.getCart(empty.id)).toEqual(before);
    }
    for (const invalidItems of [[], [base, green, base]]) {
      await expect(app.cart.addItems(empty.id, invalidItems, { idempotencyKey: key() })).rejects.toMatchObject({ kind: "validation" });
      expect(await app.cart.getCart(empty.id)).toEqual(before);
    }
    const merged = await app.cart.addItems(empty.id, [green, green], { idempotencyKey: key() });
    expect(merged.lines).toHaveLength(2);
    expect(merged.lines[1].quantity).toBe(2);
    expect(merged.revision).toBe(before.revision + 1);
  });
  it("rounds coupon cents, preserves a valid code on rejection, and removes it with an empty code", async () => {
    const { app, cart } = await populated();
    const couponKey = { idempotencyKey: key() };
    const discounted = await app.cart.applyCoupon(cart.id, "DEMO10", couponKey);
    expect(discounted).toMatchObject({ subtotal: { amount: 12.34 }, discount: { amount: 1.23 }, total: { amount: 11.11 }, couponCode: "DEMO10" });
    expect(await app.cart.applyCoupon(cart.id, "demo10", couponKey)).toEqual(discounted);
    for (const invalid of ["INVALID", "EXPIRED10", "DEMO10,DEMO10"]) {
      await expect(app.cart.applyCoupon(cart.id, invalid, { idempotencyKey: key() })).rejects.toMatchObject({ kind: "validation" });
      expect(await app.cart.getCart(cart.id)).toEqual(discounted);
    }
    await expect(app.cart.applyCoupon(cart.id, "", couponKey)).rejects.toMatchObject({ kind: "conflict" });
    const removed = await app.cart.applyCoupon(cart.id, "  ", { idempotencyKey: key() });
    expect(removed.couponCode).toBeUndefined();
    expect(removed.discount).toBeUndefined();
    expect(removed.total).toEqual(removed.subtotal);
    const empty = await app.cart.createCart({ idempotencyKey: key() });
    await expect(app.cart.applyCoupon(empty.id, "DEMO10", { idempotencyKey: key() })).rejects.toMatchObject({ kind: "validation" });
  });
  it("preserves the coupon on verified cancellation and reprices the unlocked bag", async () => {
    const { app, cart } = await populated();
    const discounted = await app.cart.applyCoupon(cart.id, "DEMO10", { idempotencyKey: key() });
    const checkout = await app.checkout.start(cart.id, input(discounted.revision, 11.11), { idempotencyKey: key() });
    const changed = structuredClone(product); changed.variants[0].price.amount = 15;
    vi.mocked(catalog.getProduct).mockResolvedValue(changed);
    expect((await app.cart.getCart(cart.id)).total).toEqual({ amount: 11.11, currency: "AUD" });
    await app.checkout.cancel(cart.id, checkout.id);
    expect(await app.cart.getCart(cart.id)).toMatchObject({ couponCode: "DEMO10", subtotal: { amount: 15 }, discount: { amount: 1.5 }, total: { amount: 13.5 } });
    expect((await app.checkout.get(cart.id, checkout.id)).total).toEqual({ amount: 11.11, currency: "AUD" });
  });
  it("rounds a half-cent demo discount upward before subtracting it from the subtotal", async () => {
    const halfCent = structuredClone(product);
    halfCent.variants[0].price.amount = 12.35;
    vi.mocked(catalog.getProduct).mockResolvedValue(halfCent);
    const { app, cart } = await populated();
    const discounted = await app.cart.applyCoupon(cart.id, "DEMO10", { idempotencyKey: key() });
    expect(discounted.subtotal).toEqual({ amount: 12.35, currency: "AUD" });
    expect(discounted.discount).toEqual({ amount: 1.24, currency: "AUD" });
    expect(discounted.total).toEqual({ amount: 11.11, currency: "AUD" });
    expect(discounted.lines[0].lineTotal).toEqual(discounted.subtotal);
  });
  it.each([markets.sg, markets.us])("rejects coupons in $id without changing the bag", async market => {
    const app = createPostgresCommerce({ pool, catalog: createMockCatalogAdapter({ market }), payment, market, origin: "https://shop.example" });
    const empty = await app.cart.createCart({ idempotencyKey: key() });
    const before = await app.cart.addItem(empty.id, { productId: "tamarama-modular-sofa", variantId: "tamarama-modular-sofa-default", quantity: 1 }, { idempotencyKey: key() });
    await expect(app.cart.applyCoupon(empty.id, "DEMO10", { idempotencyKey: key() })).rejects.toMatchObject({ kind: "validation" });
    expect(await app.cart.getCart(empty.id)).toEqual(before);
  });
  it.each(["paid", "expired"] as const)("recovers an aged unknown create from a verified %s event without another session", async (terminal) => {
    const { app, cart } = await populated(); const create = payment.createSession;
    vi.mocked(payment.createSession).mockImplementationOnce(async (request, id) => { await create(request, id); throw new Error("response lost"); });
    await expect(app.checkout.start(cart.id, input(cart.revision), { idempotencyKey: key() })).rejects.toThrow();
    const session = [...sessions.values()][0]; session.status = terminal === "paid" ? "complete" : "expired"; session.paid = terminal === "paid";
    time += 25 * 60 * 60 * 1000;
    vi.mocked(payment.createSession).mockClear();
    const event = { id: "evt_delayed", sessionId: session.id, checkoutId: session.checkoutId, market: "au" };
    await app.handlePaymentEvent(event); await app.handlePaymentEvent(event);
    expect(payment.createSession).not.toHaveBeenCalled();
    expect(await app.orders.list(cart.id)).toHaveLength(terminal === "paid" ? 1 : 0);
    expect((await app.checkout.get(cart.id, session.checkoutId)).status).toBe(terminal);
    expect((await app.cart.getCart(cart.id)).lockedCheckoutId).toBeUndefined();
  });
  it("rejects a verified event pointing at a session belonging to a different checkout", async () => {
    const { app, cart } = await populated();
    const first = await app.checkout.start(cart.id, input(cart.revision), { idempotencyKey: key() });
    const second = await populated();
    const other = await second.app.checkout.start(second.cart.id, input(second.cart.revision), { idempotencyKey: key() });
    const foreignSession = [...sessions.values()].find((session) => session.checkoutId === other.id)!;
    foreignSession.status = "complete"; foreignSession.paid = true;
    await expect(app.handlePaymentEvent({ id: "evt_wrong_association", sessionId: foreignSession.id, checkoutId: first.id, market: "au" })).rejects.toMatchObject({ kind: "conflict" });
    expect(await app.orders.list(cart.id)).toEqual([]);
    expect((await app.cart.getCart(cart.id)).lockedCheckoutId).toBe(first.id);
  });
  it("re-prices all old lines and rejects stale confirmed totals", async () => {
    const { app, cart } = await populated();
    const changed = structuredClone(product); changed.variants[0].price.amount = 15;
    vi.mocked(catalog.getProduct).mockResolvedValue(changed);
    expect((await app.cart.getCart(cart.id)).subtotal.amount).toBe(15);
    await expect(app.checkout.start(cart.id, input(cart.revision), { idempotencyKey: key() })).rejects.toMatchObject({ kind: "conflict" });
    expect(payment.createSession).not.toHaveBeenCalled();
  });
  it("different request keys for one revision share a checkout and lock mutations", async () => {
    const { app, cart } = await populated();
    const [first, second] = await Promise.all([app.checkout.start(cart.id, input(cart.revision), { idempotencyKey: key() }), app.checkout.start(cart.id, input(cart.revision), { idempotencyKey: key() })]);
    expect(first.id).toBe(second.id);
    expect(sessions.size).toBe(1);
    await expect(app.cart.removeItem(cart.id, cart.lines[0].id, { idempotencyKey: key() })).rejects.toMatchObject({ kind: "conflict" });
    expect((await service().cart.getCart(cart.id)).lockedCheckoutId).toBe(first.id);
  });
  it("one request key rejects different contact data", async () => {
    const { app, cart } = await populated(); const options = { idempotencyKey: key() };
    await app.checkout.start(cart.id, input(cart.revision), options);
    const changed = input(cart.revision); changed.contact.email = "other@example.com";
    await expect(app.checkout.start(cart.id, changed, options)).rejects.toMatchObject({ kind: "conflict" });
  });
  it("recovers unknown create with the identical request and refuses recreation after 24h", async () => {
    const { app, cart } = await populated(); const create = payment.createSession;
    vi.mocked(payment.createSession).mockImplementationOnce(async (request, id) => { await create(request, id); throw new Error("timeout"); });
    await expect(app.checkout.start(cart.id, input(cart.revision), { idempotencyKey: key() })).rejects.toThrow();
    const locked = await app.cart.getCart(cart.id); expect(locked.lockedCheckoutId).toBeTruthy();
    time += 25 * 60 * 60 * 1000;
    await expect(app.checkout.reconcile(cart.id, locked.lockedCheckoutId!)).rejects.toMatchObject({ kind: "conflict" });
    expect(sessions.size).toBe(1);
    expect((await app.cart.getCart(cart.id)).lockedCheckoutId).toBe(locked.lockedCheckoutId);
  });
  it("retries an uncertain provider create using the identical durable payload", async () => {
    const { app, cart } = await populated();
    const discounted = await app.cart.applyCoupon(cart.id, "DEMO10", { idempotencyKey: key() });
    const create = payment.createSession;
    vi.mocked(payment.createSession).mockImplementationOnce(async (request, id) => { await create(request, id); throw new Error("response lost"); });
    await expect(app.checkout.start(cart.id, input(discounted.revision, 11.11), { idempotencyKey: key() })).rejects.toThrow("response lost");
    const locked = await app.cart.getCart(cart.id);
    const changed = structuredClone(product); changed.variants[0].price.amount = 15;
    vi.mocked(catalog.getProduct).mockResolvedValue(changed);
    time += 60_000;
    const recovered = await service().checkout.reconcile(cart.id, locked.lockedCheckoutId!);
    expect(recovered.status).toBe("open");
    expect(sessions.size).toBe(1);
    const calls = vi.mocked(payment.createSession).mock.calls;
    expect(calls.at(-1)).toEqual(calls[0]);
    expect(calls[0][0].total).toEqual({ amount: 11.11, currency: "AUD" });
    expect(recovered).toMatchObject({ couponCode: "DEMO10", subtotal: { amount: 12.34 }, discount: { amount: 1.23 }, total: { amount: 11.11 } });
  });
  it("accepts a real Bangalow sofa and ottoman together as one bundle revision", async () => {
    catalog = createMockCatalogAdapter({ market: markets.au });
    const app = service();
    const empty = await app.cart.createCart({ idempotencyKey: key() });
    const sofa = await catalog.getProduct("bangalow-modular-sofa");
    const ottoman = await catalog.getProduct("bangalow-modular-sofa-ottoman");
    const result = await app.cart.addItems(empty.id, [
      { productId: sofa.id, variantId: sofa.variants[0].id, quantity: 1 },
      { productId: ottoman.id, variantId: ottoman.variants[0].id, quantity: 1 },
    ], { idempotencyKey: key() });
    expect(result.revision).toBe(1);
    expect(result.lines.map(line => [line.productId, line.variantId, line.unitPrice])).toEqual([
      [sofa.id, sofa.variants[0].id, sofa.variants[0].price], [ottoman.id, ottoman.variants[0].id, ottoman.variants[0].price],
    ]);
    expect(result.total).toEqual({ amount: sofa.variants[0].price.amount + ottoman.variants[0].price.amount, currency: "AUD" });
  });
  it("settles an older checkout snapshot without inventing discount fields", async () => {
    const { app, cart } = await populated();
    const checkout = await app.checkout.start(cart.id, input(cart.revision), { idempotencyKey: key() });
    delete checkout.subtotal; delete checkout.discount; delete checkout.couponCode;
    await db.query("UPDATE commerce_checkouts SET data = $1 WHERE id = $2", [JSON.stringify(checkout), checkout.id]);
    const session = [...sessions.values()][0]; session.status = "complete"; session.paid = true;
    const paid = await app.checkout.reconcile(cart.id, checkout.id);
    const order = await app.orders.get(cart.id, paid.orderId!);
    expect(order.total).toEqual({ amount: 12.34, currency: "AUD" });
    expect(order.subtotal).toBeUndefined();
    expect(order.discount).toBeUndefined();
    expect(order.couponCode).toBeUndefined();
  });
  it("rolls back a failed order write and recovers a paid session without another payment", async () => {
    const { app, cart } = await populated();
    const checkout = await app.checkout.start(cart.id, input(cart.revision), { idempotencyKey: key() });
    const session = [...sessions.values()][0]; session.paid = true; session.status = "complete";
    const originalConnect = pool.connect.bind(pool);
    pool.connect = async () => {
      const client = await originalConnect();
      return { ...client, query: async (sql, values) => { if (sql.startsWith("INSERT INTO commerce_orders")) throw new Error("database unavailable"); return client.query(sql, values); } };
    };
    await expect(app.checkout.reconcile(cart.id, checkout.id)).rejects.toThrow("database unavailable");
    expect((await app.cart.getCart(cart.id)).lockedCheckoutId).toBe(checkout.id);
    expect(await app.orders.list(cart.id)).toEqual([]);
    pool.connect = originalConnect;
    expect((await service().checkout.reconcile(cart.id, checkout.id)).status).toBe("paid");
    expect(await app.orders.list(cart.id)).toHaveLength(1);
    expect(sessions.size).toBe(1);
  });
  it("survives closing and reopening the actual file-backed database", async () => {
    const directory = await mkdtemp(join(tmpdir(), "e-pig-commerce-"));
    await db.close();
    db = new PGlite(directory);
    try {
      await db.exec(await readFile("scripts/database/001-commerce.sql", "utf8"));
      const { app, cart } = await populated();
      const checkout = await app.checkout.start(cart.id, input(cart.revision), { idempotencyKey: key() });
      const session = [...sessions.values()][0]; session.paid = true; session.status = "complete";
      const paid = await app.checkout.reconcile(cart.id, checkout.id);
      await db.close(); db = new PGlite(directory);
      expect((await service().orders.get(cart.id, paid.orderId!)).total.amount).toBe(12.34);
      expect((await service().cart.getCart(cart.id)).lines).toEqual([]);
      // Re-running the migration is safe and preserves existing orders.
      await db.exec(await readFile("scripts/database/001-commerce.sql", "utf8"));
      expect(await service().orders.list(cart.id)).toHaveLength(1);
    } finally {
      await db.close(); db = new PGlite();
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("enforces stock, form, revision and market boundaries without creating sessions", async () => {
    const { app, cart } = await populated();
    await expect(app.cart.addItem(cart.id, { productId: "sofa", variantId: "invented", quantity: 1 }, { idempotencyKey: key() })).rejects.toMatchObject({ kind: "validation" });
    const unavailable = structuredClone(product); unavailable.variants[0].availability = "out-of-stock";
    vi.mocked(catalog.getProduct).mockResolvedValueOnce(unavailable);
    await expect(app.cart.updateItem(cart.id, cart.lines[0].id, 2, { idempotencyKey: key() })).rejects.toMatchObject({ kind: "validation" });
    const invalid = input(cart.revision); invalid.address.postalCode = "200";
    await expect(app.checkout.start(cart.id, invalid, { idempotencyKey: key() })).rejects.toMatchObject({ kind: "validation" });
    await expect(app.checkout.start(cart.id, input(0), { idempotencyKey: key() })).rejects.toMatchObject({ kind: "conflict" });
    const foreign = createPostgresCommerce({ pool, catalog, payment, market: markets.sg, origin: "https://shop.example" });
    await expect(foreign.checkout.start(cart.id, input(cart.revision), { idempotencyKey: key() })).rejects.toMatchObject({ kind: "validation" });
    expect(payment.createSession).not.toHaveBeenCalled();
  });
  it("trusted return reconciliation creates exactly one order and clears the same cart once", async () => {
    const { app, cart } = await populated();
    const checkout = await app.checkout.start(cart.id, input(cart.revision), { idempotencyKey: key() });
    expect((await app.checkout.get(cart.id, checkout.id)).status).toBe("open");
    expect(await app.orders.list(cart.id)).toEqual([]);
    const session = [...sessions.values()][0]; session.paid = true; session.status = "complete";
    await app.checkout.reconcile(cart.id, checkout.id);
    const event = { id: "evt_1", sessionId: session.id, checkoutId: checkout.id, market: "au" };
    await Promise.all([app.handlePaymentEvent(event), app.handlePaymentEvent(event)]);
    const orders = await service().orders.list(cart.id); expect(orders).toHaveLength(1);
    expect(orders[0].total.amount).toBe(12.34);
    const other = await app.cart.createCart({ idempotencyKey: key() });
    expect(await app.orders.list(other.id)).toEqual([]);
    await expect(app.orders.get(other.id, orders[0].id)).rejects.toMatchObject({ kind: "not_found" });
    const cleared = await app.cart.getCart(cart.id); expect(cleared.lines).toEqual([]); expect(cleared.revision).toBe(cart.revision + 1);
    session.status = "expired"; session.paid = false;
    expect((await app.checkout.reconcile(cart.id, checkout.id)).status).toBe("paid");
  });
  it("rejects owner/market mismatches and mismatched provider amount", async () => {
    const { app, cart } = await populated(); const other = await app.cart.createCart({ idempotencyKey: key() });
    const checkout = await app.checkout.start(cart.id, input(cart.revision), { idempotencyKey: key() });
    await expect(app.checkout.get(other.id, checkout.id)).rejects.toMatchObject({ kind: "not_found" });
    const foreign = createPostgresCommerce({ pool, catalog, payment, market: markets.sg, origin: "https://shop.example" });
    await expect(foreign.cart.getCart(cart.id)).rejects.toMatchObject({ kind: "not_found" });
    const session = [...sessions.values()][0]; session.paid = true; session.status = "complete"; session.total = { amount: 1, currency: "AUD" };
    await expect(app.checkout.reconcile(cart.id, checkout.id)).rejects.toMatchObject({ kind: "conflict" });
    expect(await app.orders.list(cart.id)).toEqual([]);
  });
  it("cancel GET does not unlock; uncertain expiration stays locked; verified expiry unlocks", async () => {
    const { app, cart } = await populated(); const checkout = await app.checkout.start(cart.id, input(cart.revision), { idempotencyKey: key() });
    await app.checkout.get(cart.id, checkout.id);
    expect((await app.cart.getCart(cart.id)).lockedCheckoutId).toBe(checkout.id);
    vi.mocked(payment.expireSession).mockRejectedValueOnce(new Error("network"));
    await expect(app.checkout.cancel(cart.id, checkout.id)).rejects.toThrow();
    expect((await app.cart.getCart(cart.id)).lockedCheckoutId).toBe(checkout.id);
    expect((await app.checkout.cancel(cart.id, checkout.id)).status).toBe("expired");
    const unlocked = await app.cart.getCart(cart.id); expect(unlocked.lockedCheckoutId).toBeUndefined(); expect(unlocked.revision).toBe(cart.revision + 1);
    expect((await app.checkout.start(cart.id, input(unlocked.revision), { idempotencyKey: key() })).id).not.toBe(checkout.id);
  });
});
