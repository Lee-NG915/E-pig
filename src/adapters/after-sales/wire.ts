import {
  afterSalesErrorCodes,
  createAfterSalesError,
  defaultAfterSalesErrorRecovery,
  defaultAfterSalesErrorRetryable,
  isAfterSalesError,
  isAfterSalesRecoveryAction,
  type AfterSalesAttachment,
  type AfterSalesAttachmentContent,
  type AfterSalesErrorCode,
  type AfterSalesErrorDetails,
  type AfterSalesMediaType,
  type AfterSalesOrder,
  type AfterSalesOrderStatus,
  type AfterSalesProgress,
  type AfterSalesRequest,
  type AfterSalesRequestStatus,
  type AfterSalesRequestType,
  type AfterSalesShipment,
  type AfterSalesTicket,
  type AfterSalesTicketAction,
  type AfterSalesTicketStatus,
  type ServiceRequestFeed,
} from "@/core/contracts/after-sales";

export type WireAttachment = {
  attachment_id: string;
  file_name: string;
  media_type: AfterSalesMediaType;
  size_bytes: number;
  status: "active" | "expired";
  created_at: string;
  expires_at: string;
};

export type WireProgress = {
  status: AfterSalesRequestStatus;
  message: string;
  occurred_at: string;
};

export type WireConsumerRequest = {
  request_id: string;
  order_id: string;
  market: "au" | "sg" | "us";
  type: AfterSalesRequestType;
  description: string;
  attachments: WireAttachment[];
  status: AfterSalesRequestStatus;
  progress: WireProgress[];
  ticket_id: string | null;
  created_at: string;
  updated_at: string;
};

export type WireServiceRequest = Omit<WireConsumerRequest, "progress"> & {
  sequence: string;
};

export type WireTicketReceipt = {
  receipt_id: string;
  ticket_id: string;
  request_id: string;
  action: AfterSalesTicketAction;
  request_status: "ticket_created";
  created_at: string;
};

export type WireServiceTicket = {
  ticket_id: string;
  request_id: string;
  order_id: string;
  market: "au" | "sg" | "us";
  action: AfterSalesTicketAction;
  reply: string;
  status: AfterSalesTicketStatus;
  draft_version: string;
  approval_id: string;
  policy_version: string;
  order_version: string;
  receipt: WireTicketReceipt;
  created_at: string;
  updated_at: string;
};

export type WireConsumerTicket = Omit<
  WireServiceTicket,
  "draft_version" | "approval_id" | "policy_version" | "order_version"
>;

export type WireServiceOrder = {
  order_id: string;
  market: "au" | "sg" | "us";
  currency: string;
  items: Array<{
    order_item_id: string;
    sku: string;
    name: string;
    quantity: number;
    unit_price_minor: number;
    line_total_minor: number;
  }>;
  subtotal_minor: number;
  shipping_minor: number;
  tax_minor: number;
  discount_minor: number;
  total_minor: number;
  status: AfterSalesOrderStatus;
  created_at: string;
  order_version: string;
  recipient_summary: {
    masked_name: string;
    country_code: "AU" | "SG" | "US";
    region: string;
    postal_code_masked: string;
  };
};

export type WireServiceRequestFeed = {
  items: WireServiceRequest[];
  high_watermark: string;
  next_cursor: string;
  has_more: boolean;
};

export type WireServiceShipment = {
  shipment_id: string;
  order_id: string;
  status: "pending" | "in_transit" | "delivered" | "exception";
  carrier: string;
  events: Array<{
    event_id: string;
    status: "pending" | "in_transit" | "delivered" | "exception";
    description: string;
    occurred_at: string;
    location_summary?: string;
  }>;
};

export type WireErrorResponse = {
  error: {
    code: AfterSalesErrorCode;
    message: string;
    request_id: string;
    retryable: boolean;
    recovery_action:
      | "NONE"
      | "RETRY_REQUEST"
      | "LOOKUP_FIRST"
      | "RETRY_CREATE_WITH_SAME_KEY"
      | "RECONCILE_MANUALLY";
    details?: AfterSalesErrorDetails;
  };
};

