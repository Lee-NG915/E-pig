import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockCatalogAdapter } from "@/adapters/commerce/mock/catalog";
import { createMockAfterSalesAdapter } from "@/adapters/after-sales/mock/after-sales";
import {
  createAfterSalesError,
  type AfterSalesOrder,
  type AfterSalesPort,
  type ConsumerPrincipal,
  type ServicePrincipal,
} from "@/core/contracts/after-sales";
import { getMarket } from "@/platform/config/markets";
import type { Logger } from "@/platform/logging/logger";
import { signCartCookie } from "@/platform/security/cart-cookie";

const testState = vi.hoisted(() => ({
  market: "au",
  appOrigin: "https://shop.example.test",
  cookieSecret: "synthetic-after-sales-cookie-secret-32-chars",
  port: null as unknown as AfterSalesPort,
}));

vi.mock("@/platform/config/env", () => ({
  env: {
    get MARKET() {
      return testState.market;
    },
    get APP_ORIGIN() {
      return testState.appOrigin;
    },
    get CART_COOKIE_SECRET() {
      return testState.cookieSecret;
    },
  },
}));

vi.mock("@/platform/registry", () => ({
  getCapabilities: () => ({ afterSales: testState.port }),
}));

import { POST as uploadAttachment } from "@/app/api/[market]/after-sales/attachments/route";
import { GET as getAttachmentContent } from "@/app/api/[market]/after-sales/attachments/[attachmentId]/content/route";
import { POST as createAfterSalesRequest } from "@/app/api/[market]/after-sales/requests/route";
import { GET as getAfterSalesRequest } from "@/app/api/[market]/after-sales/requests/[requestId]/route";
import { GET as getConsumerTicket } from "@/app/api/[market]/after-sales/tickets/[ticketId]/route";

const ORIGIN = "https://shop.example.test";
const SECRET = "synthetic-after-sales-cookie-secret-32-chars";
const CART_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CART_ID = "22222222-2222-4222-8222-222222222222";
const ORDER_ID = "ord_route_au";
const OTHER_ORDER_ID = "ord_route_other";
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PNG_BYTES = new Uint8Array(
  readFileSync(
    new URL(
      "../../../contracts/epig-after-sales/v1/fixtures/binary/synthetic-1x1.png",
      import.meta.url,
    ),
  ),
);

function order(id: string, ownerCartId: string): AfterSalesOrder {
  return {
    id,
    ownerCartId,
    market: "au",
    currency: "AUD",
    items: [],
    subtotalMinor: 0,
    shippingMinor: 0,
    taxMinor: 0,
    discountMinor: 0,
    totalMinor: 0,
    status: "fulfilled",
    createdAt: "2026-11-01T00:00:00Z",
    orderVersion: `ov_${id}_1`,
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

function setup() {
  const market = getMarket("au");
  const catalog = createMockCatalogAdapter({ market });
  const recorded = recordingLogger();
  let currentTime = new Date("2026-11-05T00:00:00.000Z");
  const adapter = createMockAfterSalesAdapter({
    catalog,
    market,
    logger: recorded.logger,
    now: () => new Date(currentTime),
    orders: [
      order(ORDER_ID, CART_ID),
      order(OTHER_ORDER_ID, OTHER_CART_ID),
    ],
  });
  const consumer: ConsumerPrincipal = {
    kind: "consumer",
    market: "au",
    cartId: CART_ID,
  };
  const otherConsumer: ConsumerPrincipal = {
    kind: "consumer",
    market: "au",
    cartId: OTHER_CART_ID,
  };
  const service: ServicePrincipal = {
    kind: "service",
    market: "au",
    actorId: "synthetic-dtc-service",
    allowedMarkets: ["au"],
  };
  testState.port = adapter;
  return {
    adapter,
    consumer,
    otherConsumer,
    service,
    records: recorded.records,
    tick(milliseconds: number) {
      currentTime = new Date(currentTime.getTime() + milliseconds);
    },
  };
}

function cookieHeader(
  cartId = CART_ID,
  market = "au",
  secret = SECRET,
  now?: number,
) {
  return `epig_cart_${market}=${signCartCookie(cartId, market, secret, now)}`;
}

function headers(options: {
  cookie?: string;
  origin?: string;
  secFetchSite?: string;
  version?: string | null;
  idempotencyKey?: string;
  contentType?: string;
} = {}) {
  return {
    ...(options.version === null
      ? {}
      : { "X-After-Sales-Contract-Version": options.version ?? "1" }),
    Origin: options.origin ?? ORIGIN,
    "Sec-Fetch-Site": options.secFetchSite ?? "same-origin",
    Cookie: options.cookie ?? cookieHeader(),
    ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    ...(options.contentType ? { "Content-Type": options.contentType } : {}),
  };
}

type RequestOptions = {
  body?: BodyInit | null;
  cookie?: string;
  origin?: string;
  secFetchSite?: string;
  version?: string | null;
  idempotencyKey?: string;
  contentType?: string;
};

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
    method,
    headers: headers(options),
    ...(options.body === undefined ? {} : { body: options.body }),
  });
}

function jsonRequest(
  path: string,
  body: unknown,
  options: {
    cookie?: string;
    origin?: string;
    secFetchSite?: string;
    version?: string | null;
    idempotencyKey?: string;
    contentType?: string;
  } = {},
) {
  return request("POST", path, {
    ...options,
    contentType: options.contentType ?? "application/json",
    body: JSON.stringify(body),
  });
}

