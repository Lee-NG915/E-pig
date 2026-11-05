import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  attachmentContentHeaders,
  toServiceOrder,
  toServiceRequest,
  toServiceRequestFeed,
  toServiceShipment,
  toServiceTicket,
  toWireError,
} from "@/adapters/after-sales/wire";
import {
  createAfterSalesError,
  isAfterSalesError,
  type AfterSalesAttachmentContent,
  type AfterSalesErrorCode,
  type AfterSalesErrorDetails,
  type AfterSalesPort,
  type CreateServiceTicketInput,
  type ServicePrincipal,
} from "@/core/contracts/after-sales";
import { afterSalesServiceConfigSchema } from "@/platform/config/after-sales-service-config";
import { isMarketId, type MarketId } from "@/platform/config/markets";
import { createLogger, type Logger } from "@/platform/logging/logger";

const CONTRACT_VERSION = "1";
/**
 * Worst-case legal createServiceTicket body: 10,000 code points encoded as
 * surrogate-pair `\uXXXX` escapes (12 bytes each) plus all audit fields.
 */
const JSON_BODY_LIMIT_BYTES = 131_072;
const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const idempotencyKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;
const cursorPattern = /^[A-Za-z0-9_-]{1,512}$/;
const serviceActorId = "dtc-service";

const baseHeaders = {
  "X-After-Sales-Contract-Version": CONTRACT_VERSION,
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
  "X-Content-Type-Options": "nosniff",
} as const;

const statusByErrorCode: Record<AfterSalesErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNSUPPORTED_CONTRACT_VERSION: 400,
  INVALID_CURSOR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN_MARKET: 403,
  NOT_FOUND: 404,
  IDEMPOTENCY_CONFLICT: 409,
  REQUEST_STATE_CONFLICT: 409,
  ORDER_VERSION_CONFLICT: 409,
  ATTACHMENT_EXPIRED: 410,
  ATTACHMENT_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  UPSTREAM_UNAVAILABLE: 503,
};

type ServiceOperation =
  | "getServiceAttachmentContent"
  | "getServiceOrder"
  | "getServiceOrderShipment"
  | "listServiceRequests"
  | "getServiceRequest"
  | "createServiceTicket"
  | "getServiceTicket"
  | "getServiceTicketByIdempotencyKey";

export type ServiceAfterSalesApiDependencies = {
  market: MarketId;
  serviceToken?: string;
  serviceMarkets?: string;
  logger?: Logger;
  getAfterSales: () => AfterSalesPort;
};

type ServiceConfig = {
  token: string;
  markets: MarketId[];
};

const createTicketFields = new Set([
  "request_id",
  "action",
  "reply",
  "draft_version",
  "approval_id",
  "policy_version",
  "order_version",
]);

const codePointLength = (value: string) => Array.from(value).length;

const createTicketSchema = z.object({
  request_id: z.string().regex(opaqueIdPattern),
  action: z.enum(["reship", "return", "refund", "reject", "other"]),
  reply: z
    .string()
    .min(1)
    .refine((value) => /\S/.test(value))
    .refine((value) => codePointLength(value) <= 10_000),
  draft_version: z.string().min(1).refine((value) => codePointLength(value) <= 128),
  approval_id: z.string().regex(opaqueIdPattern),
  policy_version: z.string().min(1).refine((value) => codePointLength(value) <= 128),
  order_version: z.string().min(1).refine((value) => codePointLength(value) <= 128),
}).strict();

function privateJson(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  return NextResponse.json(body, {
    status,
    headers: { ...baseHeaders, ...extraHeaders },
  });
}

function bytesResponse(content: AfterSalesAttachmentContent) {
  const { contentType, contentDisposition } = attachmentContentHeaders(content);
  return new Response(Uint8Array.from(content.bytes).buffer, {
    status: 200,
    headers: {
      ...baseHeaders,
      "Content-Type": contentType,
      "Content-Disposition": contentDisposition,
    },
  });
}

function requestId(): string {
  return `req_${crypto.randomUUID()}`;
}

