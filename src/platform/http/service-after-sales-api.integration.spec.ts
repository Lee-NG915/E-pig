import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockAfterSalesAdapter } from "@/adapters/after-sales/mock/after-sales";
import { createMockCatalogAdapter } from "@/adapters/commerce/mock/catalog";
import {
  createAfterSalesError,
  encodeFeedCursor,
  type AfterSalesOrder,
  type AfterSalesPort,
  type ConsumerPrincipal,
  type ServicePrincipal,
} from "@/core/contracts/after-sales";
import { getMarket } from "@/platform/config/markets";
import type { Logger } from "@/platform/logging/logger";

const testState = vi.hoisted(() => ({
  market: "au",
  serviceToken: "synthetic-service-token-32-characters-minimum" as string | undefined,
  serviceMarkets: "au,sg" as string | undefined,
  port: null as unknown as AfterSalesPort,
}));

vi.mock("@/platform/config/env", () => ({
  env: {
    get MARKET() {
      return testState.market;
    },
    get AFTER_SALES_SERVICE_TOKEN() {
      return testState.serviceToken;
    },
    get AFTER_SALES_SERVICE_MARKETS() {
      return testState.serviceMarkets;
    },
  },
}));

vi.mock("@/platform/registry", () => ({
  getCapabilities: () => ({ afterSales: testState.port }),
}));

import { GET as getServiceAttachmentContent } from "@/app/api/[market]/after-sales/service/attachments/[attachmentId]/content/route";
import { GET as getServiceOrder } from "@/app/api/[market]/after-sales/service/orders/[orderId]/route";
import { GET as getServiceOrderShipment } from "@/app/api/[market]/after-sales/service/orders/[orderId]/shipment/route";
import { GET as listServiceRequests } from "@/app/api/[market]/after-sales/service/requests/route";
import { GET as getServiceRequest } from "@/app/api/[market]/after-sales/service/requests/[requestId]/route";
import { POST as createServiceTicket } from "@/app/api/[market]/after-sales/service/tickets/route";
import { GET as getServiceTicket } from "@/app/api/[market]/after-sales/service/tickets/[ticketId]/route";
import { GET as getServiceTicketByIdempotencyKey } from "@/app/api/[market]/after-sales/service/tickets/by-idempotency-key/[idempotencyKey]/route";

const ORIGIN = "https://shop.example.test";
const TOKEN = "synthetic-service-token-32-characters-minimum";
const CART_ID = "11111111-1111-4111-8111-111111111111";
const ORDER_ID = "ord_service_au";
const ORDER_VERSION = "ov_service_au_1";
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PNG_BYTES = new Uint8Array(
  readFileSync(
    new URL(
      "../../../contracts/epig-after-sales/v1/fixtures/binary/synthetic-1x1.png",
      import.meta.url,
    ),
  ),
);

function order(id = ORDER_ID): AfterSalesOrder {
  return {
    id,
    ownerCartId: CART_ID,
    market: "au",
    currency: "AUD",
    items: [{
      id: "oit_service_1",
      productId: "product_must_not_leak",
      variantId: "variant_must_not_leak",
      sku: "SYNTH-1",
      name: "Synthetic item",
      quantity: 1,
      unitPriceMinor: 12_900,
      lineTotalMinor: 12_900,
    }],
    subtotalMinor: 12_900,
    shippingMinor: 895,
    taxMinor: 0,
    discountMinor: 0,
    totalMinor: 13_795,
    status: "fulfilled",
    createdAt: "2026-01-10T02:30:00Z",
    orderVersion: ORDER_VERSION,
    recipient: {
      name: "Synthetic Buyer",
      countryCode: "AU",
      region: "NSW",
      postalCode: "2000",
    },
  };
}

function recordingLogger() {
  const records: Array<{
    level: string;
    event: string;
    fields?: Record<string, unknown>;
  }> = [];
  const record = (level: string) => (event: string, fields?: Record<string, unknown>) => {
    records.push({ level, event, fields });
  };
  const logger: Logger = {
    debug: record("debug"),
    info: record("info"),
    warn: record("warn"),
    error: record("error"),
  };
  return { logger, records };
}

function setup(options: {
  beforeTicketCommit?: () => Promise<void>;
} = {}) {
  const market = getMarket("au");
  const catalog = createMockCatalogAdapter({ market });
  const recorded = recordingLogger();
  let currentTime = new Date("2026-11-05T00:00:00.000Z");
  const adapter = createMockAfterSalesAdapter({
    catalog,
    market,
    logger: recorded.logger,
    now: () => new Date(currentTime),
    orders: [order()],
    beforeTicketCommit: options.beforeTicketCommit,
  });
  const consumer: ConsumerPrincipal = {
    kind: "consumer",
    market: "au",
    cartId: CART_ID,
  };
  const service: ServicePrincipal = {
    kind: "service",
    market: "au",
    actorId: "dtc-service",
    allowedMarkets: ["au", "sg"],
  };
  testState.port = adapter;
  return {
    adapter,
    catalog,
    consumer,
    service,
    records: recorded.records,
    tick(milliseconds: number) {
      currentTime = new Date(currentTime.getTime() + milliseconds);
    },
  };
}

