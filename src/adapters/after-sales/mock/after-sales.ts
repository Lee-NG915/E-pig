import type { CatalogPort } from "@/core/contracts/commerce/catalog";
import {
  createAfterSalesError,
  createAfterSalesRequestFingerprint,
  createIdempotencyScope,
  createServiceTicketFingerprint,
  decodeFeedCursor,
  encodeFeedCursor,
  type AfterSalesAttachment,
  type AfterSalesAttachmentContent,
  type AfterSalesMediaType,
  type AfterSalesOrder,
  type AfterSalesPort,
  type AfterSalesRequest,
  type AfterSalesShipment,
  type AfterSalesTicket,
  type AfterSalesTicketStatus,
  type ConsumerPrincipal,
  type CreateAfterSalesRequestInput,
  type CreateRequestResult,
  type CreateServiceTicketInput,
  type CreateTicketResult,
  type ServicePrincipal,
  type ServiceRequestFeed,
} from "@/core/contracts/after-sales";
import type { Market, MarketId } from "@/platform/config/markets";
import type { Logger } from "@/platform/logging/logger";

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 5_242_880;
const ATTACHMENT_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const idempotencyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;
const allowedTicketStatusTransitions: Record<
  AfterSalesTicketStatus,
  readonly AfterSalesTicketStatus[]
> = {
  open: ["processing", "closed"],
  processing: ["closed"],
  closed: [],
};

type AttachmentRecord = {
  metadata: AfterSalesAttachment;
  orderId: string;
  ownerCartId: string;
  bytes: Uint8Array;
};

type RequestRecord = {
  request: AfterSalesRequest;
  ownerCartId: string;
  sequence: bigint;
};

type RequestKeyRecord = {
  fingerprint: string;
  requestId?: string;
  settled: boolean;
  result: Promise<CreateRequestResult>;
};

type TicketKeyRecord = {
  fingerprint: string;
  ticketId?: string;
  settled: boolean;
  result: Promise<CreateTicketResult>;
};

export type MockAfterSalesAdapterOptions = {
  catalog: CatalogPort;
  market: Market;
  logger: Logger;
  now?: () => Date;
  orders?: readonly AfterSalesOrder[];
  beforeTicketCommit?: () => Promise<void>;
  retryAfterMs?: number;
};

export type MockAfterSalesAdapter = AfterSalesPort & {
  advanceTicketStatus(
    principal: ServicePrincipal,
    ticketId: string,
    status: AfterSalesTicketStatus,
  ): Promise<AfterSalesTicket>;
};

export function mockAfterSalesCartId(market: MarketId): string {
  return `cart_mock_${market}`;
}