function fail(
  code: AfterSalesErrorCode,
  currentRequestId: string,
  details?: AfterSalesErrorDetails,
  recoveryAction?: Parameters<typeof createAfterSalesError>[0]["recoveryAction"],
  retryable?: boolean,
): never {
  throw createAfterSalesError({
    code,
    requestId: currentRequestId,
    details,
    recoveryAction,
    retryable,
  });
}

async function readLimitedBytes(
  request: Request,
  limit: number,
  currentRequestId: string,
  overLimit: () => never,
): Promise<Uint8Array> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^[0-9]+$/.test(contentLength)) {
      fail("VALIDATION_ERROR", currentRequestId, { field: "content_length" });
    }
    if (Number(contentLength) > limit) overLimit();
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      void reader.cancel().catch(() => undefined);
      overLimit();
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function mediaType(contentType: string | null): string {
  return contentType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function validationField(issue: z.core.$ZodIssue): string {
  const field = issue.path[0];
  return typeof field === "string" && createTicketFields.has(field) ? field : "body";
}

function assertValidId(value: string, field: string, currentRequestId: string): string {
  if (!opaqueIdPattern.test(value)) {
    fail("VALIDATION_ERROR", currentRequestId, { field });
  }
  return value;
}

function assertIdempotencyKey(value: string | null, currentRequestId: string): string {
  if (!value || !idempotencyKeyPattern.test(value)) {
    fail("VALIDATION_ERROR", currentRequestId, { field: "idempotency_key" });
  }
  return value;
}

function tokenMatches(provided: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(provided), digest(expected));
}

function correctedError(
  operation: ServiceOperation,
  error: unknown,
  currentRequestId: string,
) {
  const original = isAfterSalesError(error)
    ? error
    : createAfterSalesError({
        code: "INTERNAL_ERROR",
        requestId: currentRequestId,
        retryable: false,
        recoveryAction: "LOOKUP_FIRST",
      });
  let retryable = original.retryable;
  let recoveryAction = original.recoveryAction;

  if (original.code === "INTERNAL_ERROR" || original.code === "UPSTREAM_UNAVAILABLE") {
    if (operation === "createServiceTicket") {
      retryable = false;
      recoveryAction = "LOOKUP_FIRST";
    } else {
      retryable = true;
      recoveryAction = "RETRY_REQUEST";
    }
  }

  return createAfterSalesError({
    code: original.code,
    requestId: currentRequestId,
    retryable,
    recoveryAction,
    details: original.details,
  });
}