type RequestOptions = {
  bearer?: string | null;
  version?: string | null;
  idempotencyKey?: string;
  contentType?: string;
  cookie?: string;
  body?: BodyInit | null;
};

function headers(options: RequestOptions = {}) {
  return {
    ...(options.version === null
      ? {}
      : { "X-After-Sales-Contract-Version": options.version ?? "1" }),
    ...(options.bearer === null
      ? {}
      : { Authorization: options.bearer ?? `Bearer ${TOKEN}` }),
    ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    ...(options.contentType ? { "Content-Type": options.contentType } : {}),
    ...(options.cookie ? { Cookie: options.cookie } : {}),
  };
}

function request(path: string, options?: RequestOptions): Request;
function request(
  method: "GET" | "POST",
  path: string,
  options?: RequestOptions,
): Request;
function request(
  first: string,
  second?: string | RequestOptions,
  third: RequestOptions = {},
) {
  const method = typeof second === "string" ? first : "GET";
  const path = typeof second === "string" ? second : first;
  const options = (typeof second === "string" ? third : second) ?? {};
  return new Request(`${ORIGIN}${path}`, {
    method: method as "GET" | "POST",
    headers: headers(options),
    ...(options.body === undefined ? {} : { body: options.body }),
  });
}

function jsonRequest(
  path: string,
  body: unknown,
  options: RequestOptions = {},
) {
  return request("POST", path, {
    ...options,
    contentType: options.contentType ?? "application/json",
    body: JSON.stringify(body),
  });
}

function marketContext(market = "au") {
  return { params: Promise.resolve({ market }) };
}

function orderContext(orderId: string, market = "au") {
  return { params: Promise.resolve({ market, orderId }) };
}

function attachmentContext(attachmentId: string, market = "au") {
  return { params: Promise.resolve({ market, attachmentId }) };
}

function requestContext(requestId: string, market = "au") {
  return { params: Promise.resolve({ market, requestId }) };
}

function ticketContext(ticketId: string, market = "au") {
  return { params: Promise.resolve({ market, ticketId }) };
}

function lookupContext(idempotencyKey: string, market = "au") {
  return { params: Promise.resolve({ market, idempotencyKey }) };
}

async function responseJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

function expectProtectedHeaders(response: Response) {
  expect(response.headers.get("x-after-sales-contract-version")).toBe("1");
  expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  expect(response.headers.get("vary")).toBe("Authorization");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expectProtectedHeaders(response);
  const body = await responseJson<{
    error: {
      code: string;
      message: string;
      request_id: string;
      retryable: boolean;
      recovery_action: string;
      details?: Record<string, unknown>;
    };
  }>(response);
  expect(body.error).toMatchObject({ code });
  expect(body.error.request_id).toMatch(OPAQUE_ID);
  expect(body.error.message.length).toBeGreaterThan(0);
  expect(typeof body.error.retryable).toBe("boolean");
  expect(body.error.recovery_action).toMatch(
    /^(?:NONE|RETRY_REQUEST|LOOKUP_FIRST|RETRY_CREATE_WITH_SAME_KEY|RECONCILE_MANUALLY)$/,
  );
  return body;
}

function servicePath(suffix: string, market = "au") {
  return `/api/${market}/after-sales/service${suffix}`;
}

function seedRequest(
  context: ReturnType<typeof setup>,
  overrides: { description?: string; type?: "damaged" | "wrong_item" | "return" | "other" } = {},
  key = crypto.randomUUID(),
) {
  return context.adapter.createRequest(
    context.consumer,
    {
      orderId: ORDER_ID,
      type: "damaged",
      description: "Synthetic damaged item.",
      ...overrides,
    },
    { idempotencyKey: key },
  );
}

function seedAttachment(context: ReturnType<typeof setup>) {
  return context.adapter.uploadAttachment(context.consumer, {
    orderId: ORDER_ID,
    fileName: "synthetic.png",
    mediaType: "image/png",
    bytes: PNG_BYTES,
  });
}

function ticketBody(requestId: string, overrides: Record<string, unknown> = {}) {
  return {
    request_id: requestId,
    action: "reship",
    reply: "We will send a synthetic replacement.",
    draft_version: "draft_synthetic_1",
    approval_id: "approval_synthetic_1",
    policy_version: "policy_synthetic_1",
    order_version: ORDER_VERSION,
    ...overrides,
  };
}

async function postTicket(
  body: unknown,
  options: RequestOptions & { idempotencyKey?: string } = {},
) {
  return createServiceTicket(
    jsonRequest(servicePath("/tickets"), body, {
      idempotencyKey: options.idempotencyKey ?? "service-ticket-key",
      ...options,
    }),
    marketContext(),
  );
}