function formRequest(
  form: FormData,
  options: {
    cookie?: string;
    origin?: string;
    secFetchSite?: string;
    version?: string | null;
  } = {},
) {
  return request("POST", "/api/au/after-sales/attachments", {
    ...options,
    body: form,
  });
}

function marketContext(market = "au") {
  return { params: Promise.resolve({ market }) };
}

function requestContext(requestId: string, market = "au") {
  return { params: Promise.resolve({ market, requestId }) };
}

function attachmentContext(attachmentId: string, market = "au") {
  return { params: Promise.resolve({ market, attachmentId }) };
}

function ticketContext(ticketId: string, market = "au") {
  return { params: Promise.resolve({ market, ticketId }) };
}

async function responseJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

function expectProtectedHeaders(response: Response) {
  expect(response.headers.get("x-after-sales-contract-version")).toBe("1");
  expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  expect(response.headers.get("vary")).toBe("Cookie");
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

function validCreateBody(overrides: Record<string, unknown> = {}) {
  return {
    order_id: ORDER_ID,
    type: "damaged",
    description: "The synthetic parcel arrived damaged.",
    ...overrides,
  };
}

async function uploadSyntheticAttachment(
  context: ReturnType<typeof setup>,
  options: {
    cookie?: string;
    orderId?: string;
    mediaType?: string;
    fileName?: string;
    bytes?: Uint8Array;
  } = {},
) {
  const form = new FormData();
  form.set("order_id", options.orderId ?? ORDER_ID);
  form.set(
    "file",
    new File(
      [Uint8Array.from(options.bytes ?? PNG_BYTES).buffer],
      options.fileName ?? "synthetic.png",
      { type: options.mediaType ?? "image/png" },
    ),
  );
  const response = await uploadAttachment(
    formRequest(form, { cookie: options.cookie }),
    marketContext(),
  );
  expect(response.status).toBe(201);
  return responseJson<{
    attachment_id: string;
    file_name: string;
    media_type: string;
    size_bytes: number;
  }>(response);
}

beforeEach(() => {
  testState.market = "au";
  testState.appOrigin = ORIGIN;
  testState.cookieSecret = SECRET;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("consumer after-sales Route Handlers", () => {
  it("creates a request with a raw owner DTO and replays its current representation", async () => {
    const context = setup();
    const attachment = await uploadSyntheticAttachment(context);
    const body = validCreateBody({ attachment_ids: [attachment.attachment_id] });
    const key = "request-key-synthetic-1";

    const created = await createAfterSalesRequest(
      jsonRequest("/api/au/after-sales/requests", body, {
        idempotencyKey: key,
        contentType: "application/json; charset=utf-8",
      }),
      marketContext(),
    );
    expect(created.status).toBe(201);
    expectProtectedHeaders(created);
    expect(created.headers.get("idempotency-replayed")).toBeNull();
    const createdBody = await responseJson<Record<string, unknown>>(created);
    expect(createdBody).toMatchObject({
      order_id: ORDER_ID,
      market: "au",
      type: "damaged",
      description: body.description,
      status: "pending",
      ticket_id: null,
    });
    expect(createdBody).not.toHaveProperty("request");
    expect(createdBody).not.toHaveProperty("sequence");
    const requestId = createdBody.request_id as string;

    const read = await getAfterSalesRequest(
      request("/api/au/after-sales/requests/id", {
        cookie: cookieHeader(CART_ID),
      }),
      requestContext(requestId),
    );
    expect(read.status).toBe(200);
    expectProtectedHeaders(read);
    expect(await responseJson(read)).toEqual(createdBody);

    const latest = await context.adapter.getServiceOrder(context.service, ORDER_ID);
    const ticket = await context.adapter.createTicket(
      context.service,
      {
        requestId,
        action: "reship",
        reply: "We will send a synthetic replacement.",
        draftVersion: "draft_synthetic_1",
        approvalId: "approval_synthetic_1",
        policyVersion: "policy_synthetic_1",
        orderVersion: latest.orderVersion,
      },
      { idempotencyKey: "ticket-key-synthetic-1" },
    );

    const replay = await createAfterSalesRequest(
      jsonRequest("/api/au/after-sales/requests", body, { idempotencyKey: key }),
      marketContext(),
    );
    expect(replay.status).toBe(200);
    expectProtectedHeaders(replay);
    expect(replay.headers.get("idempotency-replayed")).toBe("true");
    expect(await responseJson(replay)).toMatchObject({
      request_id: requestId,
      status: "ticket_created",
      ticket_id: ticket.ticket.id,
      progress: [{ status: "pending" }, { status: "ticket_created" }],
    });

    const consumerTicket = await getConsumerTicket(
      request("/api/au/after-sales/tickets/id"),
      ticketContext(ticket.ticket.id),
    );
    expect(consumerTicket.status).toBe(200);
    expectProtectedHeaders(consumerTicket);
    const ticketBody = await responseJson<Record<string, unknown>>(consumerTicket);
    expect(ticketBody).toMatchObject({
      ticket_id: ticket.ticket.id,
      request_id: requestId,
      order_id: ORDER_ID,
      reply: "We will send a synthetic replacement.",
    });
    expect(ticketBody).not.toHaveProperty("approval_id");
    expect(ticketBody).not.toHaveProperty("draft_version");
    expect(ticketBody).not.toHaveProperty("policy_version");
    expect(ticketBody).not.toHaveProperty("order_version");

    const feed = await context.adapter.listServiceRequests(context.service);
    expect(feed.items).toHaveLength(1);
  });

  it("stores and streams one exact private attachment without exposing storage metadata", async () => {
    setup();
    const form = new FormData();
    form.set("order_id", ORDER_ID);
    form.set(
      "file",
      new File([PNG_BYTES], "../../private/synthetic.png", { type: "image/png" }),
    );
    const uploaded = await uploadAttachment(formRequest(form), marketContext());
    expect(uploaded.status).toBe(201);
    expectProtectedHeaders(uploaded);
    const metadata = await responseJson<Record<string, unknown>>(uploaded);
    expect(metadata).toMatchObject({
      file_name: "synthetic.png",
      media_type: "image/png",
      size_bytes: PNG_BYTES.byteLength,
      status: "active",
    });
    expect(metadata).not.toHaveProperty("order_id");
    expect(metadata).not.toHaveProperty("storage_url");
    expect(metadata).not.toHaveProperty("bytes");

    const content = await getAttachmentContent(
      request("/api/au/after-sales/attachments/id/content"),
      attachmentContext(metadata.attachment_id as string),
    );
    expect(content.status).toBe(200);
    expectProtectedHeaders(content);
    expect(content.headers.get("content-type")).toBe("image/png");
    expect(content.headers.get("content-disposition")).toBe(
      'attachment; filename="synthetic.png"',
    );
    expect(new Uint8Array(await content.arrayBuffer())).toEqual(PNG_BYTES);
  });

  it("uses an ASCII-safe Content-Disposition while preserving a Unicode filename", async () => {
    const context = setup();
    const form = new FormData();
    form.set("order_id", ORDER_ID);
    form.set(
      "file",
      new File([PNG_BYTES], "../../private/售后.png", { type: "image/png" }),
    );
    const uploaded = await uploadAttachment(formRequest(form), marketContext());
    const metadata = await responseJson<{ attachment_id: string }>(uploaded);
    const content = await getAttachmentContent(
      request("/api/au/after-sales/attachments/id/content"),
      attachmentContext(metadata.attachment_id),
    );
    expect(content.status).toBe(200);
    expect(content.headers.get("content-disposition")).toBe(
      'attachment; filename="__.png"; filename*=UTF-8\'\'%E5%94%AE%E5%90%8E.png',
    );

    const longUnicodeName = `${"a".repeat(254)}😀`;
    const longAttachment = await uploadSyntheticAttachment(context, {
      fileName: longUnicodeName,
    });
    const longContent = await getAttachmentContent(
      request("/api/au/after-sales/attachments/id/content"),
      attachmentContext(longAttachment.attachment_id),
    );
    expect(longContent.status).toBe(200);
    expect(longContent.headers.get("content-disposition")).toContain(
      `filename*=UTF-8''${"a".repeat(254)}%F0%9F%98%80`,
    );
  });

  it("rejects missing, tampered, expired, and cross-market signed cookies", async () => {
    const context = setup();
    const getRequest = vi.spyOn(context.adapter, "getRequest");
    const cookieCases = [
      "",
      `epig_cart_au=${cookieHeader(CART_ID).split("=")[1]}x`,
      cookieHeader(CART_ID, "au", SECRET, 0),
      cookieHeader(CART_ID, "sg"),
      `epig_cart_sg=${signCartCookie(CART_ID, "sg", SECRET)}`,
      `epig_cart_au=${signCartCookie(CART_ID, "sg", SECRET)}`,
    ];

    for (const cookie of cookieCases) {
      const response = await getAfterSalesRequest(
        request("/api/au/after-sales/requests/id", { cookie }),
        requestContext("asr_unknown"),
      );
      await expectError(response, 401, "UNAUTHORIZED");
    }
    expect(getRequest).not.toHaveBeenCalled();
  });

  it("hides other consumers' orders, requests, tickets, and attachments as not found", async () => {
    const context = setup();
    const attachment = await uploadSyntheticAttachment(context);
    const created = await createAfterSalesRequest(
      jsonRequest(
        "/api/au/after-sales/requests",
        validCreateBody(),
        { idempotencyKey: "owner-request-key" },
      ),
      marketContext(),
    );
    const requestId = (await responseJson<{ request_id: string }>(created)).request_id;
    const latest = await context.adapter.getServiceOrder(context.service, ORDER_ID);
    const ticket = await context.adapter.createTicket(
      context.service,
      {
        requestId,
        action: "reship",
        reply: "Synthetic final reply.",
        draftVersion: "draft_synthetic_1",
        approvalId: "approval_synthetic_1",
        policyVersion: "policy_synthetic_1",
        orderVersion: latest.orderVersion,
      },
      { idempotencyKey: "owner-ticket-key" },
    );

    const otherCookie = cookieHeader(OTHER_CART_ID);
    await expectError(
      await getAfterSalesRequest(
        request("/api/au/after-sales/requests/id", { cookie: otherCookie }),
        requestContext(requestId),
      ),
      404,
      "NOT_FOUND",
    );
    await expectError(
      await getConsumerTicket(
        request("/api/au/after-sales/tickets/id", { cookie: otherCookie }),
        ticketContext(ticket.ticket.id),
      ),
      404,
      "NOT_FOUND",
    );
    await expectError(
      await getAttachmentContent(
        request("/api/au/after-sales/attachments/id/content", { cookie: otherCookie }),
        attachmentContext(attachment.attachment_id),
      ),
      404,
      "NOT_FOUND",
    );
    await expectError(
      await createAfterSalesRequest(
        jsonRequest(
          "/api/au/after-sales/requests",
          validCreateBody(),
          { cookie: otherCookie, idempotencyKey: "other-owner-order-key" },
        ),
        marketContext(),
      ),
      404,
      "NOT_FOUND",
    );

    const otherForm = new FormData();
    otherForm.set("order_id", ORDER_ID);
    otherForm.set("file", new File([PNG_BYTES], "other.png", { type: "image/png" }));
    await expectError(
      await uploadAttachment(
        formRequest(otherForm, { cookie: otherCookie }),
        marketContext(),
      ),
      404,
      "NOT_FOUND",
    );
  });

  it("rejects forged body principals and unknown resources without changing ownership", async () => {
    const context = setup();
    const created = await createAfterSalesRequest(
      jsonRequest(
        "/api/au/after-sales/requests",
        validCreateBody(),
        { idempotencyKey: "forged-principal-owner" },
      ),
      marketContext(),
    );
    expect(created.status).toBe(201);
    const ownedRequest = await responseJson<{ request_id: string }>(created);

    const queryLookup = await getAfterSalesRequest(
      request(
        `/api/au/after-sales/requests/id?cart_id=${OTHER_CART_ID}&user_id=forged-user`,
      ),
      requestContext(ownedRequest.request_id),
    );
    expect(queryLookup.status).toBe(200);
    expect(await responseJson<{ request_id: string }>(queryLookup)).toMatchObject({
      request_id: ownedRequest.request_id,
    });

    await expectError(
      await createAfterSalesRequest(
        jsonRequest(
          "/api/au/after-sales/requests",
          validCreateBody({ cart_id: "forged-cart" }),
          { idempotencyKey: "forged-principal-key" },
        ),
        marketContext(),
      ),
      400,
      "VALIDATION_ERROR",
    );
    await expectError(
      await getAfterSalesRequest(
        request("/api/au/after-sales/requests/id"),
        requestContext("asr_unknown"),
      ),
      404,
      "NOT_FOUND",
    );
    await expectError(
      await getConsumerTicket(
        request("/api/au/after-sales/tickets/id"),
        ticketContext("tic_unknown"),
      ),
      404,
      "NOT_FOUND",
    );
    await expectError(
      await getAttachmentContent(
        request("/api/au/after-sales/attachments/id/content"),
        attachmentContext("att_unknown"),
      ),
      404,
      "NOT_FOUND",
    );
    expect(await context.adapter.listServiceRequests(context.service)).toMatchObject({
      items: [expect.objectContaining({ status: "pending" })],
      highWatermark: "1",
    });
  });

  it("returns a conflict for a reused key with a different fingerprint without writing again", async () => {
    const context = setup();
    const key = "same-key-different-fingerprint";
    const first = await createAfterSalesRequest(
      jsonRequest(
        "/api/au/after-sales/requests",
        validCreateBody(),
        { idempotencyKey: key },
      ),
      marketContext(),
    );
    expect(first.status).toBe(201);

    const conflict = await createAfterSalesRequest(
      jsonRequest(
        "/api/au/after-sales/requests",
        validCreateBody({ description: "A different synthetic description." }),
        { idempotencyKey: key },
      ),
      marketContext(),
    );
    await expectError(conflict, 409, "IDEMPOTENCY_CONFLICT");
    const feed = await context.adapter.listServiceRequests(context.service);
    expect(feed).toMatchObject({
      items: [expect.objectContaining({ status: "pending" })],
      highWatermark: "1",
    });
  });

  it.each(["jp", "AU", ""])(
    "rejects invalid market path %j as validation",
    async (market) => {
      setup();
      const response = await getAfterSalesRequest(
        request("/api/invalid/after-sales/requests/id"),
        requestContext("asr_unknown", market),
      );
      await expectError(response, 400, "VALIDATION_ERROR");
    },
  );

  it("returns not found for a valid market not served by this process", async () => {
    const context = setup();
    const getRequest = vi.spyOn(context.adapter, "getRequest");
    const response = await getAfterSalesRequest(
      request("/api/us/after-sales/requests/id", {
        cookie: cookieHeader(CART_ID, "us"),
      }),
      requestContext("asr_unknown", "us"),
    );
    await expectError(response, 404, "NOT_FOUND");
    expect(getRequest).not.toHaveBeenCalled();
  });

  it.each([null, "2", "", "1, 2"])(
    "requires exact contract version %j before reading the port",
    async (version) => {
      const context = setup();
      const getRequest = vi.spyOn(context.adapter, "getRequest");
      const response = await getAfterSalesRequest(
        request("/api/au/after-sales/requests/id", { version }),
        requestContext("asr_unknown"),
      );
      const body = await expectError(response, 400, "UNSUPPORTED_CONTRACT_VERSION");
      expect(body.error.details).toEqual({ supported_major: "1" });
      expect(getRequest).not.toHaveBeenCalled();
    },
  );

  it.each(["", "too-short"])(
    "fails closed when the cookie secret is not configured safely",
    async (secret) => {
      const context = setup();
      testState.cookieSecret = secret;
      const getRequest = vi.spyOn(context.adapter, "getRequest");
      const response = await getAfterSalesRequest(
        request("/api/au/after-sales/requests/id"),
        requestContext("asr_unknown"),
      );
      const body = await expectError(response, 500, "INTERNAL_ERROR");
      expect(JSON.stringify(body)).not.toContain("secret");
      expect(getRequest).not.toHaveBeenCalled();
    },
  );

  it("requires trusted origin and rejects cross-site POSTs before the port", async () => {
    const context = setup();
    const create = vi.spyOn(context.adapter, "createRequest");
    const upload = vi.spyOn(context.adapter, "uploadAttachment");
    const body = validCreateBody();
    const cases = [
      { origin: "https://foreign.example.test" },
      { origin: "" },
      { secFetchSite: "cross-site" },
    ];

    for (const overrides of cases) {
      await expectError(
        await createAfterSalesRequest(
          jsonRequest(
            "/api/au/after-sales/requests",
            body,
            { idempotencyKey: "cross-site-request", ...overrides },
          ),
          marketContext(),
        ),
        401,
        "UNAUTHORIZED",
      );
    }
    const form = new FormData();
    form.set("order_id", ORDER_ID);
    form.set("file", new File([PNG_BYTES], "cross.png", { type: "image/png" }));
    await expectError(
      await uploadAttachment(
        formRequest(form, { secFetchSite: "cross-site" }),
        marketContext(),
      ),
      401,
      "UNAUTHORIZED",
    );

    expect(create).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect((await context.adapter.listServiceRequests(context.service)).highWatermark).toBe("0");
  });

  it.each(["", "not-a-valid-origin"])(
    "fails closed without a trusted APP_ORIGIN before a POST write: %j",
    async (origin) => {
      const context = setup();
      testState.appOrigin = origin;
      const create = vi.spyOn(context.adapter, "createRequest");
      const response = await createAfterSalesRequest(
        jsonRequest(
          "/api/au/after-sales/requests",
          validCreateBody(),
          { idempotencyKey: "missing-origin" },
        ),
        marketContext(),
      );
      await expectError(response, 500, "INTERNAL_ERROR");
      expect(create).not.toHaveBeenCalled();
    },
  );

  it("validates JSON media type, size, shape, IDs, type, description, and key", async () => {
    const context = setup();
    const create = vi.spyOn(context.adapter, "createRequest");
    const cases: Array<{
      request: Request;
      status?: number;
      field?: string;
    }> = [
      {
        request: request("POST", "/api/au/after-sales/requests", {
          body: JSON.stringify(validCreateBody()),
          contentType: "text/plain",
          idempotencyKey: "valid-key",
        }),
        status: 415,
      },
      {
        request: request("POST", "/api/au/after-sales/requests", {
          body: "{invalid",
          contentType: "application/json",
          idempotencyKey: "valid-key",
        }),
        status: 400,
      },
      {
        request: jsonRequest(
          "/api/au/after-sales/requests",
          validCreateBody({ internal_note: "must not cross boundary" }),
          { idempotencyKey: "valid-key" },
        ),
        status: 400,
      },
      {
        request: jsonRequest(
          "/api/au/after-sales/requests",
          validCreateBody({ order_id: "invalid order id" }),
          { idempotencyKey: "valid-key" },
        ),
        status: 400,
      },
      {
        request: jsonRequest(
          "/api/au/after-sales/requests",
          validCreateBody({ type: "replacement" }),
          { idempotencyKey: "valid-key" },
        ),
        status: 400,
      },
      {
        request: jsonRequest(
          "/api/au/after-sales/requests",
          validCreateBody({ description: " \n\t " }),
          { idempotencyKey: "valid-key" },
        ),
        status: 400,
      },
      {
        request: jsonRequest(
          "/api/au/after-sales/requests",
          validCreateBody({ description: "x".repeat(5001) }),
          { idempotencyKey: "valid-key" },
        ),
        status: 400,
      },
      {
        request: jsonRequest(
          "/api/au/after-sales/requests",
          validCreateBody({
            attachment_ids: ["att_1", "att_2", "att_3", "att_4"],
          }),
          { idempotencyKey: "valid-key" },
        ),
        status: 400,
      },
      {
        request: jsonRequest(
          "/api/au/after-sales/requests",
          validCreateBody({ attachment_ids: ["att_1", "att_1"] }),
          { idempotencyKey: "valid-key" },
        ),
        status: 400,
      },
      {
        request: request("POST", "/api/au/after-sales/requests", {
          body: JSON.stringify(validCreateBody()),
          contentType: "application/json",
        }),
        status: 400,
      },
      {
        request: jsonRequest(
          "/api/au/after-sales/requests",
          validCreateBody(),
          { idempotencyKey: "invalid key" },
        ),
        status: 400,
      },
      {
        request: jsonRequest(
          "/api/au/after-sales/requests",
          validCreateBody({ idempotency_key: "body-key-must-not-be-authority" }),
          { idempotencyKey: "header-key-is-authority" },
        ),
        status: 400,
      },
      {
        request: request("POST", "/api/au/after-sales/requests", {
          body: JSON.stringify({
            ...validCreateBody(),
            padding: "x".repeat(65_536),
          }),
          contentType: "application/json",
          idempotencyKey: "oversized-json",
        }),
        status: 400,
      },
    ];

    for (const item of cases) {
      await expectError(
        await createAfterSalesRequest(item.request, marketContext()),
        item.status ?? 400,
        item.status === 415 ? "UNSUPPORTED_MEDIA_TYPE" : "VALIDATION_ERROR",
      );
    }
    expect(create).not.toHaveBeenCalled();
  });

  it("round-trips a 5000-code-point emoji description through the JSON body limit", async () => {
    setup();
    const description = "😀".repeat(5000);
    const body = validCreateBody({ description });
    const bodyBytes = new TextEncoder().encode(JSON.stringify(body)).byteLength;
    expect(bodyBytes).toBeGreaterThan(16_384);
    expect(bodyBytes).toBeLessThanOrEqual(24_576);

    const created = await createAfterSalesRequest(
      jsonRequest("/api/au/after-sales/requests", body, {
        idempotencyKey: "unicode-description-boundary",
      }),
      marketContext(),
    );
    expect(created.status).toBe(201);
    const createdBody = await responseJson<{
      request_id: string;
      description: string;
    }>(created);
    expect(createdBody.description).toBe(description);

    const read = await getAfterSalesRequest(
      request("/api/au/after-sales/requests/id"),
      requestContext(createdBody.request_id),
    );
    expect(read.status).toBe(200);
    expect((await responseJson<{ description: string }>(read)).description).toBe(description);
  });

  it("round-trips a 5000-code-point surrogate-escaped description through the JSON body limit", async () => {
    setup();
    const description = "😀".repeat(5000);
    const escapedBody = JSON.stringify(validCreateBody({ description })).replaceAll(
      "😀",
      "\\ud83d\\ude00",
    );
    expect(escapedBody).not.toContain("😀");
    const bodyBytes = new TextEncoder().encode(escapedBody).byteLength;
    expect(bodyBytes).toBeGreaterThan(24_576);
    expect(bodyBytes).toBeLessThanOrEqual(65_536);

    const created = await createAfterSalesRequest(
      request("POST", "/api/au/after-sales/requests", {
        body: escapedBody,
        contentType: "application/json",
        idempotencyKey: "surrogate-escaped-description-boundary",
      }),
      marketContext(),
    );
    expect(created.status).toBe(201);
    const createdBody = await responseJson<{
      request_id: string;
      description: string;
    }>(created);
    expect(createdBody.description).toBe(description);

    const read = await getAfterSalesRequest(
      request("/api/au/after-sales/requests/id"),
      requestContext(createdBody.request_id),
    );
    expect(read.status).toBe(200);
    expect((await responseJson<{ description: string }>(read)).description).toBe(description);
  });

  it("rejects a 5001-code-point surrogate-escaped description without writing", async () => {
    const context = setup();
    const create = vi.spyOn(context.adapter, "createRequest");
    const escapedBody = JSON.stringify(
      validCreateBody({ description: "😀".repeat(5001) }),
    ).replaceAll("😀", "\\ud83d\\ude00");
    const bodyBytes = new TextEncoder().encode(escapedBody).byteLength;
    expect(bodyBytes).toBeGreaterThan(24_576);
    expect(bodyBytes).toBeLessThanOrEqual(65_536);

    const rejected = await createAfterSalesRequest(
      request("POST", "/api/au/after-sales/requests", {
        body: escapedBody,
        contentType: "application/json",
        idempotencyKey: "surrogate-escaped-description-overflow",
      }),
      marketContext(),
    );
    await expectError(rejected, 400, "VALIDATION_ERROR");
    expect(create).not.toHaveBeenCalled();
    expect(await context.adapter.listServiceRequests(context.service)).toMatchObject({
      items: [],
      highWatermark: "0",
    });
  });

  it("rejects a 5001-code-point emoji description without another business write", async () => {
    const context = setup();
    const create = vi.spyOn(context.adapter, "createRequest");
    const accepted = await createAfterSalesRequest(
      jsonRequest(
        "/api/au/after-sales/requests",
        validCreateBody({ description: "😀".repeat(5000) }),
        { idempotencyKey: "unicode-watermark-accepted" },
      ),
      marketContext(),
    );
    expect(accepted.status).toBe(201);
    create.mockClear();

    const rejected = await createAfterSalesRequest(
      jsonRequest(
        "/api/au/after-sales/requests",
        validCreateBody({ description: "😀".repeat(5001) }),
        { idempotencyKey: "unicode-watermark-rejected" },
      ),
      marketContext(),
    );
    await expectError(rejected, 400, "VALIDATION_ERROR");
    expect(create).not.toHaveBeenCalled();
    expect(await context.adapter.listServiceRequests(context.service)).toMatchObject({
      items: [expect.objectContaining({ description: "😀".repeat(5000) })],
      highWatermark: "1",
    });
  });

  it("rejects malformed, extra, duplicate, oversized, and spoofed multipart uploads", async () => {
    const context = setup();
    const upload = vi.spyOn(context.adapter, "uploadAttachment");
    const extra = new FormData();
    extra.set("order_id", ORDER_ID);
    extra.set("file", new File([PNG_BYTES], "extra.png", { type: "image/png" }));
    extra.set("internal_note", "must not cross boundary");

    const duplicateOrder = new FormData();
    duplicateOrder.append("order_id", ORDER_ID);
    duplicateOrder.append("order_id", ORDER_ID);
    duplicateOrder.set("file", new File([PNG_BYTES], "duplicate.png", { type: "image/png" }));

    const duplicateFile = new FormData();
    duplicateFile.set("order_id", ORDER_ID);
    duplicateFile.append("file", new File([PNG_BYTES], "one.png", { type: "image/png" }));
    duplicateFile.append("file", new File([PNG_BYTES], "two.png", { type: "image/png" }));

    const unsupported = new FormData();
    unsupported.set("order_id", ORDER_ID);
    unsupported.set("file", new File(["plain text"], "note.txt", { type: "text/plain" }));

    const spoofed = new FormData();
    spoofed.set("order_id", ORDER_ID);
    spoofed.set(
      "file",
      new File([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])], "spoof.png", {
        type: "image/png",
      }),
    );

    const oversizedBytes = new Uint8Array(5_242_881);
    oversizedBytes.set(PNG_BYTES);
    const oversized = new FormData();
    oversized.set("order_id", ORDER_ID);
    oversized.set(
      "file",
      new File([oversizedBytes], "oversized.png", { type: "image/png" }),
    );

    const missingOrder = new FormData();
    missingOrder.set(
      "file",
      new File([PNG_BYTES], "missing-order.png", { type: "image/png" }),
    );
    const missingFile = new FormData();
    missingFile.set("order_id", ORDER_ID);
    const stringFile = new FormData();
    stringFile.set("order_id", ORDER_ID);
    stringFile.set("file", "not-a-file");

    for (const form of [
      extra,
      duplicateOrder,
      duplicateFile,
      missingOrder,
      missingFile,
      stringFile,
    ]) {
      await expectError(
        await uploadAttachment(formRequest(form), marketContext()),
        400,
        "VALIDATION_ERROR",
      );
    }
    await expectError(
      await uploadAttachment(formRequest(unsupported), marketContext()),
      415,
      "UNSUPPORTED_MEDIA_TYPE",
    );
    await expectError(
      await uploadAttachment(formRequest(spoofed), marketContext()),
      415,
      "UNSUPPORTED_MEDIA_TYPE",
    );
    const tooLarge = await expectError(
      await uploadAttachment(formRequest(oversized), marketContext()),
      413,
      "ATTACHMENT_TOO_LARGE",
    );
    expect(tooLarge.error.details).toEqual({ max_size_bytes: 5_242_880 });

    const declaredTooLarge = new Request(
      `${ORIGIN}/api/au/after-sales/attachments`,
      {
        method: "POST",
        headers: {
          ...headers({
            contentType: "multipart/form-data; boundary=synthetic",
          }),
          "Content-Length": "5308417",
        },
        body: "x",
      },
    );
    await expectError(
      await uploadAttachment(declaredTooLarge, marketContext()),
      413,
      "ATTACHMENT_TOO_LARGE",
    );

    await expectError(
      await uploadAttachment(
        request("POST", "/api/au/after-sales/attachments", {
          body: "not multipart",
          contentType: "multipart/form-data; boundary=broken",
        }),
        marketContext(),
      ),
      400,
      "VALIDATION_ERROR",
    );
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("returns 410 for an expired attachment", async () => {
    const context = setup();
    const attachment = await uploadSyntheticAttachment(context);
    context.tick(8 * 24 * 60 * 60 * 1000);
    await expectError(
      await getAttachmentContent(
        request("/api/au/after-sales/attachments/id/content"),
        attachmentContext(attachment.attachment_id),
      ),
      410,
      "ATTACHMENT_EXPIRED",
    );
  });

  it("maps safe GET internal and upstream failures to request retries", async () => {
    const context = setup();
    for (const [code, status] of [
      ["INTERNAL_ERROR", 500],
      ["UPSTREAM_UNAVAILABLE", 503],
    ] as const) {
      testState.port = {
        ...context.adapter,
        getRequest: vi.fn().mockRejectedValue(
          createAfterSalesError({
            code,
            requestId: "port_generated_request",
            recoveryAction: "LOOKUP_FIRST",
            details: { retry_after_seconds: 3 },
          }),
        ),
      };
      const response = await getAfterSalesRequest(
        request("/api/au/after-sales/requests/id"),
        requestContext("asr_unknown"),
      );
      const body = await expectError(response, status, code);
      expect(body.error).toMatchObject({
        retryable: true,
        recovery_action: "RETRY_REQUEST",
      });
      expect(response.headers.get("retry-after")).toBe(code === "UPSTREAM_UNAVAILABLE" ? "3" : null);
      expect(body.error.request_id).not.toBe("port_generated_request");
    }
  });

  it("uses the same-key recovery for request create failures and never leaks LOOKUP_FIRST", async () => {
    const context = setup();
    for (const [code, status] of [
      ["INTERNAL_ERROR", 500],
      ["UPSTREAM_UNAVAILABLE", 503],
    ] as const) {
      testState.port = {
        ...context.adapter,
        createRequest: vi.fn().mockRejectedValue(
          createAfterSalesError({
            code,
            requestId: "port_generated_request",
            recoveryAction: "LOOKUP_FIRST",
            details: { retry_after_seconds: 2 },
          }),
        ),
      };
      const response = await createAfterSalesRequest(
        jsonRequest(
          "/api/au/after-sales/requests",
          validCreateBody(),
          { idempotencyKey: `failure-same-key-${code}` },
        ),
        marketContext(),
      );
      const body = await expectError(response, status, code);
      expect(body.error).toMatchObject({
        retryable: false,
        recovery_action: "RETRY_CREATE_WITH_SAME_KEY",
      });
      expect(response.headers.get("retry-after")).toBe(
        code === "UPSTREAM_UNAVAILABLE" ? "2" : null,
      );
      expect(JSON.stringify(body)).not.toContain("LOOKUP_FIRST");
    }
  });

  it("does not claim an upload can be looked up or blindly recreated", async () => {
    const context = setup();
    for (const [code, status] of [
      ["INTERNAL_ERROR", 500],
      ["UPSTREAM_UNAVAILABLE", 503],
    ] as const) {
      testState.port = {
        ...context.adapter,
        uploadAttachment: vi.fn().mockRejectedValue(
          createAfterSalesError({
            code,
            requestId: "port_generated_request",
            recoveryAction: "LOOKUP_FIRST",
          }),
        ),
      };
      const form = new FormData();
      form.set("order_id", ORDER_ID);
      form.set("file", new File([PNG_BYTES], "failure.png", { type: "image/png" }));
      const body = await expectError(
        await uploadAttachment(formRequest(form), marketContext()),
        status,
        code,
      );
      expect(body.error).toMatchObject({
        retryable: false,
        recovery_action: "RECONCILE_MANUALLY",
      });
    }
  });

  it("emits Retry-After only for rate limiting with a valid retry interval", async () => {
    const context = setup();
    testState.port = {
      ...context.adapter,
      getConsumerTicket: vi.fn().mockRejectedValue(
        createAfterSalesError({
          code: "RATE_LIMITED",
          requestId: "port_generated_request",
          details: { retry_after_seconds: 7 },
        }),
      ),
    };
    const response = await getConsumerTicket(
      request("/api/au/after-sales/tickets/id"),
      ticketContext("tic_unknown"),
    );
    const body = await expectError(response, 429, "RATE_LIMITED");
    expect(body.error).toMatchObject({
      retryable: true,
      recovery_action: "RETRY_REQUEST",
    });
    expect(response.headers.get("retry-after")).toBe("7");
  });

  it.each([undefined, -1, 1.5])(
    "omits Retry-After when retry_after_seconds is not a nonnegative integer: %j",
    async (retryAfterSeconds) => {
      const context = setup();
      testState.port = {
        ...context.adapter,
        getConsumerTicket: vi.fn().mockRejectedValue(
          createAfterSalesError({
            code: "RATE_LIMITED",
            requestId: "port_generated_request",
            details: retryAfterSeconds === undefined
              ? undefined
              : { retry_after_seconds: retryAfterSeconds },
          }),
        ),
      };
      const response = await getConsumerTicket(
        request("/api/au/after-sales/tickets/id"),
        ticketContext("tic_unknown"),
      );
      await expectError(response, 429, "RATE_LIMITED");
      expect(response.headers.get("retry-after")).toBeNull();
    },
  );

  it("sanitizes unexpected causes and never logs customer content or credentials", async () => {
    const context = setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const description = "SYNTHETIC_DESCRIPTION_MUST_NOT_LEAK";
    const cause = `raw cause ${cookieHeader()} synthetic-secret`;
    testState.port = {
      ...context.adapter,
      createRequest: vi.fn().mockRejectedValue(new Error(cause)),
    };
    const response = await createAfterSalesRequest(
      jsonRequest(
        "/api/au/after-sales/requests",
        validCreateBody({ description }),
        { idempotencyKey: "unexpected-error" },
      ),
      marketContext(),
    );
    const body = await expectError(response, 500, "INTERNAL_ERROR");
    const serialized = JSON.stringify({
      body,
      httpLogs: consoleError.mock.calls,
      adapterLogs: context.records,
    });
    expect(serialized).not.toContain("raw cause");
    expect(serialized).not.toContain("synthetic-secret");
    expect(serialized).not.toContain(description);
    expect(serialized).not.toContain(cookieHeader());
  });

  it("rejects invalid resource IDs before calling the port", async () => {
    const context = setup();
    const getRequest = vi.spyOn(context.adapter, "getRequest");
    const getTicket = vi.spyOn(context.adapter, "getConsumerTicket");
    const getContent = vi.spyOn(context.adapter, "getAttachmentContent");

    await expectError(
      await getAfterSalesRequest(
        request("/api/au/after-sales/requests/id"),
        requestContext("invalid id"),
      ),
      400,
      "VALIDATION_ERROR",
    );
    await expectError(
      await getConsumerTicket(
        request("/api/au/after-sales/tickets/id"),
        ticketContext("x".repeat(129)),
      ),
      400,
      "VALIDATION_ERROR",
    );
    await expectError(
      await getAttachmentContent(
        request("/api/au/after-sales/attachments/id/content"),
        attachmentContext(""),
      ),
      400,
      "VALIDATION_ERROR",
    );
    expect(getRequest).not.toHaveBeenCalled();
    expect(getTicket).not.toHaveBeenCalled();
    expect(getContent).not.toHaveBeenCalled();
  });
});
