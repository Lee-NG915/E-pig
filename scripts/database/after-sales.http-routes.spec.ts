import { readFileSync } from "node:fs";

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createPostgresAfterSalesAdapter } from "@/adapters/after-sales/postgres/after-sales";
import type { CommercePool } from "@/adapters/commerce/postgres/pool";
import type { AfterSalesPort } from "@/core/contracts/after-sales";
import { getMarket } from "@/platform/config/markets";
import { signCartCookie } from "@/platform/security/cart-cookie";

import { runMigrations } from "./migrate-lib.mjs";

const testState = vi.hoisted(() => ({
  port: null as unknown as AfterSalesPort,
}));

const ORIGIN = "https://shop.example.test";
const SECRET = "synthetic-after-sales-cookie-secret-32-chars";
const TOKEN = "synthetic-service-token-32-characters-minimum";
const MARKET = "au" as const;
const PNG_BYTES = new Uint8Array(
  readFileSync(
    new URL(
      "../../contracts/epig-after-sales/v1/fixtures/binary/synthetic-1x1.png",
      import.meta.url,
    ),
  ),
);

vi.mock("@/platform/config/env", () => ({
  env: {
    MARKET: "au",
    APP_ORIGIN: "https://shop.example.test",
    CART_COOKIE_SECRET: "synthetic-after-sales-cookie-secret-32-chars",
    AFTER_SALES_SERVICE_TOKEN: "synthetic-service-token-32-characters-minimum",
    AFTER_SALES_SERVICE_MARKETS: "au",
  },
}));
vi.mock("@/platform/registry", () => ({
  getAfterSales: () => testState.port,
}));

import { POST as uploadAttachment } from "@/app/api/[market]/after-sales/attachments/route";
import { GET as getAttachmentContent } from "@/app/api/[market]/after-sales/attachments/[attachmentId]/content/route";
import { POST as createAfterSalesRequest } from "@/app/api/[market]/after-sales/requests/route";
import { GET as getAfterSalesRequest } from "@/app/api/[market]/after-sales/requests/[requestId]/route";
import { GET as getConsumerTicket } from "@/app/api/[market]/after-sales/tickets/[ticketId]/route";
import { GET as getServiceOrder } from "@/app/api/[market]/after-sales/service/orders/[orderId]/route";
import { GET as listServiceRequests } from "@/app/api/[market]/after-sales/service/requests/route";
import { POST as createServiceTicket } from "@/app/api/[market]/after-sales/service/tickets/route";
import { GET as getServiceTicketByIdempotencyKey } from "@/app/api/[market]/after-sales/service/tickets/by-idempotency-key/[idempotencyKey]/route";

if (process.env.E_PIG_AFTER_SALES_PG_TEST !== "1") {
  throw new Error("Run this spec only through pnpm test:after-sales:pg");
}
const pgPort = Number(process.env.PGPORT);
if (
  process.env.PGHOST !== "127.0.0.1"
  || !Number.isInteger(pgPort)
  || pgPort < 1
  || pgPort > 65535
  || !process.env.PGPASSWORD
) {
  throw new Error("The dedicated runner must provide loopback PG* credentials");
}
const databaseUrl = `postgres://${encodeURIComponent(process.env.PGUSER ?? "")}:`
  + `${encodeURIComponent(process.env.PGPASSWORD)}@${process.env.PGHOST}:${pgPort}/`
  + `${encodeURIComponent(process.env.PGDATABASE ?? "")}`;

let rawPool: Pool;
let adapter: AfterSalesPort;

type Seed = { orderId: string; cartId: string; orderVersion: string };

function createPgCommercePool(raw: Pool): CommercePool {
  return {
    async query(sql, values) {
      const result = values === undefined
        ? await raw.query(sql)
        : await raw.query(sql, values);
      return { rows: result.rows as Record<string, unknown>[] };
    },
    async connect() {
      const client = await raw.connect();
      let released = false;
      return {
        async query(sql, values) {
          const result = values === undefined
            ? await client.query(sql)
            : await client.query(sql, values);
          return { rows: result.rows as Record<string, unknown>[] };
        },
        release() {
          if (released) return;
          released = true;
          client.release();
        },
      };
    },
  };
}

