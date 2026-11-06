import { z } from "zod";

import {
  afterSalesErrorCodes,
  afterSalesRecoveryActions,
  type AfterSalesErrorCode,
  type AfterSalesRecoveryAction,
} from "@/core/contracts/after-sales/errors";
import { marketIds } from "@/platform/config/markets";

export const AFTER_SALES_CONTRACT_VERSION = "1";
export const MAX_ATTACHMENTS = 3;
export const MAX_ATTACHMENT_BYTES = 5_242_880;
export const MAX_DESCRIPTION_CODE_POINTS = 5000;
export const ATTACHMENT_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AttachmentMediaType = (typeof ATTACHMENT_MEDIA_TYPES)[number];
export type RequestType = "damaged" | "wrong_item" | "return" | "other";

export type AfterSalesAttachmentView = {
  attachment_id: string;
  file_name: string;
  media_type: AttachmentMediaType;
  size_bytes: number;
  status: "active" | "expired";
  created_at: string;
  expires_at: string;
};

export type AfterSalesRequestView = {
  request_id: string;
  order_id: string;
  market: string;
  type: RequestType;
  description: string;
  attachments: AfterSalesAttachmentView[];
  status: "pending" | "ticket_created";
  ticket_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TicketAction = "reship" | "return" | "refund" | "reject" | "other";

export type AfterSalesTicketView = {
  ticket_id: string;
  request_id: string;
  order_id: string;
  market: string;
  action: TicketAction;
  reply: string;
  status: "open" | "processing" | "closed";
  receipt: {
    receipt_id: string;
    ticket_id: string;
    request_id: string;
    action: TicketAction;
    request_status: "ticket_created";
    created_at: string;
  };
  created_at: string;
  updated_at: string;
};

export type RequestBody = {
  order_id: string;
  type: RequestType;
  description: string;
  attachment_ids: string[];
};

const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const utcPattern =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$/;

function isUtc(value: string): boolean {
  return utcPattern.test(value) && !Number.isNaN(Date.parse(value));
}

const utcString = z.string().refine(isUtc);
const opaqueId = z.string().regex(opaqueIdPattern);
const marketId = z.enum(marketIds);

const requestTypeSchema = z.enum(["damaged", "wrong_item", "return", "other"]);
const ticketActionSchema = z.enum([
  "reship",
  "return",
  "refund",
  "reject",
  "other",
]);

function nonBlankText(maxCodePoints: number) {
  return z
    .string()
    .min(1)
    .refine((value) => /\S/.test(value))
    .refine((value) => Array.from(value).length <= maxCodePoints);
}

const attachmentSchema = z.object({
  attachment_id: opaqueId,
  file_name: z
    .string()
    .min(1)
    .refine((value) => Array.from(value).length <= 255),
  media_type: z.enum(ATTACHMENT_MEDIA_TYPES),
  size_bytes: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
  status: z.enum(["active", "expired"]),
  created_at: utcString,
  expires_at: utcString,
});

const requestSchema = z
  .object({
    request_id: opaqueId,
    order_id: opaqueId,
    market: marketId,
    type: requestTypeSchema,
    description: nonBlankText(MAX_DESCRIPTION_CODE_POINTS),
    attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS),
    status: z.enum(["pending", "ticket_created"]),
    ticket_id: opaqueId.nullable(),
    created_at: utcString,
    updated_at: utcString,
  })
  .refine(
    (value) =>
      value.status === "ticket_created"
        ? Boolean(value.ticket_id)
        : value.ticket_id === null,
    {
      message: "Request status and ticket linkage are inconsistent.",
      path: ["ticket_id"],
    },
  );

const ticketSchema = z
  .object({
    ticket_id: opaqueId,
    request_id: opaqueId,
    order_id: opaqueId,
    market: marketId,
    action: ticketActionSchema,
    reply: nonBlankText(10_000),
    status: z.enum(["open", "processing", "closed"]),
    receipt: z.object({
      receipt_id: opaqueId,
      ticket_id: opaqueId,
      request_id: opaqueId,
      action: ticketActionSchema,
      request_status: z.literal("ticket_created"),
      created_at: utcString,
    }),
    created_at: utcString,
    updated_at: utcString,
  })
  .refine(
    (value) =>
      value.receipt.ticket_id === value.ticket_id &&
      value.receipt.request_id === value.request_id &&
      value.receipt.action === value.action,
    {
      message: "Ticket and receipt linkage are inconsistent.",
      path: ["receipt"],
    },
  );

