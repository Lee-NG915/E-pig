import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type {
  AfterSalesMediaType,
  ConsumerPrincipal,
  CreateServiceTicketInput,
  ServicePrincipal,
} from "@/core/contracts/after-sales";
import { encodeFeedCursor } from "@/core/contracts/after-sales";
import { createMockCatalogAdapter } from "@/adapters/commerce/mock/catalog";
import { getMarket, type MarketId } from "@/platform/config/markets";
import type { Logger } from "@/platform/logging/logger";

import {
  createMockAfterSalesAdapter,
  mockAfterSalesCartId,
  mockAfterSalesOrderId,
  type MockAfterSalesAdapterOptions,
} from "./after-sales";

const PNG_BYTES = new Uint8Array(
  readFileSync(
    new URL(
      "../../../../contracts/epig-after-sales/v1/fixtures/binary/synthetic-1x1.png",
      import.meta.url,
    ),
  ),
);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

function recordingLogger() {
  const calls: Array<{ event: string; fields?: Record<string, unknown> }> = [];
  const logger: Logger = {
    debug: (event, fields) => calls.push({ event, fields }),
    info: (event, fields) => calls.push({ event, fields }),
    warn: (event, fields) => calls.push({ event, fields }),
    error: (event, fields) => calls.push({ event, fields }),
  };
  return { logger, calls };
}

function setup(
  marketId: MarketId = "au",
  options: Omit<MockAfterSalesAdapterOptions, "catalog" | "market" | "logger" | "now"> = {},
) {
  const market = getMarket(marketId);
  const catalog = createMockCatalogAdapter({ market });
  let currentTime = new Date("2026-11-05T00:00:00.000Z");
  const recorded = recordingLogger();
  const adapter = createMockAfterSalesAdapter({
    catalog,
    market,
    logger: recorded.logger,
    now: () => new Date(currentTime),
    ...options,
  });
  const consumer: ConsumerPrincipal = {
    kind: "consumer",
    market: marketId,
    cartId: mockAfterSalesCartId(marketId),
  };
  const service: ServicePrincipal = {
    kind: "service",
    market: marketId,
    actorId: "dtc-service-test",
    allowedMarkets: [marketId],
  };
  return {
    adapter,
    catalog,
    market,
    consumer,
    service,
    logs: recorded.calls,
    tick: (milliseconds: number) => {
      currentTime = new Date(currentTime.getTime() + milliseconds);
    },
  };
}

async function createRequest(
  context: ReturnType<typeof setup>,
  overrides: Partial<{
    orderId: string;
    type: "damaged" | "wrong_item" | "return" | "other";
    description: string;
    attachmentIds: string[];
  }> = {},
  key = crypto.randomUUID(),
) {
  return context.adapter.createRequest(
    context.consumer,
    {
      orderId: mockAfterSalesOrderId(context.market.id),
      type: "damaged",
      description: "Synthetic issue.",
      ...overrides,
    },
    { idempotencyKey: key },
  );
}

function upload(
  context: ReturnType<typeof setup>,
  mediaType: AfterSalesMediaType = "image/png",
  bytes = PNG_BYTES,
  fileName = "synthetic.png",
  orderId = mockAfterSalesOrderId(context.market.id),
) {
  return context.adapter.uploadAttachment(context.consumer, {
    orderId,
    fileName,
    mediaType,
    bytes,
  });
}

async function createTicket(
  context: ReturnType<typeof setup>,
  requestId: string,
  orderVersion: string,
  overrides: Partial<CreateServiceTicketInput> = {},
  key = crypto.randomUUID(),
) {
  return context.adapter.createTicket(
    context.service,
    {
      requestId,
      action: "reship",
      reply: "Synthetic final reply.",
      draftVersion: "draft_synthetic_1",
      approvalId: "approval_synthetic_1",
      policyVersion: "policy_synthetic_1",
      orderVersion,
      ...overrides,
    },
    { idempotencyKey: key },
  );
}