async function seedOrder(): Promise<Seed> {
  const currency = getMarket(MARKET).currency;
  const orderId = `ord_${crypto.randomUUID()}`;
  const cartId = crypto.randomUUID();
  const checkoutId = `chk_${crypto.randomUUID()}`;
  const createdAt = "2026-11-01T00:00:00.000Z";
  const lines = [{
    id: `line_${crypto.randomUUID()}`,
    productId: "prod_5d",
    variantId: "var_5d",
    sku: "SKU-5D",
    name: "Synthetic 5D Sofa",
    quantity: 1,
    unitPrice: { amount: 100, currency },
    lineTotal: { amount: 100, currency },
  }];
  const data = {
    id: orderId,
    checkoutId,
    cartId,
    market: MARKET,
    status: "paid",
    lines,
    subtotal: { amount: 100, currency },
    total: { amount: 100, currency },
    contact: {
      name: "Synthetic Buyer",
      email: "buyer@example.invalid",
      phone: "0400000000",
    },
    address: {
      line1: "1 Synthetic Street",
      city: "Sydney",
      state: "NSW",
      postalCode: "2000",
      country: "AU",
    },
    createdAt,
  };

  await rawPool.query(
    `INSERT INTO commerce_carts (id, market, creation_key, data)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [cartId, MARKET, `creation_${crypto.randomUUID()}`, JSON.stringify({ id: cartId, market: MARKET })],
  );
  await rawPool.query(
    `INSERT INTO commerce_checkouts
       (id, cart_id, market, revision, input_signature, data, payment_request, first_attempt_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)`,
    [
      checkoutId,
      cartId,
      MARKET,
      0,
      `sig_${crypto.randomUUID()}`,
      JSON.stringify({ id: checkoutId, cartId, market: MARKET }),
      JSON.stringify({ checkoutId, cartId, market: MARKET }),
      createdAt,
    ],
  );
  await rawPool.query(
    `INSERT INTO commerce_orders (id, checkout_id, cart_id, market, data)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [orderId, checkoutId, cartId, MARKET, JSON.stringify(data)],
  );

  const mapped = await adapter.getServiceOrder({
    kind: "service",
    market: MARKET,
    actorId: "dtc-service",
    allowedMarkets: [MARKET],
  }, orderId);
  return { orderId, cartId, orderVersion: mapped.orderVersion };
}

function cookieHeader(cartId: string, market: string = MARKET) {
  return `epig_cart_${market}=${signCartCookie(cartId, market, SECRET)}`;
}

type ConsumerOptions = {
  cookie?: string;
  origin?: string;
  version?: string | null;
  idempotencyKey?: string;
  contentType?: string;
};

function consumerHeaders(options: ConsumerOptions = {}) {
  return {
    ...(options.version === null
      ? {}
      : { "X-After-Sales-Contract-Version": options.version ?? "1" }),
    Origin: options.origin ?? ORIGIN,
    "Sec-Fetch-Site": "same-origin",
    Cookie: options.cookie ?? cookieHeader("00000000-0000-4000-8000-000000000000"),
    ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    ...(options.contentType ? { "Content-Type": options.contentType } : {}),
  };
}

function consumerJson(path: string, body: unknown, options: ConsumerOptions = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: consumerHeaders({ ...options, contentType: "application/json" }),
    body: JSON.stringify(body),
  });
}

function consumerGet(path: string, options: ConsumerOptions = {}) {
  return new Request(`${ORIGIN}${path}`, { headers: consumerHeaders(options) });
}

function formRequest(form: FormData, options: ConsumerOptions = {}) {
  return new Request(`${ORIGIN}/api/au/after-sales/attachments`, {
    method: "POST",
    headers: consumerHeaders(options),
    body: form,
  });
}

function serviceHeaders(options: {
  bearer?: string | null;
  version?: string | null;
  idempotencyKey?: string;
} = {}) {
  return {
    ...(options.version === null
      ? {}
      : { "X-After-Sales-Contract-Version": options.version ?? "1" }),
    ...(options.bearer === null ? {} : { Authorization: options.bearer ?? `Bearer ${TOKEN}` }),
    ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    "Content-Type": "application/json",
  };
}

function serviceGet(path: string, options: { bearer?: string | null; version?: string | null } = {}) {
  return new Request(`${ORIGIN}${path}`, { headers: serviceHeaders(options) });
}

function serviceJson(path: string, body: unknown, options: { bearer?: string | null; version?: string | null; idempotencyKey?: string } = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: serviceHeaders(options),
    body: JSON.stringify(body),
  });
}

const marketContext = () => ({ params: Promise.resolve({ market: MARKET }) });
const requestContext = (requestId: string) => ({ params: Promise.resolve({ market: MARKET, requestId }) });
const attachmentContext = (attachmentId: string) => ({ params: Promise.resolve({ market: MARKET, attachmentId }) });
const ticketContext = (ticketId: string) => ({ params: Promise.resolve({ market: MARKET, ticketId }) });
const orderContext = (orderId: string) => ({ params: Promise.resolve({ market: MARKET, orderId }) });
const keyContext = (key: string) => ({ params: Promise.resolve({ market: MARKET, idempotencyKey: key }) });

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