const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const utcPattern = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$/;
const allowedMediaTypes = ["image/jpeg", "image/png", "image/webp"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeOpaqueId(value: unknown, fallback: string): string {
  return typeof value === "string" && opaqueIdPattern.test(value) ? value : fallback;
}

function utc(value: string): string {
  if (!utcPattern.test(value) || Number.isNaN(Date.parse(value))) {
    throw createAfterSalesError({
      code: "INTERNAL_ERROR",
      requestId: "wire_serialization",
      retryable: false,
      recoveryAction: "NONE",
    });
  }
  return value;
}

function safeFileName(value: string): string {
  const base = value.split(/[\\/]/).at(-1) ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f"\\]/g, "").trim();
  return Array.from(cleaned || "attachment").slice(0, 255).join("");
}

function contentDisposition(fileName: string): string {
  const asciiName = Array.from(fileName)
    .map((character) => /^[\u0020-\u007e]$/.test(character) ? character : "_")
    .join("");
  const fallback = `attachment; filename="${asciiName}"`;
  if (asciiName === fileName) return fallback;
  try {
    const encoded = encodeURIComponent(fileName).replace(
      /['()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return `${fallback}; filename*=UTF-8''${encoded}`;
  } catch {
    return fallback;
  }
}

function progress(value: AfterSalesProgress): WireProgress {
  return {
    status: value.status,
    message: value.message,
    occurred_at: utc(value.occurredAt),
  };
}

function receipt(value: AfterSalesTicket["receipt"]): WireTicketReceipt {
  return {
    receipt_id: value.id,
    ticket_id: value.ticketId,
    request_id: value.requestId,
    action: value.action,
    request_status: "ticket_created",
    created_at: utc(value.createdAt),
  };
}

function requestTicketId(request: AfterSalesRequest): string | null {
  if (request.status === "pending") return null;
  if (!request.ticketId) {
    throw createAfterSalesError({
      code: "REQUEST_STATE_CONFLICT",
      requestId: "wire_serialization",
      details: { status: request.status },
    });
  }
  return request.ticketId;
}

function recipientSummary(order: AfterSalesOrder): WireServiceOrder["recipient_summary"] {
  const words = order.recipient.name.trim().split(/\s+/).filter(Boolean);
  const maskedName = words
    .map((word) => `${Array.from(word)[0] ?? "*"}***`)
    .join(" ") || "***";
  const postalCode = order.recipient.postalCode.trim();
  return {
    masked_name: maskedName,
    country_code: order.recipient.countryCode,
    region: order.recipient.region,
    postal_code_masked: `${Array.from(postalCode)[0] ?? "*"}***`,
  };
}

export function toAttachment(value: AfterSalesAttachment): WireAttachment {
  return {
    attachment_id: value.id,
    file_name: safeFileName(value.fileName),
    media_type: value.mediaType,
    size_bytes: value.sizeBytes,
    status: value.status,
    created_at: utc(value.createdAt),
    expires_at: utc(value.expiresAt),
  };
}

export function toConsumerRequest(value: AfterSalesRequest): WireConsumerRequest {
  return {
    request_id: value.id,
    order_id: value.orderId,
    market: value.market,
    type: value.type,
    description: value.description,
    attachments: value.attachments.map(toAttachment),
    status: value.status,
    progress: value.progress.map(progress),
    ticket_id: requestTicketId(value),
    created_at: utc(value.createdAt),
    updated_at: utc(value.updatedAt),
  };
}

export function toServiceRequest(value: AfterSalesRequest): WireServiceRequest {
  return {
    request_id: value.id,
    sequence: value.sequence,
    order_id: value.orderId,
    market: value.market,
    type: value.type,
    description: value.description,
    attachments: value.attachments.map(toAttachment),
    status: value.status,
    ticket_id: requestTicketId(value),
    created_at: utc(value.createdAt),
    updated_at: utc(value.updatedAt),
  };
}

export function toServiceRequestFeed(value: ServiceRequestFeed): WireServiceRequestFeed {
  return {
    items: value.items.map(toServiceRequest),
    high_watermark: value.highWatermark,
    next_cursor: value.nextCursor,
    has_more: value.hasMore,
  };
}

export function toServiceTicket(value: AfterSalesTicket): WireServiceTicket {
  return {
    ticket_id: value.id,
    request_id: value.requestId,
    order_id: value.orderId,
    market: value.market,
    action: value.action,
    reply: value.reply,
    status: value.status,
    draft_version: value.draftVersion,
    approval_id: value.approvalId,
    policy_version: value.policyVersion,
    order_version: value.orderVersion,
    receipt: receipt(value.receipt),
    created_at: utc(value.createdAt),
    updated_at: utc(value.updatedAt),
  };
}

export function toConsumerTicket(value: AfterSalesTicket): WireConsumerTicket {
  return {
    ticket_id: value.id,
    request_id: value.requestId,
    order_id: value.orderId,
    market: value.market,
    action: value.action,
    reply: value.reply,
    status: value.status,
    receipt: receipt(value.receipt),
    created_at: utc(value.createdAt),
    updated_at: utc(value.updatedAt),
  };
}

export function toServiceOrder(value: AfterSalesOrder): WireServiceOrder {
  return {
    order_id: value.id,
    market: value.market,
    currency: value.currency,
    items: value.items.map((item) => ({
      order_item_id: item.id,
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      unit_price_minor: item.unitPriceMinor,
      line_total_minor: item.lineTotalMinor,
    })),
    subtotal_minor: value.subtotalMinor,
    shipping_minor: value.shippingMinor,
    tax_minor: value.taxMinor,
    discount_minor: value.discountMinor,
    total_minor: value.totalMinor,
    status: value.status,
    created_at: utc(value.createdAt),
    order_version: value.orderVersion,
    recipient_summary: recipientSummary(value),
  };
}

export function toServiceShipment(value: AfterSalesShipment): WireServiceShipment {
  return {
    shipment_id: value.id,
    order_id: value.orderId,
    status: value.status,
    carrier: value.carrier,
    events: value.events.map((event) => ({
      event_id: event.id,
      status: event.status,
      description: event.description,
      occurred_at: utc(event.occurredAt),
      ...(event.locationSummary ? { location_summary: event.locationSummary } : {}),
    })),
  };
}

export function attachmentContentHeaders(
  value: AfterSalesAttachmentContent,
): { contentType: AfterSalesMediaType; contentDisposition: string } {
  return {
    contentType: value.mediaType,
    contentDisposition: contentDisposition(safeFileName(value.fileName)),
  };
}

function isErrorCode(value: unknown): value is AfterSalesErrorCode {
  return typeof value === "string"
    && (afterSalesErrorCodes as readonly string[]).includes(value);
}

function sanitizeDetails(value: unknown): AfterSalesErrorDetails | undefined {
  if (!isRecord(value)) return undefined;
  const details: AfterSalesErrorDetails = {};
  if (
    typeof value.field === "string"
    && /^[A-Za-z0-9_.-]{1,128}$/.test(value.field)
  ) {
    details.field = value.field;
  }
  if (Number.isInteger(value.retry_after_seconds) && Number(value.retry_after_seconds) >= 0) {
    details.retry_after_seconds = Number(value.retry_after_seconds);
  }
  if (Array.isArray(value.allowed_media_types)) {
    const mediaTypes = [...new Set(value.allowed_media_types)]
      .filter((item): item is AfterSalesMediaType =>
        typeof item === "string"
        && (allowedMediaTypes as readonly string[]).includes(item),
      )
      .slice(0, 3);
    if (mediaTypes.length) details.allowed_media_types = mediaTypes;
  }
  if (typeof value.attachment_id === "string" && opaqueIdPattern.test(value.attachment_id)) {
    details.attachment_id = value.attachment_id;
  }
  if (value.operation === "createAfterSalesRequest" || value.operation === "createServiceTicket") {
    details.operation = value.operation;
  }
  if (Number.isInteger(value.max_size_bytes) && Number(value.max_size_bytes) > 0) {
    details.max_size_bytes = Number(value.max_size_bytes);
  }
  if (typeof value.request_id === "string" && opaqueIdPattern.test(value.request_id)) {
    details.request_id = value.request_id;
  }
  if (value.status === "pending" || value.status === "ticket_created") {
    details.status = value.status;
  }
  if (value.supported_major === "1") details.supported_major = "1";
  if (value.market === "au" || value.market === "sg" || value.market === "us") {
    details.market = value.market;
  }
  return Object.keys(details).length ? details : undefined;
}

export function parseAfterSalesErrorResponse(
  value: unknown,
  fallbackRequestId = "req_unknown",
): ReturnType<typeof createAfterSalesError> {
  const candidate = isRecord(value) && isRecord(value.error) ? value.error : value;
  if (!isRecord(candidate) || !isErrorCode(candidate.code)) {
    return createAfterSalesError({
      code: "INTERNAL_ERROR",
      requestId: safeOpaqueId(fallbackRequestId, "req_unknown"),
      retryable: false,
      recoveryAction: "LOOKUP_FIRST",
    });
  }
  const code = candidate.code;
  const requestId = safeOpaqueId(
    candidate.request_id,
    safeOpaqueId(fallbackRequestId, "req_unknown"),
  );
  return createAfterSalesError({
    code,
    requestId,
    retryable: typeof candidate.retryable === "boolean"
      ? candidate.retryable
      : defaultAfterSalesErrorRetryable(code),
    recoveryAction: isAfterSalesRecoveryAction(candidate.recovery_action)
      ? candidate.recovery_action
      : defaultAfterSalesErrorRecovery(code),
    details: sanitizeDetails(candidate.details),
  });
}

export function toWireError(error: unknown, fallbackRequestId: string): WireErrorResponse {
  const normalized = isAfterSalesError(error)
    ? error
    : parseAfterSalesErrorResponse(error, fallbackRequestId);
  return {
    error: {
      code: normalized.code,
      message: normalized.message,
      request_id: safeOpaqueId(normalized.requestId, safeOpaqueId(fallbackRequestId, "req_unknown")),
      retryable: normalized.retryable,
      recovery_action: normalized.recoveryAction,
      ...(sanitizeDetails(normalized.details)
        ? { details: sanitizeDetails(normalized.details) }
        : {}),
    },
  };
}
