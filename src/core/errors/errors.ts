/**
 * 统一 error model（04 §5）。
 * UI 只处理内部 typed error；adapter 把供应商原始错误保存在 cause 里用于观测，
 * 但不得泄露给用户（toPublicError 是唯一出口）。
 */

export const errorKinds = [
  "validation",
  "unauthorized",
  "not_found",
  "conflict",
  "rate_limited",
  "upstream",
  "unknown",
] as const;

export type ErrorKind = (typeof errorKinds)[number];

export class AppError extends Error {
  readonly kind: ErrorKind;
  readonly retryable: boolean;

  constructor(
    kind: ErrorKind,
    message: string,
    options?: { cause?: unknown; retryable?: boolean },
  ) {
    super(message, { cause: options?.cause });
    this.name = "AppError";
    this.kind = kind;
    this.retryable = options?.retryable ?? false;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** 把任意异常归一化为 AppError；原始错误只进 cause，不进 message。 */
export function normalizeError(error: unknown, fallbackMessage = "Unexpected error"): AppError {
  if (isAppError(error)) return error;
  if (error instanceof Error) {
    return new AppError("unknown", error.message || fallbackMessage, { cause: error });
  }
  return new AppError("unknown", fallbackMessage, { cause: error });
}

export type PublicError = {
  kind: ErrorKind;
  message: string;
};

/** 给用户/客户端的唯一错误形态：kind + 安全文案，绝不携带 cause/stack/供应商 payload。 */
export function toPublicError(error: unknown): PublicError {
  if (isAppError(error)) {
    return { kind: error.kind, message: error.message };
  }
  return { kind: "unknown", message: "Something went wrong. Please try again." };
}