function expectProtected(response: Response, vary: string) {
  expect(response.headers.get("x-after-sales-contract-version")).toBe("1");
  expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  expect(response.headers.get("vary")).toBe(vary);
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
}

function createBody(seed: Seed, overrides: Record<string, unknown> = {}) {
  return {
    order_id: seed.orderId,
    type: "damaged",
    description: "The synthetic parcel arrived damaged.",
    ...overrides,
  };
}

async function createRequestViaRoute(seed: Seed, key: string, overrides: Record<string, unknown> = {}) {
  const response = await createAfterSalesRequest(
    consumerJson("/api/au/after-sales/requests", createBody(seed, overrides), {
      cookie: cookieHeader(seed.cartId),
      idempotencyKey: key,
    }),
    marketContext(),
  );
  return { response, body: await json<Record<string, unknown>>(response) };
}

async function counts() {
  const { rows } = await rawPool.query<{ requests: number; tickets: number; keys: number }>(
    `SELECT (SELECT count(*)::int FROM after_sales_requests) AS requests,
            (SELECT count(*)::int FROM after_sales_tickets) AS tickets,
            (SELECT count(*)::int FROM after_sales_ticket_keys) AS keys`,
  );
  return rows[0];
}

beforeAll(async () => {
  await runMigrations({
    connectionString: databaseUrl,
    driver: "tcp",
    scope: "all",
  });
  rawPool = new Pool({
    host: process.env.PGHOST,
    port: pgPort,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    max: 8,
    connectionTimeoutMillis: 5_000,
    application_name: "e-pig-as5d-routes",
  });
  adapter = createPostgresAfterSalesAdapter({
    pool: createPgCommercePool(rawPool),
    market: getMarket(MARKET),
    now: () => new Date("2026-11-06T00:00:00.000Z"),
  });
  testState.port = adapter;
});

beforeEach(async () => {
  await rawPool.query(
    `TRUNCATE after_sales_ticket_keys, after_sales_tickets, after_sales_attachments,
              after_sales_requests, after_sales_request_counters,
              commerce_orders, commerce_checkouts, commerce_carts CASCADE`,
  );
});

afterAll(async () => {
  await rawPool?.end();
});