const errorSchema = z.object({
  code: z.enum(afterSalesErrorCodes),
  message: z.string().min(1).max(300).optional(),
  request_id: opaqueId.optional(),
  retryable: z.boolean().optional(),
  recovery_action: z.enum(afterSalesRecoveryActions).optional(),
  details: z
    .object({
      field: z.string().max(128).optional(),
      retry_after_seconds: z.number().int().min(0).optional(),
      allowed_media_types: z.array(z.enum(ATTACHMENT_MEDIA_TYPES)).max(3).optional(),
      attachment_id: opaqueId.optional(),
      operation: z
        .enum(["createAfterSalesRequest", "createServiceTicket"])
        .optional(),
      max_size_bytes: z.number().int().positive().optional(),
      request_id: opaqueId.optional(),
      status: z.enum(["pending", "ticket_created"]).optional(),
      supported_major: z.literal("1").optional(),
      market: marketId.optional(),
    })
    .optional(),
});

export class AfterSalesClientError extends Error {
  readonly status: number;
  readonly code: AfterSalesErrorCode | null;
  readonly requestId: string | null;
  readonly retryable: boolean;
  readonly recoveryAction: AfterSalesRecoveryAction | null;

  constructor({
    message,
    status,
    code = null,
    requestId = null,
    retryable = false,
    recoveryAction = null,
  }: {
    message: string;
    status: number;
    code?: AfterSalesErrorCode | null;
    requestId?: string | null;
    retryable?: boolean;
    recoveryAction?: AfterSalesRecoveryAction | null;
  }) {
    super(message);
    this.name = "AfterSalesClientError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.retryable = retryable;
    this.recoveryAction = recoveryAction;
  }
}

export class AfterSalesTransportError extends Error {
  readonly retryable = true;
  constructor() {
    super("We could not reach the after-sales service. Your recovery details are unchanged.");
    this.name = "AfterSalesTransportError";
  }
}

export function isAuthenticationFailure(error: unknown): boolean {
  return (
    error instanceof AfterSalesClientError &&
    (error.status === 401 ||
      error.status === 403 ||
      error.code === "UNAUTHORIZED" ||
      error.code === "FORBIDDEN_MARKET")
  );
}

export function isDefinitelyNotWritten(error: unknown): boolean {
  return (
    error instanceof AfterSalesClientError &&
    error.status >= 400 &&
    error.status < 500 &&
    ![401, 403, 408, 409, 429].includes(error.status)
  );
}

export function isConflict(error: unknown): boolean {
  return (
    error instanceof AfterSalesClientError &&
    (error.status === 409 ||
      error.code === "IDEMPOTENCY_CONFLICT" ||
      error.code === "REQUEST_STATE_CONFLICT")
  );
}

export function isRateLimitedOrUnavailable(error: unknown): boolean {
  return (
    error instanceof AfterSalesClientError &&
    (error.status === 429 ||
      error.status >= 500 ||
      error.code === "RATE_LIMITED" ||
      error.code === "UPSTREAM_UNAVAILABLE" ||
      error.code === "INTERNAL_ERROR")
  );
}

export function afterSalesQueryBase(
  market: string,
  cartId: string,
  orderId: string,
) {
  return ["after-sales", market, cartId, orderId] as const;
}

export function afterSalesRequestQueryKey(
  market: string,
  cartId: string,
  orderId: string,
  requestId: string,
) {
  return [...afterSalesQueryBase(market, cartId, orderId), "request", requestId] as const;
}

export function afterSalesTicketQueryKey(
  market: string,
  cartId: string,
  orderId: string,
  ticketId: string,
) {
  return [...afterSalesQueryBase(market, cartId, orderId), "ticket", ticketId] as const;
}

function path(market: string, suffix: string): string {
  return `/api/${encodeURIComponent(market)}/after-sales${suffix}`;
}

function headers(extra?: HeadersInit): Headers {
  const result = new Headers(extra);
  result.set("X-After-Sales-Contract-Version", AFTER_SALES_CONTRACT_VERSION);
  return result;
}

