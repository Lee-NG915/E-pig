import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  attachmentContentHeaders,
  toAttachment,
  toConsumerRequest,
  toConsumerTicket,
  toWireError,
} from "@/adapters/after-sales/wire";
import {
  createAfterSalesError,
  isAfterSalesError,
  type AfterSalesAttachmentContent,
  type AfterSalesErrorCode,
  type AfterSalesErrorDetails,
  type AfterSalesPort,
  type ConsumerPrincipal,
} from "@/core/contracts/after-sales";
import { isMarketId, type MarketId } from "@/platform/config/markets";
import { createLogger, type Logger } from "@/platform/logging/logger";
import { cartCookieName, readCartCookie } from "@/platform/security/cart-cookie";

const CONTRACT_VERSION = "1";
// A valid 5000-code-point description can exceed 60 KiB when clients send
// non-BMP characters as surrogate-pair escapes, so keep the envelope above that.
const JSON_BODY_LIMIT_BYTES = 65_536;
const MAX_ATTACHMENT_BYTES = 5_242_880;
const MAX_MULTIPART_BYTES = MAX_ATTACHMENT_BYTES + 65_536;
const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const idempotencyKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;
const allowedMediaTypes = ["image/jpeg", "image/png", "image/webp"] as const;

const baseHeaders = {
  "X-After-Sales-Contract-Version": CONTRACT_VERSION,
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
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

type ConsumerOperation =
  | "uploadAttachment"
  | "getAttachmentContent"
  | "createAfterSalesRequest"
  | "getAfterSalesRequest"
  | "getConsumerTicket";

export type ConsumerAfterSalesApiDependencies = {
  market: MarketId;
  origin?: string;
  cookieSecret?: string;
  now?: () => Date;
  logger?: Logger;
  getAfterSales: () => AfterSalesPort;
};

const createRequestSchema = z.object({
  order_id: z.string().regex(opaqueIdPattern),
  type: z.enum(["damaged", "wrong_item", "return", "other"]),
  description: z
    .string()
    .min(1)
    .refine((value) => Array.from(value).length <= 5000)
    .refine((value) => /\S/.test(value)),
  attachment_ids: z
    .array(z.string().regex(opaqueIdPattern))
    .max(3)
    .refine((values) => new Set(values).size === values.length)
    .optional(),
}).strict();

const createRequestFields = new Set(["order_id", "type", "description", "attachment_ids"]);

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

function bytesResponse(
  content: AfterSalesAttachmentContent,
) {
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
  return typeof field === "string" && createRequestFields.has(field) ? field : "body";
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

function trustedOrigin(origin: string | undefined, currentRequestId: string): string {
  if (!origin) fail("INTERNAL_ERROR", currentRequestId);
  try {
    const url = new URL(origin);
    if (
      url.username
      || url.password
      || url.pathname !== "/"
      || url.search
      || url.hash
      || (
        url.protocol !== "https:"
        && !(url.protocol === "http:" && url.hostname === "localhost")
      )
    ) {
      fail("INTERNAL_ERROR", currentRequestId);
    }
    return url.origin;
  } catch {
    fail("INTERNAL_ERROR", currentRequestId);
  }
}

function correctedError(
  operation: ConsumerOperation,
  error: unknown,
  currentRequestId: string,
) {
  const original = isAfterSalesError(error)
    ? error
    : createAfterSalesError({
        code: "INTERNAL_ERROR",
        requestId: currentRequestId,
      });
  let retryable = original.retryable;
  let recoveryAction = original.recoveryAction;

  if (original.code === "INTERNAL_ERROR" || original.code === "UPSTREAM_UNAVAILABLE") {
    if (operation === "createAfterSalesRequest") {
      retryable = false;
      recoveryAction = "RETRY_CREATE_WITH_SAME_KEY";
    } else if (operation === "uploadAttachment") {
      retryable = false;
      recoveryAction = "RECONCILE_MANUALLY";
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

export function createConsumerAfterSalesApi(
  deps: ConsumerAfterSalesApiDependencies,
) {
  const logger = deps.logger ?? createLogger({ module: "after-sales-http" });
  const currentTime = () => deps.now?.() ?? new Date();

  async function execute(
    operation: ConsumerOperation,
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
      if (status >= 500) logger.error("after_sales.http.failed", fields);
      else logger.warn("after_sales.http.rejected", fields);
      return privateJson(toWireError(normalized, currentRequestId), status, extraHeaders);
    }
  }

  function assertMarket(market: string, currentRequestId: string): MarketId {
    if (!isMarketId(market)) {
      fail("VALIDATION_ERROR", currentRequestId, { field: "market" });
    }
    if (market !== deps.market) fail("NOT_FOUND", currentRequestId);
    return market;
  }

  function assertContractVersion(request: Request, currentRequestId: string): void {
    if (request.headers.get("X-After-Sales-Contract-Version") !== CONTRACT_VERSION) {
      fail("UNSUPPORTED_CONTRACT_VERSION", currentRequestId, {
        supported_major: CONTRACT_VERSION,
      });
    }
  }

  function assertCookieSecret(currentRequestId: string): string {
    if (!deps.cookieSecret || deps.cookieSecret.length < 32) {
      fail("INTERNAL_ERROR", currentRequestId);
    }
    return deps.cookieSecret;
  }

  function consumerPrincipal(
    request: Request,
    market: MarketId,
    currentRequestId: string,
  ): ConsumerPrincipal {
    const cookieSecret = assertCookieSecret(currentRequestId);
    const token = new NextRequest(request.url, {
      headers: request.headers,
    }).cookies.get(cartCookieName(market))?.value;
    const cartId = readCartCookie(
      token,
      market,
      cookieSecret,
      currentTime().getTime() / 1000,
    );
    if (!cartId) fail("UNAUTHORIZED", currentRequestId);
    return { kind: "consumer", market, cartId };
  }

  function assertTrustedPost(
    request: Request,
    currentRequestId: string,
  ): void {
    const origin = trustedOrigin(deps.origin, currentRequestId);
    if (
      request.headers.get("origin") !== origin
      || request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site"
    ) {
      fail("UNAUTHORIZED", currentRequestId);
    }
  }

  async function jsonInput(
    request: Request,
    currentRequestId: string,
  ): Promise<z.infer<typeof createRequestSchema>> {
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
    const parsed = createRequestSchema.safeParse(value);
    if (!parsed.success) {
      fail("VALIDATION_ERROR", currentRequestId, {
        field: validationField(parsed.error.issues[0]),
      });
    }
    return parsed.data;
  }

  async function multipartInput(
    request: Request,
    currentRequestId: string,
  ) {
    if (mediaType(request.headers.get("content-type")) !== "multipart/form-data") {
      fail("UNSUPPORTED_MEDIA_TYPE", currentRequestId, {
        allowed_media_types: [...allowedMediaTypes],
      });
    }
    let bytes: Uint8Array;
    try {
      bytes = await readLimitedBytes(
        request,
        MAX_MULTIPART_BYTES,
        currentRequestId,
        () =>
          fail("ATTACHMENT_TOO_LARGE", currentRequestId, {
            max_size_bytes: MAX_ATTACHMENT_BYTES,
          }),
      );
    } catch (error) {
      if (isAfterSalesError(error)) throw error;
      fail("VALIDATION_ERROR", currentRequestId, { field: "body" });
    }

    const snapshotHeaders = new Headers(request.headers);
    snapshotHeaders.delete("content-length");
    let form: FormData;
    try {
      const snapshot = new Request(request.url, {
        method: "POST",
        headers: snapshotHeaders,
        body: new Uint8Array(bytes).buffer,
      });
      form = await snapshot.formData();
    } catch {
      fail("VALIDATION_ERROR", currentRequestId, { field: "body" });
    }

    for (const key of new Set(form.keys())) {
      if (key !== "order_id" && key !== "file") {
        fail("VALIDATION_ERROR", currentRequestId, { field: "body" });
      }
    }
    const orderIds = form.getAll("order_id");
    const files = form.getAll("file");
    if (orderIds.length !== 1 || files.length !== 1) {
      fail("VALIDATION_ERROR", currentRequestId, {
        field: orderIds.length !== 1 ? "order_id" : "file",
      });
    }
    const orderId = orderIds[0];
    const file = files[0];
    if (
      typeof orderId !== "string"
      || !opaqueIdPattern.test(orderId)
      || typeof file === "string"
    ) {
      fail("VALIDATION_ERROR", currentRequestId, {
        field: typeof orderId === "string" ? "file" : "order_id",
      });
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      fail("ATTACHMENT_TOO_LARGE", currentRequestId, {
        max_size_bytes: MAX_ATTACHMENT_BYTES,
      });
    }
    if (
      !(allowedMediaTypes as readonly string[]).includes(file.type)
    ) {
      fail("UNSUPPORTED_MEDIA_TYPE", currentRequestId, {
        allowed_media_types: [...allowedMediaTypes],
      });
    }
    return {
      orderId,
      fileName: file.name,
      mediaType: file.type as (typeof allowedMediaTypes)[number],
      bytes: new Uint8Array(await file.arrayBuffer()),
    };
  }

  return {
    uploadAttachment(request: Request, market: string) {
      return execute("uploadAttachment", request, async (currentRequestId) => {
        const servedMarket = assertMarket(market, currentRequestId);
        assertContractVersion(request, currentRequestId);
        assertCookieSecret(currentRequestId);
        assertTrustedPost(request, currentRequestId);
        const principal = consumerPrincipal(request, servedMarket, currentRequestId);
        const input = await multipartInput(request, currentRequestId);
        const attachment = await deps.getAfterSales().uploadAttachment(principal, input);
        return privateJson(toAttachment(attachment), 201);
      });
    },

    getAttachmentContent(
      request: Request,
      market: string,
      attachmentId: string,
    ) {
      return execute("getAttachmentContent", request, async (currentRequestId) => {
        const servedMarket = assertMarket(market, currentRequestId);
        assertContractVersion(request, currentRequestId);
        const id = assertValidId(
          attachmentId,
          "attachment_id",
          currentRequestId,
        );
        const principal = consumerPrincipal(request, servedMarket, currentRequestId);
        const content = await deps.getAfterSales().getAttachmentContent(principal, id);
        return bytesResponse(content);
      });
    },

    createAfterSalesRequest(request: Request, market: string) {
      return execute("createAfterSalesRequest", request, async (currentRequestId) => {
        const servedMarket = assertMarket(market, currentRequestId);
        assertContractVersion(request, currentRequestId);
        assertCookieSecret(currentRequestId);
        assertTrustedPost(request, currentRequestId);
        const principal = consumerPrincipal(request, servedMarket, currentRequestId);
        const idempotencyKey = assertIdempotencyKey(
          request.headers.get("Idempotency-Key"),
          currentRequestId,
        );
        const body = await jsonInput(request, currentRequestId);
        const result = await deps.getAfterSales().createRequest(
          principal,
          {
            orderId: body.order_id,
            type: body.type,
            description: body.description,
            attachmentIds: body.attachment_ids,
          },
          { idempotencyKey },
        );
        return privateJson(
          toConsumerRequest(result.request),
          result.replayed ? 200 : 201,
          result.replayed ? { "Idempotency-Replayed": "true" } : {},
        );
      });
    },

    getAfterSalesRequest(request: Request, market: string, requestIdValue: string) {
      return execute("getAfterSalesRequest", request, async (currentRequestId) => {
        const servedMarket = assertMarket(market, currentRequestId);
        assertContractVersion(request, currentRequestId);
        const id = assertValidId(requestIdValue, "request_id", currentRequestId);
        const principal = consumerPrincipal(request, servedMarket, currentRequestId);
        const afterSalesRequest = await deps.getAfterSales().getRequest(principal, id);
        return privateJson(toConsumerRequest(afterSalesRequest));
      });
    },

    getConsumerTicket(request: Request, market: string, ticketId: string) {
      return execute("getConsumerTicket", request, async (currentRequestId) => {
        const servedMarket = assertMarket(market, currentRequestId);
        assertContractVersion(request, currentRequestId);
        const id = assertValidId(ticketId, "ticket_id", currentRequestId);
        const principal = consumerPrincipal(request, servedMarket, currentRequestId);
        const ticket = await deps.getAfterSales().getConsumerTicket(principal, id);
        return privateJson(toConsumerTicket(ticket));
      });
    },
  };
}