beforeEach(() => {
  testState.market = "au";
  testState.serviceToken = TOKEN;
  testState.serviceMarkets = "au,sg";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("service after-sales Route Handlers", () => {
  it("requires an exact Bearer token and never accepts a consumer Cookie", async () => {
    const context = setup();
    const getOrder = vi.spyOn(context.adapter, "getServiceOrder");
    const cases: RequestOptions[] = [
      { bearer: null },
      { bearer: "Basic synthetic" },
      { bearer: "Bearer" },
      { bearer: "Bearer  two-spaces" },
      { bearer: `Bearer ${TOKEN}x` },
      { bearer: "Bearer wrong-token" },
      { bearer: null, cookie: `epig_cart_au=${crypto.randomUUID()}` },
    ];

    for (const options of cases) {
      await expectError(
        await getServiceOrder(
          request(servicePath(`/orders/${ORDER_ID}`), options),
          orderContext(ORDER_ID),
        ),
        401,
        "UNAUTHORIZED",
      );
    }
    expect(getOrder).not.toHaveBeenCalled();
  });

  it("fails closed with a safe 500 when service configuration is absent or invalid", async () => {
    const context = setup();
    const getOrder = vi.spyOn(context.adapter, "getServiceOrder");
    const cases: Array<[string | undefined, string | undefined]> = [
      [undefined, "au"],
      ["", "au"],
      ["short", "au"],
      [`${TOKEN} `, "au"],
      [TOKEN, undefined],
      [TOKEN, ""],
      [TOKEN, "xx"],
      [TOKEN, "au,,sg"],
    ];

    for (const [token, markets] of cases) {
      testState.serviceToken = token;
      testState.serviceMarkets = markets;
      const response = await getServiceOrder(
        request(servicePath(`/orders/${ORDER_ID}`)),
        orderContext(ORDER_ID),
      );
      const body = await expectError(response, 500, "INTERNAL_ERROR");
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain(TOKEN);
      expect(serialized).not.toContain("markets");
    }
    expect(getOrder).not.toHaveBeenCalled();
  });

  it("enforces service market authorization, process market, and path validity before the port", async () => {
    const context = setup();
    const getOrder = vi.spyOn(context.adapter, "getServiceOrder");

    testState.serviceMarkets = "au";
    await expectError(
      await getServiceOrder(
        request(servicePath(`/orders/${ORDER_ID}`, "sg")),
        orderContext(ORDER_ID, "sg"),
      ),
      403,
      "FORBIDDEN_MARKET",
    );

    testState.serviceMarkets = "au,sg";
    await expectError(
      await getServiceOrder(
        request(servicePath(`/orders/${ORDER_ID}`, "sg")),
        orderContext(ORDER_ID, "sg"),
      ),
      404,
      "NOT_FOUND",
    );

    for (const market of ["jp", "AU", ""]) {
      await expectError(
        await getServiceOrder(
          request(servicePath(`/orders/${ORDER_ID}`, market)),
          orderContext(ORDER_ID, market),
        ),
        400,
        "VALIDATION_ERROR",
      );
    }
    expect(getOrder).not.toHaveBeenCalled();
  });

  it.each([null, "2", "", "1, 2"])(
    "requires the exact contract version %j before authorization and the port",
    async (version) => {
      const context = setup();
      const getOrder = vi.spyOn(context.adapter, "getServiceOrder");
      const createTicket = vi.spyOn(context.adapter, "createTicket");

      const read = await getServiceOrder(
        request(servicePath(`/orders/${ORDER_ID}`), { version }),
        orderContext(ORDER_ID),
      );
      const body = await expectError(read, 400, "UNSUPPORTED_CONTRACT_VERSION");
      expect(body.error.details).toEqual({ supported_major: "1" });

      await expectError(
        await postTicket(ticketBody("asr_unknown"), {
          version,
          idempotencyKey: `version-${String(version)}`,
        }),
        400,
        "UNSUPPORTED_CONTRACT_VERSION",
      );
      expect(getOrder).not.toHaveBeenCalled();
      expect(createTicket).not.toHaveBeenCalled();
    },
  );

  it("serves service order and shipment views without full addresses or private fields", async () => {
    setup();
    const response = await getServiceOrder(
      request(servicePath(`/orders/${ORDER_ID}`)),
      orderContext(ORDER_ID),
    );
    expect(response.status).toBe(200);
    expectProtectedHeaders(response);
    const body = await responseJson<Record<string, unknown>>(response);
    expect(body).toEqual({
      order_id: ORDER_ID,
      market: "au",
      currency: "AUD",
      items: [{
        order_item_id: "oit_service_1",
        sku: "SYNTH-1",
        name: "Synthetic item",
        quantity: 1,
        unit_price_minor: 12_900,
        line_total_minor: 12_900,
      }],
      subtotal_minor: 12_900,
      shipping_minor: 895,
      tax_minor: 0,
      discount_minor: 0,
      total_minor: 13_795,
      status: "fulfilled",
      created_at: "2026-01-10T02:30:00Z",
      order_version: ORDER_VERSION,
      recipient_summary: {
        masked_name: "S*** B***",
        country_code: "AU",
        region: "NSW",
        postal_code_masked: "2***",
      },
    });
    expect(body).not.toHaveProperty("ownerCartId");
    expect(body).not.toHaveProperty("recipient");
    expect(JSON.stringify(body)).not.toMatch(
      /product_must_not_leak|variant_must_not_leak|Synthetic Buyer|2000/,
    );

    const shipment = await getServiceOrderShipment(
      request(servicePath(`/orders/${ORDER_ID}/shipment`)),
      orderContext(ORDER_ID),
    );
    expect(shipment.status).toBe(200);
    expectProtectedHeaders(shipment);
    const shipmentBody = await responseJson<{
      events: Array<Record<string, unknown>>;
    } & Record<string, unknown>>(shipment);
    expect(shipmentBody).toMatchObject({
      shipment_id: "shp_mock_au",
      order_id: ORDER_ID,
      status: "delivered",
      carrier: "Synthetic Parcel Carrier",
    });
    expect(shipmentBody.events).toHaveLength(2);
    expect(JSON.stringify(shipmentBody)).not.toMatch(/storage|url/i);

    await expectError(
      await getServiceOrder(
        request(servicePath("/orders/ord_unknown")),
        orderContext("ord_unknown"),
      ),
      404,
      "NOT_FOUND",
    );
    await expectError(
      await getServiceOrder(
        request(servicePath("/orders/invalid%20id")),
        orderContext("invalid id"),
      ),
      400,
      "VALIDATION_ERROR",
    );
  });

  it("streams authorized private attachment bytes to the service", async () => {
    const context = setup();
    const attachment = await seedAttachment(context);
    const response = await getServiceAttachmentContent(
      request(servicePath(`/attachments/${attachment.id}/content`)),
      attachmentContext(attachment.id),
    );
    expect(response.status).toBe(200);
    expectProtectedHeaders(response);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="synthetic.png"',
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG_BYTES);

    await expectError(
      await getServiceAttachmentContent(
        request(servicePath("/attachments/att_unknown/content")),
        attachmentContext("att_unknown"),
      ),
      404,
      "NOT_FOUND",
    );
    await expectError(
      await getServiceAttachmentContent(
        request(servicePath("/attachments/invalid%20id/content")),
        attachmentContext("invalid id"),
      ),
      400,
      "VALIDATION_ERROR",
    );
  });

  it("returns 410 for an expired service attachment", async () => {
    const context = setup();
    const attachment = await seedAttachment(context);
    context.tick(8 * 24 * 60 * 60 * 1000);
    await expectError(
      await getServiceAttachmentContent(
        request(servicePath(`/attachments/${attachment.id}/content`)),
        attachmentContext(attachment.id),
      ),
      410,
      "ATTACHMENT_EXPIRED",
    );
  });

  it("serves an append-only service feed with stable multipage cursors", async () => {
    const context = setup();
    const empty = await listServiceRequests(
      request(servicePath("/requests")),
      marketContext(),
    );
    expect(empty.status).toBe(200);
    expectProtectedHeaders(empty);
    const emptyBody = await responseJson<{
      items: unknown[];
      high_watermark: string;
      next_cursor: string;
      has_more: boolean;
    }>(empty);
    expect(emptyBody).toMatchObject({
      items: [],
      high_watermark: "0",
      has_more: false,
    });
    expect(emptyBody.next_cursor).toMatch(/^[A-Za-z0-9_-]+$/);

    const first = await seedRequest(context, { description: "First" }, "feed-request-1");
    await seedRequest(context, { description: "Second" }, "feed-request-2");
    await seedRequest(context, { description: "Third" }, "feed-request-3");

    const page = await listServiceRequests(
      request(servicePath("/requests?limit=2")),
      marketContext(),
    );
    expect(page.status).toBe(200);
    const pageBody = await responseJson<{
      items: Array<Record<string, unknown>>;
      high_watermark: string;
      next_cursor: string;
      has_more: boolean;
    }>(page);
    expect(pageBody.items.map((item) => item.sequence)).toEqual(["1", "2"]);
    expect(pageBody.high_watermark).toBe("3");
    expect(pageBody.has_more).toBe(true);
    expect(pageBody.items[0]).not.toHaveProperty("progress");
    expect(pageBody.items[0]).toMatchObject({ status: "pending", ticket_id: null });

    const secondPage = await listServiceRequests(
      request(servicePath(`/requests?cursor=${encodeURIComponent(pageBody.next_cursor)}`)),
      marketContext(),
    );
    const secondBody = await responseJson<{
      items: Array<Record<string, unknown>>;
      next_cursor: string;
      has_more: boolean;
    }>(secondPage);
    expect(secondBody.items.map((item) => item.sequence)).toEqual(["3"]);
    expect(secondBody.has_more).toBe(false);

    const terminal = await listServiceRequests(
      request(servicePath(`/requests?cursor=${encodeURIComponent(secondBody.next_cursor)}`)),
      marketContext(),
    );
    const terminalBody = await responseJson<{
      items: unknown[];
      next_cursor: string;
      has_more: boolean;
    }>(terminal);
    expect(terminalBody).toMatchObject({ items: [], has_more: false });
    expect(terminalBody.next_cursor).toBe(secondBody.next_cursor);

    const detail = await getServiceRequest(
      request(servicePath(`/requests/${first.request.id}`)),
      requestContext(first.request.id),
    );
    expect(detail.status).toBe(200);
    const detailBody = await responseJson<Record<string, unknown>>(detail);
    expect(detailBody).toMatchObject({
      request_id: first.request.id,
      sequence: "1",
      status: "pending",
      ticket_id: null,
    });
    expect(detailBody).not.toHaveProperty("progress");
    expect(detailBody).not.toHaveProperty("request");

    const ignoredQuery = await listServiceRequests(
      request(servicePath("/requests?market=sg")),
      marketContext(),
    );
    expect(await responseJson<{ items: unknown[] }>(ignoredQuery)).toMatchObject({
      items: [expect.anything(), expect.anything(), expect.anything()],
    });
  });

  it("rejects invalid cursor and limit values without inventing alternate paging", async () => {
    const context = setup();
    await seedRequest(context, {}, "feed-invalid-request");
    const list = vi.spyOn(context.adapter, "listServiceRequests");

    const prevalidated: Array<{ query: string; code: string; field: string }> = [
      { query: "cursor=bad%20cursor", code: "INVALID_CURSOR", field: "cursor" },
      { query: "cursor=", code: "INVALID_CURSOR", field: "cursor" },
      { query: "cursor=a&cursor=b", code: "INVALID_CURSOR", field: "cursor" },
      { query: "limit=0", code: "VALIDATION_ERROR", field: "limit" },
      { query: "limit=201", code: "VALIDATION_ERROR", field: "limit" },
      { query: "limit=abc", code: "VALIDATION_ERROR", field: "limit" },
      { query: "limit=1.5", code: "VALIDATION_ERROR", field: "limit" },
      { query: "limit=1&limit=2", code: "VALIDATION_ERROR", field: "limit" },
    ];
    for (const item of prevalidated) {
      const response = await listServiceRequests(
        request(servicePath(`/requests?${item.query}`)),
        marketContext(),
      );
      const body = await expectError(response, 400, item.code);
      expect(body.error.details).toEqual({ field: item.field });
    }
    expect(list).not.toHaveBeenCalled();

    for (const cursor of [
      encodeFeedCursor({ market: "sg", position: "1" }),
      encodeFeedCursor({ market: "au", position: "99" }),
    ]) {
      const response = await listServiceRequests(
        request(servicePath(`/requests?cursor=${encodeURIComponent(cursor)}`)),
        marketContext(),
      );
      const body = await expectError(response, 400, "INVALID_CURSOR");
      expect(body.error.details).toEqual({ field: "cursor" });
    }
  });

  it("creates, replays, and exposes the current immutable ticket representation", async () => {
    const context = setup();
    const seeded = await seedRequest(context, {}, "service-ticket-request");
    const key = "service-ticket-create-key";
    const body = ticketBody(seeded.request.id);

    const created = await postTicket(body, { idempotencyKey: key });
    expect(created.status).toBe(201);
    expectProtectedHeaders(created);
    expect(created.headers.get("idempotency-replayed")).toBeNull();
    const createdBody = await responseJson<Record<string, unknown>>(created);
    expect(createdBody).toMatchObject({
      request_id: seeded.request.id,
      order_id: ORDER_ID,
      market: "au",
      action: "reship",
      reply: body.reply,
      status: "open",
      draft_version: "draft_synthetic_1",
      approval_id: "approval_synthetic_1",
      policy_version: "policy_synthetic_1",
      order_version: ORDER_VERSION,
      receipt: {
        request_id: seeded.request.id,
        action: "reship",
        request_status: "ticket_created",
      },
    });
    expect(createdBody).not.toHaveProperty("request");
    const ticketId = createdBody.ticket_id as string;
    expect(ticketId).toMatch(OPAQUE_ID);

    const read = await getServiceTicket(
      request(servicePath(`/tickets/${ticketId}`)),
      ticketContext(ticketId),
    );
    expect(read.status).toBe(200);
    expectProtectedHeaders(read);
    expect(await responseJson(read)).toEqual(createdBody);

    const replay = await postTicket(body, { idempotencyKey: key });
    expect(replay.status).toBe(200);
    expect(replay.headers.get("idempotency-replayed")).toBe("true");
    expect(await responseJson(replay)).toEqual(createdBody);

    context.tick(60_000);
    await context.adapter.advanceTicketStatus(context.service, ticketId, "closed");
    const closedReplay = await postTicket(body, { idempotencyKey: key });
    expect(closedReplay.status).toBe(200);
    expect(closedReplay.headers.get("idempotency-replayed")).toBe("true");
    const closedBody = await responseJson<Record<string, unknown>>(closedReplay);
    expect(closedBody).toMatchObject({ ticket_id: ticketId, status: "closed" });
    expect(closedBody.updated_at).not.toBe(createdBody.updated_at);

    const sameFingerprint = await postTicket(body, {
      idempotencyKey: "service-ticket-uniqueness-loser",
    });
    expect(sameFingerprint.status).toBe(200);
    expect(sameFingerprint.headers.get("idempotency-replayed")).toBe("true");
    expect(await responseJson(sameFingerprint)).toMatchObject({
      ticket_id: ticketId,
      status: "closed",
    });

    await expectError(
      await postTicket({ ...body, reply: "Different reply." }, { idempotencyKey: key }),
      409,
      "IDEMPOTENCY_CONFLICT",
    );
    await expectError(
      await postTicket(
        { ...body, reply: "Different reply." },
        { idempotencyKey: "service-ticket-different-key" },
      ),
      409,
      "REQUEST_STATE_CONFLICT",
    );

    const requestRead = await getServiceRequest(
      request(servicePath(`/requests/${seeded.request.id}`)),
      requestContext(seeded.request.id),
    );
    expect(await responseJson(requestRead)).toMatchObject({
      status: "ticket_created",
      ticket_id: ticketId,
      sequence: "1",
    });
    const feed = await listServiceRequests(
      request(servicePath("/requests")),
      marketContext(),
    );
    expect(await responseJson(feed)).toMatchObject({
      items: [expect.objectContaining({
        request_id: seeded.request.id,
        status: "ticket_created",
        ticket_id: ticketId,
      })],
    });
  });

  it("rejects stale order versions and unknown requests without changing request state", async () => {
    const context = setup();
    const pending = await seedRequest(context, {}, "stale-version-request");

    await expectError(
      await postTicket(
        { ...ticketBody(pending.request.id), order_version: "ov_stale" },
        { idempotencyKey: "stale-version-key" },
      ),
      409,
      "ORDER_VERSION_CONFLICT",
    );
    expect(
      await context.adapter.getServiceRequest(context.service, pending.request.id),
    ).toMatchObject({ status: "pending", ticketId: null });

    await expectError(
      await postTicket(ticketBody("asr_unknown"), {
        idempotencyKey: "unknown-request-key",
      }),
      404,
      "NOT_FOUND",
    );
    expect(
      (await context.adapter.listServiceRequests(context.service)).highWatermark,
    ).toBe("1");
  });

  it("validates ticket bodies, media type, size, and idempotency key before the port", async () => {
    const context = setup();
    const seeded = await seedRequest(context, {}, "ticket-validation-request");
    const createTicket = vi.spyOn(context.adapter, "createTicket");
    const valid = ticketBody(seeded.request.id);

    const cases: Array<{
      make: () => Promise<Response>;
      status: number;
      code: string;
      field?: string;
    }> = [
      {
        make: () => postTicket(valid, {
          idempotencyKey: "ticket-validation-key",
          contentType: "text/plain",
        }),
        status: 415,
        code: "UNSUPPORTED_MEDIA_TYPE",
      },
      {
        make: () => createServiceTicket(
          request("POST", servicePath("/tickets"), {
            idempotencyKey: "ticket-validation-key",
            contentType: "application/json",
            body: "{invalid",
          }),
          marketContext(),
        ),
        status: 400,
        code: "VALIDATION_ERROR",
        field: "body",
      },
      {
        make: () => postTicket({ ...valid, internal_note: "must not cross" }, {
          idempotencyKey: "ticket-validation-key",
        }),
        status: 400,
        code: "VALIDATION_ERROR",
        field: "body",
      },
      {
        make: () => postTicket({ ...valid, market: "sg" }, {
          idempotencyKey: "ticket-validation-key",
        }),
        status: 400,
        code: "VALIDATION_ERROR",
        field: "body",
      },
      {
        make: () => postTicket({ ...valid, request_id: "invalid request id" }, {
          idempotencyKey: "ticket-validation-key",
        }),
        status: 400,
        code: "VALIDATION_ERROR",
        field: "request_id",
      },
      {
        make: () => postTicket({ ...valid, action: "replace" }, {
          idempotencyKey: "ticket-validation-key",
        }),
        status: 400,
        code: "VALIDATION_ERROR",
        field: "action",
      },
      {
        make: () => postTicket({ ...valid, reply: " \n\t " }, {
          idempotencyKey: "ticket-validation-key",
        }),
        status: 400,
        code: "VALIDATION_ERROR",
        field: "reply",
      },
      {
        make: () => postTicket({ ...valid, reply: "😀".repeat(10_001) }, {
          idempotencyKey: "ticket-validation-key",
        }),
        status: 400,
        code: "VALIDATION_ERROR",
        field: "reply",
      },
      {
        make: () => postTicket({ ...valid, draft_version: "d".repeat(129) }, {
          idempotencyKey: "ticket-validation-key",
        }),
        status: 400,
        code: "VALIDATION_ERROR",
        field: "draft_version",
      },
      {
        make: () => postTicket({ ...valid, approval_id: "invalid approval id" }, {
          idempotencyKey: "ticket-validation-key",
        }),
        status: 400,
        code: "VALIDATION_ERROR",
        field: "approval_id",
      },
      {
        make: () => postTicket({ ...valid, approval_id: undefined }, {
          idempotencyKey: "ticket-validation-key",
        }),
        status: 400,
        code: "VALIDATION_ERROR",
        field: "approval_id",
      },
      {
        make: () => createServiceTicket(
          jsonRequest(servicePath("/tickets"), valid),
          marketContext(),
        ),
        status: 400,
        code: "VALIDATION_ERROR",
        field: "idempotency_key",
      },
      {
        make: () => postTicket(valid, { idempotencyKey: "bad key" }),
        status: 400,
        code: "VALIDATION_ERROR",
        field: "idempotency_key",
      },
      {
        make: () => createServiceTicket(
          jsonRequest(
            servicePath("/tickets"),
            { ...valid, padding: "x".repeat(140_000) },
            { idempotencyKey: "ticket-validation-key" },
          ),
          marketContext(),
        ),
        status: 400,
        code: "VALIDATION_ERROR",
        field: "body",
      },
    ];

    for (const item of cases) {
      const body = await expectError(await item.make(), item.status, item.code);
      if (item.field) expect(body.error.details).toEqual({ field: item.field });
    }
    expect(createTicket).not.toHaveBeenCalled();
    expect(
      await context.adapter.getServiceRequest(context.service, seeded.request.id),
    ).toMatchObject({ status: "pending", ticketId: null });
  });

  it("accepts the largest legal reply in code points, including surrogate escapes", async () => {
    const context = setup();
    const reply = "😀".repeat(10_000);

    const rawRequest = await seedRequest(context, {}, "max-reply-request-1");
    const raw = await postTicket(ticketBody(rawRequest.request.id, { reply }), {
      idempotencyKey: "max-reply-key-1",
    });
    expect(raw.status).toBe(201);
    expect((await responseJson<{ reply: string }>(raw)).reply).toBe(reply);

    const escapedRequest = await seedRequest(context, {}, "max-reply-request-2");
    const escaped = "\\ud83d\\ude00".repeat(10_000);
    const bodyText = JSON.stringify(ticketBody(escapedRequest.request.id, {
      reply: "__REPLY__",
    })).replace('"__REPLY__"', `"${escaped}"`);
    expect(bodyText.length).toBeGreaterThan(120_000);
    const escapedResponse = await createServiceTicket(
      request("POST", servicePath("/tickets"), {
        idempotencyKey: "max-reply-key-2",
        contentType: "application/json",
        body: bodyText,
      }),
      marketContext(),
    );
    expect(escapedResponse.status).toBe(201);
    expect((await responseJson<{ reply: string }>(escapedResponse)).reply).toBe(reply);

    const overflowRequest = await seedRequest(context, {}, "max-reply-request-3");
    const createTicket = vi.spyOn(context.adapter, "createTicket");
    await expectError(
      await postTicket(
        ticketBody(overflowRequest.request.id, { reply: "😀".repeat(10_001) }),
        { idempotencyKey: "max-reply-key-3" },
      ),
      400,
      "VALIDATION_ERROR",
    );
    expect(createTicket).not.toHaveBeenCalled();
    expect(
      await context.adapter.getServiceRequest(context.service, overflowRequest.request.id),
    ).toMatchObject({ status: "pending", ticketId: null });
  });

  it("distinguishes in-flight, currently unavailable, and recovered idempotency lookups", async () => {
    setup();
    await expectError(
      await getServiceTicketByIdempotencyKey(
        request(servicePath("/tickets/by-idempotency-key/unknown-key")),
        lookupContext("unknown-key"),
      ),
      404,
      "NOT_FOUND",
    );

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const context = setup({ beforeTicketCommit: () => gate });
    const seeded = await seedRequest(context, {}, "in-flight-request");
    const key = "in-flight-ticket-key";
    const pending = context.adapter.createTicket(
      context.service,
      {
        requestId: seeded.request.id,
        action: "reship",
        reply: "Synthetic final reply.",
        draftVersion: "draft_synthetic_1",
        approvalId: "approval_synthetic_1",
        policyVersion: "policy_synthetic_1",
        orderVersion: ORDER_VERSION,
      },
      { idempotencyKey: key },
    );

    const inFlight = await getServiceTicketByIdempotencyKey(
      request(servicePath(`/tickets/by-idempotency-key/${key}`)),
      lookupContext(key),
    );
    expect(inFlight.status).toBe(202);
    expectProtectedHeaders(inFlight);
    const inFlightBody = await responseJson<Record<string, unknown>>(inFlight);
    expect(inFlightBody).toEqual({ outcome: "IN_FLIGHT", retry_after_ms: 250 });
    expect(inFlightBody).not.toHaveProperty("ticket_id");

    release();
    const created = await pending;
    await Promise.resolve();

    const recovered = await getServiceTicketByIdempotencyKey(
      request(servicePath(`/tickets/by-idempotency-key/${key}`)),
      lookupContext(key),
    );
    expect(recovered.status).toBe(200);
    expectProtectedHeaders(recovered);
    expect(await responseJson(recovered)).toMatchObject({
      ticket_id: created.ticket.id,
      request_id: seeded.request.id,
    });

    await expectError(
      await getServiceTicketByIdempotencyKey(
        request(servicePath("/tickets/by-idempotency-key/invalid%20key")),
        lookupContext("invalid key"),
      ),
      400,
      "VALIDATION_ERROR",
    );
  });

  it("marks unknown lookup keys as retry-with-same-key rather than permanent absence", async () => {
    setup();
    const response = await getServiceTicketByIdempotencyKey(
      request(servicePath("/tickets/by-idempotency-key/never-used-key")),
      lookupContext("never-used-key"),
    );
    const body = await expectError(response, 404, "NOT_FOUND");
    expect(body.error).toMatchObject({
      retryable: false,
      recovery_action: "RETRY_CREATE_WITH_SAME_KEY",
    });
    expect(JSON.stringify(body)).not.toContain("LOOKUP_FIRST");
  });

  it("maps safe read failures to request retries and never leaks port request IDs", async () => {
    const context = setup();
    for (const [code, status] of [
      ["INTERNAL_ERROR", 500],
      ["UPSTREAM_UNAVAILABLE", 503],
    ] as const) {
      testState.port = {
        ...context.adapter,
        getServiceOrder: vi.fn().mockRejectedValue(
          createAfterSalesError({
            code,
            requestId: "port_generated_request",
            recoveryAction: "LOOKUP_FIRST",
            details: { retry_after_seconds: 3 },
          }),
        ),
      };
      const response = await getServiceOrder(
        request(servicePath(`/orders/${ORDER_ID}`)),
        orderContext(ORDER_ID),
      );
      const body = await expectError(response, status, code);
      expect(body.error).toMatchObject({
        retryable: true,
        recovery_action: "RETRY_REQUEST",
      });
      expect(body.error.request_id).not.toBe("port_generated_request");
      expect(response.headers.get("retry-after")).toBe(
        code === "UPSTREAM_UNAVAILABLE" ? "3" : null,
      );
    }
  });

  it("makes ticket creation uncertainty LOOKUP_FIRST and preserves Retry-After", async () => {
    const context = setup();
    const seeded = await seedRequest(context, {}, "uncertain-create-request");
    for (const [code, status] of [
      ["INTERNAL_ERROR", 500],
      ["UPSTREAM_UNAVAILABLE", 503],
    ] as const) {
      testState.port = {
        ...context.adapter,
        createTicket: vi.fn().mockRejectedValue(
          createAfterSalesError({
            code,
            requestId: "port_generated_request",
            retryable: true,
            recoveryAction: "RETRY_REQUEST",
            details: { retry_after_seconds: 15 },
          }),
        ),
      };
      const response = await postTicket(ticketBody(seeded.request.id), {
        idempotencyKey: `uncertain-create-${code}`,
      });
      const body = await expectError(response, status, code);
      expect(body.error).toMatchObject({
        retryable: false,
        recovery_action: "LOOKUP_FIRST",
      });
      expect(JSON.stringify(body)).not.toContain("RETRY_REQUEST");
      expect(response.headers.get("retry-after")).toBe(
        code === "UPSTREAM_UNAVAILABLE" ? "15" : null,
      );
    }
  });

  it("emits Retry-After only for rate limiting with a valid integer interval", async () => {
    const context = setup();
    for (const [retryAfterSeconds, expected] of [
      [7, "7"],
      [0, "0"],
      [1.5, null],
      [-1, null],
      [undefined, null],
    ] as const) {
      testState.port = {
        ...context.adapter,
        getServiceTicket: vi.fn().mockRejectedValue(
          createAfterSalesError({
            code: "RATE_LIMITED",
            requestId: "port_generated_request",
            details: retryAfterSeconds === undefined
              ? undefined
              : { retry_after_seconds: retryAfterSeconds },
          }),
        ),
      };
      const response = await getServiceTicket(
        request(servicePath("/tickets/tic_unknown")),
        ticketContext("tic_unknown"),
      );
      const body = await expectError(response, 429, "RATE_LIMITED");
      expect(body.error).toMatchObject({
        retryable: true,
        recovery_action: "RETRY_REQUEST",
      });
      expect(response.headers.get("retry-after")).toBe(expected);
    }
  });

  it("sanitizes unexpected failures without logging tokens, replies, or customer text", async () => {
    const context = setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const seeded = await seedRequest(context, {}, "leak-request");
    const reply = "SYNTHETIC_REPLY_MUST_NOT_LEAK";
    const cause = `raw cause ${TOKEN} epig_cart_au=secret`;
    testState.port = {
      ...context.adapter,
      createTicket: vi.fn().mockRejectedValue(new Error(cause)),
    };

    const response = await postTicket(ticketBody(seeded.request.id, { reply }), {
      idempotencyKey: "leak-key",
    });
    const body = await expectError(response, 500, "INTERNAL_ERROR");
    const serialized = JSON.stringify({
      body,
      consoleError: consoleError.mock.calls,
      consoleWarn: consoleWarn.mock.calls,
      adapterLogs: context.records,
    });
    expect(serialized).not.toContain("raw cause");
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(reply);
    expect(serialized).not.toContain("epig_cart_au");
  });
});