function signalWithTimeout(signal?: AbortSignal): AbortSignal {
  if (typeof AbortSignal.timeout !== "function") return signal ?? new AbortController().signal;
  const timeout = AbortSignal.timeout(15_000);
  if (!signal) return timeout;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([signal, timeout]);
  }
  return signal;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new AfterSalesClientError({
      message: "The after-sales service returned an unreadable response.",
      status: response.status,
      retryable: response.status >= 500,
    });
  }
}

function parseErrorResponse(value: unknown, status: number): AfterSalesClientError {
  const candidate =
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "error" in value
      ? (value as { error: unknown }).error
      : value;
  const parsed = errorSchema.safeParse(candidate);
  if (!parsed.success) {
    return new AfterSalesClientError({
      message: "The after-sales request failed. Please retry.",
      status,
      retryable: status >= 500 || status === 429,
    });
  }
  return new AfterSalesClientError({
    message: parsed.data.message ?? "The after-sales request failed. Please retry.",
    status,
    code: parsed.data.code,
    requestId: parsed.data.request_id ?? null,
    retryable: parsed.data.retryable ?? (status >= 500 || status === 429),
    recoveryAction: parsed.data.recovery_action ?? null,
  });
}

function unexpectedResponse(
  status: number,
  retryable = false,
): AfterSalesClientError {
  return new AfterSalesClientError({
    message:
      "The after-sales service returned a response this page could not verify. Please retry.",
    status,
    retryable,
  });
}

async function request(
  market: string,
  suffix: string,
  init: RequestInit,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(path(market, suffix), {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      headers: headers(init.headers),
      signal: signalWithTimeout(init.signal ?? undefined),
    });
  } catch (error) {
    if (error instanceof AfterSalesClientError) throw error;
    throw new AfterSalesTransportError();
  }
  if (!response.ok) {
    throw parseErrorResponse(await readJson(response), response.status);
  }
  if (
    response.headers.get("X-After-Sales-Contract-Version") !==
    AFTER_SALES_CONTRACT_VERSION
  ) {
    throw unexpectedResponse(response.status);
  }
  return response;
}

function assertStatus(response: Response, allowed: readonly number[]): void {
  if (!allowed.includes(response.status)) {
    throw unexpectedResponse(response.status);
  }
}

function parseRequest(value: unknown): AfterSalesRequestView {
  const parsed = requestSchema.safeParse(value);
  if (!parsed.success) {
    throw new AfterSalesClientError({
      message: "The saved after-sales request could not be read safely. Please retry.",
      status: 200,
      retryable: true,
    });
  }
  return parsed.data;
}

function parseTicket(value: unknown): AfterSalesTicketView {
  const parsed = ticketSchema.safeParse(value);
  if (!parsed.success) {
    throw new AfterSalesClientError({
      message: "The saved after-sales reply could not be read safely. Please retry.",
      status: 200,
      retryable: true,
    });
  }
  return parsed.data;
}

function parseAttachment(value: unknown): AfterSalesAttachmentView {
  const parsed = attachmentSchema.safeParse(value);
  if (!parsed.success) {
    throw new AfterSalesClientError({
      message: "The uploaded photo could not be confirmed safely. Please retry.",
      status: 201,
      retryable: true,
    });
  }
  return parsed.data;
}

export function validateAttachmentFile(file: File): string | null {
  if (!(ATTACHMENT_MEDIA_TYPES as readonly string[]).includes(file.type)) {
    return `${file.name}: use a JPEG, PNG, or WebP image.`;
  }
  if (file.size <= 0) return `${file.name}: the file is empty.`;
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `${file.name}: each photo must be 5 MiB or smaller.`;
  }
  return null;
}

export function codePointLength(value: string): number {
  return Array.from(value).length;
}

export function validateRequestBody(body: RequestBody): string | null {
  if (!opaqueIdPattern.test(body.order_id)) return "The order reference is invalid.";
  if (!["damaged", "wrong_item", "return", "other"].includes(body.type)) {
    return "Choose what went wrong with this order.";
  }
  const description = body.description.trim();
  if (!description) return "Describe the issue before sending.";
  if (codePointLength(description) > MAX_DESCRIPTION_CODE_POINTS) {
    return "Use 5000 characters or fewer.";
  }
  if (body.attachment_ids.length > MAX_ATTACHMENTS) {
    return "Attach up to 3 photos.";
  }
  return null;
}

