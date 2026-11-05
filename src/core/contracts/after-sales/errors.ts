import { AppError, type ErrorKind } from "@/core/errors/errors";

export const afterSalesErrorCodes = [
  "VALIDATION_ERROR",
  "UNSUPPORTED_CONTRACT_VERSION",
  "INVALID_CURSOR",
  "UNAUTHORIZED",
  "FORBIDDEN_MARKET",
  "NOT_FOUND",
  "IDEMPOTENCY_CONFLICT",
  "REQUEST_STATE_CONFLICT",
  "ORDER_VERSION_CONFLICT",
  "ATTACHMENT_EXPIRED",
  "ATTACHMENT_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
  "UPSTREAM_UNAVAILABLE",
] as const;

export type AfterSalesErrorCode = (typeof afterSalesErrorCodes)[number];

export const afterSalesRecoveryActions = [
  "NONE",
  "RETRY_REQUEST",
  "LOOKUP_FIRST",
  "RETRY_CREATE_WITH_SAME_KEY",
  "RECONCILE_MANUALLY",
] as const;

export type AfterSalesRecoveryAction = (typeof afterSalesRecoveryActions)[number];

export type AfterSalesErrorDetails = {
  field?: string;
  retry_after_seconds?: number;
  allowed_media_types?: Array<"image/jpeg" | "image/png" | "image/webp">;
  attachment_id?: string;
  operation?: "createAfterSalesRequest" | "createServiceTicket";
  max_size_bytes?: number;
  request_id?: string;
  status?: "pending" | "ticket_created";
  supported_major?: "1";
  market?: "au" | "sg" | "us";
};

const errorKinds: Record<AfterSalesErrorCode, ErrorKind> = {
  VALIDATION_ERROR: "validation",
  UNSUPPORTED_CONTRACT_VERSION: "validation",
  INVALID_CURSOR: "validation",
  UNAUTHORIZED: "unauthorized",
  FORBIDDEN_MARKET: "unauthorized",
  NOT_FOUND: "not_found",
  IDEMPOTENCY_CONFLICT: "conflict",
  REQUEST_STATE_CONFLICT: "conflict",
  ORDER_VERSION_CONFLICT: "conflict",
  ATTACHMENT_EXPIRED: "validation",
  ATTACHMENT_TOO_LARGE: "validation",
  UNSUPPORTED_MEDIA_TYPE: "validation",
  RATE_LIMITED: "rate_limited",
  INTERNAL_ERROR: "unknown",
  UPSTREAM_UNAVAILABLE: "upstream",
};

const messages: Record<AfterSalesErrorCode, string> = {
  VALIDATION_ERROR: "The after-sales request is invalid.",
  UNSUPPORTED_CONTRACT_VERSION: "The requested after-sales contract major is unsupported.",
  INVALID_CURSOR: "The after-sales ingestion cursor is invalid.",
  UNAUTHORIZED: "Authentication is required for this after-sales operation.",
  FORBIDDEN_MARKET: "The authenticated actor is not authorized for this market.",
  NOT_FOUND: "The requested after-sales resource was not found.",
  IDEMPOTENCY_CONFLICT: "The idempotency key was already used with different business fields.",
  REQUEST_STATE_CONFLICT: "The after-sales request cannot accept this ticket.",
  ORDER_VERSION_CONFLICT: "The supplied order version is stale.",
  ATTACHMENT_EXPIRED: "The attachment has expired.",
  ATTACHMENT_TOO_LARGE: "The attachment exceeds the allowed size.",
  UNSUPPORTED_MEDIA_TYPE: "The attachment media type is unsupported.",
  RATE_LIMITED: "The after-sales request rate limit was exceeded.",
  INTERNAL_ERROR: "The after-sales operation could not be completed.",
  UPSTREAM_UNAVAILABLE: "A required after-sales service is temporarily unavailable.",
};