describe("mock after-sales adapter", () => {
  it.each<MarketId>(["au", "sg", "us"])(
    "serves %s synthetic service orders backed by the catalog",
    async (marketId) => {
      const context = setup(marketId);
      const order = await context.adapter.getServiceOrder(
        context.service,
        mockAfterSalesOrderId(marketId),
      );
      const product = await context.catalog.getProduct(order.items[0].productId);
      const variant = product.variants.find((item) => item.id === order.items[0].variantId);

      expect(order).toMatchObject({
        market: marketId,
        currency: context.market.currency,
        status: "fulfilled",
      });
      expect(variant).toBeDefined();
      expect(order.items[0]).toMatchObject({
        sku: variant!.sku,
        name: product.name,
        unitPriceMinor: Math.round(variant!.price.amount * 100),
      });
      expect(Number.isInteger(order.totalMinor)).toBe(true);
      expect(order.totalMinor).toBe(
        order.items.reduce((sum, item) => sum + item.lineTotalMinor, 0)
          + order.shippingMinor
          - order.discountMinor
          + order.taxMinor,
      );
    },
  );

  it("enforces service market authorization and resource-market ownership", async () => {
    const context = setup("au");
    await expect(context.adapter.getServiceOrder(
      { ...context.service, allowedMarkets: ["us"] },
      mockAfterSalesOrderId("au"),
    )).rejects.toMatchObject({ code: "FORBIDDEN_MARKET" });
    await expect(context.adapter.getServiceOrder(
      context.service,
      mockAfterSalesOrderId("sg"),
    )).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(context.adapter.createRequest(
      { ...context.consumer, cartId: "another-cart" },
      {
        orderId: mockAfterSalesOrderId("au"),
        type: "damaged",
        description: "Synthetic issue.",
      },
      { idempotencyKey: "wrong-owner" },
    )).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("validates private attachment magic, media type, owner, size, filename, and expiration", async () => {
    const context = setup();
    const attachment = await upload(
      context,
      "image/png",
      PNG_BYTES,
      "../../private/synthetic.png",
    );
    expect(attachment.fileName).toBe("synthetic.png");
    expect(attachment).not.toHaveProperty("storageUrl");
    expect(await context.adapter.getAttachmentContent(context.consumer, attachment.id)).toMatchObject({
      fileName: "synthetic.png",
      mediaType: "image/png",
      sizeBytes: PNG_BYTES.byteLength,
    });
    expect(
      (await context.adapter.getAttachmentContent(context.service, attachment.id)).bytes,
    ).toEqual(PNG_BYTES);
    await expect(context.adapter.getAttachmentContent(
      { ...context.consumer, market: "us" },
      attachment.id,
    )).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(context.adapter.getAttachmentContent(
      { ...context.service, allowedMarkets: ["us"] },
      attachment.id,
    )).rejects.toMatchObject({ code: "FORBIDDEN_MARKET" });
    await expect(context.adapter.getAttachmentContent(
      { ...context.consumer, cartId: "another-cart" },
      attachment.id,
    )).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(upload(context, "image/png", JPEG_BYTES)).rejects.toMatchObject({
      code: "UNSUPPORTED_MEDIA_TYPE",
    });
    await expect(upload(
      context,
      "image/png",
      new Uint8Array(5_242_881),
    )).rejects.toMatchObject({ code: "ATTACHMENT_TOO_LARGE" });

    await upload(context, "image/jpeg", JPEG_BYTES, "second.jpg");
    await upload(context, "image/webp", WEBP_BYTES, "third.webp");
    const fourth = await upload(context, "image/jpeg", JPEG_BYTES, "fourth.jpg");
    expect(fourth.id).not.toBe(attachment.id);
    const expiringRequest = await createRequest(
      context,
      { attachmentIds: [attachment.id] },
      "expiring-request",
    );

    context.tick(8 * 24 * 60 * 60 * 1000);
    await expect(
      context.adapter.getAttachmentContent(context.consumer, attachment.id),
    ).rejects.toMatchObject({ code: "ATTACHMENT_EXPIRED" });
    expect(await context.adapter.getRequest(
      context.consumer,
      expiringRequest.request.id,
    )).toMatchObject({
      attachments: [{ id: attachment.id, status: "expired" }],
    });
    await expect(createRequest(
      context,
      { attachmentIds: [attachment.id] },
      "expired-request-attachment",
    )).rejects.toMatchObject({ code: "ATTACHMENT_EXPIRED" });
  });

  it("accepts exactly five MiB of valid private bytes", async () => {
    const context = setup();
    const bytes = new Uint8Array(5_242_880);
    bytes.set(PNG_BYTES);
    const attachment = await upload(context, "image/png", bytes);
    expect(attachment.sizeBytes).toBe(5_242_880);
  });

  it("normalizes omitted and reordered attachment IDs into one request fingerprint", async () => {
    const context = setup();
    const firstAttachment = await upload(context, "image/png", PNG_BYTES, "one.png");
    const secondAttachment = await upload(context, "image/jpeg", JPEG_BYTES, "two.jpg");
    const omitted = await createRequest(context, { description: "Synthetic issue." }, "empty");
    const empty = await createRequest(
      context,
      { description: "Synthetic issue.", attachmentIds: [] },
      "empty",
    );
    expect(omitted.request.id).toBe(empty.request.id);

    const reordered = await context.adapter.createRequest(context.consumer, {
      orderId: mockAfterSalesOrderId("au"),
      type: "damaged",
      description: "Synthetic issue.",
      attachmentIds: [secondAttachment.id, firstAttachment.id],
    }, { idempotencyKey: "reordered" });

    const original = await context.adapter.createRequest(context.consumer, {
      orderId: mockAfterSalesOrderId("au"),
      type: "damaged",
      description: "Synthetic issue.",
      attachmentIds: [firstAttachment.id, secondAttachment.id],
    }, { idempotencyKey: "reordered" });
    expect(original.request.id).toBe(reordered.request.id);
  });

  it("replays same-key creates under serial and concurrent calls and rejects different fingerprints", async () => {
    const context = setup();
    const key = "same-request-key";
    const [first, second] = await Promise.all([
      createRequest(context, {}, key),
      createRequest(context, {}, key),
    ]);
    expect(first.request.id).toBe(second.request.id);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);

    await expect(createRequest(
      context,
      { description: "Synthetic issue changed." },
      key,
    )).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect((await context.adapter.listServiceRequests(context.service)).items).toHaveLength(1);

    const seed = setup("au");
    const firstOrder = await seed.adapter.getServiceOrder(
      seed.service,
      mockAfterSalesOrderId("au"),
    );
    const scoped = setup("au", {
      orders: [
        firstOrder,
        {
          ...firstOrder,
          id: "ord_mock_other_actor",
          ownerCartId: "another-cart",
          orderVersion: "ov_mock_other_actor_1",
        },
      ],
    });
    const [ownerOne, ownerTwo] = await Promise.all([
      createRequest(scoped, {}, key),
      scoped.adapter.createRequest(
        { ...scoped.consumer, cartId: "another-cart" },
        {
          orderId: "ord_mock_other_actor",
          type: "damaged",
          description: "Synthetic issue.",
        },
        { idempotencyKey: key },
      ),
    ]);
    expect(ownerOne.request.id).not.toBe(ownerTwo.request.id);

    const order = await context.adapter.getServiceOrder(
      context.service,
      mockAfterSalesOrderId("au"),
    );
    const sameKeyDifferentOperation = await createTicket(
      context,
      first.request.id,
      order.orderVersion,
      {},
      key,
    );
    expect(sameKeyDifferentOperation.replayed).toBe(false);
  });

  it("validates requests before consuming sequence and never leaves partial state", async () => {
    const context = setup();
    const attachmentIds: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      attachmentIds.push((await upload(
        context,
        "image/png",
        PNG_BYTES,
        `request-attachment-${index}.png`,
      )).id);
    }
    await expect(createRequest(context, { description: " \n\t " }, "blank")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(createRequest(
      context,
      { attachmentIds: ["att_missing"] },
      "missing-attachment",
    )).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createRequest(
      context,
      { attachmentIds },
      "too-many-request-attachments",
    )).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await context.adapter.listServiceRequests(context.service)).toMatchObject({
      items: [],
      highWatermark: "0",
    });
    const created = await createRequest(context, {}, "valid-after-failure");
    expect(created.request.sequence).toBe("1");
    expect((await context.adapter.listServiceRequests(context.service)).highWatermark).toBe("1");
  });

  it("rejects an attachment owned by another order even for the same consumer", async () => {
    const seed = setup();
    const firstOrder = await seed.adapter.getServiceOrder(
      seed.service,
      mockAfterSalesOrderId("au"),
    );
    const context = setup("au", {
      orders: [
        firstOrder,
        {
          ...firstOrder,
          id: "ord_mock_second",
          orderVersion: "ov_mock_second_1",
        },
      ],
    });
    const attachment = await upload(context);
    await expect(createRequest(
      context,
      {
        orderId: "ord_mock_second",
        attachmentIds: [attachment.id],
      },
      "cross-order-attachment",
    )).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("keeps current request representation, one ticket per request, and immutable reply", async () => {
    const context = setup();
    const requestKey = "request-before-ticket";
    const created = await createRequest(context, {}, requestKey);
    const order = await context.adapter.getServiceOrder(
      context.service,
      mockAfterSalesOrderId("au"),
    );
    const [first, concurrent, sameKey] = await Promise.all([
      createTicket(context, created.request.id, order.orderVersion, {}, "ticket-key-1"),
      createTicket(context, created.request.id, order.orderVersion, {}, "ticket-key-2"),
      createTicket(context, created.request.id, order.orderVersion, {}, "ticket-key-1"),
    ]);
    expect(concurrent.ticket.id).toBe(first.ticket.id);
    expect(concurrent.replayed).toBe(true);
    expect(sameKey.ticket.id).toBe(first.ticket.id);
    expect(sameKey.replayed).toBe(true);

    const replayedRequest = await context.adapter.createRequest(
      context.consumer,
      {
        orderId: mockAfterSalesOrderId("au"),
        type: "damaged",
        description: "Synthetic issue.",
      },
      { idempotencyKey: requestKey },
    );
    expect(replayedRequest.replayed).toBe(true);
    expect(replayedRequest.request).toMatchObject({
      status: "ticket_created",
      ticketId: first.ticket.id,
    });
    expect(replayedRequest.request.progress.map((item) => item.status)).toEqual([
      "pending",
      "ticket_created",
    ]);

    first.ticket.reply = "Mutated local output.";
    expect((await context.adapter.getServiceTicket(context.service, first.ticket.id)).reply)
      .toBe("Synthetic final reply.");

    await expect(createTicket(
      context,
      created.request.id,
      order.orderVersion,
      { reply: "Synthetic different final reply." },
      "ticket-key-3",
    )).rejects.toMatchObject({ code: "REQUEST_STATE_CONFLICT" });
    await expect(createTicket(
      context,
      created.request.id,
      order.orderVersion,
      { reply: "Synthetic same-key different reply." },
      first.replayed ? "ticket-key-2" : "ticket-key-1",
    )).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("guards the current order version without partially creating a ticket", async () => {
    const context = setup();
    const created = await createRequest(context, {}, "version-request");
    await expect(createTicket(
      context,
      created.request.id,
      "stale-order-version",
      {},
      "stale-version-key",
    )).rejects.toMatchObject({ code: "ORDER_VERSION_CONFLICT" });
    expect(await context.adapter.getRequest(context.consumer, created.request.id)).toMatchObject({
      status: "pending",
      ticketId: null,
    });
    const feed = await context.adapter.listServiceRequests(context.service);
    expect(feed.highWatermark).toBe("1");
    expect(feed.items[0]).toMatchObject({ status: "pending", ticketId: null });
  });

  it("maintains contiguous feed publication, replayable pages, and stable terminal cursors", async () => {
    const context = setup();
    const empty = await context.adapter.listServiceRequests(context.service);
    expect(empty).toMatchObject({
      items: [],
      highWatermark: "0",
      hasMore: false,
    });
    expect(empty.nextCursor).toBeTruthy();

    await Promise.all([
      createRequest(context, {}, "feed-a"),
      createRequest(context, {}, "feed-b"),
      createRequest(context, {}, "feed-c"),
    ]);
    const first = await context.adapter.listServiceRequests(context.service, { limit: 2 });
    expect(first.items.map((item) => item.sequence)).toEqual(["1", "2"]);
    expect(first).toMatchObject({ highWatermark: "3", hasMore: true });

    const second = await context.adapter.listServiceRequests(context.service, {
      cursor: first.nextCursor,
      limit: 2,
    });
    expect(second.items.map((item) => item.sequence)).toEqual(["3"]);
    expect(second).toMatchObject({ highWatermark: "3", hasMore: false });
    expect(await context.adapter.listServiceRequests(context.service, {
      cursor: first.nextCursor,
      limit: 2,
    })).toEqual(second);

    const terminalEmpty = await context.adapter.listServiceRequests(context.service, {
      cursor: second.nextCursor,
      limit: 2,
    });
    expect(terminalEmpty).toMatchObject({
      items: [],
      highWatermark: "3",
      nextCursor: second.nextCursor,
      hasMore: false,
    });

    await createRequest(context, {}, "feed-d");
    const afterTerminal = await context.adapter.listServiceRequests(context.service, {
      cursor: second.nextCursor,
      limit: 2,
    });
    expect(afterTerminal.items.map((item) => item.sequence)).toEqual(["4"]);
  });

  it("rejects corrupted, cross-market, and future cursors", async () => {
    const context = setup();
    const auCursor = encodeFeedCursor({ market: "au", position: "1" });
    const futureCursor = encodeFeedCursor({ market: "au", position: "2" });
    await expect(context.adapter.listServiceRequests(context.service, {
      cursor: `${auCursor}x`,
    })).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    await expect(context.adapter.listServiceRequests(context.service, {
      cursor: encodeFeedCursor({ market: "us", position: "0" }),
    })).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    await expect(context.adapter.listServiceRequests(context.service, {
      cursor: futureCursor,
    })).rejects.toMatchObject({ code: "INVALID_CURSOR" });
  });

  it("exposes in-flight, current-unavailable, and recovered ticket lookup outcomes", async () => {
    let release!: () => void;
    let reached!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const context = setup("au", {
      beforeTicketCommit: async () => {
        reached();
        await gate;
      },
    });
    const created = await createRequest(context, {}, "inflight-request");
    const order = await context.adapter.getServiceOrder(
      context.service,
      mockAfterSalesOrderId("au"),
    );
    const key = "inflight-ticket";
    const pending = createTicket(
      context,
      created.request.id,
      order.orderVersion,
      {},
      key,
    );
    await started;

    await expect(context.adapter.findTicketByIdempotencyKey(context.service, key))
      .resolves.toMatchObject({ kind: "in_flight" });
    await expect(context.adapter.findTicketByIdempotencyKey(context.service, "unknown-key"))
      .resolves.toMatchObject({ kind: "currently_unavailable" });
    await expect(context.adapter.findTicketByIdempotencyKey(
      { ...context.service, actorId: "another-service-actor" },
      key,
    )).resolves.toMatchObject({ kind: "currently_unavailable" });

    release();
    const committed = await pending;
    await expect(context.adapter.findTicketByIdempotencyKey(context.service, key))
      .resolves.toMatchObject({ kind: "ticket", ticket: { id: committed.ticket.id } });
  });

  it("enforces the ticket status lifecycle without publishing or changing request progress", async () => {
    const context = setup();
    const created = await createRequest(context, {}, "status-request");
    const order = await context.adapter.getServiceOrder(
      context.service,
      mockAfterSalesOrderId("au"),
    );
    const ticket = await createTicket(
      context,
      created.request.id,
      order.orderVersion,
      {},
      "status-ticket",
    );
    context.tick(60_000);
    const processing = await context.adapter.advanceTicketStatus(
      context.service,
      ticket.ticket.id,
      "processing",
    );
    expect(processing.status).toBe("processing");
    expect(processing.updatedAt).not.toBe(ticket.ticket.updatedAt);

    context.tick(60_000);
    const closed = await context.adapter.advanceTicketStatus(
      context.service,
      ticket.ticket.id,
      "closed",
    );
    expect(closed.status).toBe("closed");
    expect(closed.updatedAt).not.toBe(ticket.ticket.updatedAt);

    const feed = await context.adapter.listServiceRequests(context.service);
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]).toMatchObject({
      sequence: "1",
      status: "ticket_created",
      ticketId: ticket.ticket.id,
    });
    expect(feed.highWatermark).toBe("1");
    expect(await context.adapter.getConsumerTicket(context.consumer, ticket.ticket.id))
      .toMatchObject({ status: "closed" });
  });

  it("keeps closed tickets terminal and unchanged after rejected transitions", async () => {
    const context = setup();
    const created = await createRequest(context, {}, "closed-status-request");
    const order = await context.adapter.getServiceOrder(
      context.service,
      mockAfterSalesOrderId("au"),
    );
    const ticket = await createTicket(
      context,
      created.request.id,
      order.orderVersion,
      {},
      "closed-status-ticket",
    );
    context.tick(60_000);
    const closed = await context.adapter.advanceTicketStatus(
      context.service,
      ticket.ticket.id,
      "closed",
    );

    for (const rejectedStatus of ["open", "processing", "closed"] as const) {
      context.tick(60_000);
      await expect(context.adapter.advanceTicketStatus(
        context.service,
        ticket.ticket.id,
        rejectedStatus,
      )).rejects.toMatchObject({ code: "REQUEST_STATE_CONFLICT" });
      expect(await context.adapter.getServiceTicket(context.service, ticket.ticket.id))
        .toEqual(closed);
    }
  });

  it("rejects no-op and backward ticket transitions without mutating the ticket", async () => {
    const context = setup();
    const created = await createRequest(context, {}, "illegal-status-request");
    const order = await context.adapter.getServiceOrder(
      context.service,
      mockAfterSalesOrderId("au"),
    );
    const ticket = await createTicket(
      context,
      created.request.id,
      order.orderVersion,
      {},
      "illegal-status-ticket",
    );

    context.tick(60_000);
    await expect(context.adapter.advanceTicketStatus(
      context.service,
      ticket.ticket.id,
      "open",
    )).rejects.toMatchObject({ code: "REQUEST_STATE_CONFLICT" });
    expect(await context.adapter.getServiceTicket(context.service, ticket.ticket.id))
      .toEqual(ticket.ticket);

    context.tick(60_000);
    const processing = await context.adapter.advanceTicketStatus(
      context.service,
      ticket.ticket.id,
      "processing",
    );
    for (const rejectedStatus of ["open", "processing"] as const) {
      context.tick(60_000);
      await expect(context.adapter.advanceTicketStatus(
        context.service,
        ticket.ticket.id,
        rejectedStatus,
      )).rejects.toMatchObject({ code: "REQUEST_STATE_CONFLICT" });
      expect(await context.adapter.getServiceTicket(context.service, ticket.ticket.id))
        .toEqual(processing);
    }
  });

  it("replays the original ticket creation as the current closed view without changing feed or progress", async () => {
    const context = setup();
    const created = await createRequest(context, {}, "closed-replay-request");
    const order = await context.adapter.getServiceOrder(
      context.service,
      mockAfterSalesOrderId("au"),
    );
    const idempotencyKey = "closed-replay-ticket";
    const input: CreateServiceTicketInput = {
      requestId: created.request.id,
      action: "reship",
      reply: "Synthetic final reply.",
      draftVersion: "draft_synthetic_1",
      approvalId: "approval_synthetic_1",
      policyVersion: "policy_synthetic_1",
      orderVersion: order.orderVersion,
    };
    const original = await context.adapter.createTicket(
      context.service,
      input,
      { idempotencyKey },
    );
    context.tick(60_000);
    const closed = await context.adapter.advanceTicketStatus(
      context.service,
      original.ticket.id,
      "closed",
    );
    const feedBeforeReplay = await context.adapter.listServiceRequests(context.service);
    const requestBeforeReplay = await context.adapter.getServiceRequest(
      context.service,
      created.request.id,
    );

    context.tick(60_000);
    const replayed = await context.adapter.createTicket(
      context.service,
      input,
      { idempotencyKey },
    );

    expect(replayed.replayed).toBe(true);
    expect(replayed.ticket).toEqual(closed);
    expect(await context.adapter.getServiceRequest(context.service, created.request.id))
      .toEqual(requestBeforeReplay);
    expect(await context.adapter.listServiceRequests(context.service)).toEqual(feedBeforeReplay);
    expect(requestBeforeReplay.progress.map((item) => item.status)).toEqual([
      "pending",
      "ticket_created",
    ]);
    expect(feedBeforeReplay).toMatchObject({ highWatermark: "1" });
    expect(feedBeforeReplay.items).toHaveLength(1);
  });

  it("returns cloned views and logs correlation IDs only", async () => {
    const context = setup();
    const description = "SYNTHETIC_DESCRIPTION_SENTINEL";
    const reply = "SYNTHETIC_REPLY_SENTINEL";
    const request = await createRequest(context, { description }, "log-request");
    request.request.description = "local mutation";
    expect((await context.adapter.getRequest(context.consumer, request.request.id)).description)
      .toBe(description);

    const order = await context.adapter.getServiceOrder(
      context.service,
      mockAfterSalesOrderId("au"),
    );
    const ticket = await createTicket(
      context,
      request.request.id,
      order.orderVersion,
      { reply },
      "log-ticket",
    );
    const serializedLogs = JSON.stringify(context.logs);
    expect(serializedLogs).not.toContain(description);
    expect(serializedLogs).not.toContain(reply);
    expect(serializedLogs).not.toMatch(/attachmentBytes|bearer|token|cookie/i);
    expect(context.logs.length).toBeGreaterThan(0);
    expect(ticket.replayed).toBe(false);
  });
});