export async function uploadAttachment(
  market: string,
  orderId: string,
  file: File,
  signal?: AbortSignal,
): Promise<AfterSalesAttachmentView> {
  const form = new FormData();
  form.set("order_id", orderId);
  form.set("file", file);
  const response = await request(market, "/attachments", {
    method: "POST",
    body: form,
    signal,
  });
  assertStatus(response, [201]);
  return parseAttachment(await readJson(response));
}

export async function getAttachmentContent(
  market: string,
  attachmentId: string,
  signal?: AbortSignal,
): Promise<{ blob: Blob; mediaType: AttachmentMediaType }> {
  const response = await request(
    market,
    `/attachments/${encodeURIComponent(attachmentId)}/content`,
    { method: "GET", signal },
  );
  assertStatus(response, [200]);
  const mediaType = response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (
    !mediaType ||
    !(ATTACHMENT_MEDIA_TYPES as readonly string[]).includes(mediaType)
  ) {
    throw new AfterSalesClientError({
      message: "This photo could not be previewed safely.",
      status: 200,
      retryable: false,
    });
  }
  const blob = await response.blob();
  if (blob.size <= 0 || blob.size > MAX_ATTACHMENT_BYTES) {
    throw new AfterSalesClientError({
      message: "This photo could not be previewed safely.",
      status: 200,
      retryable: false,
    });
  }
  return { blob, mediaType: mediaType as AttachmentMediaType };
}

function matchesSubmittedBody(
  request: AfterSalesRequestView,
  market: string,
  body: RequestBody,
): boolean {
  const expectedIds = [...(body.attachment_ids ?? [])].sort();
  const actualIds = request.attachments
    .map((attachment) => attachment.attachment_id)
    .sort();
  return (
    request.market === market &&
    request.order_id === body.order_id &&
    request.type === body.type &&
    request.description === body.description &&
    expectedIds.length === actualIds.length &&
    expectedIds.every((id, index) => id === actualIds[index])
  );
}

export async function createAfterSalesRequest(
  market: string,
  body: RequestBody,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<{ request: AfterSalesRequestView; replayed: boolean }> {
  const response = await request(market, "/requests", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    signal,
  });
  assertStatus(response, [200, 201]);
  const replayedHeader = response.headers.get("Idempotency-Replayed");
  if (
    (response.status === 200 && replayedHeader !== "true") ||
    (response.status === 201 && replayedHeader !== null)
  ) {
    throw unexpectedResponse(response.status);
  }
  const parsedRequest = parseRequest(await readJson(response));
  if (!matchesSubmittedBody(parsedRequest, market, body)) {
    throw new AfterSalesClientError({
      message:
        "The saved after-sales application could not be matched to this order. Retrying is blocked to avoid a duplicate. Contact customer support with your order details.",
      status: response.status,
      retryable: false,
    });
  }
  return {
    request: parsedRequest,
    replayed: response.status === 200,
  };
}

export async function getAfterSalesRequest(
  market: string,
  requestId: string,
  signal?: AbortSignal,
): Promise<AfterSalesRequestView> {
  const response = await request(
    market,
    `/requests/${encodeURIComponent(requestId)}`,
    { method: "GET", signal },
  );
  assertStatus(response, [200]);
  const parsed = parseRequest(await readJson(response));
  if (parsed.request_id !== requestId || parsed.market !== market) {
    throw new AfterSalesClientError({
      message: "The saved request does not match this order. Please contact customer support.",
      status: 200,
      retryable: false,
    });
  }
  return parsed;
}

export async function getConsumerTicket(
  market: string,
  ticketId: string,
  signal?: AbortSignal,
): Promise<AfterSalesTicketView> {
  const response = await request(
    market,
    `/tickets/${encodeURIComponent(ticketId)}`,
    { method: "GET", signal },
  );
  assertStatus(response, [200]);
  const parsed = parseTicket(await readJson(response));
  if (parsed.ticket_id !== ticketId || parsed.market !== market) {
    throw new AfterSalesClientError({
      message: "The saved reply does not match this order. Please contact customer support.",
      status: 200,
      retryable: false,
    });
  }
  return parsed;
}