const retryableByDefault: Record<AfterSalesErrorCode, boolean> = {
  VALIDATION_ERROR: false,
  UNSUPPORTED_CONTRACT_VERSION: false,
  INVALID_CURSOR: false,
  UNAUTHORIZED: false,
  FORBIDDEN_MARKET: false,
  NOT_FOUND: false,
  IDEMPOTENCY_CONFLICT: false,
  REQUEST_STATE_CONFLICT: false,
  ORDER_VERSION_CONFLICT: false,
  ATTACHMENT_EXPIRED: false,
  ATTACHMENT_TOO_LARGE: false,
  UNSUPPORTED_MEDIA_TYPE: false,
  RATE_LIMITED: true,
  INTERNAL_ERROR: false,
  UPSTREAM_UNAVAILABLE: false,
};

const recoveryByDefault: Record<AfterSalesErrorCode, AfterSalesRecoveryAction> = {
  VALIDATION_ERROR: "NONE",
  UNSUPPORTED_CONTRACT_VERSION: "NONE",
  INVALID_CURSOR: "NONE",
  UNAUTHORIZED: "NONE",
  FORBIDDEN_MARKET: "NONE",
  NOT_FOUND: "NONE",
  IDEMPOTENCY_CONFLICT: "NONE",
  REQUEST_STATE_CONFLICT: "NONE",
  ORDER_VERSION_CONFLICT: "NONE",
  ATTACHMENT_EXPIRED: "NONE",
  ATTACHMENT_TOO_LARGE: "NONE",
  UNSUPPORTED_MEDIA_TYPE: "NONE",
  RATE_LIMITED: "RETRY_REQUEST",
  INTERNAL_ERROR: "LOOKUP_FIRST",
  UPSTREAM_UNAVAILABLE: "LOOKUP_FIRST",
};

export class AfterSalesError extends AppError {
  readonly code: AfterSalesErrorCode;
  readonly requestId: string;
  readonly recoveryAction: AfterSalesRecoveryAction;
  readonly details?: AfterSalesErrorDetails;

  constructor({
    code,
    requestId,
    retryable = retryableByDefault[code],
    recoveryAction = recoveryByDefault[code],
    details,
  }: {
    code: AfterSalesErrorCode;
    requestId: string;
    retryable?: boolean;
    recoveryAction?: AfterSalesRecoveryAction;
    details?: AfterSalesErrorDetails;
  }) {
    const message = messages[code];
    super(errorKinds[code], message, {
      retryable,
      publicMessage: message,
    });
    this.name = "AfterSalesError";
    this.code = code;
    this.requestId = requestId;
    this.recoveryAction = recoveryAction;
    this.details = details ? { ...details } : undefined;
  }
}

export function createAfterSalesError({
  code,
  requestId,
  retryable = retryableByDefault[code],
  recoveryAction = recoveryByDefault[code],
  details,
}: {
  code: AfterSalesErrorCode;
  requestId: string;
  retryable?: boolean;
  recoveryAction?: AfterSalesRecoveryAction;
  details?: AfterSalesErrorDetails;
}): AfterSalesError {
  return new AfterSalesError({ code, requestId, retryable, recoveryAction, details });
}

export function isAfterSalesError(error: unknown): error is AfterSalesError {
  return error instanceof AfterSalesError;
}

export function normalizeAfterSalesError(
  error: unknown,
  requestId: string,
): AfterSalesError {
  if (isAfterSalesError(error)) return error;
  return createAfterSalesError({
    code: "INTERNAL_ERROR",
    requestId,
    retryable: false,
    recoveryAction: "LOOKUP_FIRST",
  });
}

export function defaultAfterSalesErrorRecovery(
  code: AfterSalesErrorCode,
): AfterSalesRecoveryAction {
  return recoveryByDefault[code];
}

export function defaultAfterSalesErrorRetryable(code: AfterSalesErrorCode): boolean {
  return retryableByDefault[code];
}

export function isAfterSalesRecoveryAction(value: unknown): value is AfterSalesRecoveryAction {
  return typeof value === "string"
    && (afterSalesRecoveryActions as readonly string[]).includes(value);
}
