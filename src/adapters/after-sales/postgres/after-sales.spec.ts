import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  toConsumerTicket,
  toServiceOrder,
} from "@/adapters/after-sales/wire";
import {
  decodeFeedCursor,
  encodeFeedCursor,
  type ConsumerPrincipal,
  type CreateServiceTicketInput,
  type ServicePrincipal,
} from "@/core/contracts/after-sales";
import { getMarket, type MarketId } from "@/platform/config/markets";

import type { CommercePool } from "@/adapters/commerce/postgres/pool";

import {
  createPostgresAfterSalesAdapter,
  type PostgresAfterSalesAdapterOptions,
} from "./after-sales";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

const key = () => `key_${crypto.randomUUID()}`;
const round = (value: number) => Math.round(value * 100) / 100;
const money = (amount: number, currency: string) => ({ amount, currency });
let checkoutRevision = 0;

function leasePool(db: PGlite): CommercePool {
  // PGlite has one physical connection: lease it for the complete transaction.
  let tail = Promise.resolve();
  return {
    query: async (sql, values) => db.query(sql, values),
    connect: async () => {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      return { query: async (sql, values) => db.query(sql, values), release };
    },
  };
}

function failingPool(base: CommercePool, shouldFail: () => boolean): CommercePool {
  return {
    query: (sql, values) => base.query(sql, values),
    connect: async () => {
      const connection = await base.connect();
      return {
        query: async (sql, values) => {
          if (shouldFail() && sql.trimStart().startsWith("UPDATE after_sales_requests SET data")) {
            throw new Error("injected after-sales transaction failure");
          }
          return connection.query(sql, values);
        },
        release: connection.release,
      };
    },
  };
}

async function migrate(db: PGlite): Promise<void> {
  for (const file of [
    "scripts/database/001-commerce.sql",
    "scripts/database/002-after-sales-requests.sql",
    "scripts/database/003-after-sales-tickets.sql",
  ]) {
    await db.exec(await readFile(file, "utf8"));
  }
}

const consumer = (cartId = "cart_au", market: MarketId = "au"): ConsumerPrincipal => ({
  kind: "consumer",
  market,
  cartId,
});

const service = (
  overrides: Partial<ServicePrincipal> = {},
): ServicePrincipal => ({
  kind: "service",
  market: "au",
  actorId: "dtc-service",
  allowedMarkets: ["au", "sg", "us"],
  ...overrides,
});

type LineOptions = {
  id?: string;
  productId?: string;
  variantId?: string;
  sku?: string | null;
  name?: string;
  quantity?: number;
  unitAmount?: number;
  lineAmount?: number;
  currency?: string;
};

function line({
  id = `line_${crypto.randomUUID()}`,
  productId = "prod_sofa",
  variantId = "var_sofa",
  sku = "SOFA-SKU-1",
  name = "Synthetic Sofa",
  quantity = 1,
  unitAmount = 100,
  lineAmount,
  currency = "AUD",
}: LineOptions = {}) {
  return {
    id,
    productId,
    variantId,
    ...(sku === null ? {} : { sku }),
    name,
    quantity,
    unitPrice: money(unitAmount, currency),
    lineTotal: money(lineAmount ?? round(unitAmount * quantity), currency),
  };
}

type OrderOptions = {
  id?: string;
  market?: MarketId;
  cartId?: string;
  lines?: ReturnType<typeof line>[];
  subtotal?: number | null;
  discount?: number;
  total?: number;
  status?: string;
  currency?: string;
  createdAt?: string;
  contactName?: string;
  country?: "AU" | "SG" | "US";
};

async function insertOrder(db: PGlite, options: OrderOptions = {}) {
  const marketId = options.market ?? "au";
  const currency = options.currency ?? getMarket(marketId).currency;
  const id = options.id ?? `ord_${crypto.randomUUID()}`;
  const cartId = options.cartId ?? `cart_${marketId}`;
  const checkoutId = `chk_${crypto.randomUUID()}`;
  const lines = options.lines ?? [line({ currency })];
  const lineSubtotal = round(
    lines.reduce((sum, item) => sum + item.lineTotal.amount, 0),
  );
  const subtotal = options.subtotal === null ? undefined : options.subtotal ?? lineSubtotal;
  const discount = options.discount ?? 0;
  const total = options.total ?? round((subtotal ?? lineSubtotal) - discount);
  const createdAt = options.createdAt ?? "2026-11-01T00:00:00.000Z";

  await db.query(
    `INSERT INTO commerce_carts (id, market, creation_key, data)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [cartId, marketId, `creation_${crypto.randomUUID()}`, JSON.stringify({
      id: cartId,
      market: marketId,
      revision: 0,
      lines: [],
      subtotal: money(0, currency),
      total: money(0, currency),
    })],
  );
  await db.query(
    `INSERT INTO commerce_checkouts
       (id, cart_id, market, revision, input_signature, data, payment_request, first_attempt_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)`,
    [checkoutId, cartId, marketId, checkoutRevision++, `sig_${crypto.randomUUID()}`, JSON.stringify({
      id: checkoutId,
      cartId,
      market: marketId,
      revision: 0,
      status: "paid",
      lines,
      total: money(total, currency),
      createdAt,
    }), JSON.stringify({ checkoutId, cartId, market: marketId }), createdAt],
  );

  const data: Record<string, unknown> = {
    id,
    checkoutId,
    cartId,
    market: marketId,
    status: options.status ?? "paid",
    lines,
    ...(subtotal === undefined ? {} : { subtotal: money(subtotal, currency) }),
    ...(discount === 0 ? {} : { discount: money(discount, currency) }),
    total: money(total, currency),
    contact: {
      name: options.contactName ?? "Synthetic Buyer",
      email: "buyer@example.com",
      phone: "0400000000",
    },
    address: {
      line1: "1 Synthetic Street",
      line2: "Unit 2",
      city: "Sydney",
      state: "NSW",
      postalCode: "2000",
      country: options.country ?? (marketId === "au" ? "AU" : marketId === "sg" ? "SG" : "US"),
    },
    createdAt,
  };
  await db.query(
    `INSERT INTO commerce_orders (id, checkout_id, cart_id, market, data)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [id, checkoutId, cartId, marketId, JSON.stringify(data)],
  );
  return { id, cartId, marketId, currency, lines, data, subtotal, discount, total };
}