export function mockAfterSalesOrderId(market: MarketId): string {
  return `ord_mock_${market}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function cloneContent(value: AttachmentRecord): AfterSalesAttachmentContent {
  return {
    fileName: value.metadata.fileName,
    mediaType: value.metadata.mediaType,
    sizeBytes: value.metadata.sizeBytes,
    bytes: new Uint8Array(value.bytes),
  };
}

function isAllowedMediaType(value: string): value is AfterSalesMediaType {
  return value === "image/jpeg" || value === "image/png" || value === "image/webp";
}

function hasMagic(bytes: Uint8Array, mediaType: AfterSalesMediaType): boolean {
  if (mediaType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mediaType === "image/png") {
    return bytes.length >= 8
      && bytes[0] === 0x89
      && bytes[1] === 0x50
      && bytes[2] === 0x4e
      && bytes[3] === 0x47
      && bytes[4] === 0x0d
      && bytes[5] === 0x0a
      && bytes[6] === 0x1a
      && bytes[7] === 0x0a;
  }
  return bytes.length >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50;
}

function safeFileName(value: string): string {
  const base = value.split(/[\\/]/).at(-1) ?? "";
  return Array.from(
    base.replace(/[\u0000-\u001f\u007f"\\]/g, "").trim() || "attachment",
  ).slice(0, 255).join("");
}

function countryCode(market: MarketId): "AU" | "SG" | "US" {
  if (market === "au") return "AU";
  if (market === "sg") return "SG";
  return "US";
}

function region(market: MarketId): string {
  if (market === "au") return "NSW";
  if (market === "sg") return "Central";
  return "CA";
}

function postalCode(market: MarketId): string {
  if (market === "au") return "2000";
  if (market === "sg") return "018956";
  return "94105";
}

export function createMockAfterSalesAdapter({
  catalog,
  market,
  logger,
  now = () => new Date(),
  orders: initialOrders = [],
  beforeTicketCommit,
  retryAfterMs = 250,
}: MockAfterSalesAdapterOptions): MockAfterSalesAdapter {
  const orders = new Map<string, AfterSalesOrder>(
    initialOrders.map((order) => [order.id, clone(order)]),
  );
  const attachments = new Map<string, AttachmentRecord>();
  const requests = new Map<string, RequestRecord>();
  const tickets = new Map<string, AfterSalesTicket>();
  const ticketFingerprintByRequest = new Map<string, string>();
  const ticketIdByRequest = new Map<string, string>();
  const requestKeys = new Map<string, RequestKeyRecord>();
  const ticketKeys = new Map<string, TicketKeyRecord>();
  let highWatermark = BigInt(0);
  let mutationTail = Promise.resolve();

  const requestId = () => `req_mock_${crypto.randomUUID()}`;

  function fail(
    code: Parameters<typeof createAfterSalesError>[0]["code"],
    details?: Parameters<typeof createAfterSalesError>[0]["details"],
    recoveryAction?: Parameters<typeof createAfterSalesError>[0]["recoveryAction"],
    retryable?: boolean,
  ): never {
    throw createAfterSalesError({
      code,
      requestId: requestId(),
      details,
      recoveryAction,
      retryable,
    });
  }

  function validateIdempotencyKey(value: string): string {
    if (!idempotencyPattern.test(value)) {
      fail("VALIDATION_ERROR", { field: "idempotency_key" });
    }
    return value;
  }

  function requireConsumer(principal: ConsumerPrincipal): ConsumerPrincipal {
    if (principal.kind !== "consumer") fail("UNAUTHORIZED");
    if (principal.market !== market.id || !principal.cartId) fail("NOT_FOUND");
    return principal;
  }

  function requireService(principal: ServicePrincipal): ServicePrincipal {
    if (principal.kind !== "service") fail("UNAUTHORIZED");
    if (
      principal.market !== market.id
      || !principal.actorId
      || !principal.allowedMarkets.includes(market.id)
    ) {
      fail("FORBIDDEN_MARKET", { market: market.id });
    }
    return principal;
  }

  function enqueue<T>(operation: () => Promise<T> | T): Promise<T> {
    const result = mutationTail.then(operation, operation);
    mutationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async function ensureDefaultOrder(): Promise<AfterSalesOrder> {
    const existing = orders.get(mockAfterSalesOrderId(market.id));
    if (existing) return existing;
    const product = await catalog.getProduct("tamarama-modular-sofa");
    const variant = product.variants.find((item) => item.availability === "in-stock")
      ?? product.variants[0];
    if (!variant) fail("UPSTREAM_UNAVAILABLE");
    const subtotalMinor = Math.round(variant.price.amount * 100);
    const shippingMinor = market.id === "au" ? 895 : market.id === "sg" ? 799 : 590;
    const created: AfterSalesOrder = {
      id: mockAfterSalesOrderId(market.id),
      ownerCartId: mockAfterSalesCartId(market.id),
      market: market.id,
      currency: market.currency,
      items: [{
        id: `item_mock_${market.id}`,
        productId: product.id,
        variantId: variant.id,
        sku: variant.sku,
        name: product.name,
        quantity: 1,
        unitPriceMinor: subtotalMinor,
        lineTotalMinor: subtotalMinor,
      }],
      subtotalMinor,
      shippingMinor,
      taxMinor: 0,
      discountMinor: 0,
      totalMinor: subtotalMinor + shippingMinor,
      status: "fulfilled",
      createdAt: "2026-01-10T02:30:00Z",
      orderVersion: `ov_mock_${market.id}_1`,
      recipient: {
        name: "Synthetic Buyer",
        countryCode: countryCode(market.id),
        region: region(market.id),
        postalCode: postalCode(market.id),
      },
    };
    orders.set(created.id, created);
    return created;
  }

  async function requireOrder(orderId: string): Promise<AfterSalesOrder> {
    const order = orderId === mockAfterSalesOrderId(market.id)
      ? await ensureDefaultOrder()
      : orders.get(orderId);
    if (!order || order.market !== market.id) fail("NOT_FOUND");
    return order;
  }

  async function requireOwnedOrder(
    principal: ConsumerPrincipal,
    orderId: string,
  ): Promise<AfterSalesOrder> {
    const owned = requireConsumer(principal);
    const order = await requireOrder(orderId);
    if (order.ownerCartId !== owned.cartId) fail("NOT_FOUND");
    return order;
  }

  function requireRequest(requestIdValue: string): RequestRecord {
    const record = requests.get(requestIdValue);
    if (!record) fail("NOT_FOUND");
    return record;
  }

  function requireTicket(ticketId: string): AfterSalesTicket {
    const ticket = tickets.get(ticketId);
    if (!ticket) fail("NOT_FOUND");
    return ticket;
  }

  function attachmentExpired(record: AttachmentRecord): boolean {
    return now().getTime() >= Date.parse(record.metadata.expiresAt);
  }

  function currentRequest(record: RequestRecord): AfterSalesRequest {
    const request = clone(record.request);
    request.attachments = request.attachments.map((attachment) => {
      const stored = attachments.get(attachment.id);
      return stored && attachmentExpired(stored)
        ? { ...attachment, status: "expired" }
        : attachment;
    });
    return request;
  }

  async function validateRequestAttachments(
    cartId: string,
    orderId: string,
    attachmentIds: string[],
  ): Promise<AfterSalesAttachment[]> {
    if (attachmentIds.length > MAX_ATTACHMENTS || new Set(attachmentIds).size !== attachmentIds.length) {
      fail("VALIDATION_ERROR", { field: "attachment_ids" });
    }
    const sorted = [...attachmentIds].sort();
    return sorted.map((attachmentId) => {
      const record = attachments.get(attachmentId);
      if (!record || record.orderId !== orderId || record.ownerCartId !== cartId) {
        fail("NOT_FOUND", { attachment_id: attachmentId });
      }
      if (attachmentExpired(record)) {
        fail("ATTACHMENT_EXPIRED", { attachment_id: attachmentId });
      }
      return clone(record.metadata);
    });
  }

  function validateRequestInput(input: CreateAfterSalesRequestInput): void {
    if (
      !input.orderId
      || !["damaged", "wrong_item", "return", "other"].includes(input.type)
      || typeof input.description !== "string"
      || input.description.trim().length === 0
      || Array.from(input.description).length > 5000
    ) {
      fail("VALIDATION_ERROR", { field: "description" });
    }
    if ((input.attachmentIds?.length ?? 0) > MAX_ATTACHMENTS) {
      fail("VALIDATION_ERROR", { field: "attachment_ids" });
    }
  }

  function validateTicketInput(input: CreateServiceTicketInput): void {
    if (
      !input.requestId
      || !["reship", "return", "refund", "reject", "other"].includes(input.action)
      || typeof input.reply !== "string"
      || input.reply.trim().length === 0
      || Array.from(input.reply).length > 10_000
    ) {
      fail("VALIDATION_ERROR", { field: "reply" });
    }
    for (const value of [
      input.draftVersion,
      input.approvalId,
      input.policyVersion,
      input.orderVersion,
    ]) {
      if (
        typeof value !== "string"
        || value.trim().length === 0
        || Array.from(value).length > 128
      ) {
        fail("VALIDATION_ERROR");
      }
    }
  }

  function requestScope(principal: ConsumerPrincipal, key: string): string {
    return createIdempotencyScope({
      market: principal.market,
      actorId: principal.cartId,
      operation: "createAfterSalesRequest",
      key,
    });
  }

  function ticketScope(principal: ServicePrincipal, key: string): string {
    return createIdempotencyScope({
      market: principal.market,
      actorId: principal.actorId,
      operation: "createServiceTicket",
      key,
    });
  }

  function replayRequest(record: RequestRecord): CreateRequestResult {
    return { request: currentRequest(record), replayed: true };
  }

  function replayTicket(ticket: AfterSalesTicket): CreateTicketResult {
    return { ticket: clone(ticket), replayed: true };
  }

  return {
    async createRequest(principal, input, options) {
      const consumer = requireConsumer(principal);
      validateRequestInput(input);
      const key = validateIdempotencyKey(options.idempotencyKey);
      const fingerprint = createAfterSalesRequestFingerprint(input);
      const scope = requestScope(consumer, key);
      const existing = requestKeys.get(scope);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          fail("IDEMPOTENCY_CONFLICT", { operation: "createAfterSalesRequest" });
        }
        const result = await existing.result;
        const record = requests.get(existing.requestId ?? result.request.id);
        if (!record) fail("INTERNAL_ERROR", undefined, "LOOKUP_FIRST");
        logger.debug("after_sales.request.replayed", { requestId: record.request.id });
        return replayRequest(record);
      }

      const result = enqueue(async () => {
        const order = await requireOwnedOrder(consumer, input.orderId);
        const selectedAttachments = await validateRequestAttachments(
          consumer.cartId,
          order.id,
          input.attachmentIds ?? [],
        );
        const createdAt = now().toISOString();
        const sequence = highWatermark + BigInt(1);
        const request: AfterSalesRequest = {
          id: `asr_${crypto.randomUUID()}`,
          sequence: sequence.toString(),
          orderId: order.id,
          market: market.id,
          type: input.type,
          description: input.description,
          attachments: selectedAttachments,
          status: "pending",
          progress: [{
            status: "pending",
            message: "Your after-sales request has been received.",
            occurredAt: createdAt,
          }],
          ticketId: null,
          createdAt,
          updatedAt: createdAt,
        };
        const record: RequestRecord = {
          request,
          ownerCartId: consumer.cartId,
          sequence,
        };
        requests.set(request.id, record);
        highWatermark = sequence;
        logger.info("after_sales.request.created", {
          requestId: request.id,
          sequence: sequence.toString(),
        });
        return { request: clone(request), replayed: false };
      });
      const entry: RequestKeyRecord = { fingerprint, settled: false, result };
      requestKeys.set(scope, entry);
      result.then(
        (created) => {
          entry.requestId = created.request.id;
          entry.settled = true;
        },
        () => {
          if (requestKeys.get(scope) === entry) requestKeys.delete(scope);
        },
      );
      return result;
    },

    async getRequest(principal, requestIdValue) {
      const consumer = requireConsumer(principal);
      const record = requireRequest(requestIdValue);
      if (record.ownerCartId !== consumer.cartId || record.request.market !== market.id) {
        fail("NOT_FOUND");
      }
      return currentRequest(record);
    },

    async getConsumerTicket(principal, ticketId) {
      const consumer = requireConsumer(principal);
      const ticket = requireTicket(ticketId);
      const request = requests.get(ticket.requestId);
      if (!request || request.ownerCartId !== consumer.cartId) fail("NOT_FOUND");
      return clone(ticket);
    },

    async uploadAttachment(principal, input) {
      const consumer = requireConsumer(principal);
      if (!isAllowedMediaType(input.mediaType)) {
        fail("UNSUPPORTED_MEDIA_TYPE");
      }
      if (input.bytes.byteLength > MAX_ATTACHMENT_BYTES) {
        fail("ATTACHMENT_TOO_LARGE", { max_size_bytes: MAX_ATTACHMENT_BYTES });
      }
      if (input.bytes.byteLength < 1 || !hasMagic(input.bytes, input.mediaType)) {
        fail("UNSUPPORTED_MEDIA_TYPE", {
          allowed_media_types: ["image/jpeg", "image/png", "image/webp"],
        });
      }
      return enqueue(async () => {
        const order = await requireOwnedOrder(consumer, input.orderId);
        const createdAt = now();
        const metadata: AfterSalesAttachment = {
          id: `att_${crypto.randomUUID()}`,
          fileName: safeFileName(input.fileName),
          mediaType: input.mediaType,
          sizeBytes: input.bytes.byteLength,
          status: "active",
          createdAt: createdAt.toISOString(),
          expiresAt: new Date(createdAt.getTime() + ATTACHMENT_LIFETIME_MS).toISOString(),
        };
        attachments.set(metadata.id, {
          metadata,
          orderId: order.id,
          ownerCartId: consumer.cartId,
          bytes: new Uint8Array(input.bytes),
        });
        logger.info("after_sales.attachment.uploaded", {
          attachmentId: metadata.id,
          orderId: order.id,
        });
        return clone(metadata);
      });
    },

    async getAttachmentContent(principal, attachmentId) {
      const record = attachments.get(attachmentId);
      if (!record) fail("NOT_FOUND", { attachment_id: attachmentId });
      if (principal.kind === "consumer") {
        const consumer = requireConsumer(principal);
        if (record.ownerCartId !== consumer.cartId) fail("NOT_FOUND", { attachment_id: attachmentId });
      } else {
        requireService(principal);
      }
      if (attachmentExpired(record!)) fail("ATTACHMENT_EXPIRED", { attachment_id: attachmentId });
      return cloneContent(record!);
    },

    async getServiceOrder(principal, orderId) {
      requireService(principal);
      return clone(await requireOrder(orderId));
    },

    async getServiceOrderShipment(principal, orderId) {
      requireService(principal);
      const order = await requireOrder(orderId);
      const events = [
        {
          id: `event_mock_${market.id}_1`,
          status: "in_transit" as const,
          description: "Synthetic parcel departed the local depot.",
          occurredAt: "2026-01-13T01:15:00Z",
          locationSummary: region(market.id),
        },
        {
          id: `event_mock_${market.id}_2`,
          status: "delivered" as const,
          description: "Synthetic parcel was recorded as delivered.",
          occurredAt: "2026-01-14T06:45:00Z",
          locationSummary: region(market.id),
        },
      ];
      return {
        id: `shp_mock_${market.id}`,
        orderId: order.id,
        status: "delivered",
        carrier: "Synthetic Parcel Carrier",
        events,
      } satisfies AfterSalesShipment;
    },

    async listServiceRequests(principal, input = {}) {
      requireService(principal);
      if (
        input.limit !== undefined
        && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 200)
      ) {
        fail("VALIDATION_ERROR", { field: "limit" });
      }
      const limit = input.limit ?? 50;
      const start = input.cursor
        ? decodeFeedCursor(input.cursor, {
            market: market.id,
            highWatermark: highWatermark.toString(),
          })
        : BigInt(0);
      const available = [...requests.values()]
        .filter((record) => record.sequence <= highWatermark && record.sequence > start)
        .sort((left, right) =>
          left.sequence < right.sequence ? -1 : left.sequence > right.sequence ? 1 : 0,
        );
      const selected = available.slice(0, limit);
      const position = selected.at(-1)?.sequence ?? start;
      const hasMore = available.some((record) => record.sequence > position);
      const page: ServiceRequestFeed = {
        items: selected.map(currentRequest),
        highWatermark: highWatermark.toString(),
        nextCursor: encodeFeedCursor({ market: market.id, position }),
        hasMore,
      };
      logger.debug("after_sales.feed.read", {
        count: page.items.length,
        highWatermark: page.highWatermark,
      });
      return page;
    },

    async getServiceRequest(principal, requestIdValue) {
      requireService(principal);
      const record = requireRequest(requestIdValue);
      return currentRequest(record);
    },

    async createTicket(principal, input, options) {
      const service = requireService(principal);
      validateTicketInput(input);
      const key = validateIdempotencyKey(options.idempotencyKey);
      const fingerprint = createServiceTicketFingerprint(input);
      const scope = ticketScope(service, key);
      const existing = ticketKeys.get(scope);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          fail("IDEMPOTENCY_CONFLICT", { operation: "createServiceTicket" });
        }
        const result = await existing.result;
        const ticket = tickets.get(existing.ticketId ?? result.ticket.id);
        if (!ticket) fail("INTERNAL_ERROR", undefined, "LOOKUP_FIRST");
        logger.debug("after_sales.ticket.replayed", {
          requestId: ticket.requestId,
          ticketId: ticket.id,
        });
        return replayTicket(ticket);
      }

      const result = enqueue(async () => {
        const requestRecord = requireRequest(input.requestId);
        const order = await requireOrder(requestRecord.request.orderId);
        const existingTicketId = ticketIdByRequest.get(requestRecord.request.id);
        if (existingTicketId) {
          if (ticketFingerprintByRequest.get(requestRecord.request.id) !== fingerprint) {
            fail("REQUEST_STATE_CONFLICT", {
              request_id: requestRecord.request.id,
              status: requestRecord.request.status,
            });
          }
          const existingTicket = requireTicket(existingTicketId);
          return replayTicket(existingTicket);
        }
        if (
          requestRecord.request.status !== "pending"
          || requestRecord.request.ticketId !== null
        ) {
          fail("REQUEST_STATE_CONFLICT", {
            request_id: requestRecord.request.id,
            status: requestRecord.request.status,
          });
        }
        if (input.orderVersion !== order.orderVersion) {
          fail("ORDER_VERSION_CONFLICT", { field: "order_version" });
        }
        await validateRequestAttachments(
          requestRecord.ownerCartId,
          requestRecord.request.orderId,
          requestRecord.request.attachments.map((attachment) => attachment.id),
        );
        await beforeTicketCommit?.();

        const createdAt = now().toISOString();
        const ticketId = `tic_${crypto.randomUUID()}`;
        const receipt = {
          id: `rcp_${crypto.randomUUID()}`,
          ticketId,
          requestId: requestRecord.request.id,
          action: input.action,
          requestStatus: "ticket_created" as const,
          createdAt,
        };
        const ticket: AfterSalesTicket = {
          id: ticketId,
          requestId: requestRecord.request.id,
          orderId: requestRecord.request.orderId,
          market: market.id,
          action: input.action,
          reply: input.reply,
          status: "open",
          draftVersion: input.draftVersion,
          approvalId: input.approvalId,
          policyVersion: input.policyVersion,
          orderVersion: input.orderVersion,
          receipt,
          createdAt,
          updatedAt: createdAt,
        };
        requestRecord.request = {
          ...requestRecord.request,
          status: "ticket_created",
          ticketId,
          updatedAt: createdAt,
          progress: [
            ...requestRecord.request.progress,
            {
              status: "ticket_created",
              message: "A support ticket and final reply are available.",
              occurredAt: createdAt,
            },
          ],
        };
        requests.set(requestRecord.request.id, requestRecord);
        tickets.set(ticket.id, ticket);
        ticketIdByRequest.set(requestRecord.request.id, ticket.id);
        ticketFingerprintByRequest.set(requestRecord.request.id, fingerprint);
        logger.info("after_sales.ticket.created", {
          requestId: ticket.requestId,
          ticketId: ticket.id,
        });
        return { ticket: clone(ticket), replayed: false };
      });
      const entry: TicketKeyRecord = { fingerprint, settled: false, result };
      ticketKeys.set(scope, entry);
      result.then(
        (created) => {
          entry.ticketId = created.ticket.id;
          entry.settled = true;
        },
        () => {
          if (ticketKeys.get(scope) === entry) ticketKeys.delete(scope);
        },
      );
      return result;
    },

    async getServiceTicket(principal, ticketId) {
      requireService(principal);
      return clone(requireTicket(ticketId));
    },

    async findTicketByIdempotencyKey(principal, idempotencyKey) {
      const service = requireService(principal);
      const key = validateIdempotencyKey(idempotencyKey);
      const entry = ticketKeys.get(ticketScope(service, key));
      if (!entry) return { kind: "currently_unavailable", retryAfterMs };
      if (!entry.settled || !entry.ticketId) return { kind: "in_flight", retryAfterMs };
      const ticket = tickets.get(entry.ticketId);
      if (!ticket) return { kind: "currently_unavailable", retryAfterMs };
      return { kind: "ticket", ticket: clone(ticket) };
    },

    async advanceTicketStatus(principal, ticketId, status) {
      requireService(principal);
      if (!["open", "processing", "closed"].includes(status)) {
        fail("VALIDATION_ERROR", { field: "status" });
      }
      return enqueue(() => {
        const ticket = requireTicket(ticketId);
        if (!allowedTicketStatusTransitions[ticket.status].includes(status)) {
          fail("REQUEST_STATE_CONFLICT");
        }
        ticket.status = status;
        ticket.updatedAt = now().toISOString();
        tickets.set(ticket.id, ticket);
        logger.info("after_sales.ticket.status_changed", {
          requestId: ticket.requestId,
          ticketId: ticket.id,
          status,
        });
        return clone(ticket);
      });
    },
  };
}