describe("after-sales Route Handlers on isolated PostgreSQL", () => {
  it("creates, reads and replays a request with signed cookies and protected headers", async () => {
    const seed = await seedOrder();
    const key = `key_${crypto.randomUUID()}`;

    const created = await createRequestViaRoute(seed, key);
    expect(created.response.status).toBe(201);
    expectProtected(created.response, "Cookie");
    expect(created.response.headers.get("idempotency-replayed")).toBeNull();
    expect(created.body).toMatchObject({
      order_id: seed.orderId,
      market: MARKET,
      type: "damaged",
      status: "pending",
      ticket_id: null,
    });
    expect(created.body).not.toHaveProperty("sequence");
    const requestId = created.body.request_id as string;

    const read = await getAfterSalesRequest(
      consumerGet("/api/au/after-sales/requests/id", { cookie: cookieHeader(seed.cartId) }),
      requestContext(requestId),
    );
    expect(read.status).toBe(200);
    expectProtected(read, "Cookie");
    expect(await json(read)).toEqual(created.body);

    const replay = await createAfterSalesRequest(
      consumerJson("/api/au/after-sales/requests", createBody(seed), {
        cookie: cookieHeader(seed.cartId),
        idempotencyKey: key,
      }),
      marketContext(),
    );
    expect(replay.status).toBe(200);
    expect(replay.headers.get("idempotency-replayed")).toBe("true");
    expect(await json(replay)).toEqual(created.body);
    expect((await counts()).requests).toBe(1);

    for (const options of [
      { cookie: "" },
      { cookie: cookieHeader(seed.cartId, "sg") },
      { version: null },
    ]) {
      const rejected = await getAfterSalesRequest(
        consumerGet("/api/au/after-sales/requests/id", {
          cookie: cookieHeader(seed.cartId),
          ...options,
        }),
        requestContext(requestId),
      );
      expect([400, 401]).toContain(rejected.status);
    }

    const wrongOrigin = await createAfterSalesRequest(
      consumerJson("/api/au/after-sales/requests", createBody(seed), {
        cookie: cookieHeader(seed.cartId),
        idempotencyKey: `key_${crypto.randomUUID()}`,
        origin: "https://attacker.example",
      }),
      marketContext(),
    );
    expect(wrongOrigin.status).toBe(401);

    const otherCart = await getAfterSalesRequest(
      consumerGet("/api/au/after-sales/requests/id", {
        cookie: cookieHeader(crypto.randomUUID()),
      }),
      requestContext(requestId),
    );
    expect(otherCart.status).toBe(404);
  });

  it("uploads and streams one private attachment and includes it in a request", async () => {
    const seed = await seedOrder();
    const form = new FormData();
    form.set("order_id", seed.orderId);
    form.set("file", new File([PNG_BYTES], "synthetic.png", { type: "image/png" }));

    const uploaded = await uploadAttachment(
      formRequest(form, { cookie: cookieHeader(seed.cartId) }),
      marketContext(),
    );
    expect(uploaded.status).toBe(201);
    expectProtected(uploaded, "Cookie");
    const metadata = await json<Record<string, unknown>>(uploaded);
    expect(metadata).toMatchObject({
      file_name: "synthetic.png",
      media_type: "image/png",
      size_bytes: PNG_BYTES.byteLength,
      status: "active",
    });
    expect(metadata).not.toHaveProperty("bytes");

    const content = await getAttachmentContent(
      consumerGet("/api/au/after-sales/attachments/id/content", {
        cookie: cookieHeader(seed.cartId),
      }),
      attachmentContext(metadata.attachment_id as string),
    );
    expect(content.status).toBe(200);
    expect(content.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await content.arrayBuffer())).toEqual(PNG_BYTES);

    const created = await createRequestViaRoute(seed, `key_${crypto.randomUUID()}`, {
      attachment_ids: [metadata.attachment_id],
    });
    expect(created.response.status).toBe(201);
    expect(created.body.attachments).toEqual([
      expect.objectContaining({ attachment_id: metadata.attachment_id, status: "active" }),
    ]);
  });

  it("creates one ticket through the service route, replays it and redacts consumer DTOs", async () => {
    const seed = await seedOrder();
    const request = await createRequestViaRoute(seed, `key_${crypto.randomUUID()}`);
    const requestId = request.body.request_id as string;

    const orderResponse = await getServiceOrder(
      serviceGet(`/api/au/after-sales/service/orders/${seed.orderId}`),
      orderContext(seed.orderId),
    );
    expect(orderResponse.status).toBe(200);
    expectProtected(orderResponse, "Authorization");
    const order = await json<{ order_version: string }>(orderResponse);
    expect(order.order_version).toBe(seed.orderVersion);

    const ticketKey = `ticket_${crypto.randomUUID()}`;
    const ticketBody = {
      request_id: requestId,
      action: "refund",
      reply: "Synthetic immutable final reply.",
      draft_version: "draft_5d",
      approval_id: "approval_5d",
      policy_version: "policy_5d",
      order_version: order.order_version,
    };
    const created = await createServiceTicket(
      serviceJson("/api/au/after-sales/service/tickets", ticketBody, {
        idempotencyKey: ticketKey,
      }),
      marketContext(),
    );
    expect(created.status).toBe(201);
    expectProtected(created, "Authorization");
    expect(created.headers.get("idempotency-replayed")).toBeNull();
    const ticket = await json<Record<string, unknown>>(created);
    expect(ticket).toMatchObject({
      request_id: requestId,
      order_id: seed.orderId,
      action: "refund",
      reply: ticketBody.reply,
      draft_version: "draft_5d",
      approval_id: "approval_5d",
      policy_version: "policy_5d",
      order_version: seed.orderVersion,
      status: "open",
    });
    const ticketId = ticket.ticket_id as string;

    const replay = await createServiceTicket(
      serviceJson("/api/au/after-sales/service/tickets", ticketBody, {
        idempotencyKey: ticketKey,
      }),
      marketContext(),
    );
    expect(replay.status).toBe(200);
    expect(replay.headers.get("idempotency-replayed")).toBe("true");
    expect(await json(replay)).toEqual(ticket);

    const lookup = await getServiceTicketByIdempotencyKey(
      serviceGet(`/api/au/after-sales/service/tickets/by-idempotency-key/${ticketKey}`),
      keyContext(ticketKey),
    );
    expect(lookup.status).toBe(200);
    expect(await json(lookup)).toEqual(ticket);

    const consumerTicket = await getConsumerTicket(
      consumerGet("/api/au/after-sales/tickets/id", { cookie: cookieHeader(seed.cartId) }),
      ticketContext(ticketId),
    );
    expect(consumerTicket.status).toBe(200);
    expectProtected(consumerTicket, "Cookie");
    const consumerBody = await json<Record<string, unknown>>(consumerTicket);
    expect(consumerBody).toMatchObject({
      ticket_id: ticketId,
      request_id: requestId,
      order_id: seed.orderId,
      reply: ticketBody.reply,
    });
    expect(consumerBody).not.toHaveProperty("draft_version");
    expect(consumerBody).not.toHaveProperty("approval_id");
    expect(consumerBody).not.toHaveProperty("policy_version");
    expect(consumerBody).not.toHaveProperty("order_version");

    const feed = await listServiceRequests(
      serviceGet("/api/au/after-sales/service/requests"),
      marketContext(),
    );
    expect(feed.status).toBe(200);
    expectProtected(feed, "Authorization");
    const feedBody = await json<{ items: Array<Record<string, unknown>>; high_watermark: string }>(feed);
    expect(feedBody.items).toHaveLength(1);
    expect(feedBody.items[0]).toMatchObject({
      request_id: requestId,
      status: "ticket_created",
      ticket_id: ticketId,
    });
    expect(feedBody.high_watermark).toBe("1");

    for (const rejected of [
      await listServiceRequests(serviceGet("/api/au/after-sales/service/requests", { bearer: null }), marketContext()),
      await listServiceRequests(serviceGet("/api/au/after-sales/service/requests", { version: null }), marketContext()),
    ]) {
      expect([400, 401]).toContain(rejected.status);
    }

    const otherMarket = await listServiceRequests(
      serviceGet("/api/sg/after-sales/service/requests"),
      { params: Promise.resolve({ market: "sg" }) },
    );
    expect([403, 404]).toContain(otherMarket.status);
    expect(await counts()).toMatchObject({ requests: 1, tickets: 1, keys: 1 });
  });

  it("keeps duplicates and conflicts from adding business rows and recovers by the original key", async () => {
    const seed = await seedOrder();
    const requestKey = `key_${crypto.randomUUID()}`;
    const request = await createRequestViaRoute(seed, requestKey);
    const requestId = request.body.request_id as string;
    const order = await adapter.getServiceOrder({
      kind: "service",
      market: MARKET,
      actorId: "dtc-service",
      allowedMarkets: [MARKET],
    }, seed.orderId);
    const ticketKey = `ticket_${crypto.randomUUID()}`;
    const ticketBody = {
      request_id: requestId,
      action: "reship",
      reply: "Synthetic recovered reply.",
      draft_version: "draft_5d_lost",
      approval_id: "approval_5d_lost",
      policy_version: "policy_5d_lost",
      order_version: order.orderVersion,
    };

    const lost = await createServiceTicket(
      serviceJson("/api/au/after-sales/service/tickets", ticketBody, {
        idempotencyKey: ticketKey,
      }),
      marketContext(),
    );
    expect(lost.status).toBe(201);
    const lostTicket = await json<Record<string, unknown>>(lost);

    // Discard the response result and recover the same ticket by the original key.
    const recovered = await getServiceTicketByIdempotencyKey(
      serviceGet(`/api/au/after-sales/service/tickets/by-idempotency-key/${ticketKey}`),
      keyContext(ticketKey),
    );
    expect(recovered.status).toBe(200);
    expect(await json(recovered)).toEqual(lostTicket);

    const conflictingReply = await createServiceTicket(
      serviceJson("/api/au/after-sales/service/tickets", {
        ...ticketBody,
        reply: "A different reply must not overwrite.",
      }, { idempotencyKey: `ticket_${crypto.randomUUID()}` }),
      marketContext(),
    );
    expect(conflictingReply.status).toBe(409);
    expect(await json(conflictingReply)).toMatchObject({
      error: { code: "REQUEST_STATE_CONFLICT" },
    });

    const conflictingRequest = await createAfterSalesRequest(
      consumerJson("/api/au/after-sales/requests", createBody(seed, {
        description: "A different fingerprint under the same key.",
      }), {
        cookie: cookieHeader(seed.cartId),
        idempotencyKey: requestKey,
      }),
      marketContext(),
    );
    expect(conflictingRequest.status).toBe(409);
    expect(await json(conflictingRequest)).toMatchObject({
      error: { code: "IDEMPOTENCY_CONFLICT" },
    });

    const requestReplay = await createRequestViaRoute(seed, requestKey);
    expect(requestReplay.response.status).toBe(200);
    expect(requestReplay.body).toMatchObject({
      request_id: requestId,
      status: "ticket_created",
      ticket_id: lostTicket.ticket_id,
    });
    expect(await counts()).toMatchObject({ requests: 1, tickets: 1, keys: 1 });
  });
});
