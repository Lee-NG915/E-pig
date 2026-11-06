import "server-only";

import { randomUUID } from "node:crypto";

import {
  createAfterSalesError,
  createAfterSalesRequestFingerprint,
  createIdempotencyScope,
  createServiceTicketFingerprint,
  decodeFeedCursor,
  type AfterSalesAttachment,
  type AfterSalesAttachmentContent,
  type AfterSalesErrorCode,
  type AfterSalesErrorDetails,
  type AfterSalesMediaType,
  type AfterSalesOrder,
  type AfterSalesPort,
  type AfterSalesRequest,
  type AfterSalesTicket,
  type ConsumerPrincipal,
  type CreateAfterSalesRequestInput,
  type CreateRequestResult,
  type CreateServiceTicketInput,
  type CreateTicketResult,
  type ServicePrincipal,
  type ServiceRequestFeed,
  type TicketCreationLookup,
} from "@/core/contracts/after-sales";
import type { Market, MarketId } from "@/platform/config/markets";

import {
  transaction,
  type CommercePool,
  type CommerceQuery,
} from "@/adapters/commerce/postgres/pool";

import { mapStoredOrder, type StoredOrderRow } from "./order-mapping";
import {
  createAfterSalesRequestStore,
  publishAfterSalesRequestInTransaction,
} from "./request-store";

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 5_242_880;
const ATTACHMENT_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const idempotencyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;
const allowedMediaTypes = ["image/jpeg", "image/png", "image/webp"] as const;

type RequestRow = {
  cart_id: string;
  order_id: string;
  sequence: string;
  data: unknown;
};

type AttachmentRow = {
  id: string;
  file_name: string;
  media_type: AfterSalesMediaType;
  size_bytes: number;
  created_at: unknown;
  expires_at: unknown;
};