export function createServiceAfterSalesApi(
  deps: ServiceAfterSalesApiDependencies,
) {
  const logger = deps.logger ?? createLogger({ module: "after-sales-service-http" });

  async function execute(
    operation: ServiceOperation,
    request: Request,
    action: (currentRequestId: string) => Promise<Response>,
  ): Promise<Response> {
    const currentRequestId = requestId();
    try {
      return await action(currentRequestId);
    } catch (error) {
      const normalized = correctedError(operation, error, currentRequestId);
      const status = statusByErrorCode[normalized.code];
      const extraHeaders: Record<string, string> = {};
      const retryAfter = normalized.details?.retry_after_seconds;
      if (
        (status === 429 || status === 503)
        && Number.isInteger(retryAfter)
        && retryAfter !== undefined
        && retryAfter >= 0
      ) {
        extraHeaders["Retry-After"] = String(retryAfter);
      }
      const fields = {
        operation,
        requestId: currentRequestId,
        status,
        code: normalized.code,
      };
      if (status >= 500) logger.error("after_sales.service_http.failed", fields);
      else logger.warn("after_sales.service_http.rejected", fields);
      return privateJson(toWireError(normalized, currentRequestId), status, extraHeaders);
    }
  }

  function assertMarket(market: string, currentRequestId: string): MarketId {
    if (!isMarketId(market)) {
      fail("VALIDATION_ERROR", currentRequestId, { field: "market" });
    }
    return market;
  }

  function assertContractVersion(request: Request, currentRequestId: string): void {
    if (request.headers.get("X-After-Sales-Contract-Version") !== CONTRACT_VERSION) {
      fail("UNSUPPORTED_CONTRACT_VERSION", currentRequestId, {
        supported_major: CONTRACT_VERSION,
      });
    }
  }

  function serviceConfig(currentRequestId: string): ServiceConfig {
    const parsed = afterSalesServiceConfigSchema.safeParse({
      token: deps.serviceToken,
      markets: deps.serviceMarkets,
    });
    if (!parsed.success) fail("INTERNAL_ERROR", currentRequestId);
    return parsed.data;
  }

  function servicePrincipal(
    request: Request,
    market: MarketId,
    config: ServiceConfig,
    currentRequestId: string,
  ): ServicePrincipal {
    const authorization = request.headers.get("authorization");
    const match = authorization?.match(/^Bearer ([^\s]+)$/i);
    if (!match || !tokenMatches(match[1], config.token)) {
      fail("UNAUTHORIZED", currentRequestId);
    }
    if (!config.markets.includes(market)) {
      fail("FORBIDDEN_MARKET", currentRequestId, { market });
    }
    if (market !== deps.market) fail("NOT_FOUND", currentRequestId);
    return {
      kind: "service",
      market,
      actorId: serviceActorId,
      allowedMarkets: config.markets,
    };
  }

  function authorize(
    request: Request,
    market: string,
    currentRequestId: string,
  ): ServicePrincipal {
    const servedMarket = assertMarket(market, currentRequestId);
    assertContractVersion(request, currentRequestId);
    const config = serviceConfig(currentRequestId);
    return servicePrincipal(request, servedMarket, config, currentRequestId);
  }

  async function jsonInput(
    request: Request,
    currentRequestId: string,
  ): Promise<z.infer<typeof createTicketSchema>> {
    if (mediaType(request.headers.get("content-type")) !== "application/json") {
      fail("UNSUPPORTED_MEDIA_TYPE", currentRequestId);
    }
    let bytes: Uint8Array;
    try {
      bytes = await readLimitedBytes(
        request,
        JSON_BODY_LIMIT_BYTES,
        currentRequestId,
        () => fail("VALIDATION_ERROR", currentRequestId, { field: "body" }),
      );
    } catch (error) {
      if (isAfterSalesError(error)) throw error;
      fail("VALIDATION_ERROR", currentRequestId, { field: "body" });
    }

    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      fail("VALIDATION_ERROR", currentRequestId, { field: "body" });
    }
    const parsed = createTicketSchema.safeParse(value);
    if (!parsed.success) {
      fail("VALIDATION_ERROR", currentRequestId, {
        field: validationField(parsed.error.issues[0]),
      });
    }
    return parsed.data;
  }

  function feedInput(request: Request, currentRequestId: string) {
    const params = new URL(request.url).searchParams;
    const cursors = params.getAll("cursor");
    const limits = params.getAll("limit");

    if (cursors.length > 1) {
      fail("INVALID_CURSOR", currentRequestId, { field: "cursor" });
    }
    const cursor = cursors[0];
    if (cursor !== undefined && !cursorPattern.test(cursor)) {
      fail("INVALID_CURSOR", currentRequestId, { field: "cursor" });
    }

    if (limits.length > 1) {
      fail("VALIDATION_ERROR", currentRequestId, { field: "limit" });
    }
    const rawLimit = limits[0];
    let limit: number | undefined;
    if (rawLimit !== undefined) {
      if (!/^[0-9]+$/.test(rawLimit)) {
        fail("VALIDATION_ERROR", currentRequestId, { field: "limit" });
      }
      limit = Number(rawLimit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
        fail("VALIDATION_ERROR", currentRequestId, { field: "limit" });
      }
    }

    return { cursor, limit };
  }

  return {
    getServiceAttachmentContent(
      request: Request,
      market: string,
      attachmentId: string,
    ) {
      return execute("getServiceAttachmentContent", request, async (currentRequestId) => {
        const principal = authorize(request, market, currentRequestId);
        const id = assertValidId(attachmentId, "attachment_id", currentRequestId);
        const content = await deps.getAfterSales().getAttachmentContent(principal, id);
        return bytesResponse(content);
      });
    },

    getServiceOrder(request: Request, market: string, orderId: string) {
      return execute("getServiceOrder", request, async (currentRequestId) => {
        const principal = authorize(request, market, currentRequestId);
        const id = assertValidId(orderId, "order_id", currentRequestId);
        const order = await deps.getAfterSales().getServiceOrder(principal, id);
        return privateJson(toServiceOrder(order));
      });
    },

    getServiceOrderShipment(request: Request, market: string, orderId: string) {
      return execute("getServiceOrderShipment", request, async (currentRequestId) => {
        const principal = authorize(request, market, currentRequestId);
        const id = assertValidId(orderId, "order_id", currentRequestId);
        const shipment = await deps.getAfterSales().getServiceOrderShipment(principal, id);
        return privateJson(toServiceShipment(shipment));
      });
    },

    listServiceRequests(request: Request, market: string) {
      return execute("listServiceRequests", request, async (currentRequestId) => {
        const principal = authorize(request, market, currentRequestId);
        const input = feedInput(request, currentRequestId);
        const feed = await deps.getAfterSales().listServiceRequests(principal, input);
        return privateJson(toServiceRequestFeed(feed));
      });
    },

    getServiceRequest(request: Request, market: string, requestIdValue: string) {
      return execute("getServiceRequest", request, async (currentRequestId) => {
        const principal = authorize(request, market, currentRequestId);
        const id = assertValidId(requestIdValue, "request_id", currentRequestId);
        const afterSalesRequest = await deps.getAfterSales().getServiceRequest(principal, id);
        return privateJson(toServiceRequest(afterSalesRequest));
      });
    },

    createServiceTicket(request: Request, market: string) {
      return execute("createServiceTicket", request, async (currentRequestId) => {
        const principal = authorize(request, market, currentRequestId);
        const idempotencyKey = assertIdempotencyKey(
          request.headers.get("Idempotency-Key"),
          currentRequestId,
        );
        const body = await jsonInput(request, currentRequestId);
        const input: CreateServiceTicketInput = {
          requestId: body.request_id,
          action: body.action,
          reply: body.reply,
          draftVersion: body.draft_version,
          approvalId: body.approval_id,
          policyVersion: body.policy_version,
          orderVersion: body.order_version,
        };
        const result = await deps.getAfterSales().createTicket(
          principal,
          input,
          { idempotencyKey },
        );
        return privateJson(
          toServiceTicket(result.ticket),
          result.replayed ? 200 : 201,
          result.replayed ? { "Idempotency-Replayed": "true" } : {},
        );
      });
    },

    getServiceTicket(request: Request, market: string, ticketId: string) {
      return execute("getServiceTicket", request, async (currentRequestId) => {
        const principal = authorize(request, market, currentRequestId);
        const id = assertValidId(ticketId, "ticket_id", currentRequestId);
        const ticket = await deps.getAfterSales().getServiceTicket(principal, id);
        return privateJson(toServiceTicket(ticket));
      });
    },

    getServiceTicketByIdempotencyKey(
      request: Request,
      market: string,
      idempotencyKey: string,
    ) {
      return execute("getServiceTicketByIdempotencyKey", request, async (currentRequestId) => {
        const principal = authorize(request, market, currentRequestId);
        const key = assertIdempotencyKey(idempotencyKey, currentRequestId);
        const lookup = await deps.getAfterSales().findTicketByIdempotencyKey(
          principal,
          key,
        );
        if (lookup.kind === "ticket") {
          return privateJson(toServiceTicket(lookup.ticket));
        }
        if (lookup.kind === "in_flight") {
          const retryAfterMs = Number.isFinite(lookup.retryAfterMs)
            ? Math.max(0, Math.trunc(lookup.retryAfterMs))
            : 0;
          return privateJson(
            { outcome: "IN_FLIGHT", retry_after_ms: retryAfterMs },
            202,
          );
        }
        fail(
          "NOT_FOUND",
          currentRequestId,
          undefined,
          "RETRY_CREATE_WITH_SAME_KEY",
          false,
        );
      });
    },
  };
}