function ticketInput(
  requestId: string,
  orderVersion: string,
  overrides: Partial<CreateServiceTicketInput> = {},
): CreateServiceTicketInput {
  return {
    requestId,
    action: "refund",
    reply: "We are sorry about the damage and have approved a refund.",
    draftVersion: "draft-1",
    approvalId: `apr_${crypto.randomUUID()}`,
    policyVersion: "policy-1",
    orderVersion,
    ...overrides,
  };
}

describe("durable after-sales adapter (actual PostgreSQL SQL)", () => {
  let db: PGlite;
  let pool: CommercePool;
  let time: number;
  let adapter: ReturnType<typeof createPostgresAfterSalesAdapter>;

  const makeAdapter = (
    marketId: MarketId = "au",
    overrides: Partial<PostgresAfterSalesAdapterOptions> = {},
  ) => createPostgresAfterSalesAdapter({
    pool,
    market: getMarket(marketId),
    now: () => new Date(time),
    ...overrides,
  });

  beforeEach(async () => {
    time = Date.parse("2026-11-05T00:00:00Z");
    db = new PGlite();
    await migrate(db);
    pool = leasePool(db);
    adapter = makeAdapter();
  });

  afterEach(async () => {
    await db.close();
  });

  it("applies the migrations idempotently, publishes requests, and serves a stable feed", async () => {
    await migrate(db);
    const order = await insertOrder(db);

    const created = await adapter.createRequest(
      consumer(order.cartId),
      { orderId: order.id, type: "damaged", description: "Damaged corner." },
      { idempotencyKey: key() },
    );
    expect(created.replayed).toBe(false);
    expect(created.request).toMatchObject({
      sequence: "1",
      orderId: order.id,
      market: "au",
      status: "pending",
      ticketId: null,
    });

    await expect(adapter.getRequest(consumer(order.cartId), created.request.id))
      .resolves.toEqual(created.request);

    const firstPage = await adapter.listServiceRequests(service(), { limit: 1 });
    expect(firstPage.items).toEqual([created.request]);
    expect(firstPage.highWatermark).toBe("1");
    expect(firstPage.hasMore).toBe(false);
    expect(decodeFeedCursor(firstPage.nextCursor, {
      market: "au",
      highWatermark: firstPage.highWatermark,
    })).toBe(BigInt(1));

    const second = await adapter.createRequest(
      consumer(order.cartId),
      { orderId: order.id, type: "return", description: "Changed my mind." },
      { idempotencyKey: key() },
    );
    expect(second.request.sequence).toBe("2");

    const page = await adapter.listServiceRequests(service(), { limit: 1 });
    expect(page.items.map((item) => item.sequence)).toEqual(["1"]);
    expect(page.hasMore).toBe(true);
    const next = await adapter.listServiceRequests(service(), {
      cursor: page.nextCursor,
      limit: 1,
    });
    expect(next.items.map((item) => item.sequence)).toEqual(["2"]);
    expect(next.hasMore).toBe(false);
    const empty = await adapter.listServiceRequests(service(), {
      cursor: next.nextCursor,
      limit: 1,
    });
    expect(empty.items).toEqual([]);
    expect(empty.hasMore).toBe(false);
    expect(empty.highWatermark).toBe("2");
  });

  it("serializes idempotency by market and stable consumer subject", async () => {
    const order = await insertOrder(db);
    const sharedKey = key();
    const first = await adapter.createRequest(
      consumer(order.cartId),
      { orderId: order.id, type: "damaged", description: "First description." },
      { idempotencyKey: sharedKey },
    );
    const replay = await adapter.createRequest(
      consumer(order.cartId),
      { orderId: order.id, type: "damaged", description: "First description." },
      { idempotencyKey: sharedKey },
    );
    expect(replay.replayed).toBe(true);
    expect(replay.request.id).toBe(first.request.id);
    expect(replay.request.sequence).toBe("1");

    await expect(adapter.createRequest(
      consumer(order.cartId),
      { orderId: order.id, type: "damaged", description: "Different description." },
      { idempotencyKey: sharedKey },
    )).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      details: { operation: "createAfterSalesRequest" },
    });

    const otherOrder = await insertOrder(db, { cartId: "cart_other", id: "ord_other" });
    const otherCart = await adapter.createRequest(
      consumer("cart_other"),
      { orderId: otherOrder.id, type: "damaged", description: "First description." },
      { idempotencyKey: sharedKey },
    );
    expect(otherCart.request.sequence).toBe("2");

    const sgOrder = await insertOrder(db, { market: "sg", id: "ord_sg" });
    const sgAdapter = makeAdapter("sg");
    const sg = await sgAdapter.createRequest(
      consumer(sgOrder.cartId, "sg"),
      { orderId: sgOrder.id, type: "other", description: "First description." },
      { idempotencyKey: sharedKey },
    );
    expect(sg.request.sequence).toBe("1");
    expect(sg.request.market).toBe("sg");

    expect((await adapter.listServiceRequests(service())).items).toHaveLength(2);
    expect((await sgAdapter.listServiceRequests(service({
      market: "sg",
      allowedMarkets: ["sg"],
    }))).items).toHaveLength(1);
  });

  it("validates ownership and input before writing a request", async () => {
    const order = await insertOrder(db);
    const foreignOrder = await insertOrder(db, { cartId: "cart_foreign", id: "ord_foreign" });

    await expect(adapter.createRequest(
      consumer(order.cartId),
      { orderId: foreignOrder.id, type: "damaged", description: "Not mine." },
      { idempotencyKey: key() },
    )).rejects.toMatchObject({ code: "NOT_FOUND" });

    for (const description of ["", "   ", "x".repeat(5_001)]) {
      await expect(adapter.createRequest(
        consumer(order.cartId),
        { orderId: order.id, type: "damaged", description },
        { idempotencyKey: key() },
      )).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }

    const legal = "😀".repeat(5_000);
    const created = await adapter.createRequest(
      consumer(order.cartId),
      { orderId: order.id, type: "damaged", description: legal },
      { idempotencyKey: key() },
    );
    expect(Array.from(created.request.description)).toHaveLength(5_000);
    await expect(adapter.getRequest(consumer("cart_other"), created.request.id))
      .rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(adapter.createRequest(
      consumer(order.cartId),
      { orderId: order.id, type: "damaged", description: "Wrong key." },
      { idempotencyKey: "bad key!" },
    )).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      details: { field: "idempotency_key" },
    });
  });

  it("keeps attachment ownership, magic, size, filename and reuse rules", async () => {
    const order = await insertOrder(db);
    const foreign = await insertOrder(db, { cartId: "cart_foreign", id: "ord_foreign" });

    const png = await adapter.uploadAttachment(consumer(order.cartId), {
      orderId: order.id,
      fileName: "..\\damage\u0000.png",
      mediaType: "image/png",
      bytes: PNG,
    });
    expect(png).toMatchObject({
      fileName: "damage.png",
      mediaType: "image/png",
      sizeBytes: PNG.byteLength,
      status: "active",
    });
    const jpeg = await adapter.uploadAttachment(consumer(order.cartId), {
      orderId: order.id,
      fileName: "photo.jpg",
      mediaType: "image/jpeg",
      bytes: JPEG,
    });
    const webp = await adapter.uploadAttachment(consumer(order.cartId), {
      orderId: order.id,
      fileName: "photo.webp",
      mediaType: "image/webp",
      bytes: WEBP,
    });
    const fourth = await adapter.uploadAttachment(consumer(order.cartId), {
      orderId: order.id,
      fileName: `${"😀".repeat(300)}.png`,
      mediaType: "image/png",
      bytes: PNG,
    });
    expect(Array.from(fourth.fileName)).toHaveLength(255);

    const content = await adapter.getAttachmentContent(consumer(order.cartId), png.id);
    expect(content).toMatchObject({
      fileName: "damage.png",
      mediaType: "image/png",
      sizeBytes: PNG.byteLength,
    });
    expect(Array.from(content.bytes)).toEqual(Array.from(PNG));
    await expect(adapter.getAttachmentContent(service(), png.id))
      .resolves.toMatchObject({ fileName: "damage.png" });
    await expect(adapter.getAttachmentContent(service({ allowedMarkets: ["sg"] }), png.id))
      .rejects.toMatchObject({ code: "FORBIDDEN_MARKET" });
    await expect(adapter.getAttachmentContent(consumer("cart_other"), png.id))
      .rejects.toMatchObject({ code: "NOT_FOUND" });

    const sgAdapter = makeAdapter("sg");
    await expect(sgAdapter.getAttachmentContent(service({ market: "sg", allowedMarkets: ["sg"] }), png.id))
      .rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(adapter.uploadAttachment(consumer(order.cartId), {
      orderId: foreign.id,
      fileName: "x.png",
      mediaType: "image/png",
      bytes: PNG,
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(adapter.uploadAttachment(consumer(order.cartId), {
      orderId: order.id,
      fileName: "fake.png",
      mediaType: "image/png",
      bytes: JPEG,
    })).rejects.toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE" });
    await expect(adapter.uploadAttachment(consumer(order.cartId), {
      orderId: order.id,
      fileName: "empty.png",
      mediaType: "image/png",
      bytes: new Uint8Array(),
    })).rejects.toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE" });
    const oversized = new Uint8Array(5_242_881);
    oversized.set(PNG);
    await expect(adapter.uploadAttachment(consumer(order.cartId), {
      orderId: order.id,
      fileName: "large.png",
      mediaType: "image/png",
      bytes: oversized,
    })).rejects.toMatchObject({
      code: "ATTACHMENT_TOO_LARGE",
      details: { max_size_bytes: 5_242_880 },
    });

    const attachmentKey = key();
    const sorted = await adapter.createRequest(
      consumer(order.cartId),
      {
        orderId: order.id,
        type: "damaged",
        description: "Three sorted attachments.",
        attachmentIds: [webp.id, png.id, jpeg.id],
      },
      { idempotencyKey: attachmentKey },
    );
    expect(sorted.request.attachments.map((item) => item.id))
      .toEqual([png.id, jpeg.id, webp.id].sort());
    const reordered = await adapter.createRequest(
      consumer(order.cartId),
      {
        orderId: order.id,
        type: "damaged",
        description: "Three sorted attachments.",
        attachmentIds: [png.id, jpeg.id, webp.id],
      },
      { idempotencyKey: attachmentKey },
    );
    expect(reordered.replayed).toBe(true);
    expect(reordered.request.id).toBe(sorted.request.id);

    await expect(adapter.createRequest(
      consumer(order.cartId),
      {
        orderId: order.id,
        type: "damaged",
        description: "Too many attachments.",
        attachmentIds: [png.id, jpeg.id, webp.id, fourth.id],
      },
      { idempotencyKey: key() },
    )).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      details: { field: "attachment_ids" },
    });
    await expect(adapter.createRequest(
      consumer(order.cartId),
      {
        orderId: order.id,
        type: "damaged",
        description: "Duplicate attachments.",
        attachmentIds: [png.id, png.id],
      },
      { idempotencyKey: key() },
    )).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      details: { field: "attachment_ids" },
    });
    await expect(adapter.createRequest(
      consumer(order.cartId),
      {
        orderId: order.id,
        type: "damaged",
        description: "Missing attachment.",
        attachmentIds: ["att_missing"],
      },
      { idempotencyKey: key() },
    )).rejects.toMatchObject({ code: "NOT_FOUND" });
    const foreignAttachment = await adapter.uploadAttachment(consumer("cart_foreign"), {
      orderId: foreign.id,
      fileName: "foreign.png",
      mediaType: "image/png",
      bytes: PNG,
    });
    await expect(adapter.createRequest(
      consumer(order.cartId),
      {
        orderId: order.id,
        type: "damaged",
        description: "Foreign attachment.",
        attachmentIds: [foreignAttachment.id],
      },
      { idempotencyKey: key() },
    )).rejects.toMatchObject({ code: "NOT_FOUND" });

    const sibling = await insertOrder(db, { cartId: order.cartId, id: "ord_sibling" });
    const siblingAttachment = await adapter.uploadAttachment(consumer(order.cartId), {
      orderId: sibling.id,
      fileName: "sibling.png",
      mediaType: "image/png",
      bytes: PNG,
    });
    await expect(adapter.createRequest(
      consumer(order.cartId),
      {
        orderId: order.id,
        type: "damaged",
        description: "Attachment from another order.",
        attachmentIds: [siblingAttachment.id],
      },
      { idempotencyKey: key() },
    )).rejects.toMatchObject({ code: "NOT_FOUND" });

    await db.query(
      `UPDATE after_sales_attachments
       SET created_at = $1, expires_at = $2
       WHERE id = $3`,
      [
        new Date(time - 2_000).toISOString(),
        new Date(time - 1_000).toISOString(),
        fourth.id,
      ],
    );
    await expect(adapter.createRequest(
      consumer(order.cartId),
      {
        orderId: order.id,
        type: "damaged",
        description: "Expired attachment.",
        attachmentIds: [fourth.id],
      },
      { idempotencyKey: key() },
    )).rejects.toMatchObject({
      code: "ATTACHMENT_EXPIRED",
      details: { attachment_id: fourth.id },
    });
  });

  it("marks expired attachments on reads without consuming a publication sequence", async () => {
    const order = await insertOrder(db);
    const attachment = await adapter.uploadAttachment(consumer(order.cartId), {
      orderId: order.id,
      fileName: "photo.png",
      mediaType: "image/png",
      bytes: PNG,
    });
    const created = await adapter.createRequest(
      consumer(order.cartId),
      {
        orderId: order.id,
        type: "damaged",
        description: "Expiry test.",
        attachmentIds: [attachment.id],
      },
      { idempotencyKey: key() },
    );
    expect(created.request.attachments[0].status).toBe("active");

    time += 8 * 24 * 60 * 60 * 1000;
    const current = await adapter.getRequest(consumer(order.cartId), created.request.id);
    expect(current.attachments[0].status).toBe("expired");
    expect(current.sequence).toBe("1");

    const feed = await adapter.listServiceRequests(service());
    expect(feed.items[0].attachments[0].status).toBe("expired");
    expect(feed.items[0].sequence).toBe("1");
    expect(feed.highWatermark).toBe("1");

    await expect(adapter.getAttachmentContent(consumer(order.cartId), attachment.id))
      .rejects.toMatchObject({ code: "ATTACHMENT_EXPIRED" });

    const orderVersion = (await adapter.getServiceOrder(service(), order.id)).orderVersion;
    await expect(adapter.createTicket(
      service(),
      ticketInput(created.request.id, orderVersion),
      { idempotencyKey: key() },
    )).rejects.toMatchObject({ code: "ATTACHMENT_EXPIRED" });
  });

  it("maps the stored order snapshot to minor units, a stable version and a masked recipient", async () => {
    const order = await insertOrder(db, {
      lines: [
        line({ id: "line_1", sku: "SKU-A", quantity: 2, unitAmount: 100.5 }),
        line({ id: "line_2", sku: "SKU-B", quantity: 1, unitAmount: 50.25 }),
      ],
      discount: 1.25,
      contactName: "Synthetic Buyer",
    });
    const mapped = await adapter.getServiceOrder(service(), order.id);
    expect(mapped).toMatchObject({
      id: order.id,
      ownerCartId: order.cartId,
      market: "au",
      currency: "AUD",
      subtotalMinor: 25_125,
      shippingMinor: 0,
      taxMinor: 0,
      discountMinor: 125,
      totalMinor: 25_000,
      status: "paid",
      orderVersion: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(mapped.items).toEqual([
      expect.objectContaining({ id: "line_1", sku: "SKU-A", quantity: 2, unitPriceMinor: 10_050, lineTotalMinor: 20_100 }),
      expect.objectContaining({ id: "line_2", sku: "SKU-B", quantity: 1, unitPriceMinor: 5_025, lineTotalMinor: 5_025 }),
    ]);
    expect(mapped.recipient).toEqual({
      name: "Synthetic Buyer",
      countryCode: "AU",
      region: "NSW",
      postalCode: "2000",
    });

    const wire = toServiceOrder(mapped);
    expect(wire.items.map((item) => item.sku)).toEqual(["SKU-A", "SKU-B"]);
    expect(wire.recipient_summary).toEqual({
      masked_name: "S*** B***",
      country_code: "AU",
      region: "NSW",
      postal_code_masked: "2***",
    });
    const serialized = JSON.stringify(wire);
    expect(serialized).not.toContain("buyer@example.com");
    expect(serialized).not.toContain("0400000000");
    expect(serialized).not.toContain("1 Synthetic Street");

    const again = await adapter.getServiceOrder(service(), order.id);
    expect(again.orderVersion).toBe(mapped.orderVersion);
    await db.query(
      `UPDATE commerce_orders SET data = jsonb_set(data, '{contact,name}', '"Changed Buyer"') WHERE id = $1`,
      [order.id],
    );
    const changed = await adapter.getServiceOrder(service(), order.id);
    expect(changed.orderVersion).not.toBe(mapped.orderVersion);
    expect(toServiceOrder(changed).recipient_summary.masked_name).toBe("C*** B***");
  });

  it("falls back to line subtotals when legacy orders omit subtotal", async () => {
    const order = await insertOrder(db, { subtotal: null });
    const mapped = await adapter.getServiceOrder(service(), order.id);
    expect(mapped.subtotalMinor).toBe(10_000);
    expect(mapped.totalMinor).toBe(10_000);
  });

  it("fails closed on missing SKU, invalid money, inconsistent totals and non-paid snapshots", async () => {
    const missingSku = await insertOrder(db, {
      lines: [line({ sku: null })],
    });
    await expect(adapter.getServiceOrder(service(), missingSku.id))
      .rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });

    const badCurrency = await insertOrder(db, { currency: "USD" });
    await expect(adapter.getServiceOrder(service(), badCurrency.id))
      .rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });

    const badTotal = await insertOrder(db, { total: 99 });
    await expect(adapter.getServiceOrder(service(), badTotal.id))
      .rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });

    const badLine = await insertOrder(db, {
      lines: [line({ quantity: 2, unitAmount: 100, lineAmount: 100 })],
    });
    await expect(adapter.getServiceOrder(service(), badLine.id))
      .rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });

    const badAmount = await insertOrder(db, {
      lines: [line({ unitAmount: 100.001 })],
    });
    await expect(adapter.getServiceOrder(service(), badAmount.id))
      .rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });

    const notPaid = await insertOrder(db, { status: "fulfilled" });
    await expect(adapter.getServiceOrder(service(), notPaid.id))
      .rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });

    await expect(adapter.getServiceOrder(service(), "ord_missing"))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("never fabricates shipment data and authorizes service/consumer boundaries", async () => {
    const order = await insertOrder(db);
    await expect(adapter.getServiceOrderShipment(service(), order.id))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(adapter.getServiceOrderShipment(service(), "ord_missing"))
      .rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(adapter.getServiceOrder(
      consumer(order.cartId) as unknown as ServicePrincipal,
      order.id,
    )).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(adapter.getServiceOrder(
      service({ market: "sg", allowedMarkets: ["sg"] }),
      order.id,
    )).rejects.toMatchObject({ code: "FORBIDDEN_MARKET" });
    await expect(adapter.getServiceOrder(
      service({ allowedMarkets: ["sg"] }),
      order.id,
    )).rejects.toMatchObject({ code: "FORBIDDEN_MARKET" });
    await expect(makeAdapter("sg").getServiceOrder(
      service({ market: "sg", allowedMarkets: ["sg"] }),
      order.id,
    )).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(adapter.getRequest(
      service() as unknown as ConsumerPrincipal,
      "asr_missing",
    )).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(adapter.getRequest(consumer("cart_foreign"), "asr_missing"))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("creates one immutable ticket, replays current state, and isolates keys/fingerprints", async () => {
    const order = await insertOrder(db);
    const created = await adapter.createRequest(
      consumer(order.cartId),
      { orderId: order.id, type: "damaged", description: "Ticket test." },
      { idempotencyKey: key() },
    );
    const orderVersion = (await adapter.getServiceOrder(service(), order.id)).orderVersion;
    const stale = ticketInput(created.request.id, "ov_stale");
    await expect(adapter.createTicket(service(), stale, { idempotencyKey: key() }))
      .rejects.toMatchObject({
        code: "ORDER_VERSION_CONFLICT",
        details: { field: "order_version" },
      });

    const input = ticketInput(created.request.id, orderVersion);
    const ticketKey = key();
    const ticket = await adapter.createTicket(service(), input, { idempotencyKey: ticketKey });
    expect(ticket.replayed).toBe(false);
    expect(ticket.ticket).toMatchObject({
      requestId: created.request.id,
      orderId: order.id,
      market: "au",
      status: "open",
      reply: input.reply,
      draftVersion: input.draftVersion,
      approvalId: input.approvalId,
      policyVersion: input.policyVersion,
      orderVersion,
    });
    expect(ticket.ticket.receipt).toMatchObject({
      ticketId: ticket.ticket.id,
      requestId: created.request.id,
      requestStatus: "ticket_created",
    });

    const requestAfter = await adapter.getRequest(consumer(order.cartId), created.request.id);
    expect(requestAfter).toMatchObject({
      status: "ticket_created",
      ticketId: ticket.ticket.id,
      sequence: "1",
    });
    expect(requestAfter.progress.map((item) => item.status)).toEqual([
      "pending",
      "ticket_created",
    ]);
    const feed = await adapter.listServiceRequests(service());
    expect(feed.highWatermark).toBe("1");
    expect(feed.items[0]).toMatchObject({
      status: "ticket_created",
      ticketId: ticket.ticket.id,
      sequence: "1",
    });

    await expect(adapter.createTicket(service(), input, { idempotencyKey: ticketKey }))
      .resolves.toEqual({ ticket: ticket.ticket, replayed: true });
    await expect(adapter.createTicket(
      service(),
      { ...input, reply: "A different reply." },
      { idempotencyKey: ticketKey },
    )).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      details: { operation: "createServiceTicket" },
    });

    await expect(adapter.createTicket(service(), input, { idempotencyKey: key() }))
      .resolves.toEqual({ ticket: ticket.ticket, replayed: true });
    await expect(adapter.createTicket(
      service(),
      { ...input, reply: "A different reply." },
      { idempotencyKey: key() },
    )).rejects.toMatchObject({
      code: "REQUEST_STATE_CONFLICT",
      details: { request_id: created.request.id, status: "ticket_created" },
    });

    const consumerTicket = await adapter.getConsumerTicket(
      consumer(order.cartId),
      ticket.ticket.id,
    );
    expect(toConsumerTicket(consumerTicket)).not.toHaveProperty("draft_version");
    expect(toConsumerTicket(consumerTicket)).not.toHaveProperty("approval_id");
    expect(toConsumerTicket(consumerTicket)).not.toHaveProperty("policy_version");
    expect(toConsumerTicket(consumerTicket)).not.toHaveProperty("order_version");
    await expect(adapter.getConsumerTicket(
      consumer("cart_foreign"),
      ticket.ticket.id,
    )).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(adapter.getServiceTicket(service(), ticket.ticket.id))
      .resolves.toEqual(ticket.ticket);
    await expect(makeAdapter("sg").getServiceTicket(
      service({ market: "sg", allowedMarkets: ["sg"] }),
      ticket.ticket.id,
    )).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(makeAdapter("sg").getConsumerTicket(
      consumer(order.cartId, "sg"),
      ticket.ticket.id,
    )).rejects.toMatchObject({ code: "NOT_FOUND" });

    // A successful replay is never blocked by a later order version.
    await db.query(
      `UPDATE commerce_orders SET data = jsonb_set(data, '{contact,name}', '"Later Buyer"') WHERE id = $1`,
      [order.id],
    );
    await expect(adapter.createTicket(service(), input, { idempotencyKey: ticketKey }))
      .resolves.toMatchObject({ replayed: true, ticket: { id: ticket.ticket.id } });
  });

  it("binds a replaying key to the existing ticket and keeps it scoped to one fingerprint", async () => {
    const order = await insertOrder(db);
    const created = await adapter.createRequest(
      consumer(order.cartId),
      { orderId: order.id, type: "damaged", description: "Replay key binding." },
      { idempotencyKey: key() },
    );
    const orderVersion = (await adapter.getServiceOrder(service(), order.id)).orderVersion;
    const input = ticketInput(created.request.id, orderVersion);
    const ticket = await adapter.createTicket(service(), input, { idempotencyKey: key() });

    const replayKey = key();
    await expect(adapter.createTicket(service(), input, { idempotencyKey: replayKey }))
      .resolves.toEqual({ ticket: ticket.ticket, replayed: true });
    await expect(adapter.findTicketByIdempotencyKey(service(), replayKey))
      .resolves.toEqual({ kind: "ticket", ticket: ticket.ticket });

    // The new key is now bound to the complete fingerprint.
    await expect(adapter.createTicket(
      service(),
      { ...input, reply: "A different reply." },
      { idempotencyKey: replayKey },
    )).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      details: { operation: "createServiceTicket" },
    });

    // It cannot be reused for a different request either.
    const other = await adapter.createRequest(
      consumer(order.cartId),
      { orderId: order.id, type: "return", description: "Another request." },
      { idempotencyKey: key() },
    );
    await expect(adapter.createTicket(
      service(),
      ticketInput(other.request.id, orderVersion),
      { idempotencyKey: replayKey },
    )).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      details: { operation: "createServiceTicket" },
    });

    // A rebuilt adapter over committed state resolves the replaying key too.
    const rebuilt = makeAdapter();
    await expect(rebuilt.findTicketByIdempotencyKey(service(), replayKey))
      .resolves.toEqual({ kind: "ticket", ticket: ticket.ticket });
    await expect(rebuilt.createTicket(service(), input, { idempotencyKey: replayKey }))
      .resolves.toEqual({ ticket: ticket.ticket, replayed: true });
  });

  it("rejects invalid ticket input and requests without writing", async () => {
    const order = await insertOrder(db);
    const created = await adapter.createRequest(
      consumer(order.cartId),
      { orderId: order.id, type: "damaged", description: "Validation." },
      { idempotencyKey: key() },
    );
    const orderVersion = (await adapter.getServiceOrder(service(), order.id)).orderVersion;

    for (const input of [
      ticketInput(created.request.id, orderVersion, { reply: "   " }),
      ticketInput(created.request.id, orderVersion, { reply: "x".repeat(10_001) }),
      ticketInput(created.request.id, orderVersion, { requestId: "" }),
      ticketInput(created.request.id, orderVersion, { draftVersion: "x".repeat(129) }),
    ]) {
      await expect(adapter.createTicket(service(), input, { idempotencyKey: key() }))
        .rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }

    const legalReply = "😀".repeat(10_000);
    const ticket = await adapter.createTicket(
      service(),
      ticketInput(created.request.id, orderVersion, { reply: legalReply }),
      { idempotencyKey: key() },
    );
    expect(Array.from(ticket.ticket.reply)).toHaveLength(10_000);

    await expect(adapter.createTicket(
      service(),
      ticketInput("asr_missing", orderVersion),
      { idempotencyKey: key() },
    )).rejects.toMatchObject({ code: "NOT_FOUND" });

    const sgAdapter = makeAdapter("sg");
    await expect(sgAdapter.createTicket(service({ market: "sg", allowedMarkets: ["sg"] }), ticketInput(created.request.id, orderVersion), { idempotencyKey: key() }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rolls back the whole ticket transaction and recovers the original key", async () => {
    const order = await insertOrder(db);
    const created = await adapter.createRequest(
      consumer(order.cartId),
      { orderId: order.id, type: "damaged", description: "Rollback." },
      { idempotencyKey: key() },
    );
    const orderVersion = (await adapter.getServiceOrder(service(), order.id)).orderVersion;
    const input = ticketInput(created.request.id, orderVersion);
    const ticketKey = key();

    let failUpdates = true;
    const failingAdapter = createPostgresAfterSalesAdapter({
      pool: failingPool(pool, () => failUpdates),
      market: getMarket("au"),
      now: () => new Date(time),
    });

    await expect(failingAdapter.createTicket(service(), input, { idempotencyKey: ticketKey }))
      .rejects.toThrow("injected after-sales transaction failure");
    await expect(adapter.findTicketByIdempotencyKey(service(), ticketKey))
      .resolves.toMatchObject({ kind: "currently_unavailable" });
    expect((await adapter.getRequest(consumer(order.cartId), created.request.id)).status)
      .toBe("pending");
    expect((await adapter.listServiceRequests(service())).highWatermark).toBe("1");
    const ticketCount = await db.query(
      "SELECT count(*)::int AS count FROM after_sales_tickets",
    );
    expect(Number((ticketCount.rows[0] as { count?: unknown } | undefined)?.count)).toBe(0);

    failUpdates = false;
    const recovered = await adapter.createTicket(service(), input, { idempotencyKey: ticketKey });
    expect(recovered.replayed).toBe(false);
    const recoveredCount = await db.query(
      "SELECT count(*)::int AS count FROM after_sales_tickets",
    );
    expect(Number((recoveredCount.rows[0] as { count?: unknown } | undefined)?.count)).toBe(1);
    await expect(adapter.findTicketByIdempotencyKey(service(), ticketKey))
      .resolves.toMatchObject({ kind: "ticket", ticket: { id: recovered.ticket.id } });
  });

  it("recovers tickets by the original idempotency key only within market and actor", async () => {
    const order = await insertOrder(db);
    const created = await adapter.createRequest(
      consumer(order.cartId),
      { orderId: order.id, type: "damaged", description: "Lookup." },
      { idempotencyKey: key() },
    );
    const orderVersion = (await adapter.getServiceOrder(service(), order.id)).orderVersion;
    const ticketKey = key();

    await expect(adapter.findTicketByIdempotencyKey(service(), ticketKey))
      .resolves.toEqual({ kind: "currently_unavailable", retryAfterMs: 250 });

    const ticket = await adapter.createTicket(
      service(),
      ticketInput(created.request.id, orderVersion),
      { idempotencyKey: ticketKey },
    );
    await expect(adapter.findTicketByIdempotencyKey(service(), ticketKey))
      .resolves.toEqual({ kind: "ticket", ticket: ticket.ticket });
    await expect(adapter.findTicketByIdempotencyKey(
      service({ actorId: "another-service" }),
      ticketKey,
    )).resolves.toMatchObject({ kind: "currently_unavailable" });
    await expect(adapter.findTicketByIdempotencyKey(service(), "bad key!"))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(adapter.findTicketByIdempotencyKey(
      consumer(order.cartId) as unknown as ServicePrincipal,
      ticketKey,
    )).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects malformed, cross-market and future feed cursors and invalid limits", async () => {
    const order = await insertOrder(db);
    await adapter.createRequest(
      consumer(order.cartId),
      { orderId: order.id, type: "damaged", description: "Cursor." },
      { idempotencyKey: key() },
    );

    for (const cursor of [
      "not-a-cursor!",
      encodeFeedCursor({ market: "sg", position: "1" }),
      encodeFeedCursor({ market: "au", position: "2" }),
    ]) {
      await expect(adapter.listServiceRequests(service(), { cursor, limit: 10 }))
        .rejects.toMatchObject({ code: "INVALID_CURSOR" });
    }
    for (const limit of [0, -1, 201, 1.5]) {
      await expect(adapter.listServiceRequests(service(), { limit }))
        .rejects.toMatchObject({
          code: "VALIDATION_ERROR",
          details: { field: "limit" },
        });
    }
  });

  it("keeps tickets, receipts, requests and attachments readable after a file-backed restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "e-pig-after-sales-adapter-"));
    try {
      await db.close();
      db = new PGlite(directory);
      await migrate(db);
      pool = leasePool(db);
      adapter = makeAdapter();

      const order = await insertOrder(db);
      const attachment = await adapter.uploadAttachment(consumer(order.cartId), {
        orderId: order.id,
        fileName: "restart.png",
        mediaType: "image/png",
        bytes: PNG,
      });
      const created = await adapter.createRequest(
        consumer(order.cartId),
        {
          orderId: order.id,
          type: "damaged",
          description: "Restart.",
          attachmentIds: [attachment.id],
        },
        { idempotencyKey: key() },
      );
      const orderVersion = (await adapter.getServiceOrder(service(), order.id)).orderVersion;
      const ticketKey = key();
      const input = ticketInput(created.request.id, orderVersion);
      const ticket = await adapter.createTicket(
        service(),
        input,
        { idempotencyKey: ticketKey },
      );
      const replayKey = key();
      await expect(adapter.createTicket(service(), input, { idempotencyKey: replayKey }))
        .resolves.toEqual({ ticket: ticket.ticket, replayed: true });

      // Rebuilding the adapter over the same database already reads committed state.
      const rebuilt = makeAdapter();
      await expect(rebuilt.getServiceTicket(service(), ticket.ticket.id))
        .resolves.toEqual(ticket.ticket);
      await expect(rebuilt.findTicketByIdempotencyKey(service(), replayKey))
        .resolves.toEqual({ kind: "ticket", ticket: ticket.ticket });

      await db.close();
      db = new PGlite(directory);
      await migrate(db);
      pool = leasePool(db);
      adapter = makeAdapter();

      await expect(adapter.getServiceTicket(service(), ticket.ticket.id))
        .resolves.toEqual(ticket.ticket);
      await expect(adapter.getConsumerTicket(consumer(order.cartId), ticket.ticket.id))
        .resolves.toEqual(ticket.ticket);
      await expect(adapter.getServiceRequest(service(), created.request.id))
        .resolves.toMatchObject({
          status: "ticket_created",
          ticketId: ticket.ticket.id,
          sequence: "1",
        });
      await expect(adapter.findTicketByIdempotencyKey(service(), ticketKey))
        .resolves.toEqual({ kind: "ticket", ticket: ticket.ticket });
      await expect(adapter.findTicketByIdempotencyKey(service(), replayKey))
        .resolves.toEqual({ kind: "ticket", ticket: ticket.ticket });
      await expect(adapter.getAttachmentContent(consumer(order.cartId), attachment.id))
        .resolves.toMatchObject({ fileName: "restart.png" });
      const feed = await adapter.listServiceRequests(service());
      expect(feed.items).toHaveLength(1);
      expect(feed.items[0].status).toBe("ticket_created");
      expect(feed.highWatermark).toBe("1");
    } finally {
      await db.close();
      await rm(directory, { recursive: true, force: true });
      db = new PGlite();
    }
  });
});