export type PostgresAfterSalesAdapterOptions = {
  pool: CommercePool;
  market: Market;
  now?: () => Date;
  retryAfterMs?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isAllowedMediaType(value: string): value is AfterSalesMediaType {
  return (allowedMediaTypes as readonly string[]).includes(value);
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

function codePointLength(value: string): number {
  return Array.from(value).length;
}

/**
 * Full durable after-sales adapter. Order snapshots and the current catalog are
 * never mixed: only `commerce_orders` is read, and missing or inconsistent
 * snapshot fields fail closed instead of being repaired from today's catalog.
 */
export function createPostgresAfterSalesAdapter({
  pool,
  market,
  now = () => new Date(),
  retryAfterMs = 250,
}: PostgresAfterSalesAdapterOptions): AfterSalesPort {
  const requestStore = createAfterSalesRequestStore(pool);

  function requestId(): string {
    return `req_pg_${randomUUID()}`;
  }

  function fail(
    code: AfterSalesErrorCode,
    details?: AfterSalesErrorDetails,
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

  function internalFailure(): never {
    return fail("INTERNAL_ERROR");
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
      || !principal.allowedMarkets?.includes(market.id)
    ) {
      fail("FORBIDDEN_MARKET", { market: market.id });
    }
    return principal;
  }

  function validateIdempotencyKey(value: string): string {
    if (typeof value !== "string" || !idempotencyPattern.test(value)) {
      fail("VALIDATION_ERROR", { field: "idempotency_key" });
    }
    return value;
  }

  function validateRequestInput(input: CreateAfterSalesRequestInput): void {
    if (
      !input.orderId
      || !["damaged", "wrong_item", "return", "other"].includes(input.type)
      || typeof input.description !== "string"
      || input.description.trim().length === 0
      || codePointLength(input.description) > 5_000
      || (input.attachmentIds !== undefined && !Array.isArray(input.attachmentIds))
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
      || codePointLength(input.reply) > 10_000
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
        || codePointLength(value) > 128
      ) {
        fail("VALIDATION_ERROR");
      }
    }
  }

  function storedRequest(data: unknown, sequence: unknown): AfterSalesRequest {
    if (!isRecord(data)) return internalFailure();
    const position = typeof sequence === "string" || typeof sequence === "bigint"
      ? sequence.toString()
      : typeof sequence === "number" && Number.isSafeInteger(sequence)
        ? String(sequence)
        : null;
    if (position === null || !/^(0|[1-9][0-9]*)$/.test(position)) return internalFailure();
    return {
      ...(data as AfterSalesRequest),
      // The column is authoritative; JSONB can only carry a stale copy.
      sequence: position,
    };
  }

  function iso(value: unknown): string {
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return internalFailure();
    return date.toISOString();
  }

  function attachmentFromRow(row: AttachmentRow | Record<string, unknown>): AfterSalesAttachment {
    const expiresAt = iso(row.expires_at);
    return {
      id: String(row.id),
      fileName: String(row.file_name),
      mediaType: row.media_type as AfterSalesMediaType,
      sizeBytes: Number(row.size_bytes),
      status: now().getTime() >= Date.parse(expiresAt) ? "expired" : "active",
      createdAt: iso(row.created_at),
      expiresAt,
    };
  }

  function currentRequest(request: AfterSalesRequest): AfterSalesRequest {
    const nowMs = now().getTime();
    return {
      ...request,
      attachments: request.attachments.map((attachment) => ({
        ...attachment,
        status: nowMs >= Date.parse(attachment.expiresAt) ? "expired" : "active",
      })),
    };
  }

  function ticketFromData(value: unknown): AfterSalesTicket {
    if (!isRecord(value)) return internalFailure();
    return value as unknown as AfterSalesTicket;
  }

  function ticketFingerprint(ticket: AfterSalesTicket): string {
    return createServiceTicketFingerprint({
      requestId: ticket.requestId,
      action: ticket.action,
      reply: ticket.reply,
      draftVersion: ticket.draftVersion,
      approvalId: ticket.approvalId,
      policyVersion: ticket.policyVersion,
      orderVersion: ticket.orderVersion,
    });
  }

  async function readOrderRow(
    db: CommerceQuery,
    orderId: string,
    marketId: MarketId,
    lock: "share" | undefined = undefined,
  ): Promise<StoredOrderRow | undefined> {
    const { rows } = await db.query(
      `SELECT id, checkout_id, cart_id, market, data
       FROM commerce_orders
       WHERE id = $1 AND market = $2${lock === "share" ? " FOR SHARE" : ""}`,
      [orderId, marketId],
    );
    return rows[0] as unknown as StoredOrderRow | undefined;
  }

  async function readRequestRow(
    db: CommerceQuery,
    requestIdValue: string,
    marketId: MarketId,
    lock = false,
  ): Promise<RequestRow | undefined> {
    const { rows } = await db.query(
      `SELECT cart_id, order_id, sequence::text AS sequence, data
       FROM after_sales_requests
       WHERE id = $1 AND market = $2${lock ? " FOR UPDATE" : ""}`,
      [requestIdValue, marketId],
    );
    return rows[0] as unknown as RequestRow | undefined;
  }

  async function readTicketData(
    db: CommerceQuery,
    ticketId: string,
    marketId: MarketId,
  ): Promise<AfterSalesTicket | undefined> {
    const { rows } = await db.query(
      `SELECT data FROM after_sales_tickets WHERE id = $1 AND market = $2`,
      [ticketId, marketId],
    );
    return rows[0] ? ticketFromData(rows[0].data) : undefined;
  }

  async function lockMarketCounter(db: CommerceQuery, marketId: MarketId): Promise<void> {
    await db.query(
      `INSERT INTO after_sales_request_counters (market, sequence)
       VALUES ($1, 0)
       ON CONFLICT (market) DO NOTHING`,
      [marketId],
    );
    const { rows } = await db.query(
      `SELECT sequence::text AS sequence
       FROM after_sales_request_counters
       WHERE market = $1
       FOR UPDATE`,
      [marketId],
    );
    if (!rows[0]) internalFailure();
  }

  async function validateRequestAttachments(
    db: CommerceQuery,
    principal: ConsumerPrincipal,
    orderId: string,
    attachmentIds: string[],
  ): Promise<AfterSalesAttachment[]> {
    if (
      attachmentIds.length > MAX_ATTACHMENTS
      || new Set(attachmentIds).size !== attachmentIds.length
    ) {
      fail("VALIDATION_ERROR", { field: "attachment_ids" });
    }
    const sorted = [...attachmentIds].sort();
    const selected: AfterSalesAttachment[] = [];
    for (const attachmentId of sorted) {
      const { rows } = await db.query(
        `SELECT id, file_name, media_type, size_bytes, created_at, expires_at
         FROM after_sales_attachments
         WHERE id = $1 AND market = $2 AND order_id = $3 AND cart_id = $4`,
        [attachmentId, market.id, orderId, principal.cartId],
      );
      const row = rows[0] as unknown as AttachmentRow | undefined;
      if (!row) fail("NOT_FOUND", { attachment_id: attachmentId });
      const attachment = attachmentFromRow(row);
      if (attachment.status === "expired") {
        fail("ATTACHMENT_EXPIRED", { attachment_id: attachmentId });
      }
      selected.push(attachment);
    }
    return selected;
  }

  async function validateTicketAttachments(
    db: CommerceQuery,
    request: AfterSalesRequest,
    cartId: string,
    orderId: string,
  ): Promise<void> {
    if (!Array.isArray(request.attachments)) internalFailure();
    for (const attachment of request.attachments) {
      if (typeof attachment?.id !== "string") internalFailure();
      const { rows } = await db.query(
        `SELECT expires_at
         FROM after_sales_attachments
         WHERE id = $1 AND market = $2 AND order_id = $3 AND cart_id = $4`,
        [attachment.id, market.id, orderId, cartId],
      );
      if (!rows[0]) fail("NOT_FOUND", { attachment_id: attachment.id });
      if (now().getTime() >= Date.parse(iso(rows[0].expires_at))) {
        fail("ATTACHMENT_EXPIRED", { attachment_id: attachment.id });
      }
    }
  }

  return {
    async createRequest(principal, input, options) {
      const consumer = requireConsumer(principal);
      validateRequestInput(input);
      const key = validateIdempotencyKey(options.idempotencyKey);
      const fingerprint = createAfterSalesRequestFingerprint(input);
      const creationKey = createIdempotencyScope({
        market: market.id,
        actorId: consumer.cartId,
        operation: "createAfterSalesRequest",
        key,
      });

      // Uncertain/duplicate results are always resolved against the original
      // key first; a replay must not require re-validating today's order state.
      const existing = await pool.query(
        `SELECT fingerprint, sequence::text AS sequence, data
         FROM after_sales_requests
         WHERE market = $1 AND cart_id = $2 AND creation_key = $3`,
        [market.id, consumer.cartId, creationKey],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].fingerprint !== fingerprint) {
          fail("IDEMPOTENCY_CONFLICT", { operation: "createAfterSalesRequest" });
        }
        return {
          request: currentRequest(storedRequest(
            existing.rows[0].data,
            existing.rows[0].sequence,
          )),
          replayed: true,
        };
      }

      const published = await transaction(pool, async (db) => {
        const order = await readOrderRow(db, input.orderId, market.id);
        if (!order || order.cart_id !== consumer.cartId) fail("NOT_FOUND");
        const selectedAttachments = await validateRequestAttachments(
          db,
          consumer,
          order.id,
          input.attachmentIds ?? [],
        );
        const createdAt = now().toISOString();
        const request: AfterSalesRequest = {
          id: `asr_${randomUUID()}`,
          sequence: "0",
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
        return publishAfterSalesRequestInTransaction(db, {
          request,
          cartId: consumer.cartId,
          creationKey,
          fingerprint,
        });
      });
      return {
        request: currentRequest(published.request),
        replayed: published.replayed,
      } satisfies CreateRequestResult;
    },

    async getRequest(principal, requestIdValue) {
      const consumer = requireConsumer(principal);
      const row = await readRequestRow(pool, requestIdValue, market.id);
      if (!row || row.cart_id !== consumer.cartId) fail("NOT_FOUND");
      return currentRequest(storedRequest(row.data, row.sequence));
    },

    async getConsumerTicket(principal, ticketId) {
      const consumer = requireConsumer(principal);
      const { rows } = await pool.query(
        `SELECT ticket.data AS data
         FROM after_sales_tickets AS ticket
         JOIN after_sales_requests AS request
           ON request.id = ticket.request_id AND request.market = ticket.market
         WHERE ticket.id = $1 AND ticket.market = $2 AND request.cart_id = $3`,
        [ticketId, market.id, consumer.cartId],
      );
      if (!rows[0]) fail("NOT_FOUND");
      return ticketFromData(rows[0].data);
    },

    async uploadAttachment(principal, input) {
      const consumer = requireConsumer(principal);
      if (!isAllowedMediaType(input.mediaType)) fail("UNSUPPORTED_MEDIA_TYPE");
      const bytes = Uint8Array.from(input.bytes ?? []);
      if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
        fail("ATTACHMENT_TOO_LARGE", { max_size_bytes: MAX_ATTACHMENT_BYTES });
      }
      if (bytes.byteLength < 1 || !hasMagic(bytes, input.mediaType)) {
        fail("UNSUPPORTED_MEDIA_TYPE", {
          allowed_media_types: ["image/jpeg", "image/png", "image/webp"],
        });
      }

      const createdAt = now();
      const expiresAt = new Date(createdAt.getTime() + ATTACHMENT_LIFETIME_MS);
      const metadata: AfterSalesAttachment = {
        id: `att_${randomUUID()}`,
        fileName: safeFileName(input.fileName),
        mediaType: input.mediaType,
        sizeBytes: bytes.byteLength,
        status: "active",
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      };

      await transaction(pool, async (db) => {
        const order = await readOrderRow(db, input.orderId, market.id);
        if (!order || order.cart_id !== consumer.cartId) fail("NOT_FOUND");
        await db.query(
          `INSERT INTO after_sales_attachments
             (id, market, order_id, cart_id, file_name, media_type, size_bytes, created_at, expires_at, bytes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            metadata.id,
            market.id,
            order.id,
            consumer.cartId,
            metadata.fileName,
            metadata.mediaType,
            metadata.sizeBytes,
            metadata.createdAt,
            metadata.expiresAt,
            bytes,
          ],
        );
      });
      return metadata;
    },

    async getAttachmentContent(principal, attachmentId) {
      if (principal.kind === "consumer") {
        const consumer = requireConsumer(principal);
        const { rows } = await pool.query(
          `SELECT cart_id, file_name, media_type, size_bytes, expires_at, bytes
           FROM after_sales_attachments
           WHERE id = $1 AND market = $2`,
          [attachmentId, market.id],
        );
        const row = rows[0];
        if (!row || row.cart_id !== consumer.cartId) {
          fail("NOT_FOUND", { attachment_id: attachmentId });
        }
        if (now().getTime() >= Date.parse(iso(row.expires_at))) {
          fail("ATTACHMENT_EXPIRED", { attachment_id: attachmentId });
        }
        return {
          fileName: String(row.file_name),
          mediaType: row.media_type as AfterSalesMediaType,
          sizeBytes: Number(row.size_bytes),
          bytes: Uint8Array.from(row.bytes as Uint8Array),
        } satisfies AfterSalesAttachmentContent;
      }

      requireService(principal);
      const { rows } = await pool.query(
        `SELECT file_name, media_type, size_bytes, expires_at, bytes
         FROM after_sales_attachments
         WHERE id = $1 AND market = $2`,
        [attachmentId, market.id],
      );
      const row = rows[0];
      if (!row) fail("NOT_FOUND", { attachment_id: attachmentId });
      if (now().getTime() >= Date.parse(iso(row.expires_at))) {
        fail("ATTACHMENT_EXPIRED", { attachment_id: attachmentId });
      }
      return {
        fileName: String(row.file_name),
        mediaType: row.media_type as AfterSalesMediaType,
        sizeBytes: Number(row.size_bytes),
        bytes: Uint8Array.from(row.bytes as Uint8Array),
      } satisfies AfterSalesAttachmentContent;
    },

    async getServiceOrder(principal, orderId) {
      requireService(principal);
      const row = await readOrderRow(pool, orderId, market.id);
      if (!row) fail("NOT_FOUND");
      return mapStoredOrder(row, market).order satisfies AfterSalesOrder;
    },

    async getServiceOrderShipment(principal, orderId) {
      requireService(principal);
      const order = await readOrderRow(pool, orderId, market.id);
      if (!order) fail("NOT_FOUND");
      // No logistics table exists; never fabricate shipment data.
      fail("NOT_FOUND");
    },

    async listServiceRequests(principal, input = {}) {
      requireService(principal);
      const limit = input.limit ?? 50;
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
        fail("VALIDATION_ERROR", { field: "limit" });
      }

      let position = "0";
      if (input.cursor !== undefined) {
        if (typeof input.cursor !== "string") {
          fail("INVALID_CURSOR", { field: "cursor" });
        }
        const { rows } = await pool.query(
          `SELECT COALESCE(
             (SELECT sequence FROM after_sales_request_counters WHERE market = $1),
             0
           )::text AS high_watermark`,
          [market.id],
        );
        const highWatermark = rows[0]?.high_watermark;
        if (typeof highWatermark !== "string") internalFailure();
        position = decodeFeedCursor(input.cursor, {
          market: market.id,
          highWatermark,
        }).toString();
      }

      const feed = await requestStore.readFeed({
        market: market.id,
        position,
        limit,
      });
      return {
        ...feed,
        items: feed.items.map(currentRequest),
      } satisfies ServiceRequestFeed;
    },

    async getServiceRequest(principal, requestIdValue) {
      requireService(principal);
      const row = await readRequestRow(pool, requestIdValue, market.id);
      if (!row) fail("NOT_FOUND");
      return currentRequest(storedRequest(row.data, row.sequence));
    },

    async createTicket(principal, input, options) {
      const service = requireService(principal);
      validateTicketInput(input);
      const key = validateIdempotencyKey(options.idempotencyKey);
      const fingerprint = createServiceTicketFingerprint(input);

      return transaction(pool, async (db) => {
        // Same per-market counter as publication, so ticket creation and request
        // publication cannot interleave their key/state checks.
        await lockMarketCounter(db, market.id);

        // Resolve an existing key before touching request/order state. A
        // successful replay must not be rejected by a later order version.
        const keyRow = (await db.query(
          `SELECT fingerprint, ticket_id
           FROM after_sales_ticket_keys
           WHERE market = $1 AND actor_id = $2 AND idempotency_key = $3`,
          [market.id, service.actorId, key],
        )).rows[0];
        if (keyRow) {
          if (keyRow.fingerprint !== fingerprint) {
            fail("IDEMPOTENCY_CONFLICT", { operation: "createServiceTicket" });
          }
          const ticket = await readTicketData(db, String(keyRow.ticket_id), market.id);
          if (!ticket) internalFailure();
          return { ticket, replayed: true } satisfies CreateTicketResult;
        }

        const requestRow = await readRequestRow(db, input.requestId, market.id, true);
        if (!requestRow) fail("NOT_FOUND");
        const request = storedRequest(requestRow.data, requestRow.sequence);

        // A different key may still attach to the original ticket only when the
        // complete normalized fingerprint matches; replies are never modified.
        const existingTicket = (await db.query(
          `SELECT data FROM after_sales_tickets WHERE market = $1 AND request_id = $2`,
          [market.id, input.requestId],
        )).rows[0];
        if (existingTicket) {
          const ticket = ticketFromData(existingTicket.data);
          if (ticketFingerprint(ticket) !== fingerprint) {
            fail("REQUEST_STATE_CONFLICT", {
              request_id: input.requestId,
              status: request.status,
            });
          }
          // Bind the new key to the original ticket in the same transaction so
          // a later lookup by this key resolves and the key cannot be reused
          // for a different request.
          await db.query(
            `INSERT INTO after_sales_ticket_keys
               (market, actor_id, idempotency_key, fingerprint, ticket_id)
             VALUES ($1, $2, $3, $4, $5)`,
            [market.id, service.actorId, key, fingerprint, ticket.id],
          );
          return { ticket, replayed: true } satisfies CreateTicketResult;
        }

        if (request.status !== "pending" || request.ticketId !== null) {
          fail("REQUEST_STATE_CONFLICT", {
            request_id: input.requestId,
            status: request.status,
          });
        }

        // Fixed lock order for new work: counter → request → commerce order.
        const orderRow = await readOrderRow(db, requestRow.order_id, market.id, "share");
        if (!orderRow || orderRow.cart_id !== requestRow.cart_id) fail("NOT_FOUND");
        const mapped = mapStoredOrder(orderRow, market);
        if (input.orderVersion !== mapped.version) {
          fail("ORDER_VERSION_CONFLICT", { field: "order_version" });
        }
        await validateTicketAttachments(db, request, requestRow.cart_id, requestRow.order_id);

        const createdAt = now().toISOString();
        const ticketId = `tic_${randomUUID()}`;
        const receipt = {
          id: `rcp_${randomUUID()}`,
          ticketId,
          requestId: request.id,
          action: input.action,
          requestStatus: "ticket_created" as const,
          createdAt,
        };
        const ticket: AfterSalesTicket = {
          id: ticketId,
          requestId: request.id,
          orderId: requestRow.order_id,
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
        await db.query(
          `INSERT INTO after_sales_tickets (id, market, request_id, order_id, data)
           VALUES ($1, $2, $3, $4, $5::jsonb)`,
          [ticket.id, market.id, ticket.requestId, ticket.orderId, JSON.stringify(ticket)],
        );
        await db.query(
          `INSERT INTO after_sales_ticket_keys
             (market, actor_id, idempotency_key, fingerprint, ticket_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [market.id, service.actorId, key, fingerprint, ticket.id],
        );

        const updatedRequest: AfterSalesRequest = {
          ...request,
          status: "ticket_created",
          ticketId: ticket.id,
          updatedAt: createdAt,
          progress: [
            ...(Array.isArray(request.progress) ? request.progress : []),
            {
              status: "ticket_created",
              message: "A support ticket and final reply are available.",
              occurredAt: createdAt,
            },
          ],
        };
        await db.query(
          `UPDATE after_sales_requests SET data = $1::jsonb WHERE id = $2 AND market = $3`,
          [JSON.stringify(updatedRequest), request.id, market.id],
        );
        return { ticket, replayed: false } satisfies CreateTicketResult;
      });
    },

    async getServiceTicket(principal, ticketId) {
      requireService(principal);
      const ticket = await readTicketData(pool, ticketId, market.id);
      if (!ticket) fail("NOT_FOUND");
      return ticket;
    },

    async findTicketByIdempotencyKey(principal, idempotencyKey) {
      const service = requireService(principal);
      const key = validateIdempotencyKey(idempotencyKey);
      const { rows } = await pool.query(
        `SELECT ticket_id
         FROM after_sales_ticket_keys
         WHERE market = $1 AND actor_id = $2 AND idempotency_key = $3`,
        [market.id, service.actorId, key],
      );
      const keyRow = rows[0];
      if (!keyRow) {
        return {
          kind: "currently_unavailable",
          retryAfterMs: Number.isFinite(retryAfterMs) ? Math.max(0, Math.trunc(retryAfterMs)) : 0,
        } satisfies TicketCreationLookup;
      }
      const ticket = await readTicketData(pool, String(keyRow.ticket_id), market.id);
      if (!ticket) {
        return {
          kind: "currently_unavailable",
          retryAfterMs: Number.isFinite(retryAfterMs) ? Math.max(0, Math.trunc(retryAfterMs)) : 0,
        } satisfies TicketCreationLookup;
      }
      return { kind: "ticket", ticket } satisfies TicketCreationLookup;
    },
  };
}
